import { z } from 'zod'
import { Papel, Sexo } from '../enums'
import { Email, Paginacao, TextoCurto, Uuid, pagina } from './comum'
import { RefClasse, RefUnidade } from './auth'

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

