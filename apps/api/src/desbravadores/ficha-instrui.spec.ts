import type { INestApplication } from '@nestjs/common'
import type { DesbravadorSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import {
  classeOficial,
  criarAcesso,
  criarClube,
  criarDbv,
  criarUnidade,
  criarUsuario,
  criarVinculo,
  desconectarPrismaDeTeste,
} from '../../test/fabricas'
import { clienteHttp, corpo } from '../../test/p6'

type Saida = z.infer<typeof DesbravadorSaida>

describe('ficha do desbravador: o que a conta ligada instrui e aconselha', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  it('traz as classes que instrui e as unidades que aconselha, só dos vínculos ativos deste clube', async () => {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const aguias = await criarUnidade({ clubeId: clube.id, nome: 'Águias' })
    const amigo = await classeOficial('Amigo')
    const companheiro = await classeOficial('Companheiro')
    const pesquisador = await classeOficial('Pesquisador')

    const usuario = await criarUsuario()
    await criarVinculo({ usuarioId: usuario.id, clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [companheiro.id, amigo.id] })
    await criarVinculo({ usuarioId: usuario.id, clubeId: clube.id, papel: 'CONSELHEIRO', unidadeIds: [aguias.id] })
    const outro = await criarClube()
    await criarVinculo({ usuarioId: usuario.id, clubeId: outro.id, papel: 'INSTRUTOR', classeIds: [pesquisador.id] })
    const dbv = await criarDbv({ clubeId: clube.id, nome: 'Rui Duplo', usuarioId: usuario.id })

    const ficha = corpo<Saida>(await api.get(`/api/desbravadores/${dbv.id}`, adm.autorizacao).expect(200))
    expect(ficha.instrui.map((classe) => classe.nome)).toEqual(['Amigo', 'Companheiro'])
    expect(ficha.aconselha).toEqual([{ id: aguias.id, nome: 'Águias' }])
  })

  it('sem conta ligada, ou com o vínculo inativo, as duas listas vêm vazias', async () => {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const lobos = await criarUnidade({ clubeId: clube.id, nome: 'Lobos' })
    const semConta = await criarDbv({ clubeId: clube.id, nome: 'Sem Conta' })
    const usuario = await criarUsuario()
    await criarVinculo({ usuarioId: usuario.id, clubeId: clube.id, papel: 'CONSELHEIRO', ativo: false, unidadeIds: [lobos.id] })
    const inativo = await criarDbv({ clubeId: clube.id, nome: 'Ex Conselheiro', usuarioId: usuario.id })

    for (const dbv of [semConta, inativo]) {
      const ficha = corpo<Saida>(await api.get(`/api/desbravadores/${dbv.id}`, adm.autorizacao).expect(200))
      expect(ficha.instrui).toEqual([])
      expect(ficha.aconselha).toEqual([])
    }
  })
})
