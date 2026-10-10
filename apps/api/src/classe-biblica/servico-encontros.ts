import { Injectable } from '@nestjs/common'
import {
  hojeNoFuso,
  type Aviso as AvisoContrato,
  type CancelarEntrada,
  type EncontroDetalheSaida,
  type EncontroSaida,
  type RemarcarEntrada,
} from '@desbravadores/shared'
import type { z } from 'zod'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import { daDataCivil, paraDataCivil } from '../desbravadores/apoio'
import type { EncontroClasseBiblica, Prisma } from '../generated/prisma/client.js'
import { diaEMes } from '../progresso/conclusoes'
import { ROTULO_DO_IMPEDIMENTO, somarDias, TIPOS_QUE_IMPEDEM } from './datas'

type Aviso = z.infer<typeof AvisoContrato>
type Encontro = z.infer<typeof EncontroSaida>
type Detalhe = z.infer<typeof EncontroDetalheSaida>
type Tx = Prisma.TransactionClient
type Banco = Tx | PrismaService

const TEMPO_DA_TRANSACAO_MS = 20_000
const CONFIRA = 'Confira os campos informados.'
export const ENCONTRO_NAO_ENCONTRADO = 'Encontro não encontrado.'
const JA_TEM_CHAMADA = 'Este encontro já tem chamada feita, por isso não dá para remarcar nem cancelar.'

/** Remarcar, cancelar e desfazer o cancelamento (regra 7), sempre com o evento do calendário junto. */
@Injectable()
export class ServicoEncontros {
  constructor(private readonly prisma: PrismaService) {}

  async detalhe(sessao: SessaoLogada, id: string): Promise<Detalhe> {
    const { clubeId } = sessao
    const encontro = await exigirEncontro(this.prisma, clubeId, id)
    const edicao = await this.prisma.edicaoClasseBiblica.findFirstOrThrow({
      where: { clubeId, id: encontro.edicaoId },
      select: { id: true, nome: true, inicio: true, fim: true },
    })
    const inicio = edicao.inicio ? paraDataCivil(edicao.inicio) : paraDataCivil(encontro.data)
    const fim = edicao.fim ? paraDataCivil(edicao.fim) : paraDataCivil(encontro.data)
    const [grupos, outros, impedimentos, hoje] = await Promise.all([
      this.prisma.grupoClasseBiblica.findMany({
        where: { clubeId, edicaoId: edicao.id, removidoEm: null },
        select: { nome: true },
        orderBy: [{ ordem: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.encontroClasseBiblica.findMany({
        where: { clubeId, edicaoId: edicao.id, canceladoEm: null, id: { not: encontro.id } },
        select: { data: true },
        orderBy: { data: 'asc' },
      }),
      eventosQueAvisam(this.prisma, clubeId, inicio, fim),
      hojeDoClube(this.prisma, clubeId),
    ])
    const avisos: Detalhe['avisos'] = []
    for (let data = inicio; data <= fim; data = somarDias(data, 1)) {
      const evento = impedimentos.find((e) => e.inicio <= data && data <= e.fim)
      if (evento) avisos.push({ data, motivo: evento.motivo })
    }
    return {
      encontro: await saidaDoEncontro(this.prisma, clubeId, encontro, hoje),
      edicao: { id: edicao.id, nome: edicao.nome ?? '', inicio, fim },
      grupos: grupos.map((grupo) => grupo.nome),
      ocupadas: [...new Set(outros.map((outro) => paraDataCivil(outro.data)))],
      avisos,
    }
  }

  /** A nova data fica no período, não antes de hoje e fora das datas de outros encontros não cancelados. */
  async remarcar(sessao: SessaoLogada, id: string, entrada: z.infer<typeof RemarcarEntrada>): Promise<{ dados: Encontro; avisos: Aviso[] }> {
    const { clubeId } = sessao
    return this.transacao(clubeId, id, async (tx, encontro, hoje) => {
      if (encontro.canceladoEm) throw new ErroApp('REGRA', 'Desfaça o cancelamento antes de remarcar o encontro.')
      await exigirSemChamada(tx, clubeId, encontro.id)
      const edicao = await tx.edicaoClasseBiblica.findFirstOrThrow({ where: { clubeId, id: encontro.edicaoId }, select: { inicio: true, fim: true } })
      const { data } = entrada
      if (!edicao.inicio || !edicao.fim || data < paraDataCivil(edicao.inicio) || data > paraDataCivil(edicao.fim)) {
        throw new ErroApp('VALIDACAO', CONFIRA, { data: 'Escolha uma data dentro do período da edição.' })
      }
      if (data < hoje) throw new ErroApp('VALIDACAO', CONFIRA, { data: 'Escolha uma data de hoje em diante.' })
      if (await outroNaData(tx, clubeId, encontro, data)) {
        throw new ErroApp('VALIDACAO', CONFIRA, { data: `Já existe outro encontro em ${diaEMes(data)}.` })
      }

      const horario = entrada.horario ?? encontro.horario
      const original = encontro.dataOriginal ?? encontro.data
      const atualizado = await tx.encontroClasseBiblica.update({
        where: { clubeId_id: { clubeId, id: encontro.id } },
        data: { data: daDataCivil(data), horario, dataOriginal: data === paraDataCivil(original) ? null : original },
      })
      await tx.eventoCalendario.update({
        where: { clubeId_id: { clubeId, id: encontro.eventoId } },
        data: { inicio: daDataCivil(data), fim: daDataCivil(data), horario },
      })
      const evento = (await eventosQueAvisam(tx, clubeId, data, data))[0]
      const avisos = evento ? [{ codigo: 'AVISO_DATA_DO_CALENDARIO', mensagem: `${diaEMes(data)} cai em ${evento.motivo}.` }] : []
      return { dados: await saidaDoEncontro(tx, clubeId, atualizado, hoje), avisos }
    })
  }

  /** O motivo aparece no calendário e no painel; o evento fica, riscado, e o encontro sai das contas. */
  async cancelar(sessao: SessaoLogada, id: string, entrada: z.infer<typeof CancelarEntrada>): Promise<Encontro> {
    const { clubeId } = sessao
    return this.transacao(clubeId, id, async (tx, encontro, hoje) => {
      if (encontro.canceladoEm) return saidaDoEncontro(tx, clubeId, encontro, hoje)
      await exigirSemChamada(tx, clubeId, encontro.id)
      const atualizado = await tx.encontroClasseBiblica.update({
        where: { clubeId_id: { clubeId, id: encontro.id } },
        data: { canceladoEm: new Date(), motivoCancelamento: entrada.motivo, canceladoPorId: sessao.usuarioId },
      })
      return saidaDoEncontro(tx, clubeId, atualizado, hoje)
    })
  }

  /** Vale até a data do encontro e só se nenhum outro encontro não cancelado ocupa a data. */
  async desfazerCancelamento(sessao: SessaoLogada, id: string): Promise<Encontro> {
    const { clubeId } = sessao
    return this.transacao(clubeId, id, async (tx, encontro, hoje) => {
      if (!encontro.canceladoEm) return saidaDoEncontro(tx, clubeId, encontro, hoje)
      const data = paraDataCivil(encontro.data)
      if (data < hoje) throw new ErroApp('REGRA', 'O cancelamento só pode ser desfeito até a data do encontro.')
      if (await outroNaData(tx, clubeId, encontro, data)) {
        throw new ErroApp('REGRA', `Outro encontro já está marcado em ${diaEMes(data)}; remarque um deles antes de desfazer o cancelamento.`)
      }
      const atualizado = await tx.encontroClasseBiblica.update({
        where: { clubeId_id: { clubeId, id: encontro.id } },
        data: { canceladoEm: null, motivoCancelamento: null, canceladoPorId: null },
      })
      return saidaDoEncontro(tx, clubeId, atualizado, hoje)
    })
  }

  /**
   * Trava por clube (a mesma do terminar, contra duas datas iguais) e a linha do encontro (a mesma do
   * envio da chamada, contra remarcar ou cancelar enquanto uma chamada grava).
   */
  private transacao<T>(clubeId: string, id: string, gravar: (tx: Tx, encontro: EncontroClasseBiblica, hoje: string) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`classe-biblica:${clubeId}`}, 0))`
        await tx.$queryRaw`SELECT id FROM "EncontroClasseBiblica" WHERE id = ${id}::uuid AND "clubeId" = ${clubeId}::uuid FOR UPDATE`
        const encontro = await exigirEncontro(tx, clubeId, id)
        return gravar(tx, encontro, await hojeDoClube(tx, clubeId))
      },
      { timeout: TEMPO_DA_TRANSACAO_MS },
    )
  }
}

export async function exigirEncontro(db: Banco, clubeId: string, id: string): Promise<EncontroClasseBiblica> {
  const encontro = await db.encontroClasseBiblica.findFirst({ where: { clubeId, id } })
  if (!encontro) throw new ErroApp('NAO_ENCONTRADO', ENCONTRO_NAO_ENCONTRADO)
  return encontro
}

export async function hojeDoClube(db: Banco, clubeId: string, agora: Date = new Date()): Promise<string> {
  const configuracao = await db.configuracaoClube.findUniqueOrThrow({ where: { clubeId }, select: { fuso: true } })
  return hojeNoFuso(configuracao.fuso, agora)
}

async function exigirSemChamada(tx: Tx, clubeId: string, encontroId: string): Promise<void> {
  const chamada = await tx.chamadaClasseBiblica.findFirst({ where: { clubeId, encontroId }, select: { grupoId: true } })
  if (chamada) throw new ErroApp('CONFLITO', JA_TEM_CHAMADA)
}

async function outroNaData(db: Banco, clubeId: string, encontro: EncontroClasseBiblica, data: string): Promise<boolean> {
  const outro = await db.encontroClasseBiblica.findFirst({
    where: { clubeId, edicaoId: encontro.edicaoId, canceladoEm: null, id: { not: encontro.id }, data: daDataCivil(data) },
    select: { id: true },
  })
  return outro !== null
}

async function eventosQueAvisam(db: Banco, clubeId: string, inicio: string, fim: string): Promise<{ inicio: string; fim: string; motivo: string }[]> {
  const eventos = await db.eventoCalendario.findMany({
    where: { clubeId, removidoEm: null, tipo: { in: TIPOS_QUE_IMPEDEM }, inicio: { lte: daDataCivil(fim) }, fim: { gte: daDataCivil(inicio) } },
    select: { nome: true, tipo: true, inicio: true, fim: true },
    orderBy: [{ inicio: 'asc' }, { id: 'asc' }],
  })
  return eventos.map((evento) => ({
    inicio: paraDataCivil(evento.inicio),
    fim: paraDataCivil(evento.fim),
    motivo: `${ROTULO_DO_IMPEDIMENTO[evento.tipo] ?? ''}: ${evento.nome}`,
  }))
}

async function saidaDoEncontro(db: Banco, clubeId: string, encontro: EncontroClasseBiblica, hoje: string): Promise<Encontro> {
  const data = paraDataCivil(encontro.data)
  const [chamada, ocupada] = await Promise.all([
    db.chamadaClasseBiblica.findFirst({ where: { clubeId, encontroId: encontro.id }, select: { grupoId: true } }),
    encontro.canceladoEm ? outroNaData(db, clubeId, encontro, data) : Promise.resolve(true),
  ])
  return {
    id: encontro.id,
    edicaoId: encontro.edicaoId,
    data,
    horario: encontro.horario,
    local: encontro.local,
    dataOriginal: encontro.dataOriginal ? paraDataCivil(encontro.dataOriginal) : null,
    cancelado: encontro.canceladoEm !== null,
    motivo: encontro.motivoCancelamento,
    temChamada: chamada !== null,
    podeDesfazer: encontro.canceladoEm !== null && data >= hoje && !ocupada,
  }
}
