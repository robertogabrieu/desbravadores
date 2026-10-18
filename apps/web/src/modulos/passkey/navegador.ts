import { startAuthentication, startRegistration } from '@simplewebauthn/browser'
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser'
import { RespostaCadastroPasskey, RespostaLoginPasskey } from '@desbravadores/shared'
import type { OpcoesCadastroPasskey, OpcoesLoginPasskey } from '@desbravadores/shared'
import type { z } from 'zod'

/** O aparelho entende passkey (o jsdom dos testes não: eles definem `window.PublicKeyCredential`). */
export const aparelhoPermitePasskey = (): boolean => typeof window !== 'undefined' && 'PublicKeyCredential' in window

/**
 * O contrato do shared devolve `type` e `transports` como texto; a biblioteca do navegador os quer como
 * as listas fechadas do WebAuthn. O servidor só manda valores dessas listas, então o cast é aqui e só aqui.
 */
const opcoesDeCadastroDoNavegador = (opcoes: z.infer<typeof OpcoesCadastroPasskey>) => opcoes as PublicKeyCredentialCreationOptionsJSON
const opcoesDeLoginDoNavegador = (opcoes: z.infer<typeof OpcoesLoginPasskey>) => opcoes as PublicKeyCredentialRequestOptionsJSON

/** Pede a digital ou o rosto e devolve a credencial nova, já no formato do contrato. */
export async function criarCredencial(opcoes: z.infer<typeof OpcoesCadastroPasskey>) {
  return RespostaCadastroPasskey.parse(await startRegistration({ optionsJSON: opcoesDeCadastroDoNavegador(opcoes) }))
}

/** Pede a digital ou o rosto para assinar o desafio e devolve a resposta no formato do contrato. */
export async function assinarDesafio(opcoes: z.infer<typeof OpcoesLoginPasskey>) {
  return RespostaLoginPasskey.parse(await startAuthentication({ optionsJSON: opcoesDeLoginDoNavegador(opcoes) }))
}

/** Cancelar a tela do celular não é falha: o navegador usa estes dois nomes para "a pessoa desistiu". */
export const foiCancelamento = (erro: unknown): boolean =>
  erro instanceof Error && (erro.name === 'NotAllowedError' || erro.name === 'AbortError')

const NAVEGADORES: [RegExp, string][] = [
  [/Edg\//, 'Edge'],
  [/CriOS|Chrome\//, 'Chrome'],
  [/Firefox\/|FxiOS/, 'Firefox'],
  [/Safari\//, 'Safari'],
]
const SISTEMAS: [RegExp, string][] = [
  [/Android/, 'Android'],
  [/iPhone/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Windows/, 'Windows'],
  [/Macintosh/, 'Mac'],
  [/Linux/, 'Linux'],
]

/** "Chrome no Android", "Safari no iPhone"; se não reconhece os dois, "Este aparelho". */
export function nomeSugeridoDoAparelho(userAgent = navigator.userAgent): string {
  const navegador = NAVEGADORES.find(([padrao]) => padrao.test(userAgent))?.[1]
  const sistema = SISTEMAS.find(([padrao]) => padrao.test(userAgent))?.[1]
  return navegador && sistema ? `${navegador} no ${sistema}` : 'Este aparelho'
}
