import { Injectable } from '@nestjs/common'
import { datasDeAula, type MontagemSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import type { SessaoLogada } from '../../comum/decorators/sessao.decorator'
import { ErroApp } from '../../comum/erros'
import { PrismaService } from '../../comum/prisma/prisma.service'
import { ServicoAtividade } from '../../atividades/servico-atividade'
import { ServicoCalendario } from '../../calendario/servico-calendario'
import { daDataCivil, paraDataCivil } from '../../desbravadores/apoio'
import { Prisma, type Cronograma } from '../../generated/prisma/client.js'
import { ServicoNotificacoes } from '../../notificacoes/servico-notificacoes'
import { ServicoCronograma } from '../servico-cronograma'
import { eventosDasSituacoes, ServicoMontagemLeitura } from './servico-montagem-leitura'

type Saida = z.infer<typeof MontagemSaida>
type Tx = Prisma.TransactionClient
type Autorizacao = 'MONTAR' | 'ENVIAR' | 'PUBLICAR'

interface Contexto {
  tx: Tx
  sessao: SessaoLogada
  cronograma: Cronograma
  classeNome: string
  trilha: 'INDIVIDUAL' | 'AGRUPADAS'
}

/** O que a mutação muda no cronograma além do que toda edição muda (voltar a rascunho e renovar `atualizadoEm`). */
type MudancaDoCronograma = Prisma.CronogramaUncheckedUpdateManyInput

const AULA_DADA = 'Esta aula já foi dada.'
const CLASSE_DESATIVADA = 'Esta classe está desativada no clube.'
const OUTRA_PESSOA_MUDOU = 'Outra pessoa acabou de mudar esta data. Atualize a tela.'
const CRONOGRAMA_MUDOU = 'O cronograma mudou desde que você abriu. Revise antes de publicar.'
const CODIGOS_DE_CORRIDA = ['P2002', 'P2034']

function regra(mensagem: string): ErroApp {
  return new ErroApp('REGRA', mensagem)
}

function diaEMes(data: string): string {
  return `${data.slice(8, 10)}/${data.slice(5, 7)}`
}

/** Montagem do cronograma vivo (G2 a G5, G7): toda mutação trava a linha do cronograma e termina renovando-a. */
@Injectable()
export class ServicoMontagem {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leitura: ServicoMontagemLeitura,
    private readonly cronogramas: ServicoCronograma,
    private readonly calendario: ServicoCalendario,
    private readonly notificacoes: ServicoNotificacoes,
    private readonly atividades: ServicoAtividade,
  ) {}

  async criar(sessao: SessaoLogada, entrada: { classeId: string; anoClube: number; inicio: string; fim: string }): Promise<Saida> {
    await this.leitura.classeQueMonta(sessao, entrada.classeId)
    await this.exigirClasseAtiva(sessao.clubeId, entrada.classeId)
    try {
      const criado = await this.prisma.cronograma.create({
        data: {
          clubeId: sessao.clubeId,
          classeId: entrada.classeId,
          anoClube: entrada.anoClube,
          inicio: daDataCivil(entrada.inicio),
          fim: daDataCivil(entrada.fim),
        },
        select: { id: true },
      })
      return await this.leitura.saida(sessao.clubeId, criado.id)
    } catch (erro) {
      if (ehCorrida(erro)) throw new ErroApp('CONFLITO', 'Já existe um cronograma desta classe neste ano.')
      throw erro
    }
  }

  editarPeriodo(sessao: SessaoLogada, cronogramaId: string, periodo: { inicio: string; fim: string }): Promise<Saida> {
    return this.executar(sessao, cronogramaId, 'MONTAR', async ({ tx, cronograma }) => {
      const aulas = await tx.aulaPlanejada.findMany({
        where: { clubeId: cronograma.clubeId, cronogramaId, removidaEm: null },
        select: { data: true },
      })
      const fora = aulas.map((aula) => paraDataCivil(aula.data)).filter((data) => data < periodo.inicio || data > periodo.fim).sort()
      if (fora.length > 0) throw regra(`Há aulas fora do novo período: ${fora.map(diaEMes).join(', ')}. Mova-as antes.`)
      return { inicio: daDataCivil(periodo.inicio), fim: daDataCivil(periodo.fim) }
    })
  }

  colocarRequisito(sessao: SessaoLogada, cronogramaId: string, requisitoId: string, data: string): Promise<Saida> {
    return this.executar(sessao, cronogramaId, 'MONTAR', async (contexto) => {
      const { tx, cronograma, trilha } = contexto
      const { clubeId, classeId } = cronograma
      const requisitos = await this.leitura.requisitosDaClasse(clubeId, classeId)
      if (!requisitos.some((requisito) => requisito.id === requisitoId)) {
        throw new ErroApp('NAO_ENCONTRADO', 'Requisito não encontrado nesta classe.')
      }
      const origem = await this.aulaDoRequisito(tx, cronograma, requisitoId)
      if (origem) await this.exigirAulaNaoDada(tx, cronograma, paraDataCivil(origem.data))
      await this.exigirAulaNaoDada(tx, cronograma, data)

      let destino = await tx.aulaPlanejada.findFirst({ where: { clubeId, cronogramaId: cronograma.id, data: daDataCivil(data), removidaEm: null } })
      if (trilha === 'INDIVIDUAL') {
        await this.exigirDataDeAula(cronograma, data)
        destino ??= await tx.aulaPlanejada.create({ data: { clubeId, cronogramaId: cronograma.id, data: daDataCivil(data) } })
      } else if (!destino) {
        throw regra('Crie a aula desta data antes de colocar o requisito.')
      }
      if (origem?.id === destino.id) return

      await tx.aulaRequisito.deleteMany({ where: { clubeId, cronogramaId: cronograma.id, requisitoId } })
      await tx.aulaRequisito.create({ data: { clubeId, cronogramaId: cronograma.id, aulaPlanejadaId: destino.id, requisitoId } })
      if (origem && trilha === 'INDIVIDUAL') await this.removerSeVazia(tx, clubeId, origem.id)
    })
  }

  tirarRequisito(sessao: SessaoLogada, cronogramaId: string, requisitoId: string): Promise<Saida> {
    return this.executar(sessao, cronogramaId, 'MONTAR', async ({ tx, cronograma, trilha }) => {
      const origem = await this.aulaDoRequisito(tx, cronograma, requisitoId)
      if (!origem) return
      await this.exigirAulaNaoDada(tx, cronograma, paraDataCivil(origem.data))
      await tx.aulaRequisito.deleteMany({ where: { clubeId: cronograma.clubeId, cronogramaId: cronograma.id, requisitoId } })
      if (trilha === 'INDIVIDUAL') await this.removerSeVazia(tx, cronograma.clubeId, origem.id)
    })
  }

  criarAula(
    sessao: SessaoLogada,
    cronogramaId: string,
    entrada: { data: string; horario: string | null; local: string | null; titulo: string | null },
  ): Promise<Saida> {
    return this.executar(sessao, cronogramaId, 'MONTAR', async ({ tx, cronograma, trilha }) => {
      if (trilha !== 'AGRUPADAS') throw regra('Só as classes agrupadas criam aula em qualquer data.')
      this.exigirNoPeriodo(cronograma, entrada.data)
      await this.exigirAulaNaoDada(tx, cronograma, entrada.data)
      const existente = await tx.aulaPlanejada.findFirst({
        where: { clubeId: cronograma.clubeId, cronogramaId: cronograma.id, data: daDataCivil(entrada.data), removidaEm: null },
        select: { id: true },
      })
      if (existente) throw new ErroApp('CONFLITO', 'Já existe uma aula nesta data.')
      await tx.aulaPlanejada.create({
        data: {
          clubeId: cronograma.clubeId,
          cronogramaId: cronograma.id,
          data: daDataCivil(entrada.data),
          horario: entrada.horario,
          local: entrada.local,
          titulo: entrada.titulo,
        },
      })
    })
  }

  async editarAula(
    sessao: SessaoLogada,
    aulaId: string,
    entrada: { horario?: string | null; local?: string | null; titulo?: string | null },
  ): Promise<Saida> {
    const cronogramaId = await this.cronogramaDaAula(sessao, aulaId)
    return this.executar(sessao, cronogramaId, 'MONTAR', async ({ tx, cronograma }) => {
      const atual = await this.aulaAtiva(tx, cronograma, aulaId)
      await this.exigirAulaNaoDada(tx, cronograma, paraDataCivil(atual.data))
      await tx.aulaPlanejada.updateMany({
        where: { clubeId: cronograma.clubeId, id: aulaId },
        data: { horario: entrada.horario, local: entrada.local, titulo: entrada.titulo },
      })
    })
  }

  /** Remoção lógica da aula (Agrupadas e individuais); os requisitos dela voltam a ficar sem data. */
  async removerAula(sessao: SessaoLogada, aulaId: string): Promise<Saida> {
    const cronogramaId = await this.cronogramaDaAula(sessao, aulaId)
    return this.executar(sessao, cronogramaId, 'MONTAR', async ({ tx, cronograma }) => {
      const atual = await this.aulaAtiva(tx, cronograma, aulaId)
      await this.exigirAulaNaoDada(tx, cronograma, paraDataCivil(atual.data))
      await tx.aulaRequisito.deleteMany({ where: { clubeId: cronograma.clubeId, aulaPlanejadaId: aulaId } })
      await tx.aulaPlanejada.updateMany({ where: { clubeId: cronograma.clubeId, id: aulaId }, data: { removidaEm: new Date() } })
    })
  }

  /**
   * Desativar um requisito no clube (G2/G3): sai das aulas ainda não dadas de cada cronograma que o contém; aula
   * dada mantém o vínculo. Roda na transação de quem chama; cada cronograma afetado é travado e renovado.
   */
  async retirarRequisitoDoClube(tx: Tx, clubeId: string, requisitoId: string): Promise<void> {
    // Trava antes de listar: todo cronograma do clube na classe do requisito, em ordem de id (sem deadlock). Uma
    // colocação em curso termina antes; a seguinte espera este commit e relê o ajuste já desligado.
    const candidatos = await tx.cronograma.findMany({
      where: { clubeId, classe: { secoes: { some: { requisitos: { some: { id: requisitoId } } } } } },
      select: { id: true },
      orderBy: { id: 'asc' },
    })
    for (const { id } of candidatos) await this.travarCronograma(tx, clubeId, id)
    const ligacoes = await tx.aulaRequisito.findMany({ where: { clubeId, requisitoId }, select: { cronogramaId: true } })
    const cronogramaIds = [...new Set(ligacoes.map((ligacao) => ligacao.cronogramaId))].sort()
    for (const cronogramaId of cronogramaIds) {
      const cronograma = await tx.cronograma.findFirstOrThrow({ where: { clubeId, id: cronogramaId }, include: { classe: { select: { trilha: true } } } })
      const aulasDoRequisito = await tx.aulaRequisito.findMany({ where: { clubeId, cronogramaId, requisitoId }, select: { aulaPlanejadaId: true } })
      let retirou = false
      for (const { aulaPlanejadaId } of aulasDoRequisito) {
        const aula = await tx.aulaPlanejada.findFirstOrThrow({ where: { clubeId, id: aulaPlanejadaId } })
        const dada = await tx.registroAula.findFirst({
          where: { clubeId, classeId: cronograma.classeId, data: aula.data },
          select: { id: true },
        })
        if (dada) continue
        await tx.aulaRequisito.deleteMany({ where: { clubeId, cronogramaId, requisitoId, aulaPlanejadaId } })
        retirou = true
        if (cronograma.classe.trilha === 'INDIVIDUAL') await this.removerSeVazia(tx, clubeId, aula.id)
      }
      if (!retirou) continue
      await tx.cronograma.updateMany({
        where: { clubeId, id: cronogramaId },
        data: { status: 'RASCUNHO', atualizadoEm: instanteNovo(cronograma.atualizadoEm) },
      })
    }
  }

  enviar(sessao: SessaoLogada, cronogramaId: string, atualizadoEmVisto: string): Promise<Saida> {
    return this.executar(sessao, cronogramaId, 'ENVIAR', async (contexto) => {
      const { tx, cronograma, classeNome } = contexto
      exigirNaoDesatualizado(cronograma, atualizadoEmVisto)
      if (cronograma.status !== 'RASCUNHO') throw regra('Só o cronograma em rascunho pode ser enviado.')
      const { clubeId } = cronograma
      const autor = await tx.usuario.findUniqueOrThrow({ where: { id: contexto.sessao.usuarioId }, select: { nome: true } })
      const adms = await tx.vinculo.findMany({ where: { clubeId, papel: 'ADM', ativo: true }, select: { usuarioId: true } })
      const link = `/cronograma/montar?classe=${cronograma.classeId}`
      await this.notificacoes.notificar(tx, {
        clubeId,
        destinos: adms.map((adm) => ({ usuarioId: adm.usuarioId, link })),
        tipo: 'CRONOGRAMA_ENVIADO',
        titulo: `Cronograma enviado: ${classeNome}`,
        texto: `${autor.nome} enviou o cronograma de ${classeNome} para você publicar.`,
      })
      await this.atividades.registrar(tx, {
        clubeId,
        autorId: contexto.sessao.usuarioId,
        tipo: 'CRONOGRAMA_ENVIADO',
        descricao: `${autor.nome} enviou o cronograma de ${classeNome}`,
        link,
      })
      return { status: 'ENVIADO', enviadoEm: new Date(), enviadoPorId: contexto.sessao.usuarioId }
    })
  }

  publicar(sessao: SessaoLogada, cronogramaId: string, atualizadoEmVisto: string): Promise<Saida> {
    return this.executar(sessao, cronogramaId, 'PUBLICAR', async (contexto) => {
      const { tx, cronograma, classeNome } = contexto
      exigirNaoDesatualizado(cronograma, atualizadoEmVisto)
      if (cronograma.status === 'PUBLICADO') throw regra('Este cronograma já está publicado.')
      const { clubeId } = cronograma
      await tx.cronogramaPublicacao.create({
        data: { clubeId, cronogramaId: cronograma.id, conteudo: await this.retrato(tx, cronograma), publicadoPorId: contexto.sessao.usuarioId },
      })

      const instrutores = await this.cronogramas.instrutoresDaClasse(clubeId, cronograma.classeId)
      const quemMonta = await tx.classeClube.findUnique({
        where: { clubeId_classeId: { clubeId, classeId: cronograma.classeId } },
        select: { quemMontaCronograma: true },
      })
      const linkDoInstrutor =
        quemMonta?.quemMontaCronograma === 'INSTRUTOR' ? `/cronograma/montar?classe=${cronograma.classeId}` : `/cronograma?classe=${cronograma.classeId}`
      await this.notificacoes.notificar(tx, {
        clubeId,
        destinos: instrutores.map((instrutor) => ({ usuarioId: instrutor.usuarioId, link: linkDoInstrutor })),
        tipo: 'CRONOGRAMA_PUBLICADO',
        titulo: `Cronograma publicado: ${classeNome}`,
        texto: `O cronograma de ${classeNome} foi publicado.`,
      })
      await this.atividades.registrar(tx, {
        clubeId,
        autorId: contexto.sessao.usuarioId,
        tipo: 'CRONOGRAMA_PUBLICADO',
        descricao: `Cronograma de ${classeNome} publicado`,
        link: `/cronograma/montar?classe=${cronograma.classeId}`,
      })
      return { status: 'PUBLICADO' }
    })
  }

  /**
   * Autoriza, trava a linha do cronograma (G3) e roda a mudança; a mudança pode devolver o que mais gravar no
   * cronograma. Termina sempre atualizando-o: rascunho e `atualizadoEm` novo, mesmo que já fosse rascunho.
   */
  private async executar(
    sessao: SessaoLogada,
    cronogramaId: string,
    autorizacao: Autorizacao,
    mudar: (contexto: Contexto) => Promise<MudancaDoCronograma | void>,
  ): Promise<Saida> {
    const classe = await this.autorizar(sessao, cronogramaId, autorizacao)
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.travarCronograma(tx, sessao.clubeId, cronogramaId)
        const cronograma = await tx.cronograma.findFirstOrThrow({ where: { clubeId: sessao.clubeId, id: cronogramaId } })
        const mudanca = await mudar({ tx, sessao, cronograma, classeNome: classe.nome, trilha: classe.trilha })
        await tx.cronograma.updateMany({
          where: { clubeId: sessao.clubeId, id: cronogramaId },
          data: { status: 'RASCUNHO', ...mudanca, atualizadoEm: instanteNovo(cronograma.atualizadoEm) },
        })
      })
    } catch (erro) {
      if (ehCorrida(erro)) throw new ErroApp('CONFLITO', OUTRA_PESSOA_MUDOU)
      throw erro
    }
    return this.leitura.saida(sessao.clubeId, cronogramaId)
  }

  private async travarCronograma(tx: Tx, clubeId: string, cronogramaId: string): Promise<void> {
    await tx.$queryRaw`SELECT id FROM "Cronograma" WHERE id = ${cronogramaId}::uuid AND "clubeId" = ${clubeId}::uuid FOR UPDATE`
  }

  private async cronogramaDaAula(sessao: SessaoLogada, aulaId: string): Promise<string> {
    const aula = await this.prisma.aulaPlanejada.findFirst({
      where: { clubeId: sessao.clubeId, id: aulaId, removidaEm: null },
      select: { cronogramaId: true },
    })
    if (!aula) throw new ErroApp('NAO_ENCONTRADO', 'Aula não encontrada.')
    return aula.cronogramaId
  }

  private async aulaAtiva(tx: Tx, cronograma: Cronograma, aulaId: string) {
    const aula = await tx.aulaPlanejada.findFirst({ where: { clubeId: cronograma.clubeId, id: aulaId, removidaEm: null } })
    if (!aula) throw new ErroApp('NAO_ENCONTRADO', 'Aula não encontrada.')
    return aula
  }

  /** Classe desativada no clube não recebe mutação de montagem; sem linha de ajuste vale o padrão (ativa). */
  private async exigirClasseAtiva(clubeId: string, classeId: string): Promise<void> {
    const ajuste = await this.prisma.classeClube.findUnique({ where: { clubeId_classeId: { clubeId, classeId } }, select: { ativa: true } })
    if (ajuste?.ativa === false) throw regra(CLASSE_DESATIVADA)
  }

  /** Cronograma de outro clube é 404; depois valem as regras de quem monta, envia ou publica. */
  private async autorizar(sessao: SessaoLogada, cronogramaId: string, autorizacao: Autorizacao) {
    const cronograma = await this.prisma.cronograma.findFirst({
      where: { clubeId: sessao.clubeId, id: cronogramaId },
      select: { classeId: true },
    })
    if (!cronograma) throw new ErroApp('NAO_ENCONTRADO', 'Cronograma não encontrado.')
    if (autorizacao === 'PUBLICAR') {
      const classe = await this.leitura.classeDoEscopo(sessao, cronograma.classeId)
      if (sessao.papel !== 'ADM') throw new ErroApp('SEM_PERMISSAO', 'Só o Adm publica o cronograma.')
      await this.exigirClasseAtiva(sessao.clubeId, cronograma.classeId)
      return classe
    }
    const classe = await this.leitura.classeQueMonta(sessao, cronograma.classeId)
    await this.exigirClasseAtiva(sessao.clubeId, cronograma.classeId)
    if (autorizacao === 'ENVIAR' && sessao.papel !== 'INSTRUTOR') {
      throw new ErroApp('SEM_PERMISSAO', 'Só o instrutor liberado envia o cronograma; o Adm publica direto.')
    }
    return classe
  }

  private exigirNoPeriodo(cronograma: Cronograma, data: string): void {
    if (data < paraDataCivil(cronograma.inicio) || data > paraDataCivil(cronograma.fim)) {
      throw regra('Esta data está fora do período do cronograma.')
    }
  }

  /** B5: só dia de reunião mantida ou data boa para campo, sem bloqueio, aceita aula das individuais. */
  private async exigirDataDeAula(cronograma: Cronograma, data: string): Promise<void> {
    this.exigirNoPeriodo(cronograma, data)
    const [configuracao, situacoes] = await Promise.all([
      this.prisma.configuracaoClube.findUniqueOrThrow({ where: { clubeId: cronograma.clubeId } }),
      this.calendario.situacoes(cronograma.clubeId, data, data),
    ])
    if (datasDeAula(data, data, configuracao.diaReuniao, eventosDasSituacoes(situacoes)).length === 0) {
      throw regra('Esta data não é dia de aula.')
    }
  }

  /** G2: existe `RegistroAula` da mesma classe e data (nunca pelo `aulaPlanejadaId`). */
  private async exigirAulaNaoDada(tx: Tx, cronograma: Cronograma, data: string): Promise<void> {
    const registro = await tx.registroAula.findFirst({
      where: { clubeId: cronograma.clubeId, classeId: cronograma.classeId, data: daDataCivil(data) },
      select: { id: true },
    })
    if (registro) throw regra(AULA_DADA)
  }

  private async aulaDoRequisito(tx: Tx, cronograma: Cronograma, requisitoId: string) {
    const ligacao = await tx.aulaRequisito.findFirst({
      where: { clubeId: cronograma.clubeId, cronogramaId: cronograma.id, requisitoId },
      select: { aulaPlanejadaId: true },
    })
    if (!ligacao) return null
    return tx.aulaPlanejada.findFirstOrThrow({ where: { clubeId: cronograma.clubeId, id: ligacao.aulaPlanejadaId } })
  }

  /** Aula das individuais que ficou sem requisito deixa de existir; nas agrupadas só se remove de propósito. */
  private async removerSeVazia(tx: Tx, clubeId: string, aulaId: string): Promise<void> {
    const restantes = await tx.aulaRequisito.count({ where: { clubeId, aulaPlanejadaId: aulaId } })
    if (restantes === 0) await tx.aulaPlanejada.updateMany({ where: { clubeId, id: aulaId }, data: { removidaEm: new Date() } })
  }

  /** G4: as aulas ativas do vivo, no formato que `ServicoCronograma.ultimaPublicacao` lê de volta. */
  private async retrato(tx: Tx, cronograma: Cronograma) {
    const { clubeId } = cronograma
    const [aulas, ligacoes] = await Promise.all([
      tx.aulaPlanejada.findMany({ where: { clubeId, cronogramaId: cronograma.id, removidaEm: null }, orderBy: { data: 'asc' } }),
      tx.aulaRequisito.findMany({ where: { clubeId, cronogramaId: cronograma.id }, select: { aulaPlanejadaId: true, requisitoId: true } }),
    ])
    return {
      aulas: aulas.map((aula) => ({
        id: aula.id,
        data: paraDataCivil(aula.data),
        horario: aula.horario,
        local: aula.local,
        titulo: aula.titulo,
        requisitoIds: ligacoes.filter((ligacao) => ligacao.aulaPlanejadaId === aula.id).map((ligacao) => ligacao.requisitoId),
      })),
    }
  }
}

function exigirNaoDesatualizado(cronograma: Cronograma, atualizadoEmVisto: string): void {
  if (new Date(atualizadoEmVisto).getTime() !== cronograma.atualizadoEm.getTime()) {
    throw new ErroApp('CONFLITO', CRONOGRAMA_MUDOU)
  }
}

/** Agora, mas nunca igual ao instante anterior: duas edições no mesmo milissegundo ainda se distinguem. */
function instanteNovo(anterior: Date): Date {
  return new Date(Math.max(Date.now(), anterior.getTime() + 1))
}

function ehCorrida(erro: unknown): boolean {
  return erro instanceof Prisma.PrismaClientKnownRequestError && CODIGOS_DE_CORRIDA.includes(erro.code)
}
