import { Injectable } from '@nestjs/common'
import {
  NOME_SISTEMA,
  type PasskeyCadastroEntrada,
  type PasskeyCadastroOpcoesSaida,
  type PasskeyListaSaida,
  type PasskeyLoginEntrada,
  type PasskeyLoginOpcoesSaida,
  type PasskeyResumo,
} from '@desbravadores/shared'
import {
  type AuthenticatorTransport,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import type { z } from 'zod'
import { ErroApp } from '../comum/erros'
import { PrismaSistema } from '../comum/prisma/prisma-sistema'
import { ehViolacaoUnica } from '../comum/violacao-unica'
import type { CredencialPasskey, FinalidadeDesafioPasskey } from '../generated/prisma/client.js'
import { AuthService, type SessaoEmitida } from './auth.service'
import { origemWebauthn, userHandleDe } from './passkeys.config'
import { senhaConfere } from './senha'

const MINUTO_MS = 60 * 1000
const HORA_MS = 60 * MINUTO_MS
const VALIDADE_DESAFIO_MS = 5 * MINUTO_MS
const RETENCAO_DESAFIO_VENCIDO_MS = HORA_MS

const MENSAGEM_LOGIN_RECUSADO = 'Não foi possível entrar com a digital. Use sua senha.'
const MENSAGEM_DESAFIO_VENCIDO = 'Esta confirmação venceu. Tente de novo.'
const MENSAGEM_CADASTRO_RECUSADO = 'Não foi possível ativar a digital neste aparelho.'

function resumir(credencial: Pick<CredencialPasskey, 'id' | 'nome' | 'criadoEm' | 'ultimoUsoEm'>): z.infer<typeof PasskeyResumo> {
  return {
    id: credencial.id,
    nome: credencial.nome,
    criadoEm: credencial.criadoEm.toISOString(),
    ultimoUsoEm: credencial.ultimoUsoEm?.toISOString() ?? null,
  }
}

@Injectable()
export class PasskeysService {
  constructor(
    private readonly prisma: PrismaSistema,
    private readonly auth: AuthService,
  ) {}

  async opcoesDeLogin(): Promise<z.infer<typeof PasskeyLoginOpcoesSaida>> {
    const { rpID } = origemWebauthn()
    const opcoes = await generateAuthenticationOptions({ rpID, userVerification: 'required' })
    const desafioId = await this.guardarDesafio('LOGIN', opcoes.challenge, null)
    return { desafioId, opcoes }
  }

  /** Toda recusa e `CREDENCIAIS`: o cliente nao distingue passkey removida de conta desativada. */
  async login(entrada: z.infer<typeof PasskeyLoginEntrada>, aparelho?: string): Promise<SessaoEmitida> {
    const recusa = (): ErroApp => new ErroApp('CREDENCIAIS', MENSAGEM_LOGIN_RECUSADO)
    const desafio = await this.consumirDesafio(entrada.desafioId, 'LOGIN', null)
    if (!desafio) throw recusa()

    const credencial = await this.prisma.credencialPasskey.findUnique({
      where: { credentialId: entrada.resposta.id },
      include: { usuario: { select: { id: true, status: true } } },
    })
    if (!credencial || credencial.revogadaEm || credencial.usuario.status !== 'ATIVO') throw recusa()
    if (entrada.resposta.response.userHandle !== userHandleDe(credencial.usuarioId)) throw recusa()

    const { origin, rpID } = origemWebauthn()
    let contador: number
    try {
      const { verified, authenticationInfo } = await verifyAuthenticationResponse({
        response: entrada.resposta,
        expectedChallenge: desafio,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: {
          id: credencial.credentialId,
          publicKey: credencial.chavePublica,
          counter: credencial.contador,
          transports: credencial.transportes as AuthenticatorTransport[],
        },
      })
      if (!verified) throw recusa()
      contador = authenticationInfo.newCounter
    } catch {
      throw recusa()
    }

    const agora = new Date()
    // Duas respostas com o mesmo contador lido: so a primeira grava; a segunda e um clone ou repeticao.
    const { count } = await this.prisma.credencialPasskey.updateMany({
      where: { id: credencial.id, contador: credencial.contador, revogadaEm: null },
      data: { contador, ultimoUsoEm: agora },
    })
    if (count === 0) throw recusa()
    const sessao = await this.auth.abrirSessao(credencial.usuarioId, aparelho)
    await this.prisma.usuario.update({ where: { id: credencial.usuarioId }, data: { ultimoAcessoEm: agora } })
    return sessao
  }

  async opcoesDeCadastro(usuarioId: string, senha: string): Promise<z.infer<typeof PasskeyCadastroOpcoesSaida>> {
    const usuario = await this.prisma.usuario.findUnique({ where: { id: usuarioId } })
    if (usuario?.status !== 'ATIVO') throw new ErroApp('NAO_AUTENTICADO', 'Sua sessão expirou. Entre de novo.')
    // Mesma regra de qualquer cadastro. `REGRA` e nao `CREDENCIAIS`: 401 derrubaria a sessao no cliente (regra 16).
    if (!(await senhaConfere(usuario.senhaHash, senha))) throw new ErroApp('REGRA', 'Senha incorreta.')

    const existentes = await this.prisma.credencialPasskey.findMany({
      where: { usuarioId, revogadaEm: null },
      select: { credentialId: true, transportes: true },
    })
    const { rpID } = origemWebauthn()
    const opcoes = await generateRegistrationOptions({
      rpName: NOME_SISTEMA,
      rpID,
      userName: usuario.email,
      userDisplayName: usuario.nome,
      userID: Buffer.from(usuario.id),
      attestationType: 'none',
      excludeCredentials: existentes.map((c) => ({ id: c.credentialId, transports: c.transportes })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    })
    const desafioId = await this.guardarDesafio('CADASTRO', opcoes.challenge, usuarioId)
    return { desafioId, opcoes }
  }

  async cadastrar(usuarioId: string, entrada: z.infer<typeof PasskeyCadastroEntrada>): Promise<z.infer<typeof PasskeyResumo>> {
    const desafio = await this.consumirDesafio(entrada.desafioId, 'CADASTRO', usuarioId)
    if (!desafio) throw new ErroApp('TOKEN_INVALIDO', MENSAGEM_DESAFIO_VENCIDO)
    const usuario = await this.prisma.usuario.findUnique({ where: { id: usuarioId }, select: { status: true } })
    if (usuario?.status !== 'ATIVO') throw new ErroApp('NAO_AUTENTICADO', 'Sua sessão expirou. Entre de novo.')

    const { origin, rpID } = origemWebauthn()
    let registro: Awaited<ReturnType<typeof verifyRegistrationResponse>>['registrationInfo']
    try {
      const resultado = await verifyRegistrationResponse({
        response: entrada.resposta,
        expectedChallenge: desafio,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
      })
      registro = resultado.verified ? resultado.registrationInfo : undefined
    } catch {
      registro = undefined
    }
    if (!registro) throw new ErroApp('REGRA', MENSAGEM_CADASTRO_RECUSADO)

    try {
      const criada = await this.prisma.credencialPasskey.create({
        data: {
          usuarioId,
          credentialId: registro.credential.id,
          chavePublica: registro.credential.publicKey,
          contador: registro.credential.counter,
          transportes: registro.credential.transports ?? [],
          nome: entrada.nome,
        },
      })
      return resumir(criada)
    } catch (erro) {
      if (ehViolacaoUnica(erro)) throw new ErroApp('CONFLITO', 'Este aparelho já está ativado.')
      throw erro
    }
  }

  async listar(usuarioId: string): Promise<z.infer<typeof PasskeyListaSaida>> {
    const credenciais = await this.prisma.credencialPasskey.findMany({
      where: { usuarioId, revogadaEm: null },
      orderBy: [{ criadoEm: 'asc' }, { id: 'asc' }],
    })
    return { itens: credenciais.map(resumir) }
  }

  /** Nunca apaga: preenche `revogadaEm`. De outra pessoa, ou ja removida, e 404. */
  async remover(usuarioId: string, id: string): Promise<void> {
    const { count } = await this.prisma.credencialPasskey.updateMany({
      where: { id, usuarioId, revogadaEm: null },
      data: { revogadaEm: new Date() },
    })
    if (count === 0) throw new ErroApp('NAO_ENCONTRADO', 'Digital não encontrada.')
  }

  /** Apaga os vencidos ha mais de 1 hora (nao e historico) e grava o novo; devolve o id que o cliente reapresenta. */
  private async guardarDesafio(finalidade: FinalidadeDesafioPasskey, desafio: string, usuarioId: string | null): Promise<string> {
    const agora = Date.now()
    await this.prisma.desafioPasskey.deleteMany({ where: { expiraEm: { lt: new Date(agora - RETENCAO_DESAFIO_VENCIDO_MS) } } })
    const criado = await this.prisma.desafioPasskey.create({
      data: { desafio, finalidade, usuarioId, expiraEm: new Date(agora + VALIDADE_DESAFIO_MS) },
    })
    return criado.id
  }

  /**
   * Marca o desafio como usado so onde ainda esta aberto, da finalidade e do dono certos, ANTES de
   * verificar: dando certo ou errado ele nao serve de novo. Devolve o texto do desafio, ou null.
   */
  private async consumirDesafio(id: string, finalidade: FinalidadeDesafioPasskey, usuarioId: string | null): Promise<string | null> {
    const agora = new Date()
    const linha = await this.prisma.desafioPasskey.findUnique({ where: { id } })
    if (!linha) return null
    const { count } = await this.prisma.desafioPasskey.updateMany({
      where: { id, finalidade, usuarioId, usadoEm: null, expiraEm: { gt: agora } },
      data: { usadoEm: agora },
    })
    return count === 1 ? linha.desafio : null
  }
}
