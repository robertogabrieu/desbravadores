import { Injectable } from '@nestjs/common'
import { mediaTurma, type InicioInstrutorSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { refClasse, SELECAO_REF_CLASSE } from '../classes/apresentacao-classe'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import { ServicoCronograma } from '../cronogramas/servico-cronograma'
import { daDataCivil } from '../desbravadores/apoio'
import { ServicoEscopo, type RelogioDoClube } from '../desbravadores/escopo.service'
import { ServicoNotificacoes } from '../notificacoes/servico-notificacoes'
import { ServicoProgresso } from '../progresso/servico-progresso'

type Inicio = z.infer<typeof InicioInstrutorSaida>

const VINTE_E_QUATRO_HORAS = 24 * 60 * 60 * 1000

function exigirInstrutor(sessao: SessaoLogada): void {
  if (sessao.papel !== 'INSTRUTOR') throw new ErroApp('SEM_PERMISSAO', 'Esta tela é só para instrutores.')
}

@Injectable()
export class InstrutorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escopo: ServicoEscopo,
    private readonly progresso: ServicoProgresso,
    private readonly cronograma: ServicoCronograma,
    private readonly notificacoes: ServicoNotificacoes,
  ) {}

  async inicio(sessao: SessaoLogada): Promise<Inicio> {
    exigirInstrutor(sessao)
    const { clubeId } = sessao
    const relogio = await this.escopo.relogio(clubeId)
    const classes = await this.prisma.classe.findMany({
      where: { id: { in: await this.escopo.classesDoInstrutor(sessao) }, OR: [{ clubeId: null }, { clubeId }] },
      select: { ...SELECAO_REF_CLASSE, ordem: true },
    })
    classes.sort((a, b) => Number(a.trilha === 'AGRUPADAS') - Number(b.trilha === 'AGRUPADAS') || a.ordem - b.ordem)

    const saida: Inicio = { classes: [], alertaFaltas: [] }
    for (const classe of classes) {
      const calculado = await this.progresso.calcularClasse(clubeId, classe.id, relogio.anoClube)
      const cursando = calculado.itens.filter((item) => item.status === 'CURSANDO')
      const aulas = await this.aulasPublicadas(clubeId, classe.id, relogio)
      const proxima = aulas.find((aula) => aula.data >= relogio.hoje)
      const { de, ate } = this.progresso.intervaloDoAno(relogio)
      const registros = await this.prisma.registroAula.findMany({
        where: { clubeId, classeId: classe.id, data: { gte: de, lt: ate } },
        orderBy: { data: 'desc' },
        select: { id: true, data: true },
      })
      const hojeRegistrada = registros.some((registro) => registro.data.getTime() === daDataCivil(relogio.hoje).getTime())

      saida.classes.push({
        classe: refClasse(classe),
        totalDbvs: cursando.length,
        progressoMedio: calculado.itens.length === 0 ? null : mediaTurma(calculado.itens.map((item) => item.percentualExato)),
        proximaAula: proxima
          ? { aulaId: proxima.id, data: proxima.data, horario: proxima.horario, titulo: proxima.titulo, totalRequisitos: proxima.requisitoIds.length }
          : null,
        aulaHoje: aulas.some((aula) => aula.data === relogio.hoje),
        aulaHojeRegistrada: hojeRegistrada,
        aulasDadas: registros.length,
      })

      const faltosos = await this.faltaramAsDuasUltimas(clubeId, registros.slice(0, 2).map((registro) => registro.id))
      const dbvs = cursando.filter((item) => faltosos.has(item.dbvId)).map((item) => ({ dbvId: item.dbvId, nome: item.nome }))
      if (dbvs.length > 0) saida.alertaFaltas.push({ classe: refClasse(classe), dbvs })
    }
    return saida
  }

  async pedirLiberacao(sessao: SessaoLogada, classeId: string): Promise<void> {
    exigirInstrutor(sessao)
    const { clubeId } = sessao
    if (!(await this.escopo.classesDoInstrutor(sessao)).includes(classeId)) {
      throw new ErroApp('NAO_ENCONTRADO', 'Classe não encontrada.')
    }
    const ajuste = await this.prisma.classeClube.findUnique({ where: { clubeId_classeId: { clubeId, classeId } } })
    if (ajuste?.quemMontaCronograma === 'INSTRUTOR') {
      throw new ErroApp('REGRA', 'Você já pode montar o cronograma desta classe.')
    }

    const link = `/adm/classes?classe=${classeId}`
    const tipo = 'PEDIDO_LIBERAR_CRONOGRAMA'
    await this.prisma.$transaction(async (tx) => {
      const recente = await tx.notificacao.findFirst({
        where: { clubeId, tipo, link, criadaEm: { gte: new Date(Date.now() - VINTE_E_QUATRO_HORAS) } },
        select: { id: true },
      })
      if (recente) return
      const [classe, autor, adms] = await Promise.all([
        tx.classe.findFirstOrThrow({ where: { id: classeId, OR: [{ clubeId: null }, { clubeId }] }, select: { nome: true } }),
        tx.usuario.findUniqueOrThrow({ where: { id: sessao.usuarioId }, select: { nome: true } }),
        tx.vinculo.findMany({ where: { clubeId, papel: 'ADM', ativo: true }, select: { usuarioId: true } }),
      ])
      await this.notificacoes.notificar(tx, {
        clubeId,
        tipo,
        titulo: 'Pedido para montar o cronograma',
        texto: `${autor.nome} pediu para montar o cronograma de ${classe.nome}.`,
        destinos: adms.map((adm) => ({ usuarioId: adm.usuarioId, link })),
      })
    })
  }

  /** As aulas da ultima publicacao do cronograma do ano, por data; vazio se nunca publicou. */
  private async aulasPublicadas(clubeId: string, classeId: string, relogio: RelogioDoClube) {
    const cronograma = await this.prisma.cronograma.findFirst({
      where: { clubeId, classeId, anoClube: relogio.anoClube },
      select: { id: true },
    })
    if (!cronograma) return []
    const publicacao = await this.cronograma.ultimaPublicacao(clubeId, cronograma.id)
    return [...(publicacao?.aulas ?? [])].sort((a, b) => a.data.localeCompare(b.data))
  }

  /** F13: quem tem `presente=false` nas duas aulas; menos de duas aulas registradas, ninguem. */
  private async faltaramAsDuasUltimas(clubeId: string, registroIds: string[]): Promise<Set<string>> {
    if (registroIds.length < 2) return new Set()
    const faltas = await this.prisma.presencaAula.findMany({
      where: { clubeId, registroAulaId: { in: registroIds }, presente: false },
      select: { dbvId: true },
    })
    const contagem = new Map<string, number>()
    for (const { dbvId } of faltas) contagem.set(dbvId, (contagem.get(dbvId) ?? 0) + 1)
    return new Set([...contagem].filter(([, faltou]) => faltou === registroIds.length).map(([dbvId]) => dbvId))
  }
}
