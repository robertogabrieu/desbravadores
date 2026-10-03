import type { INestApplication } from '@nestjs/common'
import type { UsuarioLista, UsuarioSaida } from '@desbravadores/shared'
import argon2 from 'argon2'
import type { z } from 'zod'
import { criarAppDeTeste, emailFalso } from '../../test/app'
import {
  classeOficial,
  type Acesso,
  criarAcesso,
  criarClube,
  criarUnidade,
  criarUsuario,
  criarVinculo,
  desconectarPrismaDeTeste,
  prismaDeTeste,
  SENHA_DE_TESTE,
} from '../../test/fabricas'
import { testarIsolamento } from '../../test/isolamento'
import { ajustarPermissao, clienteHttp, corpo, criarClasseDoClube } from '../../test/p6'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { UsuariosService } from './usuarios.service'

type Usuario = z.infer<typeof UsuarioSaida>
type Lista = z.infer<typeof UsuarioLista>

describe('usuarios e vinculos', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  beforeEach(() => {
    emailFalso(app).limpar()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  describe('POST /usuarios (D21: usuario global)', () => {
    it('cria usuario novo CONVIDADO com vinculos e manda o convite', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const unidade = await criarUnidade({ clubeId: clube.id })
      const amigo = await classeOficial('Amigo')
      const resposta = await api
        .post('/api/usuarios', adm.autorizacao, {
          nome: 'Carla Nova',
          email: 'Carla.Nova@Exemplo.org',
          genero: 'F',
          vinculos: [
            { papel: 'CONSELHEIRO', unidadeIds: [unidade.id], ajustes: [{ permissao: 'dbv.editar', concedida: true }] },
            { papel: 'INSTRUTOR', classeIds: [amigo.id] },
          ],
        })
        .expect(201)
      const saida = corpo<Usuario>(resposta)
      expect(saida).toMatchObject({ nome: 'Carla Nova', email: 'carla.nova@exemplo.org', genero: 'F', situacao: 'CONVIDADO' })
      const papeis = saida.vinculos.map((v) => v.papel).sort()
      expect(papeis).toEqual(['CONSELHEIRO', 'INSTRUTOR'])
      const conselheiro = saida.vinculos.find((v) => v.papel === 'CONSELHEIRO')
      expect(conselheiro?.unidades).toEqual([{ id: unidade.id, nome: unidade.nome }])
      expect(conselheiro?.ajustes).toEqual([{ permissao: 'dbv.editar', concedida: true }])
      expect(saida.vinculos.find((v) => v.papel === 'INSTRUTOR')?.classes.map((c) => c.id)).toEqual([amigo.id])

      const enviadas = emailFalso(app).enviadas
      expect(enviadas).toHaveLength(1)
      expect(enviadas[0]?.para).toBe('carla.nova@exemplo.org')
      expect(enviadas[0]?.assunto).toBe(`Seu acesso ao ${clube.nome}`)
      expect(enviadas[0]?.texto).toContain('/convite/')
    })

    it('e-mail que ja existe em outro clube: mesma resposta, so ganha vinculo, nome e senha intactos', async () => {
      const clube = await criarClube()
      const outro = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const existente = await criarUsuario({ nome: 'Nome Verdadeiro', genero: 'M' })
      await criarVinculo({ usuarioId: existente.id, clubeId: outro.id, papel: 'ADM' })
      const hashAntes = existente.senhaHash

      const novo = corpo<Usuario>(
        await api
          .post('/api/usuarios', adm.autorizacao, { nome: 'Inventado', email: 'inedito@exemplo.org', genero: 'F', vinculos: [{ papel: 'CONSELHEIRO' }] })
          .expect(201),
      )
      emailFalso(app).limpar()
      const ecoado = corpo<Usuario>(
        await api
          .post('/api/usuarios', adm.autorizacao, { nome: 'Nome Inventado', email: existente.email, genero: 'F', vinculos: [{ papel: 'CONSELHEIRO' }] })
          .expect(201),
      )
      expect(ecoado).toMatchObject({ nome: 'Nome Inventado', genero: 'F', situacao: 'CONVIDADO', email: existente.email })
      expect(ecoado.vinculos.map((v) => v.papel)).toEqual(['CONSELHEIRO'])
      expect(Object.keys(ecoado).sort()).toEqual(Object.keys(novo).sort())
      expect(Object.keys(ecoado.vinculos[0] ?? {}).sort()).toEqual(Object.keys(novo.vinculos[0] ?? {}).sort())

      const depois = await prismaDeTeste().usuario.findUniqueOrThrow({ where: { id: existente.id } })
      expect(depois).toMatchObject({ nome: 'Nome Verdadeiro', genero: 'M', status: 'ATIVO' })
      expect(depois.senhaHash).toBe(hashAntes)
      expect(await argon2.verify(depois.senhaHash ?? '', SENHA_DE_TESTE)).toBe(true)
      const vinculos = await prismaDeTeste().vinculo.findMany({ where: { clubeId: clube.id, usuarioId: existente.id } })
      expect(vinculos).toHaveLength(1)
      // Usuario ativo recebe o aviso de "adicionado", nao um convite.
      const enviadas = emailFalso(app).enviadas
      expect(enviadas).toHaveLength(1)
      expect(enviadas[0]?.assunto).toBe(`Você agora faz parte do ${clube.nome}`)
      expect(enviadas[0]?.texto).not.toContain('/convite/')
    })

    it('ajuste invalido → 422 AJUSTE_INVALIDO e nada e criado (ADM, chave que nao se aplica, chave inexistente)', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const ajustesInvalidos: { papel: string; ajustes: object[] }[] = [
        { papel: 'ADM', ajustes: [{ permissao: 'dbv.ver', concedida: false }] },
        { papel: 'CONSELHEIRO', ajustes: [{ permissao: 'usuario.gerenciar', concedida: true }] },
        { papel: 'INSTRUTOR', ajustes: [{ permissao: 'nao.existe', concedida: true }] },
      ]
      for (const [indice, vinculo] of ajustesInvalidos.entries()) {
        const email = `ajuste${indice}@exemplo.org`
        const r = await api.post('/api/usuarios', adm.autorizacao, { nome: 'Teste', email, vinculos: [vinculo] }).expect(422)
        expect(r.body).toMatchObject({ codigo: 'AJUSTE_INVALIDO' })
        expect(await prismaDeTeste().usuario.count({ where: { email } })).toBe(0)
      }
    })

    it('unidade ou classe de outro clube → 404 e nada e criado', async () => {
      const clube = await criarClube()
      const outro = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const unidadeFora = await criarUnidade({ clubeId: outro.id })
      const classeFora = await criarClasseDoClube(outro.id)
      const casos = [
        { papel: 'CONSELHEIRO', unidadeIds: [unidadeFora.id] },
        { papel: 'INSTRUTOR', classeIds: [classeFora.id] },
      ]
      for (const [indice, vinculo] of casos.entries()) {
        const email = `fora${indice}@exemplo.org`
        const r = await api.post('/api/usuarios', adm.autorizacao, { nome: 'Teste', email, vinculos: [vinculo] }).expect(404)
        expect(r.body).toMatchObject({ codigo: 'NAO_ENCONTRADO' })
        expect(await prismaDeTeste().usuario.count({ where: { email } })).toBe(0)
      }
    })

    it('mesmo papel ja ativo no clube → 409; papel repetido no pedido → 422; conselheiro → 403; corpo invalido → 400', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const cons = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
      const existente = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR' })
      const conflito = await api
        .post('/api/usuarios', adm.autorizacao, { nome: 'Dup', email: existente.usuario.email, vinculos: [{ papel: 'INSTRUTOR' }] })
        .expect(409)
      expect(conflito.body).toMatchObject({ codigo: 'CONFLITO' })
      const repetido = await api
        .post('/api/usuarios', adm.autorizacao, { nome: 'Rep', email: 'rep@exemplo.org', vinculos: [{ papel: 'INSTRUTOR' }, { papel: 'INSTRUTOR' }] })
        .expect(422)
      expect(repetido.body).toMatchObject({ codigo: 'REGRA' })
      await api.post('/api/usuarios', cons.autorizacao, { nome: 'X', email: 'x@exemplo.org', vinculos: [{ papel: 'INSTRUTOR' }] }).expect(403)
      await api.post('/api/usuarios', adm.autorizacao, { nome: 'X', email: 'nao-e-email', vinculos: [] }).expect(400)
    })

    it('vinculo desativado do mesmo papel e reativado com a nova configuracao', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const inativo = await criarUsuario()
      await criarVinculo({ usuarioId: inativo.id, clubeId: clube.id, papel: 'INSTRUTOR', ativo: false })
      const saida = corpo<Usuario>(
        await api.post('/api/usuarios', adm.autorizacao, { nome: 'Volta', email: inativo.email, vinculos: [{ papel: 'INSTRUTOR' }] }).expect(201),
      )
      expect(saida.vinculos).toHaveLength(1)
      expect(saida.vinculos[0]?.ativo).toBe(true)
    })
  })

  describe('GET /usuarios', () => {
    it('lista so o clube, com situacao, contagens por papel, busca sem acento, filtro por papel e pagina de 25', async () => {
      const clube = await criarClube()
      const outro = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      await criarAcesso({ clubeId: outro.id, papel: 'ADM' })
      const cons1 = await criarUsuario({ nome: 'Álvaro Conselheiro', email: 'alvaro@exemplo.org' })
      const cons2 = await criarUsuario({ nome: 'Bia Conselheira' })
      const instrutor = await criarUsuario({ nome: 'Caio Instrutor' })
      const convidado = await criarUsuario({ nome: 'Dani Convidada', status: 'CONVIDADO' })
      const desligado = await criarUsuario({ nome: 'Edu Desligado' })
      await criarVinculo({ usuarioId: cons1.id, clubeId: clube.id, papel: 'CONSELHEIRO' })
      await criarVinculo({ usuarioId: cons2.id, clubeId: clube.id, papel: 'CONSELHEIRO' })
      await criarVinculo({ usuarioId: instrutor.id, clubeId: clube.id, papel: 'INSTRUTOR' })
      await criarVinculo({ usuarioId: convidado.id, clubeId: clube.id, papel: 'INSTRUTOR' })
      await criarVinculo({ usuarioId: desligado.id, clubeId: clube.id, papel: 'CONSELHEIRO', ativo: false })

      const todos = corpo<Lista>(await api.get('/api/usuarios', adm.autorizacao).expect(200))
      expect(todos.contagens).toEqual({ todos: 6, ADM: 1, CONSELHEIRO: 2, INSTRUTOR: 2 })
      expect(todos.total).toBe(6)
      expect(todos.itens.map((u) => u.nome)).toEqual(
        [adm.usuario.nome, 'Álvaro Conselheiro', 'Bia Conselheira', 'Caio Instrutor', 'Dani Convidada', 'Edu Desligado'].sort((a, b) => a.localeCompare(b, 'pt-BR')),
      )
      const situacoes = Object.fromEntries(todos.itens.map((u) => [u.nome, u.situacao]))
      expect(situacoes).toMatchObject({
        'Álvaro Conselheiro': 'ATIVO', 'Dani Convidada': 'CONVIDADO', 'Edu Desligado': 'INATIVO',
      })
      expect(todos.itens.every((u) => u.vinculos.length >= 1)).toBe(true)

      const soConselheiros = corpo<Lista>(await api.get('/api/usuarios?papel=CONSELHEIRO', adm.autorizacao).expect(200))
      expect(soConselheiros.itens.map((u) => u.nome)).toEqual(['Álvaro Conselheiro', 'Bia Conselheira'])
      expect(soConselheiros.contagens.todos).toBe(6)
      const busca = corpo<Lista>(await api.get('/api/usuarios?busca=alvaro', adm.autorizacao).expect(200))
      expect(busca.itens.map((u) => u.id)).toEqual([cons1.id])
      const porEmail = corpo<Lista>(await api.get('/api/usuarios?busca=ALVARO@EXEMPLO', adm.autorizacao).expect(200))
      expect(porEmail.itens.map((u) => u.id)).toEqual([cons1.id])
    })

    it('pagina de 25 por padrao', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      for (let i = 0; i < 26; i++) {
        const u = await criarUsuario({ nome: `Zz Pessoa ${String(i).padStart(2, '0')}` })
        await criarVinculo({ usuarioId: u.id, clubeId: clube.id, papel: 'INSTRUTOR' })
      }
      const pagina1 = corpo<Lista>(await api.get('/api/usuarios', adm.autorizacao).expect(200))
      expect(pagina1).toMatchObject({ total: 27, pagina: 1, porPagina: 25 })
      expect(pagina1.itens).toHaveLength(25)
      const pagina2 = corpo<Lista>(await api.get('/api/usuarios?pagina=2', adm.autorizacao).expect(200))
      expect(pagina2.itens).toHaveLength(2)
    })

    it('so ve vinculos deste clube e conselheiro → 403', async () => {
      const clube = await criarClube()
      const outro = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const cons = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
      const compartilhado = await criarUsuario()
      await criarVinculo({ usuarioId: compartilhado.id, clubeId: clube.id, papel: 'INSTRUTOR' })
      const vinculoFora = await criarVinculo({ usuarioId: compartilhado.id, clubeId: outro.id, papel: 'ADM' })
      const lista = corpo<Lista>(await api.get('/api/usuarios', adm.autorizacao).expect(200))
      const item = lista.itens.find((u) => u.id === compartilhado.id)
      expect(item?.vinculos.map((v) => v.papel)).toEqual(['INSTRUTOR'])
      expect(JSON.stringify(lista)).not.toContain(vinculoFora.id)
      await api.get('/api/usuarios', cons.autorizacao).expect(403)
    })
  })

  describe('PATCH /usuarios/:id', () => {
    it('edita nome e genero so de CONVIDADO sem vinculo em outro clube', async () => {
      const clube = await criarClube()
      const outro = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const convidado = await criarUsuario({ status: 'CONVIDADO' })
      await criarVinculo({ usuarioId: convidado.id, clubeId: clube.id, papel: 'INSTRUTOR' })
      const ok = corpo<Usuario>(await api.patch(`/api/usuarios/${convidado.id}`, adm.autorizacao, { nome: 'Corrigido', genero: 'F' }).expect(200))
      expect(ok).toMatchObject({ nome: 'Corrigido', genero: 'F', situacao: 'CONVIDADO' })

      const compartilhado = await criarUsuario({ status: 'CONVIDADO' })
      await criarVinculo({ usuarioId: compartilhado.id, clubeId: clube.id, papel: 'INSTRUTOR' })
      await criarVinculo({ usuarioId: compartilhado.id, clubeId: outro.id, papel: 'INSTRUTOR' })
      const recusa = await api.patch(`/api/usuarios/${compartilhado.id}`, adm.autorizacao, { nome: 'Sequestrado' }).expect(422)
      expect(recusa.body).toMatchObject({ codigo: 'REGRA' })

      const ativo = await criarUsuario({ nome: 'Ativo Real' })
      await criarVinculo({ usuarioId: ativo.id, clubeId: clube.id, papel: 'INSTRUTOR' })
      await api.patch(`/api/usuarios/${ativo.id}`, adm.autorizacao, { nome: 'Outro' }).expect(422)
      const intacto = await prismaDeTeste().usuario.findUniqueOrThrow({ where: { id: ativo.id } })
      expect(intacto.nome).toBe('Ativo Real')
    })

    it('e-mail no corpo nao altera nada; usuario sem vinculo neste clube → 404', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const convidado = await criarUsuario({ status: 'CONVIDADO', email: 'fixo@exemplo.org' })
      await criarVinculo({ usuarioId: convidado.id, clubeId: clube.id, papel: 'INSTRUTOR' })
      await api.patch(`/api/usuarios/${convidado.id}`, adm.autorizacao, { nome: 'Novo Nome', email: 'trocado@exemplo.org' }).expect(200)
      const depois = await prismaDeTeste().usuario.findUniqueOrThrow({ where: { id: convidado.id } })
      expect(depois.email).toBe('fixo@exemplo.org')
      const estranho = await criarUsuario({ status: 'CONVIDADO' })
      await api.patch(`/api/usuarios/${estranho.id}`, adm.autorizacao, { nome: 'Xx' }).expect(404)
    })
  })

  describe('desativar e ultimo Adm', () => {
    it('desativa todos os vinculos deste clube e preserva os de outro clube', async () => {
      const clube = await criarClube()
      const outro = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const alvo = await criarUsuario()
      const v1 = await criarVinculo({ usuarioId: alvo.id, clubeId: clube.id, papel: 'INSTRUTOR' })
      const v2 = await criarVinculo({ usuarioId: alvo.id, clubeId: clube.id, papel: 'CONSELHEIRO' })
      const vFora = await criarVinculo({ usuarioId: alvo.id, clubeId: outro.id, papel: 'ADM' })
      const saida = corpo<Usuario>(await api.post(`/api/usuarios/${alvo.id}/desativar`, adm.autorizacao).expect(200))
      expect(saida.situacao).toBe('INATIVO')
      expect(saida.vinculos.every((v) => !v.ativo)).toBe(true)
      const banco = await prismaDeTeste().vinculo.findMany({ where: { usuarioId: alvo.id, clubeId: { in: [clube.id, outro.id] } } })
      expect(banco.find((v) => v.id === v1.id)?.ativo).toBe(false)
      expect(banco.find((v) => v.id === v2.id)?.ativo).toBe(false)
      expect(banco.find((v) => v.id === vFora.id)?.ativo).toBe(true)
    })

    it('deixar o clube sem Adm ativo → 422 ULTIMO_ADM (desativar, PUT ativo=false, desativar a si mesmo)', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const desativar = await api.post(`/api/usuarios/${adm.usuario.id}/desativar`, adm.autorizacao).expect(422)
      expect(desativar.body).toMatchObject({ codigo: 'ULTIMO_ADM' })
      const put = await api.put(`/api/vinculos/${adm.vinculo.id}`, adm.autorizacao, { ativo: false }).expect(422)
      expect(put.body).toMatchObject({ codigo: 'ULTIMO_ADM' })
      const banco = await prismaDeTeste().vinculo.findFirstOrThrow({ where: { id: adm.vinculo.id, clubeId: clube.id } })
      expect(banco.ativo).toBe(true)

      const segundo = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      await api.put(`/api/vinculos/${segundo.vinculo.id}`, adm.autorizacao, { ativo: false }).expect(200)
      const ultimo = await api.post(`/api/usuarios/${adm.usuario.id}/desativar`, adm.autorizacao).expect(422)
      expect(ultimo.body).toMatchObject({ codigo: 'ULTIMO_ADM' })
    })

    it('Adm inativo nao conta como Adm restante', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const inativo = await criarUsuario()
      await criarVinculo({ usuarioId: inativo.id, clubeId: clube.id, papel: 'ADM', ativo: false })
      const r = await api.post(`/api/usuarios/${adm.usuario.id}/desativar`, adm.autorizacao).expect(422)
      expect(r.body).toMatchObject({ codigo: 'ULTIMO_ADM' })
    })

    describe('dois Adm tirando um ao outro ao mesmo tempo', () => {
      // Pelo serviço, não pelo HTTP: pela rota, quem chega depois pode cair na guarda de sessão (403) e o
      // teste dependeria da ordem de chegada. Aqui as duas contagens correm antes de qualquer gravação.
      const sessaoDe = (clubeId: string, a: Acesso): SessaoLogada => ({ usuarioId: a.usuario.id, vinculoId: a.vinculo.id, clubeId, papel: 'ADM' })

      async function conferirUmSoPassou(clubeId: string, resultados: PromiseSettledResult<unknown>[]): Promise<void> {
        expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
        const recusa = resultados.find((r) => r.status === 'rejected')
        expect(recusa?.status === 'rejected' && recusa.reason).toMatchObject({ codigo: 'ULTIMO_ADM' })
        expect(await prismaDeTeste().vinculo.count({ where: { clubeId, papel: 'ADM', ativo: true } })).toBe(1)
      }

      it('PUT ativo=false: um passa, o outro 422 ULTIMO_ADM, e o clube fica com um Adm', async () => {
        const servico = app.get(UsuariosService)
        const clube = await criarClube()
        const a = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
        const b = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
        const resultados = await Promise.allSettled([
          servico.editarVinculo(sessaoDe(clube.id, a), b.vinculo.id, { ativo: false }),
          servico.editarVinculo(sessaoDe(clube.id, b), a.vinculo.id, { ativo: false }),
        ])
        await conferirUmSoPassou(clube.id, resultados)
      })

      it('desativar: A desativa B e B desativa A; um passa, o outro 422 ULTIMO_ADM', async () => {
        const servico = app.get(UsuariosService)
        const clube = await criarClube()
        const a = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
        const b = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
        const resultados = await Promise.allSettled([
          servico.desativar(sessaoDe(clube.id, a), b.usuario.id),
          servico.desativar(sessaoDe(clube.id, b), a.usuario.id),
        ])
        await conferirUmSoPassou(clube.id, resultados)
      })
    })

    it('remover Adm com outro Adm ativo passa; remover papel que não é Adm não esbarra na trava', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const outroAdm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR' })
      await api.put(`/api/vinculos/${outroAdm.vinculo.id}`, adm.autorizacao, { ativo: false }).expect(200)
      await api.put(`/api/vinculos/${instrutor.vinculo.id}`, adm.autorizacao, { ativo: false }).expect(200)
      await api.post(`/api/usuarios/${instrutor.usuario.id}/desativar`, adm.autorizacao).expect(200)
    })
  })

  describe('POST /usuarios/:id/vinculos e PUT /vinculos/:id', () => {
    it('papel removido volta pelo acrescentar: mesmo registro, escopo do pedido e sem os ajustes antigos', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const alvo = await criarUsuario()
      const amigo = await classeOficial('Amigo')
      const guia = await classeOficial('Guia')
      const antigo = await criarVinculo({ usuarioId: alvo.id, clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [amigo.id] })
      await ajustarPermissao(antigo.id, 'observacao.ver_outros', true)
      await api.put(`/api/vinculos/${antigo.id}`, adm.autorizacao, { ativo: false }).expect(200)

      const saida = corpo<Usuario>(
        await api
          .post(`/api/usuarios/${alvo.id}/vinculos`, adm.autorizacao, { papel: 'INSTRUTOR', classeIds: [guia.id], ajustes: [] })
          .expect(201),
      )
      const instrutor = saida.vinculos.find((v) => v.papel === 'INSTRUTOR')
      expect(instrutor).toMatchObject({ id: antigo.id, ativo: true, ajustes: [] })
      expect(instrutor?.classes.map((c) => c.id)).toEqual([guia.id])
    })

    it('acrescenta vinculo; mesmo papel ativo → 409; ajuste invalido → 422; unidade de outro clube → 404', async () => {
      const clube = await criarClube()
      const outro = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const alvo = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR' })
      const unidade = await criarUnidade({ clubeId: clube.id })
      const unidadeFora = await criarUnidade({ clubeId: outro.id })
      const url = `/api/usuarios/${alvo.usuario.id}/vinculos`

      const saida = corpo<Usuario>(await api.post(url, adm.autorizacao, { papel: 'CONSELHEIRO', unidadeIds: [unidade.id] }).expect(201))
      expect(saida.vinculos.map((v) => v.papel).sort()).toEqual(['CONSELHEIRO', 'INSTRUTOR'])
      expect((await api.post(url, adm.autorizacao, { papel: 'CONSELHEIRO' }).expect(409)).body).toMatchObject({ codigo: 'CONFLITO' })
      const invalido = await api.post(url, adm.autorizacao, { papel: 'ADM', ajustes: [{ permissao: 'dbv.ver', concedida: false }] }).expect(422)
      expect(invalido.body).toMatchObject({ codigo: 'AJUSTE_INVALIDO' })
      const alvo2 = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR' })
      const outroClube = await api
        .post(`/api/usuarios/${alvo2.usuario.id}/vinculos`, adm.autorizacao, { papel: 'CONSELHEIRO', unidadeIds: [unidadeFora.id] })
        .expect(404)
      expect(outroClube.body).toMatchObject({ codigo: 'NAO_ENCONTRADO' })
      await api.post(`/api/usuarios/${alvo.usuario.id}/vinculos`, alvo.autorizacao, { papel: 'ADM' }).expect(403)
    })

    it('usuario sem vinculo neste clube → 404 (nao da para acrescentar vinculo a conta alheia)', async () => {
      const clube = await criarClube()
      const outro = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const estranho = await criarUsuario()
      await criarVinculo({ usuarioId: estranho.id, clubeId: outro.id, papel: 'ADM' })
      await api.post(`/api/usuarios/${estranho.id}/vinculos`, adm.autorizacao, { papel: 'INSTRUTOR' }).expect(404)
      expect(await prismaDeTeste().vinculo.count({ where: { clubeId: clube.id, usuarioId: estranho.id } })).toBe(0)
    })

    it('PUT substitui unidades, classes e ajustes e reativa; cruzar clube → 404; ajuste invalido → 422', async () => {
      const clube = await criarClube()
      const outro = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const u1 = await criarUnidade({ clubeId: clube.id })
      const u2 = await criarUnidade({ clubeId: clube.id })
      const unidadeFora = await criarUnidade({ clubeId: outro.id })
      const classeFora = await criarClasseDoClube(outro.id)
      const amigo = await classeOficial('Amigo')
      const cons = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [u1.id] })
      const instrutor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR' })

      const saida = corpo<Usuario>(
        await api
          .put(`/api/vinculos/${cons.vinculo.id}`, adm.autorizacao, { unidadeIds: [u2.id], ajustes: [{ permissao: 'dbv.editar', concedida: true }] })
          .expect(200),
      )
      expect(saida.id).toBe(cons.usuario.id)
      expect(saida.vinculos[0]?.unidades.map((u) => u.id)).toEqual([u2.id])
      expect(saida.vinculos[0]?.ajustes).toEqual([{ permissao: 'dbv.editar', concedida: true }])
      const trocado = corpo<Usuario>(await api.put(`/api/vinculos/${cons.vinculo.id}`, adm.autorizacao, { ajustes: [] }).expect(200))
      expect(trocado.vinculos[0]?.ajustes).toEqual([])
      expect(trocado.vinculos[0]?.unidades.map((u) => u.id)).toEqual([u2.id])

      const comClasse = corpo<Usuario>(await api.put(`/api/vinculos/${instrutor.vinculo.id}`, adm.autorizacao, { classeIds: [amigo.id] }).expect(200))
      expect(comClasse.vinculos[0]?.classes.map((c) => c.id)).toEqual([amigo.id])

      await api.put(`/api/vinculos/${cons.vinculo.id}`, adm.autorizacao, { unidadeIds: [unidadeFora.id] }).expect(404)
      await api.put(`/api/vinculos/${instrutor.vinculo.id}`, adm.autorizacao, { classeIds: [classeFora.id] }).expect(404)
      const invalido = await api
        .put(`/api/vinculos/${cons.vinculo.id}`, adm.autorizacao, { ajustes: [{ permissao: 'usuario.gerenciar', concedida: true }] })
        .expect(422)
      expect(invalido.body).toMatchObject({ codigo: 'AJUSTE_INVALIDO' })
      const unidadesEmInstrutor = await api.put(`/api/vinculos/${instrutor.vinculo.id}`, adm.autorizacao, { unidadeIds: [u1.id] }).expect(422)
      expect(unidadesEmInstrutor.body).toMatchObject({ codigo: 'REGRA' })
      const banco = await prismaDeTeste().vinculoUnidade.findMany({ where: { clubeId: clube.id, vinculoId: cons.vinculo.id } })
      expect(banco.map((v) => v.unidadeId)).toEqual([u2.id])
      await api.put(`/api/vinculos/${cons.vinculo.id}`, cons.autorizacao, { ativo: false }).expect(403)
    })

    it('classe desativada: vinculo novo com ela → 404; quem ja estava nela continua podendo ser editado', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const alvo = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
      const retirada = await criarClasseDoClube(clube.id, 'Retirada')
      const amigo = await classeOficial('Amigo')
      const antigo = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [retirada.id] })
      const novo = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR' })
      await prismaDeTeste().classe.update({ where: { id: retirada.id }, data: { ativa: false } })

      const recusado = await api
        .post(`/api/usuarios/${alvo.usuario.id}/vinculos`, adm.autorizacao, { papel: 'INSTRUTOR', classeIds: [retirada.id] })
        .expect(404)
      expect(recusado.body).toMatchObject({ codigo: 'NAO_ENCONTRADO' })
      await api.put(`/api/vinculos/${novo.vinculo.id}`, adm.autorizacao, { classeIds: [retirada.id] }).expect(404)

      const mantido = corpo<Usuario>(
        await api.put(`/api/vinculos/${antigo.vinculo.id}`, adm.autorizacao, { classeIds: [retirada.id, amigo.id] }).expect(200),
      )
      expect(mantido.vinculos[0]?.classes.map((c) => c.id).sort()).toEqual([retirada.id, amigo.id].sort())
    })

    it('a permissao ajustada vale na proxima requisicao', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const cons = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
      await api.get('/api/unidades', cons.autorizacao).expect(200)
      await api.put(`/api/vinculos/${cons.vinculo.id}`, adm.autorizacao, { ajustes: [{ permissao: 'dbv.ver', concedida: false }] }).expect(200)
      await api.get('/api/unidades', cons.autorizacao).expect(403)
    })
  })

  describe('POST /usuarios/:id/convite', () => {
    it('reenvia so para CONVIDADO e invalida convites anteriores', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const convidado = await criarUsuario({ status: 'CONVIDADO', nome: 'Fulano Convidado' })
      await criarVinculo({ usuarioId: convidado.id, clubeId: clube.id, papel: 'INSTRUTOR' })
      await api.post(`/api/usuarios/${convidado.id}/convite`, adm.autorizacao).expect(204)
      await api.post(`/api/usuarios/${convidado.id}/convite`, adm.autorizacao).expect(204)
      const enviadas = emailFalso(app).enviadas
      expect(enviadas).toHaveLength(2)
      expect(enviadas[1]?.assunto).toBe(`Seu acesso ao ${clube.nome}`)
      const tokens = await prismaDeTeste().tokenUsoUnico.findMany({
        where: { usuarioId: convidado.id, finalidade: 'CONVITE' }, orderBy: { criadoEm: 'asc' },
      })
      expect(tokens).toHaveLength(2)
      expect(tokens[0].expiraEm.getTime()).toBeLessThanOrEqual(Date.now())
      expect(tokens[1].expiraEm.getTime()).toBeGreaterThan(Date.now())

      const ativo = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR' })
      const r = await api.post(`/api/usuarios/${ativo.usuario.id}/convite`, adm.autorizacao).expect(422)
      expect(r.body).toMatchObject({ codigo: 'REGRA' })
      await api.post(`/api/usuarios/${convidado.id}/convite`, ativo.autorizacao).expect(403)
    })
  })

  describe('isolamento entre clubes', () => {
    const semearUsuario = async (clubeId: string, status: 'ATIVO' | 'CONVIDADO' = 'ATIVO'): Promise<{ id: string; nome: string }> => {
      const usuario = await criarUsuario({ status, nome: 'Original' })
      await criarVinculo({ usuarioId: usuario.id, clubeId, papel: 'INSTRUTOR' })
      return { id: usuario.id, nome: usuario.nome }
    }

    testarIsolamento({
      titulo: 'GET /usuarios (lista)',
      app: () => app,
      papel: 'ADM',
      semear: async (clube) => {
        const usuario = await semearUsuario(clube.id)
        return { metodo: 'get', caminho: '/api/usuarios', idsDoOutroClube: [usuario.id] }
      },
      esperado: { tipo: 'LISTA_SEM_OS_IDS' },
    })

    testarIsolamento({
      titulo: 'POST /usuarios com unidade de outro clube',
      app: () => app,
      papel: 'ADM',
      semear: async (clube) => {
        const unidade = await criarUnidade({ clubeId: clube.id })
        return {
          metodo: 'post',
          caminho: '/api/usuarios',
          corpo: { nome: 'Novo', email: `novo.${clube.id}@exemplo.org`, vinculos: [{ papel: 'CONSELHEIRO', unidadeIds: [unidade.id] }] },
        }
      },
      esperado: { tipo: 'NAO_ENCONTRADO' },
    })

    testarIsolamento({
      titulo: 'PATCH /usuarios/:id',
      app: () => app,
      papel: 'ADM',
      semear: async (clube) => {
        const usuario = await semearUsuario(clube.id, 'CONVIDADO')
        return {
          metodo: 'patch',
          caminho: `/api/usuarios/${usuario.id}`,
          corpo: { nome: 'Invadido' },
          conferirIntacto: async () => {
            const depois = await prismaDeTeste().usuario.findUniqueOrThrow({ where: { id: usuario.id } })
            expect(depois.nome).toBe('Original')
          },
        }
      },
      esperado: { tipo: 'NAO_ENCONTRADO' },
    })

    testarIsolamento({
      titulo: 'POST /usuarios/:id/desativar',
      app: () => app,
      papel: 'ADM',
      semear: async (clube) => {
        const usuario = await semearUsuario(clube.id)
        return {
          metodo: 'post',
          caminho: `/api/usuarios/${usuario.id}/desativar`,
          conferirIntacto: async () => {
            const banco = await prismaDeTeste().vinculo.findMany({ where: { clubeId: clube.id, usuarioId: usuario.id } })
            expect(banco.every((v) => v.ativo)).toBe(true)
          },
        }
      },
      esperado: { tipo: 'NAO_ENCONTRADO' },
    })

    testarIsolamento({
      titulo: 'POST /usuarios/:id/vinculos',
      app: () => app,
      papel: 'ADM',
      semear: async (clube) => {
        const usuario = await semearUsuario(clube.id)
        return {
          metodo: 'post',
          caminho: `/api/usuarios/${usuario.id}/vinculos`,
          corpo: { papel: 'CONSELHEIRO' },
          conferirIntacto: async () => {
            expect(await prismaDeTeste().vinculo.count({ where: { clubeId: clube.id, usuarioId: usuario.id } })).toBe(1)
          },
        }
      },
      esperado: { tipo: 'NAO_ENCONTRADO' },
    })

    testarIsolamento({
      titulo: 'PUT /vinculos/:id',
      app: () => app,
      papel: 'ADM',
      semear: async (clube) => {
        const usuario = await semearUsuario(clube.id)
        const vinculo = await prismaDeTeste().vinculo.findFirstOrThrow({ where: { clubeId: clube.id, usuarioId: usuario.id } })
        return {
          metodo: 'put',
          caminho: `/api/vinculos/${vinculo.id}`,
          corpo: { ativo: false },
          conferirIntacto: async () => {
            const depois = await prismaDeTeste().vinculo.findFirstOrThrow({ where: { id: vinculo.id, clubeId: clube.id } })
            expect(depois.ativo).toBe(true)
          },
        }
      },
      esperado: { tipo: 'NAO_ENCONTRADO' },
    })

    testarIsolamento({
      titulo: 'POST /usuarios/:id/convite',
      app: () => app,
      papel: 'ADM',
      semear: async (clube) => {
        const usuario = await semearUsuario(clube.id, 'CONVIDADO')
        return {
          metodo: 'post',
          caminho: `/api/usuarios/${usuario.id}/convite`,
          conferirIntacto: async () => {
            expect(await prismaDeTeste().tokenUsoUnico.count({ where: { usuarioId: usuario.id } })).toBe(0)
          },
        }
      },
      esperado: { tipo: 'NAO_ENCONTRADO' },
    })
  })

  describe('GET /usuarios/:id e ultimoAcessoEm', () => {
    it('le o usuario do clube com vinculos inativos e o ultimo acesso; a lista traz o mesmo campo', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const alvo = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
      await criarVinculo({ usuarioId: alvo.usuario.id, clubeId: clube.id, papel: 'INSTRUTOR', ativo: false })
      const quando = new Date('2026-09-30T13:45:00.000Z')
      await prismaDeTeste().usuario.update({ where: { id: alvo.usuario.id }, data: { ultimoAcessoEm: quando } })

      const lido = corpo<Usuario>(await api.get(`/api/usuarios/${alvo.usuario.id}`, adm.autorizacao).expect(200))
      expect(lido).toMatchObject({ id: alvo.usuario.id, ultimoAcessoEm: quando.toISOString() })
      expect(lido.vinculos.map((v) => `${v.papel}:${v.ativo}`).sort()).toEqual(['CONSELHEIRO:true', 'INSTRUTOR:false'])
      const lista = corpo<Lista>(await api.get('/api/usuarios', adm.autorizacao).expect(200))
      expect(lista.itens.find((u) => u.id === alvo.usuario.id)?.ultimoAcessoEm).toBe(quando.toISOString())
      expect(lista.itens.find((u) => u.id === adm.usuario.id)?.ultimoAcessoEm).toBeNull()
    })

    it('usuario sem vinculo neste clube → 404; id malformado → 400; sem usuario.gerenciar → 403', async () => {
      const clube = await criarClube()
      const outro = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const alheio = await criarAcesso({ clubeId: outro.id, papel: 'CONSELHEIRO' })
      const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
      expect((await api.get(`/api/usuarios/${alheio.usuario.id}`, adm.autorizacao).expect(404)).body).toMatchObject({ codigo: 'NAO_ENCONTRADO' })
      expect((await api.get('/api/usuarios/nao-e-uuid', adm.autorizacao).expect(400)).body).toMatchObject({ codigo: 'VALIDACAO' })
      await api.get(`/api/usuarios/${adm.usuario.id}`, conselheiro.autorizacao).expect(403)
    })

    it('o eco do POST para e-mail ja cadastrado nao revela o ultimo acesso da conta', async () => {
      const clube = await criarClube()
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      const existente = await criarUsuario({ email: 'ja.existe@exemplo.org' })
      await prismaDeTeste().usuario.update({ where: { id: existente.id }, data: { ultimoAcessoEm: new Date() } })
      const saida = corpo<Usuario>(
        await api.post('/api/usuarios', adm.autorizacao, { nome: 'Outro Nome', email: 'ja.existe@exemplo.org', vinculos: [{ papel: 'INSTRUTOR' }] }).expect(201),
      )
      expect(saida.ultimoAcessoEm).toBeNull()
    })
  })

  describe('isolamento entre clubes: leitura do usuario', () => {
    testarIsolamento({
      titulo: 'GET /usuarios/:id',
      app: () => app,
      papel: 'ADM',
      semear: async (clube) => {
        const acesso = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
        return { metodo: 'get', caminho: `/api/usuarios/${acesso.usuario.id}` }
      },
      esperado: { tipo: 'NAO_ENCONTRADO' },
    })
  })
})
