import { z } from 'zod'
import { Papel, TipoClasse, Trilha } from '../enums'
import { Email, InstanteIso, Senha, Uuid } from './comum'

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

