// Fase 0 — contratos de dados (zod 4). A onda 2 copia cada bloco "ARQUIVO:" para
// packages/shared/src/contratos/<arquivo>.ts sem mudar nomes nem campos — só acrescenta os
// `import` entre arquivos que a divisão exige.
// Regra: `.default()` só nos contratos de CRIAÇÃO. Contrato de edição nunca tem default (no zod 4,
// `.partial()` mantém o default e a edição sobrescreveria campos que ninguém mandou).
// Conferido com typescript 5.9.3 + zod 4.3.6 (`tsc --noEmit --strict`).
import { z } from 'zod'

// ═══════════════ ARQUIVO: enums.ts (packages/shared/src/enums.ts) ═══════════════
export const PAPEIS = ['ADM', 'CONSELHEIRO', 'INSTRUTOR'] as const
export const STATUS_USUARIO = ['CONVIDADO', 'ATIVO', 'INATIVO'] as const
export const SEXOS = ['F', 'M'] as const
export const TIPOS_PESSOA = ['DBV', 'LIDER'] as const
export const TIPOS_UNIDADE = ['MISTA', 'MASCULINA', 'FEMININA'] as const
export const TIPOS_CLASSE = ['REGULAR', 'AVANCADA'] as const
export const TRILHAS = ['INDIVIDUAL', 'AGRUPADAS'] as const
export const ORIGENS = ['OFICIAL', 'CLUBE'] as const
export const QUEM_MONTA = ['ADM', 'INSTRUTOR'] as const
export const STATUS_MATRICULA = ['CURSANDO', 'CONCLUIDA', 'INVESTIDA', 'DESISTIU'] as const

export const Papel = z.enum(PAPEIS)
export const Sexo = z.enum(SEXOS)
export const TipoPessoa = z.enum(TIPOS_PESSOA)
export const TipoUnidade = z.enum(TIPOS_UNIDADE)
export const TipoClasse = z.enum(TIPOS_CLASSE)
export const Trilha = z.enum(TRILHAS)
export const Origem = z.enum(ORIGENS)
export const QuemMonta = z.enum(QUEM_MONTA)
export const StatusMatricula = z.enum(STATUS_MATRICULA)
export const StatusUsuario = z.enum(STATUS_USUARIO)
export type Papel = z.infer<typeof Papel>

// ═══════════════ ARQUIVO: comum.ts ═══════════════
export const Uuid = z.uuid()
/** Data civil, sem hora nem fuso: "2026-09-27". */
export const DataCivil = z.iso.date()
export const InstanteIso = z.iso.datetime({ offset: true })
export const Email = z.string().trim().toLowerCase().pipe(z.email({ message: 'E-mail inválido' }))
export const Senha = z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres').max(128)
export const TextoCurto = z.string().trim().min(1).max(120)

/** Query string de listas. Ordem: sempre a do endpoint (documentada no SPEC §9). */
export const Paginacao = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  porPagina: z.coerce.number().int().min(1).max(100).default(25),
})
export const pagina = <T extends z.ZodType>(item: T) =>
  z.object({
    itens: z.array(item),
    total: z.number().int().min(0),
    pagina: z.number().int().min(1),
    porPagina: z.number().int().min(1),
  })

export const CODIGOS_ERRO = [
  'VALIDACAO',          // 400 — campos inválidos; `campos` preenchido
  'NAO_AUTENTICADO',    // 401 — sem sessão, token inválido ou expirado
  'CREDENCIAIS',        // 401 — login falhou (mensagem única, não diz qual campo)
  'SEM_PERMISSAO',      // 403 — permissão do papel negada
  'VINCULO_INATIVO',    // 403 — vínculo ativo foi desativado; front leva a /papel
  'NAO_ENCONTRADO',     // 404 — inclusive recurso fora do escopo ou de outro clube
  'CONFLITO',           // 409 — unicidade (nome de unidade repetido etc.)
  'TOKEN_INVALIDO',     // 410 — convite/redefinição usado, vencido ou inexistente
  'ULTIMO_ADM',         // 422 — operação deixaria o clube sem Adm ativo
  'AJUSTE_INVALIDO',    // 422 — permissão fora do catálogo ou que não se aplica ao papel
  'REGRA',              // 422 — outra regra de negócio (mensagem explica)
  'LIMITE_EXCEDIDO',    // 429
  'ERRO_INTERNO',       // 500 — mensagem genérica; detalhe só no log
] as const
export const CodigoErro = z.enum(CODIGOS_ERRO)
export const ErroApi = z.object({
  codigo: CodigoErro,
  mensagem: z.string(),
  campos: z.record(z.string(), z.string()).optional(),
})
export const Aviso = z.object({ codigo: z.string(), mensagem: z.string() })
export const comAvisos = <T extends z.ZodType>(dados: T) =>
  z.object({ dados, avisos: z.array(Aviso) })

// ═══════════════ ARQUIVO: auth.ts ═══════════════
export const LoginEntrada = z.object({ email: Email, senha: z.string().min(1).max(128) })
export const AceitarConviteEntrada = z.object({ token: z.string().min(20).max(200), senha: Senha })
export const EsqueciSenhaEntrada = z.object({ email: Email })
export const RedefinirSenhaEntrada = z.object({ token: z.string().min(20).max(200), senha: Senha })
export const PapelAtivoEntrada = z.object({ vinculoId: Uuid })

export const RefUnidade = z.object({ id: Uuid, nome: z.string() })
/** corToken: ver ClasseSaida.corToken. */
export const RefClasse = z.object({ id: Uuid, nome: z.string(), tipo: TipoClasse, trilha: Trilha, corToken: z.string() })
export const VinculoResumo = z.object({
  id: Uuid,
  papel: Papel,
  clube: z.object({ id: Uuid, nome: z.string(), slug: z.string() }),
  unidades: z.array(RefUnidade),   // só CONSELHEIRO; vazio nos outros
  classes: z.array(RefClasse),     // só INSTRUTOR; vazio nos outros
})
export const SessaoSaida = z.object({
  accessToken: z.string(),
  expiraEm: InstanteIso,
  /** Nulo quando o usuário tem 2+ vínculos ativos e ainda não escolheu (front vai a /papel).
   *  Com vínculo nulo o token só serve para rotas @Autenticado (SPEC D24). */
  vinculoAtivoId: Uuid.nullable(),
  vinculos: z.array(VinculoResumo).min(1), // só os ativos; zero vínculos ativos → 403 VINCULO_INATIVO
})

// ═══════════════ ARQUIVO: eu.ts ═══════════════
export const EuSaida = z.object({
  usuario: z.object({ id: Uuid, nome: z.string(), email: z.string(), genero: Sexo.nullable() }),
  vinculoAtivo: VinculoResumo.nullable(),
  vinculos: z.array(VinculoResumo),
  /** Permissões efetivas do vínculo ativo (chaves do catálogo). Vazio sem vínculo ativo. */
  permissoes: z.array(z.string()),
})

// ═══════════════ ARQUIVO: desbravadores.ts ═══════════════
const camposPessoa = {
  nome: z.string().trim().min(2).max(120),
  nomePublico: z.string().trim().min(2).max(40), // vazio na criação → calculado por nomePublico()
  nascimento: DataCivil,
  sexo: Sexo,
  responsavelNome: z.string().trim().max(120).nullable(),
  responsavelTelefone: z.string().trim().max(30).nullable(),
  responsavelEmail: Email.nullable(),
  autorizacaoImagem: z.boolean(),
  autorizacaoImagemEm: DataCivil.nullable(),
}
export const DesbravadorCriarEntrada = z.object({
  ...camposPessoa,
  nomePublico: camposPessoa.nomePublico.optional(),
  tipo: TipoPessoa.default('DBV'),
  responsavelNome: camposPessoa.responsavelNome.optional(),
  responsavelTelefone: camposPessoa.responsavelTelefone.optional(),
  responsavelEmail: camposPessoa.responsavelEmail.optional(),
  autorizacaoImagem: z.boolean().default(false),
  autorizacaoImagemEm: camposPessoa.autorizacaoImagemEm.optional(),
  entradaEm: DataCivil,
  usuarioId: Uuid.nullable().optional(),  // só tipo LIDER
  unidadeId: Uuid.nullable().optional(),  // só tipo DBV; cria o MembroUnidade desde entradaEm
  classeId: Uuid.nullable().optional(),   // classe REGULAR do ano do clube; cria a matrícula
  incluirAvancada: z.boolean().default(true), // matricula também na avançada ligada
})
/** Adm edita tudo abaixo. Conselheiro (dbv.editar) só: nome, nomePublico, responsavel*,
 *  autorizacaoImagem, autorizacaoImagemEm — outro campo enviado por ele → 422 REGRA. */
export const DesbravadorEditarEntrada = z
  .object({ ...camposPessoa, tipo: TipoPessoa, usuarioId: Uuid.nullable() })
  .partial()
export const InativarEntrada = z.object({ saidaEm: DataCivil })
export const MoverUnidadeEntrada = z.object({ unidadeId: Uuid.nullable(), desde: DataCivil })
export const MatriculaEntrada = z.object({
  classeId: Uuid,
  anoClube: z.number().int().min(2000).max(2100),
  incluirAvancada: z.boolean().default(true),
})
export const MatriculaSaida = z.object({
  id: Uuid, classe: RefClasse, anoClube: z.number().int(), status: StatusMatricula,
})
export const ContatoResponsavel = z.object({
  responsavelNome: z.string().nullable(),
  responsavelTelefone: z.string().nullable(),
  responsavelEmail: z.string().nullable(),
})
export const DesbravadorSaida = z.object({
  id: Uuid,
  nome: z.string(),
  nomePublico: z.string(),
  tipo: TipoPessoa,
  nascimento: DataCivil,
  idade: z.number().int(),
  sexo: Sexo,
  ativo: z.boolean(),
  entradaEm: DataCivil,
  saidaEm: DataCivil.nullable(),
  autorizacaoImagem: z.boolean(),
  autorizacaoImagemEm: DataCivil.nullable(),
  usuarioId: Uuid.nullable(),
  unidade: RefUnidade.nullable(),
  classeAtual: RefClasse.nullable(),   // matrícula CURSANDO na REGULAR do ano do clube
  avancadaAtual: RefClasse.nullable(), // matrícula CURSANDO na AVANCADA do ano do clube
  /** Ausente (não null) quando quem pede não tem `dbv.ver_contato`. O serviço omite a chave. */
  contato: ContatoResponsavel.optional(),
})
export const DesbravadorFiltro = Paginacao.extend({
  busca: z.string().trim().max(60).optional(),     // nome, sem acento e sem caixa
  unidadeId: Uuid.optional(),
  semUnidade: z.stringbool().optional(),
  classeId: Uuid.optional(),
  tipo: TipoPessoa.optional(),
  ativo: z.enum(['true', 'false', 'todos']).default('true'),
})
export const DesbravadorLista = pagina(DesbravadorSaida) // ordem: nome ascendente

// ═══════════════ ARQUIVO: unidades.ts ═══════════════
export const UnidadeCriarEntrada = z.object({
  nome: TextoCurto,
  tipo: TipoUnidade.default('MISTA'),
  gritoDeGuerra: z.string().trim().max(300).nullable().optional(),
})
export const UnidadeEditarEntrada = z
  .object({ nome: TextoCurto, tipo: TipoUnidade, gritoDeGuerra: z.string().trim().max(300).nullable(), ativa: z.boolean() })
  .partial()
export const UnidadeFiltro = z.object({ todas: z.stringbool().default(false) }) // true inclui inativas (só ADM)
export const UnidadeSaida = z.object({
  id: Uuid,
  nome: z.string(),
  tipo: TipoUnidade,
  gritoDeGuerra: z.string().nullable(),
  ativa: z.boolean(),
  conselheiros: z.array(z.object({ usuarioId: Uuid, nome: z.string() })),
  totalMembros: z.number().int(),
})
export const MembroSaida = z.object({
  dbvId: Uuid,
  nome: z.string(),
  nomePublico: z.string(),
  idade: z.number().int(),
  sexo: Sexo,
  classeAtual: RefClasse.nullable(),
  desde: DataCivil,
})
// GET /unidades?todas= → UnidadeSaida[] (ordem: nome)
// GET /unidades/:id/membros e GET /unidades/sem-membros → MembroSaida[] (ordem: nome; só tipo DBV)

// ═══════════════ ARQUIVO: usuarios.ts ═══════════════
export const AjustePermissao = z.object({ permissao: z.string(), concedida: z.boolean() })
export const VinculoEntrada = z
  .object({
    papel: Papel,
    unidadeIds: z.array(Uuid).default([]),
    classeIds: z.array(Uuid).default([]),
    ajustes: z.array(AjustePermissao).default([]),
  })
  .refine((v) => v.papel === 'CONSELHEIRO' || v.unidadeIds.length === 0, {
    message: 'Só conselheiro tem unidades', path: ['unidadeIds'],
  })
  .refine((v) => v.papel === 'INSTRUTOR' || v.classeIds.length === 0, {
    message: 'Só instrutor tem classes', path: ['classeIds'],
  })
// Ajuste para ADM, ou de chave que não se aplica ao papel: recusado no SERVIÇO com 422
// AJUSTE_INVALIDO (SPEC §6.1) — não aqui, para o código de erro ser o que a SPEC e os testes pedem.
export const VinculoEditarEntrada = z.object({
  unidadeIds: z.array(Uuid).optional(),
  classeIds: z.array(Uuid).optional(),
  ajustes: z.array(AjustePermissao).optional(),
  ativo: z.boolean().optional(),
})
/** E-mail já cadastrado (em qualquer clube): só ganha os vínculos e a resposta ECOA o que foi
 *  enviado (nome, gênero, situação CONVIDADO) — nunca os dados gravados da conta existente. */
export const UsuarioCriarEntrada = z.object({
  nome: TextoCurto,
  email: Email,
  genero: Sexo.nullable().optional(),
  vinculos: z.array(VinculoEntrada).min(1),
})
/** Nome e gênero: o Adm só edita se o usuário está CONVIDADO **e** não tem vínculo em outro
 *  clube (senão 422 REGRA). E-mail nunca. */
export const UsuarioEditarEntrada = z.object({ nome: TextoCurto.optional(), genero: Sexo.nullable().optional() })
export const SITUACOES_NO_CLUBE = ['CONVIDADO', 'ATIVO', 'INATIVO'] as const
export const VinculoSaida = z.object({
  id: Uuid,
  papel: Papel,
  ativo: z.boolean(),
  unidades: z.array(RefUnidade),
  classes: z.array(RefClasse),
  ajustes: z.array(AjustePermissao),
})
export const UsuarioSaida = z.object({
  id: Uuid,
  nome: z.string(),
  email: z.string(),
  genero: Sexo.nullable(),
  /** CONVIDADO = nunca definiu senha; INATIVO = sem vínculo ativo NESTE clube. Nunca o status global. */
  situacao: z.enum(SITUACOES_NO_CLUBE),
  vinculos: z.array(VinculoSaida), // só os deste clube
})
export const UsuarioFiltro = Paginacao.extend({
  papel: Papel.optional(),
  busca: z.string().trim().max(60).optional(),
})
export const UsuarioLista = pagina(UsuarioSaida).extend({
  contagens: z.object({ todos: z.number().int(), ADM: z.number().int(), CONSELHEIRO: z.number().int(), INSTRUTOR: z.number().int() }),
}) // ordem: nome ascendente
export const CatalogoPermissoesSaida = z.array(
  z.object({
    chave: z.string(),
    rotulo: z.string(),
    padrao: z.object({ ADM: z.boolean().optional(), CONSELHEIRO: z.boolean().optional(), INSTRUTOR: z.boolean().optional() }),
  }),
)

// ═══════════════ ARQUIVO: classes.ts ═══════════════
export const ClasseFiltro = z.object({ trilha: Trilha.optional(), tipo: TipoClasse.optional() })
export const ClasseSaida = z.object({
  id: Uuid,
  nome: z.string(),
  idade: z.number().int().nullable(),
  tipo: TipoClasse,
  trilha: Trilha,
  origem: Origem,
  classeBaseId: Uuid.nullable(),
  ordem: z.number().int(),
  /** Token CSS: "--classe-amigo"… ; avançada herda da regular; Agrupadas e CLUBE: "--color-primary". */
  corToken: z.string(),
  ativa: z.boolean(),               // de ClasseClube
  quemMontaCronograma: QuemMonta,   // de ClasseClube
  totalRequisitos: z.number().int(), // ativos, com o ajuste do clube aplicado
})
export const RequisitoSaida = z.object({
  id: Uuid, codigo: z.string(), texto: z.string(), campo: z.boolean(), ativo: z.boolean(),
})
export const ClasseDetalheSaida = ClasseSaida.extend({
  secoes: z.array(z.object({
    id: Uuid, codigo: z.string(), nome: z.string(), ordem: z.number().int(),
    requisitos: z.array(RequisitoSaida),
  })),
})
// GET /classes → ClasseSaida[] (ordem: ordem ascendente)

// ═══════════════ ARQUIVO: especialidades.ts ═══════════════
export const EspecialidadeFiltro = z.object({ areaId: Uuid.optional(), busca: z.string().trim().max(60).optional() })
export const AreaComEspecialidades = z.object({
  id: Uuid, codigo: z.string(), nome: z.string(), ordem: z.number().int(),
  especialidades: z.array(z.object({ id: Uuid, nome: z.string(), origem: Origem })),
})
// GET /especialidades → AreaComEspecialidades[] (sem paginação; áreas por ordem, itens por nome)

// ═══════════════ ARQUIVO: saude.ts ═══════════════
export const SaudeSaida = z.object({ ok: z.boolean(), versao: z.string(), banco: z.boolean() })
