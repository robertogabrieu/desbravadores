import { z } from 'zod'
import { DataCivil, InstanteIso, Uuid } from './comum'

/** CHAMADA = link de unidade (papel do conselheiro); CLASSE = link de classe (papel do instrutor). */
export const TIPOS_SUBSTITUICAO = ['CHAMADA', 'CLASSE'] as const
export const TipoSubstituicao = z.enum(TIPOS_SUBSTITUICAO)

/** Janela gravada na geração: abre em `inicioEm`, fecha em `fimEm` (+3h); o salvo sobe até `fimEnvioEm` (+12h). */
const Janela = { data: DataCivil, inicioEm: InstanteIso, fimEm: InstanteIso }

// GET /api/substituicoes/datas?tipo → DatasElegiveis (de hoje até 28 dias, só dias com reunião ou classe)
export const DatasElegiveisFiltro = z.object({ tipo: TipoSubstituicao })
export const DatasElegiveis = z.array(z.object(Janela))

// GET /api/unidades/:id/substituicao · /api/classes/:id/substituicao → SubstituicaoDoAlvo (o link aberto, ou nulo)
export const SubstituicaoDoAlvo = z
  .object({
    id: Uuid,
    ...Janela,
    identificadaEm: InstanteIso.nullable(),
    /** Nome da conta reconhecida (S3) ou o digitado (S2); nulo enquanto ninguém abriu. */
    substituto: z.object({ nome: z.string() }).nullable(),
  })
  .nullable()

// POST /api/unidades/:id/substituicao · /api/classes/:id/substituicao, corpo { data }
export const GerarSubstituicaoEntrada = z.object({ data: DataCivil })
/** O link só existe nesta resposta: o banco guarda apenas o hash do token. */
export const SubstituicaoGerada = z.object({
  id: Uuid,
  ...Janela,
  identificadaEm: InstanteIso.nullable(),
  substituto: z.object({ nome: z.string() }).nullable(),
  link: z.string(),
})

/** Estados na ordem em que o servidor os decide (SPEC "Abrir o link"). */
export const ESTADOS_DO_LINK = ['INEXISTENTE', 'CANCELADO', 'ENCERRADO', 'ANTES', 'EM_OUTRO_APARELHO', 'ABERTO'] as const
export const EstadoDoLink = z.enum(ESTADOS_DO_LINK)

// GET /api/auth/substituicao/:token (segredo do aparelho, se houver, no cabeçalho abaixo) → LinkPublico
export const CABECALHO_DO_SEGREDO_DO_APARELHO = 'X-Segredo-Aparelho'
export const LinkPublico = z.object({
  estado: EstadoDoLink,
  /** Nulos só em INEXISTENTE. */
  tipo: TipoSubstituicao.nullable(),
  alvo: z.object({ nome: z.string() }).nullable(),
  data: DataCivil.nullable(),
  inicioEm: InstanteIso.nullable(),
  fimEm: InstanteIso.nullable(),
  fimEnvioEm: InstanteIso.nullable(),
  /** Fuso do clube: as horas da tela saem nele. */
  fuso: z.string().nullable(),
  /** Relógio do servidor: o aparelho decide S1→S2 e a virada da janela por ele. */
  agora: InstanteIso,
  /** Conta com vínculo ativo no clube do link, lida do cookie de refresh sem rotacionar (S3). */
  conta: z.object({ nome: z.string() }).nullable(),
  /** Este aparelho já se identificou (o segredo conferiu): entra direto. */
  identificado: z.boolean(),
})

// POST /api/auth/substituicao/:token/entrar → Entrada
export const EntrarNoLink = z.object({
  /** S2: nome digitado, 3 a 80 caracteres depois de aparar. */
  nome: z.string().trim().min(3, 'Escreva seu nome e sobrenome').max(80).optional(),
  /** S3: lançar como a conta reconhecida no navegador. */
  usarConta: z.boolean().optional(),
  /** Reingresso no mesmo aparelho. */
  segredo: z.string().min(1).max(200).optional(),
})

export const IdentidadeDaSubstituicao = z.object({
  substituicaoId: Uuid,
  /** Quem lança: o membro reconhecido ou o nome digitado. */
  nome: z.string(),
  tipo: TipoSubstituicao,
  alvoId: Uuid,
  alvoNome: z.string(),
  clubeId: Uuid,
  data: DataCivil,
  fimEm: InstanteIso,
  fimEnvioEm: InstanteIso,
  /** Fuso do clube: as horas da tela saem nele. */
  fuso: z.string(),
})
export const Entrada = z.object({
  credencial: z.string(),
  /** Só na primeira identificação; o aparelho guarda e reapresenta. */
  segredo: z.string().nullable(),
  identidade: IdentidadeDaSubstituicao,
  agora: InstanteIso,
})

/** R1: "Chamada lançada/alterada por <autor> (sem conta no app), pelo link que <geradoPor> gerou." */
export const SubstituicaoNoRegistro = z.object({
  autor: z.string(),
  /** O autor é um usuário de substituição (nome digitado), não um membro. */
  semConta: z.boolean(),
  geradoPor: z.string(),
  /** O substituto criou o registro (senão, alterou o que o titular lançou). */
  lancou: z.boolean(),
})
