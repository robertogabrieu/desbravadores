import type { Server } from 'node:http'
import type { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { EuSaida, SessaoSaida, permissoesEfetivas } from '@desbravadores/shared'
import argon2 from 'argon2'
import request from 'supertest'
import { emailFalso } from '../../test/app'
import {
  SENHA_DE_TESTE,
  criarAcesso,
  criarClube,
  criarSessao,
  criarUsuario,
  criarVinculo,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { testarIsolamento } from '../../test/isolamento'
import { ServicoTokenUsoUnico } from '../sessao/token-uso-unico.service'
import { hashDoToken } from '../sessao/tokens'
import { cookieDoRefresh, criarAppDeAuth, linhaDoSetCookie } from './testes/app-auth'

let app: INestApplication
const servidor = (): Server => app.getHttpServer() as Server
const login = (email: string, senha: string = SENHA_DE_TESTE): request.Test =>
  request(servidor()).post('/api/auth/login').send({ email, senha })
const refresh = (cookie: string): request.Test => request(servidor()).post('/api/auth/refresh').set('Cookie', cookie)
const email = (): ReturnType<typeof emailFalso> => emailFalso(app)

/** Usuario ativo com vinculos ADM em `quantos` clubes novos. */
async function usuarioComVinculos(quantos: number): Promise<{ email: string; vinculoIds: string[] }> {
  const usuario = await criarUsuario()
  const vinculoIds: string[] = []
  for (let i = 0; i < quantos; i++) {
    const clube = await criarClube()
    vinculoIds.push((await criarVinculo({ usuarioId: usuario.id, clubeId: clube.id, papel: 'ADM' })).id)
  }
  return { email: usuario.email, vinculoIds }
}

beforeAll(async () => {
  app = await criarAppDeAuth()
})

afterAll(async () => {
  await app.close()
  await desconectarPrismaDeTeste()
})

describe('POST /auth/login', () => {
  it('credenciais certas: SessaoSaida, vinculo unico escolhido e cookie de refresh endurecido', async () => {
    const { email: e, vinculoIds } = await usuarioComVinculos(1)
    const resposta = await login(e).expect(200)
    const sessao = SessaoSaida.parse(resposta.body)
    expect(sessao.vinculoAtivoId).toBe(vinculoIds[0])
    expect(sessao.vinculos).toHaveLength(1)
    const cookie = linhaDoSetCookie(resposta)
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Strict')
    expect(cookie).toContain('Path=/api/auth')
    expect(cookie).not.toContain('Secure')
  })

  it('COOKIE_SECURE ligado marca o cookie como Secure', async () => {
    const { email: e } = await usuarioComVinculos(1)
    process.env['COOKIE_SECURE'] = 'true'
    try {
      const resposta = await login(e).expect(200)
      expect(linhaDoSetCookie(resposta)).toContain('Secure')
    } finally {
      process.env['COOKIE_SECURE'] = 'false'
    }
  })

  it('o access token leva so sub e vinculoId', async () => {
    const { email: e } = await usuarioComVinculos(1)
    const resposta = await login(e).expect(200)
    const carga = new JwtService().decode<Record<string, unknown>>((resposta.body as { accessToken: string }).accessToken)
    expect(Object.keys(carga).sort()).toEqual(['exp', 'iat', 'sub', 'vinculoId'])
  })

  it('senha errada e e-mail inexistente: mesma resposta; o inexistente roda argon2 contra hash falso', async () => {
    const { email: e } = await usuarioComVinculos(1)
    const errada = await login(e, 'senha-errada-1').expect(401)
    const espiao = jest.spyOn(argon2, 'verify')
    const inexistente = await login('ninguem@exemplo.org').expect(401)
    expect(espiao).toHaveBeenCalledTimes(1)
    expect(String(espiao.mock.calls[0]?.[0])).toMatch(/^\$argon2id\$/)
    espiao.mockRestore()
    expect(errada.body).toMatchObject({ codigo: 'CREDENCIAIS' })
    expect(inexistente.body).toEqual(errada.body)
  })

  it('usuario CONVIDADO (sem senha) nao entra', async () => {
    const convidado = await criarUsuario({ status: 'CONVIDADO' })
    const resposta = await login(convidado.email, 'qualquer-coisa').expect(401)
    expect(resposta.body).toMatchObject({ codigo: 'CREDENCIAIS' })
  })

  it('zero vinculos ativos: 403 VINCULO_INATIVO', async () => {
    const usuario = await criarUsuario()
    const clube = await criarClube()
    await criarVinculo({ usuarioId: usuario.id, clubeId: clube.id, papel: 'ADM', ativo: false })
    const resposta = await login(usuario.email).expect(403)
    expect(resposta.body).toMatchObject({ codigo: 'VINCULO_INATIVO' })
  })

  it('dois vinculos ativos: vinculoAtivoId nulo e os dois na lista', async () => {
    const { email: e } = await usuarioComVinculos(2)
    const sessao = SessaoSaida.parse((await login(e).expect(200)).body)
    expect(sessao.vinculoAtivoId).toBeNull()
    expect(sessao.vinculos).toHaveLength(2)
  })

  it('corpo invalido: 400 VALIDACAO', async () => {
    const resposta = await request(servidor()).post('/api/auth/login').send({ email: 'x' }).expect(400)
    expect(resposta.body).toMatchObject({ codigo: 'VALIDACAO' })
  })
})

describe('POST /auth/refresh', () => {
  it('rotaciona: devolve sessao e cookie novo; o anterior fica marcado como usado', async () => {
    const { email: e } = await usuarioComVinculos(1)
    const primeiro = cookieDoRefresh(await login(e).expect(200))
    const resposta = await refresh(primeiro).expect(200)
    SessaoSaida.parse(resposta.body)
    const segundo = cookieDoRefresh(resposta)
    expect(segundo).not.toBe(primeiro)
    const linha = await prismaDeTeste().refreshToken.findUniqueOrThrow({
      where: { tokenHash: hashDoToken(primeiro.replace('refresh=', '')) },
    })
    expect(linha.usadoEm).not.toBeNull()
  })

  it('sem cookie: 401 NAO_AUTENTICADO', async () => {
    const resposta = await request(servidor()).post('/api/auth/refresh').expect(401)
    expect(resposta.body).toMatchObject({ codigo: 'NAO_AUTENTICADO' })
  })

  it('reuso em ate 30 s nao derruba a familia', async () => {
    const { email: e } = await usuarioComVinculos(1)
    const primeiro = cookieDoRefresh(await login(e).expect(200))
    const sucessor = cookieDoRefresh(await refresh(primeiro).expect(200))
    await refresh(primeiro).expect(200)
    await refresh(sucessor).expect(200)
  })

  it('reuso depois de 30 s revoga a familia inteira', async () => {
    const { email: e } = await usuarioComVinculos(1)
    const primeiro = cookieDoRefresh(await login(e).expect(200))
    const sucessor = cookieDoRefresh(await refresh(primeiro).expect(200))
    await prismaDeTeste().refreshToken.update({
      where: { tokenHash: hashDoToken(primeiro.replace('refresh=', '')) },
      data: { usadoEm: new Date(Date.now() - 31_000) },
    })
    await refresh(primeiro).expect(401)
    await refresh(sucessor).expect(401)
  })

  it('a familia expira em 30 dias desde o login', async () => {
    const { email: e } = await usuarioComVinculos(1)
    const cookie = cookieDoRefresh(await login(e).expect(200))
    const linha = await prismaDeTeste().refreshToken.findUniqueOrThrow({
      where: { tokenHash: hashDoToken(cookie.replace('refresh=', '')) },
    })
    const dias = (linha.familiaExpiraEm.getTime() - Date.now()) / 86_400_000
    expect(dias).toBeGreaterThan(29.9)
    expect(dias).toBeLessThanOrEqual(30)
    await prismaDeTeste().refreshToken.updateMany({
      where: { familia: linha.familia },
      data: { familiaExpiraEm: new Date(Date.now() - 1000) },
    })
    await refresh(cookie).expect(401)
  })

  it('zero vinculos ativos no refresh: 403 VINCULO_INATIVO', async () => {
    const usuario = await criarUsuario()
    const clube = await criarClube()
    const vinculo = await criarVinculo({ usuarioId: usuario.id, clubeId: clube.id, papel: 'ADM' })
    const cookie = cookieDoRefresh(await login(usuario.email).expect(200))
    await prismaDeTeste().vinculo.update({ where: { id: vinculo.id }, data: { ativo: false } })
    const resposta = await refresh(cookie).expect(403)
    expect(resposta.body).toMatchObject({ codigo: 'VINCULO_INATIVO' })
  })
})

describe('POST /auth/papel-ativo', () => {
  const trocar = (cookie: string, vinculoId: string): request.Test =>
    request(servidor()).post('/api/auth/papel-ativo').set('Cookie', cookie).send({ vinculoId })

  it('grava o vinculo escolhido na familia: o refresh seguinte o mantem', async () => {
    const { email: e, vinculoIds } = await usuarioComVinculos(2)
    const cookie = cookieDoRefresh(await login(e).expect(200))
    const resposta = await trocar(cookie, vinculoIds[1] ?? '').expect(200)
    expect(SessaoSaida.parse(resposta.body).vinculoAtivoId).toBe(vinculoIds[1])
    const seguinte = await refresh(cookieDoRefresh(resposta)).expect(200)
    expect(SessaoSaida.parse(seguinte.body).vinculoAtivoId).toBe(vinculoIds[1])
  })

  it('vinculo de outro usuario: 403 VINCULO_INATIVO e a familia segue no vinculo anterior', async () => {
    const { email: e, vinculoIds } = await usuarioComVinculos(2)
    const alheio = await usuarioComVinculos(1)
    const cookie = cookieDoRefresh(await login(e).expect(200))
    const escolhido = cookieDoRefresh(await trocar(cookie, vinculoIds[0] ?? '').expect(200))
    const resposta = await trocar(escolhido, alheio.vinculoIds[0] ?? '').expect(403)
    expect(resposta.body).toMatchObject({ codigo: 'VINCULO_INATIVO' })
    const linha = await prismaDeTeste().refreshToken.findUniqueOrThrow({
      where: { tokenHash: hashDoToken(escolhido.replace('refresh=', '')) },
    })
    expect(linha.usadoEm).toBeNull()
    expect(linha.vinculoId).toBe(vinculoIds[0])
  })

  it('vinculo inativo: 403 VINCULO_INATIVO', async () => {
    const { email: e, vinculoIds } = await usuarioComVinculos(2)
    const cookie = cookieDoRefresh(await login(e).expect(200))
    await prismaDeTeste().vinculo.update({ where: { id: vinculoIds[1] }, data: { ativo: false } })
    await trocar(cookie, vinculoIds[1] ?? '').expect(403)
  })

  it('sem cookie: 401; corpo sem uuid: 400', async () => {
    await request(servidor()).post('/api/auth/papel-ativo').send({ vinculoId: 'nao-e-uuid' }).expect(400)
    await request(servidor())
      .post('/api/auth/papel-ativo')
      .send({ vinculoId: '0195b3a0-0000-7000-8000-000000000000' })
      .expect(401)
  })
})

describe('POST /auth/logout e /auth/sair-de-todos', () => {
  it('logout revoga so a familia atual e limpa o cookie', async () => {
    const { email: e } = await usuarioComVinculos(1)
    const a = cookieDoRefresh(await login(e).expect(200))
    const b = cookieDoRefresh(await login(e).expect(200))
    const resposta = await request(servidor()).post('/api/auth/logout').set('Cookie', a).expect(204)
    expect(linhaDoSetCookie(resposta)).toContain('refresh=;')
    await refresh(a).expect(401)
    await refresh(b).expect(200)
  })

  it('logout sem cookie: 204', async () => {
    await request(servidor()).post('/api/auth/logout').expect(204)
  })

  it('sair-de-todos revoga todas as familias do usuario', async () => {
    const usuario = await criarUsuario()
    const clube = await criarClube()
    const vinculo = await criarVinculo({ usuarioId: usuario.id, clubeId: clube.id, papel: 'ADM' })
    const a = cookieDoRefresh(await login(usuario.email).expect(200))
    const b = cookieDoRefresh(await login(usuario.email).expect(200))
    const token = criarSessao({ usuarioId: usuario.id, vinculoId: vinculo.id })
    await request(servidor()).post('/api/auth/sair-de-todos').set('Authorization', `Bearer ${token}`).expect(204)
    await refresh(a).expect(401)
    await refresh(b).expect(401)
  })

  it('sair-de-todos sem token: 401; com token de vinculo nulo funciona', async () => {
    await request(servidor()).post('/api/auth/sair-de-todos').expect(401)
    const usuario = await criarUsuario()
    const token = criarSessao({ usuarioId: usuario.id, vinculoId: null })
    await request(servidor()).post('/api/auth/sair-de-todos').set('Authorization', `Bearer ${token}`).expect(204)
  })
})

describe('POST /auth/convite/aceitar', () => {
  const aceitar = (token: string, senha = 'NovaSenha@99'): request.Test =>
    request(servidor()).post('/api/auth/convite/aceitar').send({ token, senha })
  const tokens = (): ServicoTokenUsoUnico => app.get(ServicoTokenUsoUnico)

  async function convidado(): Promise<{ id: string; email: string }> {
    const usuario = await criarUsuario({ status: 'CONVIDADO' })
    const clube = await criarClube()
    await criarVinculo({ usuarioId: usuario.id, clubeId: clube.id, papel: 'CONSELHEIRO' })
    return usuario
  }

  it('CONVIDADO define a senha, vira ATIVO e recebe SessaoSaida com cookie', async () => {
    const usuario = await convidado()
    const token = await tokens().gerar(usuario.id, 'CONVITE')
    const resposta = await aceitar(token).expect(200)
    SessaoSaida.parse(resposta.body)
    cookieDoRefresh(resposta)
    const depois = await prismaDeTeste().usuario.findUniqueOrThrow({ where: { id: usuario.id } })
    expect(depois.status).toBe('ATIVO')
    await login(usuario.email, 'NovaSenha@99').expect(200)
  })

  it('link usado de novo: 410 TOKEN_INVALIDO', async () => {
    const usuario = await convidado()
    const token = await tokens().gerar(usuario.id, 'CONVITE')
    await aceitar(token).expect(200)
    const resposta = await aceitar(token).expect(410)
    expect(resposta.body).toMatchObject({ codigo: 'TOKEN_INVALIDO' })
  })

  it('link vencido ou inexistente: 410', async () => {
    const usuario = await convidado()
    const vencido = await tokens().gerar(usuario.id, 'CONVITE', new Date(Date.now() - 8 * 86_400_000))
    await aceitar(vencido).expect(410)
    await aceitar('x'.repeat(43)).expect(410)
  })

  it('so serve para CONVIDADO: usuario ativo com token de convite leva 410 e a senha nao muda', async () => {
    const ativo = await criarUsuario()
    const token = await tokens().gerar(ativo.id, 'CONVITE')
    await aceitar(token).expect(410)
    await login(ativo.email).expect(403) // senha antiga intacta: passou das credenciais e parou nos vinculos
  })

  it('senha curta: 400 VALIDACAO', async () => {
    const usuario = await convidado()
    const token = await tokens().gerar(usuario.id, 'CONVITE')
    const resposta = await aceitar(token, 'curta').expect(400)
    expect(resposta.body).toMatchObject({ codigo: 'VALIDACAO' })
  })
})

describe('senha: esqueci e redefinir', () => {
  const esqueci = (e: string): request.Test => request(servidor()).post('/api/auth/senha/esqueci').send({ email: e })
  const redefinir = (token: string, senha = 'OutraSenha@77'): request.Test =>
    request(servidor()).post('/api/auth/senha/redefinir').send({ token, senha })
  const tokenDoEmail = (): string => {
    const texto = email().enviadas.at(-1)?.texto ?? ''
    return /\/senha\/redefinir\/([\w-]+)/.exec(texto)?.[1] ?? ''
  }

  it('usuario ATIVO recebe o link; resposta 204', async () => {
    email().limpar()
    const { email: e } = await usuarioComVinculos(1)
    await esqueci(e).expect(204)
    expect(email().enviadas).toHaveLength(1)
    expect(email().enviadas[0]).toMatchObject({ para: e, assunto: 'Redefinir sua senha' })
    expect(tokenDoEmail().length).toBeGreaterThan(20)
  })

  it('o 204 nao espera o envio: volta antes do SMTP terminar e o e-mail chega depois', async () => {
    email().limpar()
    const { email: e } = await usuarioComVinculos(1)
    let liberar: () => void = () => undefined
    const espera = new Promise<void>((resolver) => {
      liberar = resolver
    })
    const espiao = jest.spyOn(email(), 'enviar').mockImplementation(async (mensagem) => {
      await espera
      email().enviadas.push(mensagem)
    })
    try {
      await esqueci(e).expect(204)
      expect(espiao).toHaveBeenCalledTimes(1)
      expect(email().enviadas).toHaveLength(0)
    } finally {
      liberar()
      await new Promise((resolver) => setImmediate(resolver))
      espiao.mockRestore()
    }
    expect(email().enviadas).toHaveLength(1)
  })

  it('inexistente e CONVIDADO: 204 e nenhum e-mail', async () => {
    email().limpar()
    const convidado = await criarUsuario({ status: 'CONVIDADO' })
    await esqueci('nao-existe@exemplo.org').expect(204)
    await esqueci(convidado.email).expect(204)
    expect(email().enviadas).toHaveLength(0)
  })

  it('redefinir troca a senha, revoga todas as familias e o link nao vale de novo', async () => {
    email().limpar()
    const { email: e } = await usuarioComVinculos(1)
    const sessaoAntiga = cookieDoRefresh(await login(e).expect(200))
    await esqueci(e).expect(204)
    const token = tokenDoEmail()
    await redefinir(token).expect(204)
    await refresh(sessaoAntiga).expect(401)
    await login(e).expect(401)
    await login(e, 'OutraSenha@77').expect(200)
    const resposta = await redefinir(token).expect(410)
    expect(resposta.body).toMatchObject({ codigo: 'TOKEN_INVALIDO' })
  })

  it('link de redefinicao vencido: 410; senha curta: 400', async () => {
    const usuario = await criarUsuario()
    const vencido = await app.get(ServicoTokenUsoUnico).gerar(usuario.id, 'SENHA', new Date(Date.now() - 2 * 3_600_000))
    await redefinir(vencido).expect(410)
    const valido = await app.get(ServicoTokenUsoUnico).gerar(usuario.id, 'SENHA')
    await redefinir(valido, 'curta').expect(400)
  })

  it('um link de convite nao redefine senha', async () => {
    const usuario = await criarUsuario()
    const token = await app.get(ServicoTokenUsoUnico).gerar(usuario.id, 'CONVITE')
    await redefinir(token).expect(410)
  })
})

describe('vinculo desativado', () => {
  it('a proxima requisicao com o mesmo access token leva 403 VINCULO_INATIVO', async () => {
    const usuario = await criarUsuario()
    const clube = await criarClube()
    const vinculo = await criarVinculo({ usuarioId: usuario.id, clubeId: clube.id, papel: 'ADM' })
    const sessao = SessaoSaida.parse((await login(usuario.email).expect(200)).body)
    const cabecalho = `Bearer ${sessao.accessToken}`
    await request(servidor()).get('/api/_teste/logado').set('Authorization', cabecalho).expect(200)
    await prismaDeTeste().vinculo.update({ where: { id: vinculo.id }, data: { ativo: false } })
    const resposta = await request(servidor()).get('/api/_teste/logado').set('Authorization', cabecalho).expect(403)
    expect(resposta.body).toMatchObject({ codigo: 'VINCULO_INATIVO' })
  })
})

describe('GET /eu', () => {
  it('devolve usuario, vinculos e as permissoes efetivas do vinculo ativo (com ajustes)', async () => {
    const clube = await criarClube()
    const acesso = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
    await prismaDeTeste().permissaoAjuste.create({
      data: { vinculoId: acesso.vinculo.id, permissao: 'dbv.editar', concedida: true },
    })
    const resposta = await request(servidor()).get('/api/eu').set('Authorization', acesso.autorizacao).expect(200)
    const eu = EuSaida.parse(resposta.body)
    expect(eu.usuario).toMatchObject({ id: acesso.usuario.id, email: acesso.usuario.email })
    expect(eu.vinculoAtivo?.id).toBe(acesso.vinculo.id)
    expect(eu.vinculoAtivo?.clube.id).toBe(clube.id)
    expect(eu.vinculos).toHaveLength(1)
    expect(eu.permissoes).toEqual(permissoesEfetivas('CONSELHEIRO', [{ permissao: 'dbv.editar', concedida: true }]))
    expect(eu.permissoes).toContain('dbv.editar')
  })

  it('token sem vinculo: vinculoAtivo nulo, permissoes vazias, vinculos ativos listados', async () => {
    const { email: e } = await usuarioComVinculos(2)
    const sessao = SessaoSaida.parse((await login(e).expect(200)).body)
    expect(sessao.vinculoAtivoId).toBeNull()
    const resposta = await request(servidor()).get('/api/eu').set('Authorization', `Bearer ${sessao.accessToken}`).expect(200)
    const eu = EuSaida.parse(resposta.body)
    expect(eu.vinculoAtivo).toBeNull()
    expect(eu.permissoes).toEqual([])
    expect(eu.vinculos).toHaveLength(2)
  })

  it('vinculo do token desativado: cai para sem vinculo ativo', async () => {
    const clube = await criarClube()
    const acesso = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    await prismaDeTeste().vinculo.update({ where: { id: acesso.vinculo.id }, data: { ativo: false } })
    const resposta = await request(servidor()).get('/api/eu').set('Authorization', acesso.autorizacao).expect(200)
    const eu = EuSaida.parse(resposta.body)
    expect(eu.vinculoAtivo).toBeNull()
    expect(eu.permissoes).toEqual([])
    expect(eu.vinculos).toEqual([])
  })

  it('sem token: 401', async () => {
    await request(servidor()).get('/api/eu').expect(401)
  })

  it('CONSELHEIRO lista as unidades e INSTRUTOR as classes do vinculo, com corToken', async () => {
    const clube = await criarClube()
    const usuario = await criarUsuario()
    const unidade = await prismaDeTeste().unidade.create({ data: { clubeId: clube.id, nome: 'Aguias', tipo: 'MISTA' } })
    const amigo = await prismaDeTeste().classe.findFirstOrThrow({ where: { nome: 'Amigo', trilha: 'INDIVIDUAL', clubeId: null } })
    const conselheiro = await criarVinculo({ usuarioId: usuario.id, clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [unidade.id] })
    const instrutor = await criarVinculo({ usuarioId: usuario.id, clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [amigo.id] })
    const token = criarSessao({ usuarioId: usuario.id, vinculoId: conselheiro.id })
    const eu = EuSaida.parse((await request(servidor()).get('/api/eu').set('Authorization', `Bearer ${token}`).expect(200)).body)
    const doConselheiro = eu.vinculos.find((v) => v.id === conselheiro.id)
    const doInstrutor = eu.vinculos.find((v) => v.id === instrutor.id)
    expect(doConselheiro?.unidades).toEqual([{ id: unidade.id, nome: 'Aguias' }])
    expect(doConselheiro?.classes).toEqual([])
    expect(doInstrutor?.classes).toEqual([
      { id: amigo.id, nome: 'Amigo', tipo: 'REGULAR', trilha: 'INDIVIDUAL', corToken: '--classe-amigo' },
    ])
  })
})

testarIsolamento({
  titulo: 'GET /eu',
  app: () => app,
  papel: 'ADM',
  semear: (clubeB) => Promise.resolve({ metodo: 'get', caminho: '/api/eu', idsDoOutroClube: [clubeB.id] }),
  esperado: { tipo: 'LISTA_SEM_OS_IDS' },
})
