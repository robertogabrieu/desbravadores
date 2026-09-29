import { randomUUID } from 'node:crypto'
import { JwtService } from '@nestjs/jwt'
import argon2 from 'argon2'
import { PrismaSistema } from '../src/comum/prisma/prisma-sistema'
import type {
  Clube,
  Desbravador,
  MatriculaClasse,
  Papel,
  Sexo,
  StatusMatricula,
  StatusUsuario,
  TipoPessoa,
  TipoUnidade,
  Trilha,
  Unidade,
  Usuario,
  Vinculo,
} from '../src/generated/prisma/client.js'
import { criarClubeBase } from '../src/scripts/clube-criar'
import { ServicoAccessToken } from '../src/sessao/access-token.service'

/** Senha padrao dos usuarios das fabricas. */
export const SENHA_DE_TESTE = 'Senha@1234'

let cliente: PrismaSistema | undefined

/** Client sem a guarda, so para montar cenario de teste (a guarda vale nas rotas). */
export function prismaDeTeste(): PrismaSistema {
  cliente ??= new PrismaSistema()
  return cliente
}

export async function desconectarPrismaDeTeste(): Promise<void> {
  await cliente?.$disconnect()
  cliente = undefined
}

function unico(): string {
  return randomUUID().slice(0, 8)
}

/** Clube criado como o `clube:criar` cria: configuracao, uma ClasseClube por classe oficial e os 8 criterios. */
export async function criarClube(sobrescrever: { nome?: string; slug?: string } = {}): Promise<Clube> {
  const sufixo = unico()
  return prismaDeTeste().$transaction((tx) =>
    criarClubeBase(tx, {
      nome: sobrescrever.nome ?? `Clube ${sufixo}`,
      slug: sobrescrever.slug ?? `clube-${sufixo}`,
    }),
  )
}

export async function criarUsuario(
  dados: { nome?: string; email?: string; senha?: string; status?: StatusUsuario; genero?: Sexo } = {},
): Promise<Usuario> {
  const status = dados.status ?? 'ATIVO'
  const senhaHash =
    status === 'CONVIDADO'
      ? null
      : await argon2.hash(dados.senha ?? SENHA_DE_TESTE, {
          type: argon2.argon2id,
          memoryCost: 1024,
          timeCost: 2,
          parallelism: 1,
        })
  return prismaDeTeste().usuario.create({
    data: {
      nome: dados.nome ?? `Usuario ${unico()}`,
      email: (dados.email ?? `usuario.${unico()}@exemplo.org`).toLowerCase(),
      senhaHash,
      status,
      genero: dados.genero ?? null,
    },
  })
}

export async function criarUnidade(dados: { clubeId: string; nome?: string; tipo?: TipoUnidade }): Promise<Unidade> {
  return prismaDeTeste().unidade.create({
    data: { clubeId: dados.clubeId, nome: dados.nome ?? `Unidade ${unico()}`, tipo: dados.tipo ?? 'MISTA' },
  })
}

export async function criarVinculo(dados: {
  usuarioId: string
  clubeId: string
  papel: Papel
  ativo?: boolean
  unidadeIds?: string[]
  classeIds?: string[]
}): Promise<Vinculo> {
  const prisma = prismaDeTeste()
  return prisma.$transaction(async (tx) => {
    const vinculo = await tx.vinculo.create({
      data: { usuarioId: dados.usuarioId, clubeId: dados.clubeId, papel: dados.papel, ativo: dados.ativo ?? true },
    })
    if (dados.unidadeIds?.length) {
      await tx.vinculoUnidade.createMany({
        data: dados.unidadeIds.map((unidadeId) => ({ clubeId: dados.clubeId, vinculoId: vinculo.id, unidadeId })),
      })
    }
    if (dados.classeIds?.length) {
      await tx.vinculoClasse.createMany({
        data: dados.classeIds.map((classeId) => ({ vinculoId: vinculo.id, classeId })),
      })
    }
    return vinculo
  })
}

export async function criarDbv(dados: {
  clubeId: string
  nome?: string
  nascimento?: string
  sexo?: Sexo
  tipo?: TipoPessoa
  usuarioId?: string
  ativo?: boolean
}): Promise<Desbravador> {
  const nome = dados.nome ?? `Desbravador ${unico()}`
  return prismaDeTeste().desbravador.create({
    data: {
      clubeId: dados.clubeId,
      nome,
      nomePublico: nome.split(' ')[0] ?? nome,
      tipo: dados.tipo ?? 'DBV',
      usuarioId: dados.usuarioId ?? null,
      nascimento: new Date(`${dados.nascimento ?? '2014-05-10'}T00:00:00Z`),
      sexo: dados.sexo ?? 'M',
      entradaEm: new Date('2026-02-01T00:00:00Z'),
      ativo: dados.ativo ?? true,
    },
  })
}

/** Classe oficial pelo nome (a carga oficial roda antes da suite). */
export async function classeOficial(nome: string, trilha: Trilha = 'INDIVIDUAL'): Promise<{ id: string }> {
  return prismaDeTeste().classe.findFirstOrThrow({ where: { nome, trilha, clubeId: null }, select: { id: true } })
}

export async function criarMatricula(dados: {
  clubeId: string
  dbvId: string
  classeId: string
  anoClube?: number
  status?: StatusMatricula
}): Promise<MatriculaClasse> {
  return prismaDeTeste().matriculaClasse.create({
    data: {
      clubeId: dados.clubeId,
      dbvId: dados.dbvId,
      classeId: dados.classeId,
      anoClube: dados.anoClube ?? 2026,
      status: dados.status ?? 'CURSANDO',
    },
  })
}

/** Access token pronto para o par usuario/vinculo, assinado direto (sem passar pelo login). */
export function criarSessao(dados: { usuarioId: string; vinculoId: string | null }): string {
  const servico = new ServicoAccessToken(new JwtService({ secret: process.env['JWT_SEGREDO'] }))
  return servico.emitir(dados)
}

export interface Acesso {
  usuario: Usuario
  vinculo: Vinculo
  accessToken: string
  /** Valor do cabecalho Authorization. */
  autorizacao: string
}

/** Usuario ativo com vinculo no clube e o access token dele. */
export async function criarAcesso(dados: {
  clubeId: string
  papel: Papel
  unidadeIds?: string[]
  classeIds?: string[]
}): Promise<Acesso> {
  const usuario = await criarUsuario()
  const vinculo = await criarVinculo({ ...dados, usuarioId: usuario.id })
  const accessToken = criarSessao({ usuarioId: usuario.id, vinculoId: vinculo.id })
  return { usuario, vinculo, accessToken, autorizacao: `Bearer ${accessToken}` }
}
