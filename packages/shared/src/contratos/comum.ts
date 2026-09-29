import { z } from 'zod'

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

