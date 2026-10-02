import { Injectable } from '@nestjs/common'
import type { AulaEnvio, AulaEnvioSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { paraDataCivil } from '../desbravadores/apoio'
import { ServicoEscopo } from '../desbravadores/escopo.service'
import type { Prisma, RegistroAula, TipoPessoa } from '../generated/prisma/client.js'
import { ServicoPontos } from '../pontos/servico-pontos'
import { ehFichaDaSessao } from '../progresso/conclusoes'

type Envio = z.infer<typeof AulaEnvio>
type Saida = z.infer<typeof AulaEnvioSaida>
type Tx = Prisma.TransactionClient
type Item = Envio['tarefaItensAcrescentados'][number]
type MarcaEspecialidade = Envio['especialidadesMarcadas'][number]
type ItemSemEfeito = Saida['tarefaItensSemEfeito'][number]
type EspecialidadeSemEfeito = Saida['especialidadesSemEfeito'][number]

export interface ContextoDaEntrega {
  sessao: SessaoLogada
  registro: RegistroAula
  envio: Envio
  membros: ReadonlyMap<string, { tipo: TipoPessoa; usuarioId: string | null }>
  /** Quem esta ausente segundo o banco, depois de aplicadas as presencas deste envio. */
  ausentes: ReadonlySet<string>
  anoClube: number
  agora: Date
}

export interface ResultadoDaEntrega {
  tarefaItensSemEfeito: ItemSemEfeito[]
  especialidadesSemEfeito: EspecialidadeSemEfeito[]
  foraDaAula: string[]
  avisos: string[]
  gravou: boolean
}

export const AVISO_TAREFA_DE_OUTRA_CLASSE = 'Uma tarefa que não é desta classe ficou como estava.'

/** Requisitos da classe que o clube considera ativos (o ajuste do clube vale sobre o oficial). */
export async function requisitosValidos(tx: Tx, clubeId: string, classeId: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const [requisitos, ajustes] = await Promise.all([
    tx.requisito.findMany({ where: { id: { in: ids }, secao: { classeId } }, select: { id: true, ativo: true } }),
    tx.requisitoAjuste.findMany({ where: { clubeId, requisitoId: { in: ids } }, select: { requisitoId: true, ativo: true } }),
  ])
  const ajustePorId = new Map(ajustes.map((ajuste) => [ajuste.requisitoId, ajuste.ativo]))
  return new Set(requisitos.filter((r) => ajustePorId.get(r.id) ?? r.ativo).map((r) => r.id))
}

function chaveDoItem(item: Item): string {
  return 'requisitoId' in item ? `requisito:${item.requisitoId}` : `especialidade:${item.especialidadeId}`
}

function chaveDaMarca(marca: MarcaEspecialidade): string {
  return `${marca.dbvId}:${marca.especialidadeId}`
}

/** Um item (ou par) so conta uma vez, na primeira aparicao. */
function semRepetidos<T>(lista: T[], chave: (elemento: T) => string): T[] {
  return [...new Map(lista.map((elemento) => [chave(elemento), elemento])).values()]
}

/**
 * A parte do envio do registro que passa, cobra e encerra a tarefa para casa. Roda dentro da transacao do
 * envio; nada aqui recusa o envio: o que nao vale volta como aviso.
 */
@Injectable()
export class TarefasEnvio {
  constructor(
    private readonly escopo: ServicoEscopo,
    private readonly pontos: ServicoPontos,
  ) {}

  async aplicar(tx: Tx, contexto: ContextoDaEntrega): Promise<ResultadoDaEntrega> {
    const podeMarcarEspecialidade = (await this.escopo.permissoes(contexto.sessao)).includes('requisito.marcar')
    const tarefa = await this.aplicarItens(tx, contexto, podeMarcarEspecialidade)
    const especialidades = await this.aplicarEspecialidades(tx, contexto, podeMarcarEspecialidade)
    const encerramento = await this.encerrar(tx, contexto)
    return {
      tarefaItensSemEfeito: tarefa.semEfeito,
      especialidadesSemEfeito: especialidades.semEfeito,
      foraDaAula: especialidades.foraDaAula,
      avisos: encerramento.avisos,
      gravou: tarefa.gravou || especialidades.gravou || encerramento.gravou,
    }
  }

  /** A tarefa do registro (so existe uma): a que ja esta la, ou a nova com o id do aparelho. */
  private async acharOuCriarTarefa(tx: Tx, { sessao, registro, envio, anoClube }: ContextoDaEntrega): Promise<{ id: string; criada: boolean } | null> {
    const { clubeId } = sessao
    const existente = await tx.tarefaCasa.findFirst({ where: { clubeId, registroAulaId: registro.id }, select: { id: true } })
    if (existente) return { id: existente.id, criada: false }
    if (envio.tarefaId === null) return null
    await tx.tarefaCasa.create({
      data: { id: envio.tarefaId, clubeId, classeId: registro.classeId, registroAulaId: registro.id, anoClube, criadaPorId: sessao.usuarioId },
    })
    return { id: envio.tarefaId, criada: true }
  }

  /** Retira e acrescenta itens, com a validacao de item (requisito da classe ou especialidade ativa) e de repeticao. */
  private async aplicarItens(tx: Tx, contexto: ContextoDaEntrega, podeMarcarEspecialidade: boolean) {
    const { sessao, registro, envio, agora } = contexto
    const { clubeId } = sessao
    const semEfeito: ItemSemEfeito[] = []
    const tarefa = await this.acharOuCriarTarefa(tx, contexto)
    if (!tarefa) return { semEfeito, gravou: false }
    let gravou = tarefa.criada

    for (const item of semRepetidos(envio.tarefaItensRetirados, chaveDoItem)) {
      const { count } = await tx.tarefaItem.updateMany({
        where: { clubeId, tarefaId: tarefa.id, removidoEm: null, ...item },
        data: { removidoEm: agora, removidoPorId: sessao.usuarioId },
      })
      if (count > 0) gravou = true
    }

    const acrescentados = semRepetidos(envio.tarefaItensAcrescentados, chaveDoItem)
    const requisitosIds = acrescentados.flatMap((item) => ('requisitoId' in item ? [item.requisitoId] : []))
    const especialidadesIds = acrescentados.flatMap((item) => ('especialidadeId' in item ? [item.especialidadeId] : []))
    const [requisitosOk, especialidadesOk, jaNestaTarefa, emOutraTarefa] = await Promise.all([
      requisitosValidos(tx, clubeId, registro.classeId, requisitosIds),
      this.especialidadesValidas(tx, clubeId, especialidadesIds),
      this.itensAtivosDa(tx, clubeId, { id: tarefa.id }, requisitosIds, especialidadesIds),
      this.itensAtivosDa(tx, clubeId, { id: { not: tarefa.id }, classeId: registro.classeId, encerradaEm: null }, requisitosIds, especialidadesIds),
    ])

    for (const item of acrescentados) {
      const chave = chaveDoItem(item)
      if (jaNestaTarefa.has(chave)) continue
      const sem = (motivo: ItemSemEfeito['motivo']): void => {
        semEfeito.push({ item, motivo })
      }
      if ('especialidadeId' in item && !podeMarcarEspecialidade) {
        sem('SEM_PERMISSAO')
        continue
      }
      const valido = 'requisitoId' in item ? requisitosOk.has(item.requisitoId) : especialidadesOk.has(item.especialidadeId)
      if (!valido) {
        sem('ITEM_INVALIDO')
        continue
      }
      if (emOutraTarefa.has(chave)) {
        sem('JA_EM_TAREFA')
        continue
      }
      await tx.tarefaItem.create({ data: { clubeId, tarefaId: tarefa.id, criadoPorId: sessao.usuarioId, ...item } })
      gravou = true
    }
    return { semEfeito, gravou }
  }

  /** Chaves (`chaveDoItem`) dos itens ativos, entre os dados, das tarefas que casam com `daTarefa`. */
  private async itensAtivosDa(
    tx: Tx,
    clubeId: string,
    daTarefa: Prisma.TarefaCasaWhereInput,
    requisitosIds: string[],
    especialidadesIds: string[],
  ): Promise<Set<string>> {
    if (requisitosIds.length === 0 && especialidadesIds.length === 0) return new Set()
    const itens = await tx.tarefaItem.findMany({
      where: {
        clubeId,
        removidoEm: null,
        tarefa: { clubeId, ...daTarefa },
        OR: [{ requisitoId: { in: requisitosIds } }, { especialidadeId: { in: especialidadesIds } }],
      },
      select: { requisitoId: true, especialidadeId: true },
    })
    return new Set(itens.map((i) => (i.requisitoId ? `requisito:${i.requisitoId}` : `especialidade:${i.especialidadeId}`)))
  }

  /** Especialidades ativas, oficiais ou do clube (a mesma regra da ficha). */
  private async especialidadesValidas(tx: Tx, clubeId: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set()
    const especialidades = await tx.especialidade.findMany({
      where: { id: { in: ids }, ativa: true, OR: [{ clubeId: null }, { clubeId }] },
      select: { id: true },
    })
    return new Set(especialidades.map((e) => e.id))
  }

  /** Desfaz so o concluido neste registro (estorna), conclui o que vale, e o resto vai para `semEfeito`. */
  private async aplicarEspecialidades(tx: Tx, contexto: ContextoDaEntrega, podeMarcar: boolean) {
    const { sessao, registro, envio, membros, ausentes, agora } = contexto
    const { clubeId } = sessao
    const semEfeito: EspecialidadeSemEfeito[] = []
    const foraDaAula = new Set<string>()
    let gravou = false
    const recusar = (marca: MarcaEspecialidade, motivo: EspecialidadeSemEfeito['motivo'], concluidaEm: string | null = null): void => {
      semEfeito.push({ dbvId: marca.dbvId, especialidadeId: marca.especialidadeId, motivo, concluidaEm })
    }
    const doRegistro = (marca: MarcaEspecialidade): { tipo: TipoPessoa } | null => {
      const membro = membros.get(marca.dbvId)
      if (!membro) {
        foraDaAula.add(marca.dbvId)
        return null
      }
      if (ehFichaDaSessao(sessao, membro.usuarioId)) {
        recusar(marca, 'PROPRIA_FICHA')
        return null
      }
      if (!podeMarcar) {
        recusar(marca, 'SEM_PERMISSAO')
        return null
      }
      return membro
    }

    for (const marca of semRepetidos(envio.especialidadesDesmarcadas, chaveDaMarca)) {
      const membro = doRegistro(marca)
      if (!membro) continue
      const { count } = await tx.especialidadeConcluida.updateMany({
        where: { clubeId, dbvId: marca.dbvId, especialidadeId: marca.especialidadeId, registroAulaId: registro.id, removidoEm: null },
        data: { removidoEm: agora, removidoPorId: sessao.usuarioId },
      })
      if (count === 0) continue
      gravou = true
      if (membro.tipo === 'DBV') await this.sincronizarPontos(tx, contexto, marca, [])
    }

    const marcadas = semRepetidos(envio.especialidadesMarcadas, chaveDaMarca)
    const validas = await this.especialidadesValidas(tx, clubeId, marcadas.map((m) => m.especialidadeId))
    const jaConcluidas = new Map(
      (
        await tx.especialidadeConcluida.findMany({
          where: {
            clubeId,
            removidoEm: null,
            dbvId: { in: marcadas.map((m) => m.dbvId) },
            especialidadeId: { in: marcadas.map((m) => m.especialidadeId) },
          },
        })
      ).map((conclusao) => [`${conclusao.dbvId}:${conclusao.especialidadeId}`, conclusao]),
    )
    const criterio = await tx.criterioRanking.findFirst({ where: { clubeId, gatilho: 'ESPECIALIDADE', padrao: true, ativo: true } })

    for (const marca of marcadas) {
      const membro = doRegistro(marca)
      if (!membro) continue
      if (!validas.has(marca.especialidadeId)) {
        recusar(marca, 'ESPECIALIDADE_INVALIDA')
        continue
      }
      if (ausentes.has(marca.dbvId)) {
        recusar(marca, 'AUSENTE')
        continue
      }
      const existente = jaConcluidas.get(chaveDaMarca(marca))
      if (existente) {
        recusar(marca, 'JA_CONCLUIDA', paraDataCivil(existente.concluidaEm))
        continue
      }
      await tx.especialidadeConcluida.create({
        data: {
          clubeId,
          dbvId: marca.dbvId,
          especialidadeId: marca.especialidadeId,
          concluidaEm: registro.data,
          registroAulaId: registro.id,
          marcadoPorId: sessao.usuarioId,
        },
      })
      gravou = true
      if (membro.tipo === 'DBV' && criterio) await this.sincronizarPontos(tx, contexto, marca, [{ criterioId: criterio.id, pontos: criterio.pontos }])
    }
    return { semEfeito, foraDaAula: [...foraDaAula], gravou }
  }

  private sincronizarPontos(
    tx: Tx,
    { sessao, registro }: ContextoDaEntrega,
    marca: MarcaEspecialidade,
    devidos: { criterioId: string; pontos: number }[],
  ): Promise<void> {
    return this.pontos.sincronizar(tx, {
      clubeId: sessao.clubeId,
      dbvId: marca.dbvId,
      origemTipo: 'ESPECIALIDADE',
      origemId: chaveDaMarca(marca),
      data: paraDataCivil(registro.data),
      devidos,
      lancadoPorId: sessao.usuarioId,
    })
  }

  /** Encerra so tarefa aberta desta classe e clube; id de outra classe ou clube vira um aviso unico. */
  private async encerrar(tx: Tx, { sessao, registro, envio, agora }: ContextoDaEntrega): Promise<{ avisos: string[]; gravou: boolean }> {
    const { clubeId } = sessao
    const ids = [...new Set(envio.tarefasEncerradas)]
    if (ids.length === 0) return { avisos: [], gravou: false }
    const { count } = await tx.tarefaCasa.updateMany({
      where: { clubeId, classeId: registro.classeId, id: { in: ids }, encerradaEm: null },
      data: { encerradaEm: agora, encerradaPorId: sessao.usuarioId },
    })
    const desta = await tx.tarefaCasa.findMany({ where: { clubeId, classeId: registro.classeId, id: { in: ids } }, select: { id: true } })
    return { avisos: desta.length < ids.length ? [AVISO_TAREFA_DE_OUTRA_CLASSE] : [], gravou: count > 0 }
  }
}
