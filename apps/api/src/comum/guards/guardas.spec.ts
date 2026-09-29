import type { Server } from 'node:http'
import { Logger, type INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import request from 'supertest'
import { criarAppDeTeste } from '../../../test/app'
import { criarAcesso, criarClube, criarUsuario, criarVinculo, desconectarPrismaDeTeste, prismaDeTeste } from '../../../test/fabricas'
import { RotasDeTesteModule } from '../../../test/rotas-de-teste'
import { ServicoAccessToken } from '../../sessao/access-token.service'

describe('guardas globais e filtro de erros', () => {
  let app: INestApplication
  const servidor = (): Server => app.getHttpServer() as Server

  beforeAll(async () => {
    app = await criarAppDeTeste({ extras: [RotasDeTesteModule] })
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  it('rota @Publica passa sem token', async () => {
    await request(servidor()).get('/api/saude').expect(200)
  })

  it('sem token: 401 NAO_AUTENTICADO em @Autenticado, @Logado e @Pode', async () => {
    for (const rota of ['autenticado', 'logado', 'pode-usuarios']) {
      const resposta = await request(servidor()).get(`/api/_teste/${rota}`).expect(401)
      expect(resposta.body).toMatchObject({ codigo: 'NAO_AUTENTICADO' })
      expect(typeof (resposta.body as { mensagem: string }).mensagem).toBe('string')
    }
  })

  it('token invalido: 401 NAO_AUTENTICADO', async () => {
    await request(servidor()).get('/api/_teste/logado').set('Authorization', 'Bearer lixo').expect(401)
    await request(servidor()).get('/api/_teste/logado').set('Authorization', 'lixo').expect(401)
  })

  it('token com vinculo nulo passa em @Autenticado e cai em 403 VINCULO_INATIVO nas outras', async () => {
    const usuario = await criarUsuario()
    const jwt = new ServicoAccessToken(new JwtService({ secret: process.env['JWT_SEGREDO'] })).emitir({
      usuarioId: usuario.id,
      vinculoId: null,
    })
    const cabecalho = `Bearer ${jwt}`
    const ok = await request(servidor()).get('/api/_teste/autenticado').set('Authorization', cabecalho).expect(200)
    expect(ok.body).toMatchObject({ usuarioId: usuario.id, vinculoId: null, clubeId: null, papel: null })
    for (const rota of ['logado', 'pode-usuarios']) {
      const resposta = await request(servidor()).get(`/api/_teste/${rota}`).set('Authorization', cabecalho).expect(403)
      expect(resposta.body).toMatchObject({ codigo: 'VINCULO_INATIVO' })
    }
  })

  it('injeta na requisicao clube e papel lidos do banco, nao do token', async () => {
    const clube = await criarClube()
    const acesso = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
    const resposta = await request(servidor()).get('/api/_teste/logado').set('Authorization', acesso.autorizacao).expect(200)
    expect(resposta.body).toEqual({
      usuarioId: acesso.usuario.id,
      vinculoId: acesso.vinculo.id,
      clubeId: clube.id,
      papel: 'CONSELHEIRO',
    })
    await prismaDeTeste().vinculo.update({ where: { id: acesso.vinculo.id }, data: { papel: 'INSTRUTOR' } })
    const depois = await request(servidor()).get('/api/_teste/logado').set('Authorization', acesso.autorizacao).expect(200)
    expect((depois.body as { papel: string }).papel).toBe('INSTRUTOR')
  })

  it('vinculo desativado, inexistente ou de outro usuario: 403 VINCULO_INATIVO na proxima requisicao', async () => {
    const clube = await criarClube()
    const acesso = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    await request(servidor()).get('/api/_teste/logado').set('Authorization', acesso.autorizacao).expect(200)
    await prismaDeTeste().vinculo.update({ where: { id: acesso.vinculo.id }, data: { ativo: false } })
    const resposta = await request(servidor()).get('/api/_teste/logado').set('Authorization', acesso.autorizacao).expect(403)
    expect(resposta.body).toMatchObject({ codigo: 'VINCULO_INATIVO' })

    const dono = await criarUsuario()
    const intruso = await criarUsuario()
    const vinculoDoDono = await criarVinculo({ usuarioId: dono.id, clubeId: clube.id, papel: 'ADM' })
    const jwt = new ServicoAccessToken(new JwtService({ secret: process.env['JWT_SEGREDO'] })).emitir({
      usuarioId: intruso.id,
      vinculoId: vinculoDoDono.id,
    })
    await request(servidor()).get('/api/_teste/logado').set('Authorization', `Bearer ${jwt}`).expect(403)
  })

  it('@Pode: ADM passa; conselheiro sem a permissao leva 403 SEM_PERMISSAO; ajuste concedido libera', async () => {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    await request(servidor()).get('/api/_teste/pode-usuarios').set('Authorization', adm.autorizacao).expect(200)

    const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
    const negada = await request(servidor()).get('/api/_teste/pode-usuarios').set('Authorization', conselheiro.autorizacao).expect(403)
    expect(negada.body).toMatchObject({ codigo: 'SEM_PERMISSAO' })

    await request(servidor()).get('/api/_teste/pode-editar-dbv').set('Authorization', conselheiro.autorizacao).expect(403)
    await prismaDeTeste().permissaoAjuste.create({
      data: { vinculoId: conselheiro.vinculo.id, permissao: 'dbv.editar', concedida: true },
    })
    await request(servidor()).get('/api/_teste/pode-editar-dbv').set('Authorization', conselheiro.autorizacao).expect(200)
  })

  it('@Pode le os ajustes do banco a cada requisicao (padrao ligado, ajuste desliga)', async () => {
    const clube = await criarClube()
    const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
    await request(servidor()).get('/api/_teste/pode-ver-dbv').set('Authorization', conselheiro.autorizacao).expect(200)
    await prismaDeTeste().permissaoAjuste.create({
      data: { vinculoId: conselheiro.vinculo.id, permissao: 'dbv.ver', concedida: false },
    })
    const resposta = await request(servidor()).get('/api/_teste/pode-ver-dbv').set('Authorization', conselheiro.autorizacao).expect(403)
    expect(resposta.body).toMatchObject({ codigo: 'SEM_PERMISSAO' })
  })

  it('ZodValidationPipe: 400 VALIDACAO com os campos', async () => {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const resposta = await request(servidor())
      .post('/api/_teste/validar')
      .set('Authorization', adm.autorizacao)
      .send({ nome: '', idade: 'x' })
      .expect(400)
    expect(resposta.body).toMatchObject({ codigo: 'VALIDACAO' })
    const campos = (resposta.body as { campos: Record<string, string> }).campos
    expect(Object.keys(campos).sort()).toEqual(['idade', 'nome'])

    const ok = await request(servidor())
      .post('/api/_teste/validar')
      .set('Authorization', adm.autorizacao)
      .send({ nome: 'Ana', idade: '12' })
      .expect(201)
    expect(ok.body).toEqual({ nome: 'Ana', idade: 12 })
  })

  it('o filtro devolve ErroApi para rota inexistente e para erro de dominio', async () => {
    const inexistente = await request(servidor()).get('/api/nao-existe').expect(404)
    expect(inexistente.body).toMatchObject({ codigo: 'NAO_ENCONTRADO' })
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const conflito = await request(servidor()).get('/api/_teste/conflito').set('Authorization', adm.autorizacao).expect(409)
    expect(conflito.body).toEqual({ codigo: 'CONFLITO', mensagem: 'Já existe uma unidade com esse nome.' })
  })

  it('ErroEscopoClube vira 500 ERRO_INTERNO generico e vai para o log', async () => {
    const espiao = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
    const resposta = await request(servidor()).get('/api/_teste/erro-escopo').expect(500)
    expect(resposta.body).toEqual({ codigo: 'ERRO_INTERNO', mensagem: 'Algo deu errado. Tente de novo em instantes.' })
    expect(JSON.stringify(espiao.mock.calls)).toContain('ErroEscopoClube')
    espiao.mockRestore()
  })
})
