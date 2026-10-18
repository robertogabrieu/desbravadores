import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto'
import { origemWebauthn } from '../src/auth/passkeys.config'

/** CBOR minimo: o que o `attestationObject` e a chave COSE usam (inteiros, bytes, texto e mapas). */
type ValorCbor = number | string | Buffer | Map<ValorCbor, ValorCbor>

function cabecalhoCbor(tipo: number, tamanho: number): Buffer {
  if (tamanho < 24) return Buffer.from([(tipo << 5) | tamanho])
  if (tamanho < 256) return Buffer.from([(tipo << 5) | 24, tamanho])
  return Buffer.from([(tipo << 5) | 25, tamanho >> 8, tamanho & 0xff])
}

function codificarCbor(valor: ValorCbor): Buffer {
  if (typeof valor === 'number') {
    return valor >= 0 ? cabecalhoCbor(0, valor) : cabecalhoCbor(1, -1 - valor)
  }
  if (typeof valor === 'string') {
    const texto = Buffer.from(valor)
    return Buffer.concat([cabecalhoCbor(3, texto.length), texto])
  }
  if (Buffer.isBuffer(valor)) return Buffer.concat([cabecalhoCbor(2, valor.length), valor])
  const partes: Buffer[] = [cabecalhoCbor(5, valor.size)]
  for (const [chave, conteudo] of valor) partes.push(codificarCbor(chave), codificarCbor(conteudo))
  return Buffer.concat(partes)
}

const sha256 = (dados: Buffer | string): Buffer => createHash('sha256').update(dados).digest()

const FLAG_PRESENCA = 0x01
const FLAG_VERIFICACAO = 0x04
const FLAG_CREDENCIAL = 0x40

export interface OpcoesDeAssinatura {
  /** Contador a enviar; o padrao e o proximo da sequencia do aparelho. */
  contador?: number
  /** `userHandle` devolvido; o padrao e o do cadastro. `null` omite o campo. */
  userHandle?: string | null
  /** Origem escrita no `clientDataJSON`; o padrao e a do app. */
  origem?: string
  /** Sem verificacao do usuario (digital/rosto) na resposta. */
  semVerificacao?: boolean
}

/**
 * Aparelho de teste: um autenticador WebAuthn de verdade (chave ES256, formato "none") que responde
 * aos desafios do servidor. A biblioteca verifica a assinatura de fato; nada e mockado.
 */
export class AutenticadorDeTeste {
  readonly credentialId = randomBytes(32)
  private readonly chavePrivada: KeyObject
  private readonly x: Buffer
  private readonly y: Buffer
  /** Id do usuario em base64url; o cadastro preenche, a fabrica tambem. */
  userHandle: string | null = null
  private contadorAtual: number

  constructor(contadorInicial = 1) {
    this.contadorAtual = contadorInicial
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
    this.chavePrivada = privateKey
    const jwk = publicKey.export({ format: 'jwk' })
    this.x = Buffer.from(jwk.x ?? '', 'base64url')
    this.y = Buffer.from(jwk.y ?? '', 'base64url')
  }

  get id(): string {
    return this.credentialId.toString('base64url')
  }

  /** Chave publica no formato COSE, como o servidor a guarda. */
  chavePublicaCose(): Buffer {
    return codificarCbor(
      new Map<ValorCbor, ValorCbor>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, this.x],
        [-3, this.y],
      ]),
    )
  }

  /** Resposta de `navigator.credentials.create` para as opcoes recebidas do servidor. */
  registrar(
    opcoes: { challenge: string; user: { id: string } },
    ajustes: { origem?: string; semVerificacao?: boolean } = {},
  ): { id: string; rawId: string; type: 'public-key'; clientExtensionResults: Record<string, never>; response: Record<string, unknown> } {
    this.userHandle = opcoes.user.id
    const flags = FLAG_PRESENCA | FLAG_CREDENCIAL | (ajustes.semVerificacao ? 0 : FLAG_VERIFICACAO)
    const contador = Buffer.alloc(4)
    const tamanhoId = Buffer.alloc(2)
    tamanhoId.writeUInt16BE(this.credentialId.length)
    const dadosAutenticador = Buffer.concat([
      sha256(origemWebauthn().rpID),
      Buffer.from([flags]),
      contador,
      Buffer.alloc(16),
      tamanhoId,
      this.credentialId,
      this.chavePublicaCose(),
    ])
    const attestationObject = codificarCbor(
      new Map<ValorCbor, ValorCbor>([
        ['fmt', 'none'],
        ['attStmt', new Map<ValorCbor, ValorCbor>()],
        ['authData', dadosAutenticador],
      ]),
    )
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      clientExtensionResults: {},
      response: {
        clientDataJSON: this.dadosDoCliente('webauthn.create', opcoes.challenge, ajustes.origem),
        attestationObject: attestationObject.toString('base64url'),
        transports: ['internal'],
      },
    }
  }

  /** Resposta de `navigator.credentials.get` para as opcoes recebidas do servidor. */
  assinar(
    opcoes: { challenge: string },
    ajustes: OpcoesDeAssinatura = {},
  ): { id: string; rawId: string; type: 'public-key'; clientExtensionResults: Record<string, never>; response: Record<string, unknown> } {
    const contador = ajustes.contador ?? this.contadorAtual++
    const contadorEmBytes = Buffer.alloc(4)
    contadorEmBytes.writeUInt32BE(contador)
    const flags = FLAG_PRESENCA | (ajustes.semVerificacao ? 0 : FLAG_VERIFICACAO)
    const dadosAutenticador = Buffer.concat([sha256(origemWebauthn().rpID), Buffer.from([flags]), contadorEmBytes])
    const dadosDoCliente = this.dadosDoCliente('webauthn.get', opcoes.challenge, ajustes.origem)
    const assinatura = sign('sha256', Buffer.concat([dadosAutenticador, sha256(Buffer.from(dadosDoCliente, 'base64url'))]), this.chavePrivada)
    const userHandle = ajustes.userHandle === undefined ? this.userHandle : ajustes.userHandle
    return {
      id: this.id,
      rawId: this.id,
      type: 'public-key',
      clientExtensionResults: {},
      response: {
        clientDataJSON: dadosDoCliente,
        authenticatorData: dadosAutenticador.toString('base64url'),
        signature: assinatura.toString('base64url'),
        ...(userHandle ? { userHandle } : {}),
      },
    }
  }

  private dadosDoCliente(tipo: string, desafio: string, origem?: string): string {
    return Buffer.from(JSON.stringify({ type: tipo, challenge: desafio, origin: origem ?? origemWebauthn().origin })).toString('base64url')
  }
}
