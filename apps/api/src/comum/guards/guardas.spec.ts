import type { Server } from 'node:http'
import { Logger, type INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import request from 'supertest'
import { criarAppDeTeste } from '../../../test/app'
import {
  admDefinirClasseClube,
  classeOficial,
  credencialDeSubstituicao,
  criarAcesso,
  criarClube,
  criarSubstituicao,
  criarUnidade,
  criarUsuario,
  criarVinculo,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../../test/fabricas'
import { congelarRelogio, descongelarRelogio } from '../../../test/relogio'
import { ServicoEscopo } from '../../desbravadores/escopo.service'
import { RotasDeTesteModule } from '../../../test/rotas-de-teste'
import { ServicoAccessToken } from '../../sessao/access-token.service'
import type { SessaoLogada } from '../decorators/sessao.decorator'

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
  describe('credencial de substituicao', () => {
    const HORA = 60 * 60 * 1000

    async function linkDeUnidade(dados: Partial<Parameters<typeof criarSubstituicao>[0]> = {}) {
      const clube = await criarClube()
      const unidade = await criarUnidade({ clubeId: clube.id })
      const substituicao = await criarSubstituicao({ clubeId: clube.id, tipo: 'CHAMADA', unidadeId: unidade.id, ...dados })
      return { clube, unidade, substituicao, ...credencialDeSubstituicao(substituicao) }
    }

    async function codigo(metodo: 'get' | 'put', caminho: string, autorizacao: string, status: number): Promise<string> {
      const resposta = await request(servidor())[metodo](caminho).set('Authorization', autorizacao).expect(status)
      return (resposta.body as { codigo: string }).codigo
    }

    afterEach(() => {
      descongelarRelogio()
    })

    it('criterio 19: em /api/eu e nas rotas @Autenticado responde 401 NAO_AUTENTICADO', async () => {
      const { autorizacao } = await linkDeUnidade()
      expect(await codigo('get', '/api/eu', autorizacao, 401)).toBe('NAO_AUTENTICADO')
      expect(await codigo('get', '/api/_teste/autenticado', autorizacao, 401)).toBe('NAO_AUTENTICADO')
    })

    it('criterio 17: rota sem a marca responde 401 NAO_AUTENTICADO; a marcada aceita', async () => {
      const { autorizacao } = await linkDeUnidade()
      for (const rota of ['logado', 'pode-ver-dbv', 'pode-usuarios', 'unidades']) {
        expect(await codigo('get', `/api/_teste/${rota}`, autorizacao, 401)).toBe('NAO_AUTENTICADO')
      }
      await request(servidor()).get('/api/_teste/logado-ou-substituto').set('Authorization', autorizacao).expect(200)
      await request(servidor()).get('/api/_teste/pode-ou-substituto').set('Authorization', autorizacao).expect(200)
      await request(servidor()).put('/api/_teste/pode-ou-substituto').set('Authorization', autorizacao).expect(200)
    })

    it('link de unidade: autor, clube do link, papel CONSELHEIRO, vinculoId = id da substituicao e o alvo', async () => {
      const { clube, unidade, substituicao, autorizacao } = await linkDeUnidade()
      const resposta = await request(servidor()).get('/api/_teste/pode-ou-substituto').set('Authorization', autorizacao).expect(200)
      expect(resposta.body).toEqual({
        usuarioId: substituicao.substitutoId,
        vinculoId: substituicao.id,
        clubeId: clube.id,
        papel: 'CONSELHEIRO',
        substituicao: {
          id: substituicao.id,
          unidadeId: unidade.id,
          classeId: null,
          data: substituicao.data.toISOString().slice(0, 10),
        },
      })
    })

    it('link de classe oficial ativa no clube: papel INSTRUTOR, sem ler vinculo nem ajuste', async () => {
      const clube = await criarClube()
      const amigo = await classeOficial('Amigo')
      const substituicao = await criarSubstituicao({ clubeId: clube.id, tipo: 'CLASSE', classeId: amigo.id })
      const { autorizacao } = credencialDeSubstituicao(substituicao)
      const resposta = await request(servidor()).put('/api/_teste/pode-ou-substituto').set('Authorization', autorizacao).expect(200)
      expect(resposta.body).toMatchObject({
        papel: 'INSTRUTOR',
        vinculoId: substituicao.id,
        substituicao: { id: substituicao.id, unidadeId: null, classeId: amigo.id },
      })
    })

    it('a sessao normal segue passando nas rotas marcadas, sem campo de substituicao', async () => {
      const clube = await criarClube()
      const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
      const resposta = await request(servidor())
        .get('/api/_teste/logado-ou-substituto')
        .set('Authorization', conselheiro.autorizacao)
        .expect(200)
      expect(resposta.body).toEqual({
        usuarioId: conselheiro.usuario.id,
        vinculoId: conselheiro.vinculo.id,
        clubeId: clube.id,
        papel: 'CONSELHEIRO',
      })
    })

    it('cancelada, sem aparelho identificado ou antes do inicio: 401 SUBSTITUICAO_ENCERRADA', async () => {
      const cancelada = await linkDeUnidade({ cancelada: true })
      const semAparelho = await linkDeUnidade({ aparelhoHash: null })
      const antes = await linkDeUnidade({ inicioEm: new Date(Date.now() + HORA) })
      for (const { autorizacao } of [cancelada, semAparelho, antes]) {
        expect(await codigo('get', '/api/_teste/pode-ou-substituto', autorizacao, 401)).toBe('SUBSTITUICAO_ENCERRADA')
        expect(await codigo('put', '/api/_teste/pode-ou-substituto', autorizacao, 401)).toBe('SUBSTITUICAO_ENCERRADA')
      }
    })

    it('entre o fim e o fim do envio: grava, mas a leitura ja encerrou', async () => {
      const { substituicao, autorizacao } = await linkDeUnidade()
      congelarRelogio(new Date(substituicao.fimEm.getTime() + HORA).toISOString())
      await request(servidor()).put('/api/_teste/pode-ou-substituto').set('Authorization', autorizacao).expect(200)
      expect(await codigo('get', '/api/_teste/pode-ou-substituto', autorizacao, 401)).toBe('SUBSTITUICAO_ENCERRADA')
      expect(await codigo('get', '/api/_teste/logado-ou-substituto', autorizacao, 401)).toBe('SUBSTITUICAO_ENCERRADA')
    })

    it('depois do fim do envio: gravacao e leitura encerradas', async () => {
      const { substituicao, autorizacao } = await linkDeUnidade()
      congelarRelogio(new Date(substituicao.fimEnvioEm.getTime() + 1000).toISOString())
      expect(await codigo('put', '/api/_teste/pode-ou-substituto', autorizacao, 401)).toBe('SUBSTITUICAO_ENCERRADA')
      expect(await codigo('get', '/api/_teste/pode-ou-substituto', autorizacao, 401)).toBe('SUBSTITUICAO_ENCERRADA')
    })

    it('alvo desativado (unidade inativa, classe desligada no clube, classe de outro clube): SUBSTITUICAO_ENCERRADA', async () => {
      const unidade = await linkDeUnidade()
      await prismaDeTeste().unidade.update({ where: { id: unidade.unidade.id }, data: { ativa: false } })

      const clube = await criarClube()
      const amigo = await classeOficial('Amigo')
      const desligada = await criarSubstituicao({ clubeId: clube.id, tipo: 'CLASSE', classeId: amigo.id })
      await admDefinirClasseClube({ clubeId: clube.id, classeId: amigo.id, ativa: false })

      const outroClube = await criarClube()
      const classeAlheia = await prismaDeTeste().classe.create({
        data: { clubeId: outroClube.id, origem: 'CLUBE', nome: 'Alheia', tipo: 'REGULAR', trilha: 'INDIVIDUAL', ordem: 99 },
      })
      const alheia = await criarSubstituicao({ clubeId: clube.id, tipo: 'CLASSE', classeId: classeAlheia.id })

      for (const autorizacao of [
        unidade.autorizacao,
        credencialDeSubstituicao(desligada).autorizacao,
        credencialDeSubstituicao(alheia).autorizacao,
      ]) {
        expect(await codigo('put', '/api/_teste/pode-ou-substituto', autorizacao, 401)).toBe('SUBSTITUICAO_ENCERRADA')
      }
    })

    it('classe do proprio clube e alvo valido', async () => {
      const clube = await criarClube()
      const propria = await prismaDeTeste().classe.create({
        data: { clubeId: clube.id, origem: 'CLUBE', nome: 'Propria', tipo: 'REGULAR', trilha: 'INDIVIDUAL', ordem: 99 },
      })
      const substituicao = await criarSubstituicao({ clubeId: clube.id, tipo: 'CLASSE', classeId: propria.id })
      await request(servidor())
        .put('/api/_teste/pode-ou-substituto')
        .set('Authorization', credencialDeSubstituicao(substituicao).autorizacao)
        .expect(200)
    })

    it('escopo: unidadesDoConselheiro e classesDoInstrutor devolvem so o alvo do link', async () => {
      const escopo = app.get(ServicoEscopo, { strict: false })
      const clube = await criarClube()
      const alvo = await criarUnidade({ clubeId: clube.id })
      const amigo = await classeOficial('Amigo')
      const base = { usuarioId: 'u', clubeId: clube.id, vinculoId: 'sub' }
      const deUnidade: SessaoLogada = {
        ...base,
        papel: 'CONSELHEIRO',
        substituicao: { id: 'sub', unidadeId: alvo.id, classeId: null, data: '2026-10-10' },
      }
      const deClasse: SessaoLogada = {
        ...base,
        papel: 'INSTRUTOR',
        substituicao: { id: 'sub', unidadeId: null, classeId: amigo.id, data: '2026-10-10' },
      }
      expect(await escopo.unidadesDoConselheiro(deUnidade)).toEqual([alvo.id])
      expect(await escopo.classesDoInstrutor(deUnidade)).toEqual([])
      expect(await escopo.classesDoInstrutor(deClasse)).toEqual([amigo.id])
      expect(await escopo.unidadesDoConselheiro(deClasse)).toEqual([])
    })
  })
})
