import { z } from 'zod'
import { InstanteIso, Uuid } from './comum'

/** Nome dado pela pessoa à passkey ("Chrome no Android"). */
export const NomePasskey = z.string().trim().min(1).max(60)

/**
 * Opções de cadastro no formato WebAuthn JSON, como o navegador as espera. Só o que a API preenche e
 * o web lê; `z.object` (e não `looseObject`) para o tipo aceitar a saída da biblioteca sem conversão.
 */
export const OpcoesCadastroPasskey = z.object({
  challenge: z.string(),
  rp: z.object({ id: z.string().optional(), name: z.string() }),
  user: z.object({ id: z.string(), name: z.string(), displayName: z.string() }),
  pubKeyCredParams: z.array(z.object({ type: z.literal('public-key'), alg: z.number() })),
  timeout: z.number().optional(),
  excludeCredentials: z
    .array(z.object({ id: z.string(), type: z.string(), transports: z.array(z.string()).optional() }))
    .optional(),
  authenticatorSelection: z
    .object({
      authenticatorAttachment: z.string().optional(),
      residentKey: z.string().optional(),
      requireResidentKey: z.boolean().optional(),
      userVerification: z.string().optional(),
    })
    .optional(),
  attestation: z.string().optional(),
})

/** Opções de login no formato WebAuthn JSON. */
export const OpcoesLoginPasskey = z.object({
  challenge: z.string(),
  rpId: z.string().optional(),
  timeout: z.number().optional(),
  allowCredentials: z
    .array(z.object({ id: z.string(), type: z.string(), transports: z.array(z.string()).optional() }))
    .optional(),
  userVerification: z.string().optional(),
})

/** Resposta do navegador ao criar a credencial (`startRegistration`). */
export const RespostaCadastroPasskey = z.looseObject({
  id: z.string(),
  rawId: z.string(),
  type: z.literal('public-key'),
  response: z.looseObject({ clientDataJSON: z.string(), attestationObject: z.string() }),
  clientExtensionResults: z.looseObject({}),
})

/** Resposta do navegador ao assinar o desafio (`startAuthentication`). */
export const RespostaLoginPasskey = z.looseObject({
  id: z.string(),
  rawId: z.string(),
  type: z.literal('public-key'),
  response: z.looseObject({
    clientDataJSON: z.string(),
    authenticatorData: z.string(),
    signature: z.string(),
    userHandle: z.string().optional(),
  }),
  clientExtensionResults: z.looseObject({}),
})

/** `POST /auth/passkey/login/opcoes` (sem corpo). */
export const PasskeyLoginOpcoesSaida = z.object({ desafioId: Uuid, opcoes: OpcoesLoginPasskey })

/** `POST /auth/passkey/login`; responde `SessaoSaida`. */
export const PasskeyLoginEntrada = z.object({ desafioId: Uuid, resposta: RespostaLoginPasskey })

/** `POST /eu/passkeys/opcoes`: a senha da conta confirma quem está cadastrando. */
export const PasskeyCadastroOpcoesEntrada = z.object({ senha: z.string().min(1).max(128) })
export const PasskeyCadastroOpcoesSaida = z.object({ desafioId: Uuid, opcoes: OpcoesCadastroPasskey })

/** `POST /eu/passkeys`; responde `PasskeyResumo`. */
export const PasskeyCadastroEntrada = z.object({
  desafioId: Uuid,
  nome: NomePasskey,
  resposta: RespostaCadastroPasskey,
})

/** Chave pública e `credentialId` nunca saem do servidor. */
export const PasskeyResumo = z.object({
  id: Uuid,
  nome: z.string(),
  criadoEm: InstanteIso,
  ultimoUsoEm: InstanteIso.nullable(),
})

/** `GET /eu/passkeys`: só as não revogadas, da mais antiga para a mais nova. */
export const PasskeyListaSaida = z.object({ itens: z.array(PasskeyResumo) })
