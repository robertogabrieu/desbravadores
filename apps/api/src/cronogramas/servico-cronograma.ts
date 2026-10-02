import { Injectable } from '@nestjs/common'
import {
  DataCivil,
  Horario,
  Uuid,
  emConflito,
  situacaoDaAula,
  situacaoDaData,
  type CronogramaLeitura,
  type SituacaoDeData,
} from '@desbravadores/shared'
import { z } from 'zod'
import { refClasse, SELECAO_REF_CLASSE } from '../classes/apresentacao-classe'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import type { Trilha } from '../generated/prisma/client.js'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import { ServicoCalendario } from '../calendario/servico-calendario'
import { daDataCivil, paraDataCivil } from '../desbravadores/apoio'
import { ServicoEscopo } from '../desbravadores/escopo.service'

type Leitura = z.infer<typeof CronogramaLeitura>
type AulaLida = Leitura['aulas'][number]
interface RequisitoNoCaderno {
  resumo: AulaLida['requisitos'][number]
  posicao: [number, number]
}

/** O retrato que `CronogramaPublicacao.conteudo` guarda: as aulas do vivo no instante da publicacao. */
const RetratoPublicado = z.object({
  aulas: z.array(
    z.object({
      id: Uuid,
      data: DataCivil,
      horario: Horario.nullable(),
      local: z.string().nullable(),
      titulo: z.string().nullable(),
      requisitoIds: z.array(Uuid),
    }),
  ),
})
type AulaDoRetrato = z.infer<typeof RetratoPublicado>['aulas'][number]

export interface PublicacaoLida {
  publicadoEm: Date
  aulas: AulaDoRetrato[]
}

const NAO_ENCONTRADA = 'Classe não encontrada.'

/** Primeiro e ultimo dia do ano do clube, a partir do "MM-DD" em que ele comeca. */
function intervaloDoAnoClube(anoClube: number, inicioAnoClube: string): { inicio: string; fim: string } {
  const primeiroDoProximo = new Date(`${anoClube + 1}-${inicioAnoClube}T00:00:00Z`)
  primeiroDoProximo.setUTCDate(primeiroDoProximo.getUTCDate() - 1)
  return { inicio: `${anoClube}-${inicioAnoClube}`, fim: primeiroDoProximo.toISOString().slice(0, 10) }
}

@Injectable()
export class ServicoCronograma {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escopo: ServicoEscopo,
    private readonly calendario: ServicoCalendario,
  ) {}

  /** Quem monta ve o vivo; os demais, a ultima publicacao. Sem `anoClube`, o do clube hoje. */
  async leitura(sessao: SessaoLogada, classeId: string, anoClube?: number): Promise<Leitura> {
    if (sessao.papel === 'CONSELHEIRO') throw new ErroApp('SEM_PERMISSAO', 'Você não tem acesso ao cronograma.')
    const { clubeId } = sessao
    const classe = await this.classeDoEscopo(sessao, classeId)
    const relogio = await this.escopo.relogio(clubeId)
    const ano = anoClube ?? relogio.anoClube
    const podeMontar = await this.podeMontar(sessao, classeId)

    const cronograma = await this.prisma.cronograma.findFirst({
      where: { clubeId, classeId, anoClube: ano },
      select: { id: true, status: true },
    })
    const base = { classe: refClasse(classe), anoClube: ano, podeMontar }
    const vazio: Leitura = { ...base, cronogramaId: cronograma?.id ?? null, status: null, fonte: null, publicadoEm: null, aulas: [] }
    if (!cronograma) {
      if (!podeMontar) return vazio
      const aulas = await this.montarAulas({ clubeId, classeId, trilha: classe.trilha, planejadas: [], ano, relogio })
      return { ...vazio, aulas }
    }

    const publicacao = await this.ultimaPublicacao(clubeId, cronograma.id)
    if (!podeMontar && !publicacao) return vazio

    const planejadas = podeMontar ? await this.aulasDoVivo(clubeId, cronograma.id) : (publicacao?.aulas ?? [])
    const aulas = await this.montarAulas({ clubeId, classeId, trilha: classe.trilha, planejadas, ano, relogio })
    return {
      ...base,
      cronogramaId: cronograma.id,
      status: podeMontar ? cronograma.status : 'PUBLICADO',
      fonte: podeMontar ? 'VIVO' : 'PUBLICADO',
      publicadoEm: publicacao?.publicadoEm.toISOString() ?? null,
      aulas,
    }
  }

  /** A publicacao mais recente (o retrato), com as aulas deduplicadas por id; `null` se nunca publicou. */
  async ultimaPublicacao(clubeId: string, cronogramaId: string): Promise<PublicacaoLida | null> {
    const publicacao = await this.prisma.cronogramaPublicacao.findFirst({
      where: { clubeId, cronogramaId },
      orderBy: [{ publicadoEm: 'desc' }, { id: 'desc' }],
      select: { conteudo: true, publicadoEm: true },
    })
    if (!publicacao) return null
    const retrato = RetratoPublicado.parse(publicacao.conteudo)
    const porId = new Map(retrato.aulas.map((aula) => [aula.id, aula]))
    return { publicadoEm: publicacao.publicadoEm, aulas: [...porId.values()] }
  }

  /** B10: instrutores ativos DO CLUBE ligados a classe; a classe oficial e compartilhada entre clubes. */
  async instrutoresDaClasse(clubeId: string, classeId: string): Promise<{ usuarioId: string; nome: string }[]> {
    const vinculos = await this.prisma.vinculo.findMany({
      where: { clubeId, papel: 'INSTRUTOR', ativo: true, classes: { some: { classeId } } },
      select: { usuario: { select: { id: true, nome: true } } },
      orderBy: { usuario: { nome: 'asc' } },
    })
    return vinculos.map((vinculo) => ({ usuarioId: vinculo.usuario.id, nome: vinculo.usuario.nome }))
  }

  /** Adm alcanca qualquer classe oficial ou do proprio clube; instrutor so as do vinculo; fora disso, 404. */
  private async classeDoEscopo(sessao: SessaoLogada, classeId: string) {
    if (sessao.papel === 'INSTRUTOR' && !(await this.escopo.classesDoInstrutor(sessao)).includes(classeId)) {
      throw new ErroApp('NAO_ENCONTRADO', NAO_ENCONTRADA)
    }
    const classe = await this.prisma.classe.findFirst({
      where: { id: classeId, OR: [{ clubeId: null }, { clubeId: sessao.clubeId }] },
      select: SELECAO_REF_CLASSE,
    })
    if (!classe) throw new ErroApp('NAO_ENCONTRADO', NAO_ENCONTRADA)
    return classe
  }

  /** B3: Adm sempre; instrutor so se o clube liberou a montagem daquela classe para ele. */
  private async podeMontar(sessao: SessaoLogada, classeId: string): Promise<boolean> {
    if (sessao.papel === 'ADM') return true
    const ajuste = await this.prisma.classeClube.findUnique({
      where: { clubeId_classeId: { clubeId: sessao.clubeId, classeId } },
      select: { quemMontaCronograma: true },
    })
    return ajuste?.quemMontaCronograma === 'INSTRUTOR'
  }

  private async aulasDoVivo(clubeId: string, cronogramaId: string): Promise<AulaDoRetrato[]> {
    const [aulas, ligacoes] = await Promise.all([
      this.prisma.aulaPlanejada.findMany({ where: { clubeId, cronogramaId, removidaEm: null } }),
      this.prisma.aulaRequisito.findMany({ where: { clubeId, cronogramaId }, select: { aulaPlanejadaId: true, requisitoId: true } }),
    ])
    return aulas.map((aula) => ({
      id: aula.id,
      data: paraDataCivil(aula.data),
      horario: aula.horario,
      local: aula.local,
      titulo: aula.titulo,
      requisitoIds: ligacoes.filter((l) => l.aulaPlanejadaId === aula.id).map((l) => l.requisitoId),
    }))
  }

  private async montarAulas(dados: {
    clubeId: string
    classeId: string
    trilha: Trilha
    planejadas: AulaDoRetrato[]
    ano: number
    relogio: { hoje: string; inicioAnoClube: string }
  }): Promise<AulaLida[]> {
    const { clubeId, classeId, trilha, planejadas, relogio } = dados
    const periodo = intervaloDoAnoClube(dados.ano, relogio.inicioAnoClube)
    const registros = await this.prisma.registroAula.findMany({
      where: { clubeId, classeId, data: { gte: daDataCivil(periodo.inicio), lte: daDataCivil(periodo.fim) } },
      select: { id: true, data: true },
    })
    const registroPorData = new Map(registros.map((registro) => [paraDataCivil(registro.data), registro.id]))
    const requisitos = await this.requisitosPorId(clubeId, planejadas.flatMap((aula) => aula.requisitoIds))
    const situacoes = await this.situacoesDasDatas(clubeId, planejadas.map((aula) => aula.data))
    const { diaReuniao } = await this.prisma.configuracaoClube.findUniqueOrThrow({ where: { clubeId }, select: { diaReuniao: true } })

    const doCronograma = planejadas.map((aula): AulaLida => {
      const registroAulaId = registroPorData.get(aula.data) ?? null
      const conflito = emConflito({
        trilha,
        temRequisitos: aula.requisitoIds.length > 0,
        temRegistro: registroAulaId !== null,
        data: aula.data,
        hoje: relogio.hoje,
        situacaoDaData: situacoes.get(aula.data) ?? situacaoDaData(aula.data, diaReuniao, []),
      })
      return {
        origem: 'PLANEJADA',
        id: aula.id,
        data: aula.data,
        horario: aula.horario,
        local: aula.local,
        titulo: aula.titulo,
        requisitos: requisitosDaAula(aula.requisitoIds, requisitos),
        situacao: situacaoDaAula({ temRegistro: registroAulaId !== null, emConflito: conflito, data: aula.data, hoje: relogio.hoje }),
        registroAulaId,
      }
    })

    const datasPlanejadas = new Set(planejadas.map((aula) => aula.data))
    const extras = [...registroPorData]
      .filter(([data]) => !datasPlanejadas.has(data))
      .map(([data, registroAulaId]): AulaLida => ({
        origem: 'EXTRA', id: null, data, horario: null, local: null, titulo: null, requisitos: [], situacao: 'DADA', registroAulaId,
      }))
    return [...doCronograma, ...extras].sort((a, b) => a.data.localeCompare(b.data))
  }

  private async situacoesDasDatas(clubeId: string, datas: string[]): Promise<Map<string, SituacaoDeData>> {
    if (datas.length === 0) return new Map()
    const ordenadas = [...datas].sort()
    return this.calendario.situacoes(clubeId, ordenadas[0], ordenadas[ordenadas.length - 1])
  }

  /** Requisitos com o `campo` ja ajustado pelo clube, por id, ainda com a posicao no caderno. */
  private async requisitosPorId(clubeId: string, ids: string[]): Promise<Map<string, RequisitoNoCaderno>> {
    const unicos = [...new Set(ids)]
    if (unicos.length === 0) return new Map()
    const [requisitos, ajustes] = await Promise.all([
      this.prisma.requisito.findMany({
        where: { id: { in: unicos } },
        select: { id: true, codigo: true, texto: true, campo: true, ordem: true, secao: { select: { codigo: true, ordem: true } } },
      }),
      this.prisma.requisitoAjuste.findMany({ where: { clubeId, requisitoId: { in: unicos } }, select: { requisitoId: true, campo: true } }),
    ])
    const campoDoClube = new Map(ajustes.map((ajuste) => [ajuste.requisitoId, ajuste.campo]))
    return new Map(
      requisitos.map((r) => [
        r.id,
        {
          resumo: { id: r.id, codigo: r.codigo, texto: r.texto, campo: campoDoClube.get(r.id) ?? r.campo, secaoCodigo: r.secao.codigo },
          posicao: [r.secao.ordem, r.ordem],
        },
      ]),
    )
  }
}

/** Ordem do caderno: secao e depois o requisito dentro dela. */
function requisitosDaAula(ids: string[], requisitos: Map<string, RequisitoNoCaderno>): AulaLida['requisitos'] {
  return ids
    .flatMap((id) => requisitos.get(id) ?? [])
    .sort((a, b) => a.posicao[0] - b.posicao[0] || a.posicao[1] - b.posicao[1])
    .map((requisito) => requisito.resumo)
}
