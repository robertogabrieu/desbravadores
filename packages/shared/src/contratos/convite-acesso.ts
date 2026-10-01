import { z } from 'zod'
import { Papel } from '../enums'
import { Email, InstanteIso, Uuid } from './comum'
import { RefClasse, RefUnidade } from './auth'

/** Papéis que o convite por link concede. Adm, Líder e Diretoria ficam de fora. */
export const PapelDoConvite = z.enum(['CONSELHEIRO', 'INSTRUTOR'])

const idsEscolhidos = z.array(Uuid).min(1).max(50)

export const ConviteAcessoEntrada = z.discriminatedUnion('papel', [
  z.object({ papel: z.literal('CONSELHEIRO'), unidadeIds: idsEscolhidos }),
  z.object({ papel: z.literal('INSTRUTOR'), classeIds: idsEscolhidos }),
])

/** O link só existe na resposta de quem gerou: o banco guarda apenas o hash do token. */
export const ConviteAcessoSaida = z.object({
  link: z.string().nullable(),
  expiraEm: InstanteIso,
  papel: PapelDoConvite,
  unidades: z.array(RefUnidade),
  classes: z.array(RefClasse),
})
export const ConviteAcessoGeradoSaida = ConviteAcessoSaida.extend({ link: z.string() })

export const ContaLigadaSaida = z.object({ email: z.string(), papeis: z.array(Papel) })

export const SituacaoAcessoSaida = z.object({
  convite: ConviteAcessoSaida.nullable(),
  conta: ContaLigadaSaida.nullable(),
})

export const ConvitePublicoSaida = z.object({
  clube: z.string(),
  nome: z.string(),
  papel: PapelDoConvite,
  unidades: z.array(RefUnidade),
  classes: z.array(RefClasse),
})

/** Senha só com o limite do login: a regra de senha nova vale apenas quando a conta é criada. */
export const AceitarConviteAcessoEntrada = z.object({ email: Email, senha: z.string().min(1).max(128) })
