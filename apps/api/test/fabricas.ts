import { randomUUID } from 'node:crypto'
import { JwtService } from '@nestjs/jwt'
import argon2 from 'argon2'
import { PrismaSistema } from '../src/comum/prisma/prisma-sistema'
import type {
  Album,
  Arquivo,
  Chamada,
  Clube,
  ConfiguracaoClube,
  CriterioRanking,
  Desbravador,
  Foto,
  GatilhoCriterio,
  LancamentoPontos,
  MembroUnidade,
  OrigemPontos,
  Reuniao,
  SituacaoChamada,
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

/** Instante exato de uma data civil (meia-noite UTC), para colunas `@db.Date`. */
function dataCivil(data: string): Date {
  return new Date(`${data}T00:00:00Z`)
}

/** Faz o desbravador membro da unidade de `inicio` ate `fim` (aberto se omitido). */
export async function criarMembro(dados: {
  dbvId: string
  unidadeId: string
  inicio: string
  fim?: string
}): Promise<MembroUnidade> {
  const unidade = await prismaDeTeste().unidade.findUniqueOrThrow({ where: { id: dados.unidadeId } })
  return prismaDeTeste().membroUnidade.create({
    data: {
      clubeId: unidade.clubeId,
      dbvId: dados.dbvId,
      unidadeId: dados.unidadeId,
      inicio: dataCivil(dados.inicio),
      fim: dados.fim ? dataCivil(dados.fim) : null,
    },
  })
}

/** Muda a configuracao do clube (a criada por `criarClube` tem os padroes). */
export async function configurarClube(
  dados: { clubeId: string } & Partial<Omit<ConfiguracaoClube, 'clubeId'>>,
): Promise<ConfiguracaoClube> {
  const { clubeId, ...mudancas } = dados
  return prismaDeTeste().configuracaoClube.update({ where: { clubeId }, data: mudancas })
}

/** O criterio padrao do gatilho (um por gatilho, garantido pelo indice parcial). */
export async function criterioPorGatilho(clubeId: string, gatilho: GatilhoCriterio): Promise<CriterioRanking> {
  return prismaDeTeste().criterioRanking.findFirstOrThrow({ where: { clubeId, gatilho, padrao: true } })
}

export interface LinhaDeChamada {
  dbvId: string
  situacao?: SituacaoChamada
  uniforme?: boolean
  biblia?: boolean
  licao?: boolean
  versao?: Date
}

/** Reuniao com as linhas de chamada dadas; o registrante e criado se nao vier. */
export async function criarReuniao(dados: {
  unidadeId: string
  data: string
  chamada?: LinhaDeChamada[]
  horario?: string
  local?: string | null
  observacoes?: string | null
  registradaPorId?: string
  cabecalhoVersao?: Date
}): Promise<Reuniao> {
  const prisma = prismaDeTeste()
  const unidade = await prisma.unidade.findUniqueOrThrow({ where: { id: dados.unidadeId } })
  const registradaPorId = dados.registradaPorId ?? (await criarUsuario()).id
  const agora = new Date()
  const reuniao = await prisma.reuniao.create({
    data: {
      clubeId: unidade.clubeId,
      unidadeId: dados.unidadeId,
      data: dataCivil(dados.data),
      horario: dados.horario ?? '09:00',
      local: dados.local ?? null,
      observacoes: dados.observacoes ?? null,
      registradaPorId,
      atualizadaPorId: registradaPorId,
      atualizadaEm: agora,
      cabecalhoVersao: dados.cabecalhoVersao ?? agora,
    },
  })
  const linhas = dados.chamada ?? []
  if (linhas.length > 0) {
    await prisma.chamada.createMany({
      data: linhas.map((linha) => ({
        clubeId: unidade.clubeId,
        reuniaoId: reuniao.id,
        dbvId: linha.dbvId,
        situacao: linha.situacao ?? 'PRESENTE',
        uniforme: linha.uniforme ?? false,
        biblia: linha.biblia ?? false,
        licao: linha.licao ?? false,
        versao: linha.versao ?? agora,
        alteradaPorId: registradaPorId,
        envioId: randomUUID(),
      })),
    })
  }
  return reuniao
}

export async function chamadasDaReuniao(reuniaoId: string): Promise<Chamada[]> {
  return prismaDeTeste().chamada.findMany({ where: { reuniaoId }, orderBy: { dbvId: 'asc' } })
}

export async function criarLancamento(dados: {
  clubeId: string
  dbvId: string
  pontos: number
  data: string
  criterioId?: string | null
  origemTipo?: OrigemPontos
  origemId?: string
  lancadoPorId?: string
  estornado?: boolean
}): Promise<LancamentoPontos> {
  return prismaDeTeste().lancamentoPontos.create({
    data: {
      clubeId: dados.clubeId,
      dbvId: dados.dbvId,
      criterioId: dados.criterioId ?? null,
      pontos: dados.pontos,
      data: dataCivil(dados.data),
      origemTipo: dados.origemTipo ?? 'MANUAL',
      origemId: dados.origemId ?? randomUUID(),
      lancadoPorId: dados.lancadoPorId ?? (await criarUsuario()).id,
      estornadoEm: dados.estornado ? new Date() : null,
    },
  })
}

export async function criarArquivo(dados: {
  clubeId: string
  criadoPorId?: string
  caminho?: string
  miniaturaCaminho?: string | null
  mime?: string
  bytes?: number
}): Promise<Arquivo> {
  const id = randomUUID()
  return prismaDeTeste().arquivo.create({
    data: {
      id,
      clubeId: dados.clubeId,
      caminho: dados.caminho ?? `clube/${dados.clubeId}/fotos/2026/${id}.jpg`,
      miniaturaCaminho: dados.miniaturaCaminho === undefined ? `clube/${dados.clubeId}/fotos/2026/${id}-min.jpg` : dados.miniaturaCaminho,
      mime: dados.mime ?? 'image/jpeg',
      bytes: dados.bytes ?? 1000,
      criadoPorId: dados.criadoPorId ?? (await criarUsuario()).id,
    },
  })
}

export async function criarAlbum(dados: {
  unidadeId: string
  titulo?: string
  data: string
  reuniaoId?: string | null
  criadoPorId?: string
}): Promise<Album> {
  const unidade = await prismaDeTeste().unidade.findUniqueOrThrow({ where: { id: dados.unidadeId } })
  return prismaDeTeste().album.create({
    data: {
      clubeId: unidade.clubeId,
      unidadeId: dados.unidadeId,
      titulo: dados.titulo ?? `Album ${unico()}`,
      data: dataCivil(dados.data),
      reuniaoId: dados.reuniaoId ?? null,
      criadoPorId: dados.criadoPorId ?? (await criarUsuario()).id,
    },
  })
}

/** Foto no album, com o arquivo criado junto (id da foto = UUID do aparelho). */
export async function criarFoto(dados: {
  albumId: string
  arquivoId?: string
  legenda?: string | null
  enviadaPorId?: string
  removida?: boolean
}): Promise<Foto> {
  const album = await prismaDeTeste().album.findUniqueOrThrow({ where: { id: dados.albumId } })
  const enviadaPorId = dados.enviadaPorId ?? (await criarUsuario()).id
  const arquivoId = dados.arquivoId ?? (await criarArquivo({ clubeId: album.clubeId, criadoPorId: enviadaPorId })).id
  return prismaDeTeste().foto.create({
    data: {
      id: randomUUID(),
      clubeId: album.clubeId,
      albumId: dados.albumId,
      arquivoId,
      legenda: dados.legenda ?? null,
      enviadaPorId,
      removidaEm: dados.removida ? new Date() : null,
      removidaPorId: dados.removida ? enviadaPorId : null,
    },
  })
}
