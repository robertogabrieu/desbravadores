import { Injectable, Logger } from '@nestjs/common'
import {
  PAPEIS_DA_DIRETORIA,
  recusaDeVoltarADesbravador,
  regraDaDiretoria,
  tipoDaFicha,
  type FichaDoTipo,
  type Papel,
  type TipoDecidido,
} from '@desbravadores/shared'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import type { Prisma, TipoPessoa } from '../generated/prisma/client.js'
import { daDataCivil, paraDataCivil } from './apoio'
import { ServicoEscopo } from './escopo.service'

type Cliente = Prisma.TransactionClient

/** O que a sincronização lê da ficha; a gravação só vale se `tipo`, `diretoriaPeloAdm`, `nascimento` e `usuarioId` ainda forem estes. */
export interface FichaLida {
  id: string
  tipo: TipoPessoa
  diretoriaPeloAdm: boolean
  diretoriaDesde: Date | null
  nascimento: Date
  usuarioId: string | null
  papeis: Papel[]
}

function selecaoDaFicha(clubeId: string) {
  return {
    id: true,
    tipo: true,
    diretoriaPeloAdm: true,
    diretoriaDesde: true,
    nascimento: true,
    usuarioId: true,
    usuario: {
      select: { vinculos: { where: { clubeId, ativo: true, papel: { in: [...PAPEIS_DA_DIRETORIA] } }, select: { papel: true } } },
    },
  } satisfies Prisma.DesbravadorSelect
}

type FichaDoBanco = Prisma.DesbravadorGetPayload<{ select: ReturnType<typeof selecaoDaFicha> }>

function lida(ficha: FichaDoBanco): FichaLida {
  const { usuario, ...campos } = ficha
  return { ...campos, papeis: usuario?.vinculos.map((vinculo) => vinculo.papel) ?? [] }
}

function paraFormula(ficha: FichaLida): FichaDoTipo {
  return {
    tipo: ficha.tipo,
    diretoriaPeloAdm: ficha.diretoriaPeloAdm,
    diretoriaDesde: ficha.diretoriaDesde ? paraDataCivil(ficha.diretoriaDesde) : null,
    nascimento: paraDataCivil(ficha.nascimento),
    papeis: ficha.papeis,
  }
}

function colunas(decidido: TipoDecidido) {
  return {
    tipo: decidido.tipo,
    diretoriaPeloAdm: decidido.diretoriaPeloAdm,
    diretoriaDesde: decidido.diretoriaDesde ? daDataCivil(decidido.diretoriaDesde) : null,
  }
}

/**
 * A véspera da entrada na Diretoria, que o ranking dos meses anteriores lê: se era DBV e a unidade aberta no
 * momento da troca (lida antes de a troca encerrá-la). Quem já era Diretoria guarda a da entrada; quem sai, zera.
 */
async function vesperaDaDiretoria(
  tx: Cliente,
  clubeId: string,
  ficha: FichaLida,
  novo: TipoPessoa,
): Promise<{ diretoriaVeioDeDbv?: boolean; diretoriaUnidadeAnteriorId?: string | null }> {
  if (novo !== 'DIRETORIA') return { diretoriaVeioDeDbv: false, diretoriaUnidadeAnteriorId: null }
  if (ficha.tipo === 'DIRETORIA') return {}
  if (ficha.tipo !== 'DBV') return { diretoriaVeioDeDbv: false, diretoriaUnidadeAnteriorId: null }
  const aberta = await tx.membroUnidade.findFirst({ where: { clubeId, dbvId: ficha.id, fim: null }, select: { unidadeId: true } })
  return { diretoriaVeioDeDbv: true, diretoriaUnidadeAnteriorId: aberta?.unidadeId ?? null }
}

/** Ao entrar na Diretoria ou em Líder, a passagem aberta pela unidade termina no dia da troca; nunca é apagada. */
async function encerrarUnidade(tx: Cliente, clubeId: string, dbvId: string, dia: string): Promise<void> {
  const aberta = await tx.membroUnidade.findFirst({ where: { clubeId, dbvId, fim: null } })
  if (!aberta) return
  const fim = daDataCivil(dia)
  await tx.membroUnidade.update({ where: { id: aberta.id, clubeId }, data: { fim: fim < aberta.inicio ? aberta.inicio : fim } })
}

/**
 * Aplica a regra da Diretoria (função pura `tipoDaFicha`) às fichas gravadas. Todo gatilho é idempotente:
 * cadastro e edição da ficha, papel dado ou tirado, aceite de convite e a varredura periódica.
 */
@Injectable()
export class ServicoTipoDaFicha {
  private readonly logger = new Logger(ServicoTipoDaFicha.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly escopo: ServicoEscopo,
  ) {}

  async hoje(clubeId: string): Promise<string> {
    return (await this.escopo.relogio(clubeId)).hoje
  }

  async lerFicha(tx: Cliente, clubeId: string, dbvId: string): Promise<FichaLida> {
    return lida(await tx.desbravador.findFirstOrThrow({ where: { clubeId, id: dbvId }, select: selecaoDaFicha(clubeId) }))
  }

  async sincronizarFicha(tx: Cliente, clubeId: string, dbvId: string, hoje: string): Promise<void> {
    await this.aplicar(tx, clubeId, await this.lerFicha(tx, clubeId, dbvId), hoje)
  }

  /** Papel dado, alterado ou desativado: recalcula a ficha ligada à conta neste clube. */
  async sincronizarConta(tx: Cliente, clubeId: string, usuarioId: string, hoje: string): Promise<void> {
    const fichas = await tx.desbravador.findMany({ where: { clubeId, usuarioId }, select: selecaoDaFicha(clubeId) })
    for (const ficha of fichas) await this.aplicar(tx, clubeId, lida(ficha), hoje)
  }

  /**
   * Varredura de um clube; cada ficha que muda grava na própria transação. Erro numa ficha vai para o log e
   * não para as outras. Devolve quantas mudaram.
   */
  async sincronizarClube(clubeId: string, hoje?: string): Promise<number> {
    const dia = hoje ?? (await this.hoje(clubeId))
    const fichas = await this.prisma.desbravador.findMany({
      where: { clubeId, tipo: { in: ['DBV', 'DIRETORIA'] } },
      select: selecaoDaFicha(clubeId),
    })
    let mudaram = 0
    for (const ficha of fichas) {
      try {
        if (await this.prisma.$transaction((tx) => this.aplicar(tx, clubeId, lida(ficha), dia))) mudaram++
      } catch (erro) {
        this.logger.error(`Clube ${clubeId}, ficha ${ficha.id}: Tipo não recalculado: ${erro instanceof Error ? erro.message : String(erro)}`)
      }
    }
    return mudaram
  }

  /**
   * Grava o Tipo que a regra pede. A gravação é condicional ao que a regra leu (`tipo`, `diretoriaPeloAdm`,
   * `nascimento` e a conta ligada): se o Adm mudou a ficha depois da leitura, nada é gravado. Devolve se gravou.
   */
  async aplicar(tx: Cliente, clubeId: string, ficha: FichaLida, hoje: string): Promise<boolean> {
    const atual = paraFormula(ficha)
    const decidido = tipoDaFicha(atual, hoje)
    const igual =
      decidido.tipo === atual.tipo &&
      decidido.diretoriaPeloAdm === atual.diretoriaPeloAdm &&
      decidido.diretoriaDesde === atual.diretoriaDesde
    if (igual) return false
    const vespera = await vesperaDaDiretoria(tx, clubeId, ficha, decidido.tipo)
    const gravada = await tx.desbravador.updateMany({
      where: {
        clubeId,
        id: ficha.id,
        tipo: ficha.tipo,
        diretoriaPeloAdm: ficha.diretoriaPeloAdm,
        nascimento: ficha.nascimento,
        usuarioId: ficha.usuarioId,
      },
      data: { ...colunas(decidido), ...vespera },
    })
    if (gravada.count === 0) return false
    if (decidido.tipo !== 'DBV') await encerrarUnidade(tx, clubeId, ficha.id, hoje)
    return true
  }

  /** O Adm trocou o Tipo na edição: Diretoria fora da regra fica marcada como dele; Desbravador só sem a regra. */
  async escolhaDoAdm(tx: Cliente, clubeId: string, ficha: FichaLida, tipo: TipoPessoa, hoje: string): Promise<void> {
    const nascimento = paraDataCivil(ficha.nascimento)
    let decidido: TipoDecidido
    if (tipo === 'DBV') {
      const recusa = recusaDeVoltarADesbravador(nascimento, ficha.papeis, hoje)
      if (recusa) throw new ErroApp('REGRA', recusa)
      decidido = { tipo, diretoriaPeloAdm: false, diretoriaDesde: null }
    } else if (tipo === 'DIRETORIA') {
      decidido = { tipo, diretoriaPeloAdm: !regraDaDiretoria(nascimento, ficha.papeis, hoje), diretoriaDesde: hoje }
    } else {
      decidido = { tipo, diretoriaPeloAdm: false, diretoriaDesde: null }
    }
    const vespera = await vesperaDaDiretoria(tx, clubeId, ficha, tipo)
    await tx.desbravador.update({ where: { id: ficha.id, clubeId }, data: { ...colunas(decidido), ...vespera } })
    if (tipo !== 'DBV') await encerrarUnidade(tx, clubeId, ficha.id, hoje)
  }
}
