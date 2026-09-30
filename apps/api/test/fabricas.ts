import { randomUUID } from 'node:crypto'
import { JwtService } from '@nestjs/jwt'
import argon2 from 'argon2'
import { PrismaSistema } from '../src/comum/prisma/prisma-sistema'
import { MARCACOES_PADRAO, anoClube as anoDoClube, hojeNoFuso } from '@desbravadores/shared'
import type {
  Album,
  Arquivo,
  AulaPlanejada,
  Cronograma,
  CronogramaPublicacao,
  EspecialidadeConcluida,
  EventoCalendario,
  Material,
  Notificacao,
  Observacao,
  RegistroAula,
  RequisitoConcluido,
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
  StatusCronograma,
  TipoEvento,
  TipoNotificacao,
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

type Marcacoes = { cancelaReuniao: boolean; bloqueiaAula: boolean; bomParaCampo: boolean }

/** Evento do calendario; sem `marcacoes`, valem as do tipo (`MARCACOES_PADRAO`). */
export async function criarEvento(dados: {
  clubeId: string
  tipo: TipoEvento
  inicio: string
  fim?: string
  marcacoes?: Partial<Marcacoes>
}): Promise<EventoCalendario> {
  return prismaDeTeste().eventoCalendario.create({
    data: {
      clubeId: dados.clubeId,
      nome: `Evento ${unico()}`,
      tipo: dados.tipo,
      inicio: dataCivil(dados.inicio),
      fim: dataCivil(dados.fim ?? dados.inicio),
      ...MARCACOES_PADRAO[dados.tipo],
      ...dados.marcacoes,
      criadoPorId: (await criarUsuario()).id,
    },
  })
}

/** Ano do clube de hoje, calculado como a API calcula (fuso e inicio padrao). */
export function anoCorrente(): number {
  return anoDoClube(hojeNoFuso('America/Sao_Paulo', new Date()), '02-01')
}

/** Cronograma vivo com as aulas dadas (cada uma com seus requisitos). Periodo: o ano do clube inteiro (padrao: o de hoje). */
export async function criarCronograma(dados: {
  clubeId: string
  classeId: string
  anoClube?: number
  status?: StatusCronograma
  aulas?: { data: string; requisitoIds: string[] }[]
}): Promise<Cronograma & { aulas: AulaPlanejada[] }> {
  const prisma = prismaDeTeste()
  const anoClube = dados.anoClube ?? anoCorrente()
  const cronograma = await prisma.cronograma.create({
    data: {
      clubeId: dados.clubeId,
      classeId: dados.classeId,
      anoClube,
      inicio: dataCivil(`${anoClube}-02-01`),
      fim: dataCivil(`${anoClube}-12-31`),
      status: dados.status ?? 'RASCUNHO',
    },
  })
  const aulas: AulaPlanejada[] = []
  for (const aula of dados.aulas ?? []) {
    const criada = await prisma.aulaPlanejada.create({
      data: { clubeId: dados.clubeId, cronogramaId: cronograma.id, data: dataCivil(aula.data) },
    })
    if (aula.requisitoIds.length > 0) {
      await prisma.aulaRequisito.createMany({
        data: aula.requisitoIds.map((requisitoId) => ({
          clubeId: dados.clubeId,
          cronogramaId: cronograma.id,
          aulaPlanejadaId: criada.id,
          requisitoId,
        })),
      })
    }
    aulas.push(criada)
  }
  return { ...cronograma, aulas }
}

/** Grava o retrato do cronograma vivo (aulas ativas com seus requisitos), sem mexer no status. */
export async function publicarCronograma(dados: { cronogramaId: string; publicadoPorId: string }): Promise<CronogramaPublicacao> {
  const prisma = prismaDeTeste()
  const cronograma = await prisma.cronograma.findUniqueOrThrow({ where: { id: dados.cronogramaId } })
  const aulas = await prisma.aulaPlanejada.findMany({
    where: { clubeId: cronograma.clubeId, cronogramaId: cronograma.id, removidaEm: null },
    include: { requisitos: { select: { requisitoId: true } } },
    orderBy: { data: 'asc' },
  })
  const conteudo = {
    aulas: aulas.map((aula) => ({
      id: aula.id,
      data: aula.data.toISOString().slice(0, 10),
      horario: aula.horario,
      local: aula.local,
      titulo: aula.titulo,
      requisitoIds: aula.requisitos.map((requisito) => requisito.requisitoId),
    })),
  }
  return prisma.cronogramaPublicacao.create({
    data: { clubeId: cronograma.clubeId, cronogramaId: cronograma.id, conteudo, publicadoPorId: dados.publicadoPorId },
  })
}

/** Aula registrada; se ha aula planejada ativa da classe naquela data, o registro se liga a ela. */
export async function criarRegistroAula(dados: {
  clubeId: string
  classeId: string
  data: string
  presencas?: { dbvId: string; presente?: boolean }[]
  concluidos?: { dbvId: string; requisitoId: string }[]
}): Promise<RegistroAula> {
  const prisma = prismaDeTeste()
  const registradoPorId = (await criarUsuario()).id
  const planejada = await prisma.aulaPlanejada.findFirst({
    where: { clubeId: dados.clubeId, data: dataCivil(dados.data), removidaEm: null, cronograma: { classeId: dados.classeId } },
    select: { id: true },
  })
  const agora = new Date()
  const registro = await prisma.registroAula.create({
    data: {
      clubeId: dados.clubeId,
      classeId: dados.classeId,
      aulaPlanejadaId: planejada?.id ?? null,
      data: dataCivil(dados.data),
      registradoPorId,
      atualizadoEm: agora,
    },
  })
  if (dados.presencas?.length) {
    await prisma.presencaAula.createMany({
      data: dados.presencas.map((presenca) => ({
        clubeId: dados.clubeId,
        registroAulaId: registro.id,
        dbvId: presenca.dbvId,
        presente: presenca.presente ?? true,
        versao: agora,
        alteradaPorId: registradoPorId,
        envioId: randomUUID(),
      })),
    })
  }
  for (const concluido of dados.concluidos ?? []) {
    await criarRequisitoConcluido({ clubeId: dados.clubeId, ...concluido, concluidoEm: dados.data, registroAulaId: registro.id })
  }
  return registro
}

export async function criarRequisitoConcluido(dados: {
  clubeId: string
  dbvId: string
  requisitoId: string
  concluidoEm?: string
  registroAulaId?: string | null
}): Promise<RequisitoConcluido> {
  return prismaDeTeste().requisitoConcluido.create({
    data: {
      clubeId: dados.clubeId,
      dbvId: dados.dbvId,
      requisitoId: dados.requisitoId,
      concluidoEm: dataCivil(dados.concluidoEm ?? '2026-03-01'),
      registroAulaId: dados.registroAulaId ?? null,
      marcadoPorId: (await criarUsuario()).id,
    },
  })
}

export async function criarEspecialidadeConcluida(dados: {
  clubeId: string
  dbvId: string
  especialidadeId: string
  concluidaEm?: string
}): Promise<EspecialidadeConcluida> {
  return prismaDeTeste().especialidadeConcluida.create({
    data: {
      clubeId: dados.clubeId,
      dbvId: dados.dbvId,
      especialidadeId: dados.especialidadeId,
      concluidaEm: dataCivil(dados.concluidaEm ?? '2026-03-01'),
      marcadoPorId: (await criarUsuario()).id,
    },
  })
}

export async function criarNotificacao(dados: {
  clubeId: string
  usuarioId: string
  tipo?: TipoNotificacao
  titulo?: string
  texto?: string
  link?: string
  criadaEm?: Date
  lida?: boolean
}): Promise<Notificacao> {
  const criadaEm = dados.criadaEm ?? new Date()
  return prismaDeTeste().notificacao.create({
    data: {
      clubeId: dados.clubeId,
      usuarioId: dados.usuarioId,
      tipo: dados.tipo ?? 'CRONOGRAMA_PUBLICADO',
      titulo: dados.titulo ?? `Aviso ${unico()}`,
      texto: dados.texto ?? 'Texto do aviso',
      link: dados.link ?? '/cronograma',
      criadaEm,
      lidaEm: dados.lida ? criadaEm : null,
    },
  })
}

export async function criarObservacao(dados: {
  clubeId: string
  classeId: string
  autorId: string
  texto: string
  titulo?: string
  registroAulaId?: string
  dbvId?: string
}): Promise<Observacao> {
  return prismaDeTeste().observacao.create({
    data: {
      clubeId: dados.clubeId,
      classeId: dados.classeId,
      autorId: dados.autorId,
      alvo: dados.dbvId ? 'DBV' : 'AULA',
      registroAulaId: dados.registroAulaId ?? null,
      dbvId: dados.dbvId ?? null,
      titulo: dados.titulo ?? null,
      texto: dados.texto,
    },
  })
}

/** Link (`link`) ou arquivo (`arquivo`, o id de um `Arquivo` do mesmo clube); sem nenhum dos dois, um link de exemplo. */
export async function criarMaterial(
  dados: {
    clubeId: string
    classeId: string
    autorId: string
    titulo: string
    secaoId?: string
  } & ({ link?: string; arquivo?: undefined } | { arquivo: string; link?: undefined }),
): Promise<Material> {
  const comArquivo = dados.arquivo !== undefined
  return prismaDeTeste().material.create({
    data: {
      clubeId: dados.clubeId,
      classeId: dados.classeId,
      secaoId: dados.secaoId ?? null,
      titulo: dados.titulo,
      tipo: comArquivo ? 'PDF' : 'LINK',
      arquivoId: dados.arquivo ?? null,
      url: comArquivo ? null : (dados.link ?? 'https://exemplo.test/material'),
      enviadoPorId: dados.autorId,
    },
  })
}
