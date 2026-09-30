import type { Server } from 'node:http'
import type { INestApplication } from '@nestjs/common'
import type { ObservacaoSaida } from '@desbravadores/shared'
import request from 'supertest'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import {
  criarAcesso,
  criarClube,
  criarDbv,
  criarMatricula,
  criarMembro,
  criarObservacao,
  criarRegistroAula,
  criarUnidade,
  desconectarPrismaDeTeste,
  prismaDeTeste,
  type Acesso,
} from '../../test/fabricas'
import { ajustarPermissao, clienteHttp, corpo, criarClasseDoClube } from '../../test/p6'

type Saida = z.infer<typeof ObservacaoSaida>

describe('observacoes (F10)', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)
  const apagar = (url: string, auth: string): request.Test => request(app.getHttpServer() as Server).delete(url).set('Authorization', auth)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  async function cenario() {
    const clube = await criarClube()
    const classe = await criarClasseDoClube(clube.id)
    const autor = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [classe.id] })
    const colega = await criarAcesso({ clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [classe.id] })
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const dbv = await criarDbv({ clubeId: clube.id })
    await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: classe.id })
    const observacao = await criarObservacao({ clubeId: clube.id, classeId: classe.id, autorId: autor.usuario.id, texto: 'Precisa de reforco', dbvId: dbv.id })
    return { clube, classe, autor, colega, adm, dbv, observacao }
  }

  const lista = async (acesso: Acesso, classeId: string): Promise<Saida[]> =>
    corpo<Saida[]>(await api.get(`/api/observacoes?classeId=${classeId}`, acesso.autorizacao).expect(200))

  it('autor cria e edita a propria; podeEditar e podeApagar so dele', async () => {
    const { classe, autor, dbv } = await cenario()
    const criada = corpo<Saida>(
      await api
        .post('/api/observacoes', autor.autorizacao, { classeId: classe.id, alvo: 'DBV', registroAulaId: null, dbvId: dbv.id, titulo: 'Titulo', texto: 'Texto novo' })
        .expect(201),
    )
    expect(criada).toMatchObject({ alvo: 'DBV', titulo: 'Titulo', texto: 'Texto novo', podeEditar: true, podeApagar: true, editadaEm: null })
    const editada = corpo<Saida>(await api.patch(`/api/observacoes/${criada.id}`, autor.autorizacao, { texto: 'Texto editado' }).expect(200))
    expect(editada.texto).toBe('Texto editado')
    expect(editada.editadaEm).not.toBeNull()
  })

  it('outro instrutor da classe nao ve sem observacao.ver_outros (lista vazia, edicao 404) e ve com ela, sem editar nem apagar', async () => {
    const { classe, autor, colega, observacao } = await cenario()
    expect(await lista(autor, classe.id)).toHaveLength(1)
    expect(await lista(colega, classe.id)).toEqual([])
    await api.patch(`/api/observacoes/${observacao.id}`, colega.autorizacao, { texto: 'x' }).expect(404)
    await apagar(`/api/observacoes/${observacao.id}`, colega.autorizacao).expect(404)

    await ajustarPermissao(colega.vinculo.id, 'observacao.ver_outros', true)
    const vistas = await lista(colega, classe.id)
    expect(vistas.map((o) => o.id)).toEqual([observacao.id])
    expect(vistas[0]).toMatchObject({ podeEditar: false, podeApagar: false })
    await api.patch(`/api/observacoes/${observacao.id}`, colega.autorizacao, { texto: 'x' }).expect(403)
    await apagar(`/api/observacoes/${observacao.id}`, colega.autorizacao).expect(403)
  })

  it('Adm ve todas e apaga, mas nao edita nem escreve; apagar zera o conteudo e a some da lista', async () => {
    const { classe, adm, observacao, clube } = await cenario()
    const vistas = await lista(adm, classe.id)
    expect(vistas[0]).toMatchObject({ id: observacao.id, podeEditar: false, podeApagar: true })
    await api.patch(`/api/observacoes/${observacao.id}`, adm.autorizacao, { texto: 'x' }).expect(403)
    await api
      .post('/api/observacoes', adm.autorizacao, { classeId: classe.id, alvo: 'DBV', registroAulaId: null, dbvId: observacao.dbvId, titulo: null, texto: 'x' })
      .expect(403)

    await apagar(`/api/observacoes/${observacao.id}`, adm.autorizacao).expect(204)
    const linha = await prismaDeTeste().observacao.findUniqueOrThrow({ where: { id: observacao.id } })
    expect(linha).toMatchObject({ titulo: null, texto: '', clubeId: clube.id })
    expect(linha.removidaEm).not.toBeNull()
    expect(await lista(adm, classe.id)).toEqual([])
    await apagar(`/api/observacoes/${observacao.id}`, adm.autorizacao).expect(404)
  })

  it('autor apaga a propria', async () => {
    const { autor, observacao } = await cenario()
    await apagar(`/api/observacoes/${observacao.id}`, autor.autorizacao).expect(204)
  })

  it('filtra por alvo e por desbravador', async () => {
    const { clube, classe, autor, dbv } = await cenario()
    const registro = await prismaDeTeste().registroAula.create({
      data: { clubeId: clube.id, classeId: classe.id, data: new Date('2026-03-07T00:00:00Z'), registradoPorId: autor.usuario.id, atualizadoEm: new Date() },
    })
    await criarObservacao({ clubeId: clube.id, classeId: classe.id, autorId: autor.usuario.id, texto: 'Da aula', registroAulaId: registro.id })
    const daAula = corpo<Saida[]>(await api.get(`/api/observacoes?classeId=${classe.id}&alvo=AULA`, autor.autorizacao).expect(200))
    expect(daAula).toHaveLength(1)
    expect(daAula[0]?.aula).toEqual({ id: registro.id, data: '2026-03-07' })
    const doDbv = corpo<Saida[]>(await api.get(`/api/observacoes?classeId=${classe.id}&dbvId=${dbv.id}`, autor.autorizacao).expect(200))
    expect(doDbv.map((o) => o.alvo)).toEqual(['DBV'])
  })

  it('classe de fora do vinculo, aula ou desbravador de outra classe e outro clube respondem 404; conselheiro 403', async () => {
    const { clube, classe, autor, dbv, observacao } = await cenario()
    const outraClasse = await criarClasseDoClube(clube.id, 'Outra classe')
    await api.get(`/api/observacoes?classeId=${outraClasse.id}`, autor.autorizacao).expect(404)

    const registroOutra = await criarRegistroAula({ clubeId: clube.id, classeId: outraClasse.id, data: '2026-03-14' })
    await api
      .post('/api/observacoes', autor.autorizacao, { classeId: classe.id, alvo: 'AULA', registroAulaId: registroOutra.id, dbvId: null, titulo: null, texto: 'x' })
      .expect(404)
    const dbvSemMatricula = await criarDbv({ clubeId: clube.id })
    await api
      .post('/api/observacoes', autor.autorizacao, { classeId: classe.id, alvo: 'DBV', registroAulaId: null, dbvId: dbvSemMatricula.id, titulo: null, texto: 'x' })
      .expect(404)
    await api
      .post('/api/observacoes', autor.autorizacao, { classeId: classe.id, alvo: 'AULA', registroAulaId: null, dbvId: dbv.id, titulo: null, texto: 'x' })
      .expect(400)

    const outroClube = await criarClube()
    const admDeFora = await criarAcesso({ clubeId: outroClube.id, papel: 'ADM' })
    await apagar(`/api/observacoes/${observacao.id}`, admDeFora.autorizacao).expect(404)

    const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO' })
    await api.get(`/api/observacoes?classeId=${classe.id}`, conselheiro.autorizacao).expect(403)
  })

  describe('o texto nao vaza para outras rotas', () => {
    it('nenhuma resposta de desbravadores, perfil, progresso, ranking, pacote, unidades e inicio traz o texto', async () => {
      const { clube, classe, dbv, colega } = await cenario()
      const segredo = `SEGREDO-${Date.now()}-do-instrutor`
      await criarObservacao({ clubeId: clube.id, classeId: classe.id, autorId: colega.usuario.id, texto: segredo, titulo: segredo, dbvId: dbv.id })
      const unidade = await criarUnidade({ clubeId: clube.id })
      await criarMembro({ dbvId: dbv.id, unidadeId: unidade.id, inicio: '2026-02-01' })
      const conselheiro = await criarAcesso({ clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [unidade.id] })
      const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
      await ajustarPermissao(colega.vinculo.id, 'observacao.ver_outros', true)

      const rotas = [
        '/api/desbravadores',
        `/api/desbravadores/${dbv.id}`,
        `/api/desbravadores/${dbv.id}/perfil`,
        `/api/desbravadores/${dbv.id}/progresso`,
        '/api/ranking',
        '/api/ranking/unidades',
        '/api/sync/pacote',
        '/api/unidades',
        `/api/unidades/${unidade.id}/membros`,
        `/api/unidades/${unidade.id}/frequencia`,
        '/api/unidades/sem-membros',
        '/api/inicio/conselheiro',
        '/api/inicio/instrutor',
      ]
      const vazamentos: string[] = []
      for (const acesso of [adm, conselheiro, colega]) {
        for (const rota of rotas) {
          const resposta = await api.get(rota, acesso.autorizacao)
          if (JSON.stringify(resposta.body).includes(segredo) || resposta.text.includes(segredo)) vazamentos.push(`${acesso.vinculo.papel} ${rota}`)
        }
      }
      expect(vazamentos).toEqual([])
    })
  })
})
