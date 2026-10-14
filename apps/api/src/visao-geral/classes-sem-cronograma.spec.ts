import type { INestApplication } from '@nestjs/common'
import type { VisaoGeralSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import { congelarRelogio, descongelarRelogio } from '../../test/relogio'
import {
  admDefinirClasseClube,
  avancadaOficial,
  classeOficial,
  criarAcesso,
  criarClube,
  criarCronograma,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { clienteHttp, corpo, criarClasseDoClube } from '../../test/p6'

type Visao = z.infer<typeof VisaoGeralSaida>

describe('visao geral: classes sem cronograma', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  // Hoje = 15/06/2026: ano do clube 2026.
  beforeEach(() => congelarRelogio('2026-06-15T15:00:00Z'))
  afterEach(() => descongelarRelogio())

  async function semCronogramaDe(clubeId: string): Promise<Visao['classesSemCronograma']> {
    const adm = await criarAcesso({ clubeId, papel: 'ADM' })
    return corpo<Visao>(await api.get('/api/visao-geral', adm.autorizacao).expect(200)).classesSemCronograma
  }
  const ids = (linhas: Visao['classesSemCronograma']): string[] => linhas.map((linha) => linha.classe.id)

  it('classe com cronograma em rascunho ou enviado conta como tendo; sem nenhum aparece', async () => {
    const clube = await criarClube()
    const amigo = await classeOficial('Amigo')
    const companheiro = await classeOficial('Companheiro')
    const pesquisador = await classeOficial('Pesquisador')
    await criarCronograma({ clubeId: clube.id, classeId: amigo.id, status: 'RASCUNHO' })
    await criarCronograma({ clubeId: clube.id, classeId: companheiro.id, status: 'ENVIADO' })

    const lista = ids(await semCronogramaDe(clube.id))
    expect(lista).toContain(pesquisador.id)
    expect(lista).not.toContain(amigo.id)
    expect(lista).not.toContain(companheiro.id)
  })

  it('cronograma de outro ano do clube nao conta', async () => {
    const clube = await criarClube()
    const amigo = await classeOficial('Amigo')
    await criarCronograma({ clubeId: clube.id, classeId: amigo.id, anoClube: 2025 })
    expect(ids(await semCronogramaDe(clube.id))).toContain(amigo.id)
  })

  it('sem nenhum cronograma: aparecem as regulares ativas, uma linha por par', async () => {
    const clube = await criarClube()
    const amigo = await classeOficial('Amigo')
    const avancada = await avancadaOficial(amigo.id)
    const linhas = await semCronogramaDe(clube.id)

    expect(ids(linhas)).toContain(amigo.id)
    expect(ids(linhas)).not.toContain(avancada.id)
    expect(linhas.find((linha) => linha.classe.id === amigo.id)?.classe.nome).toBe(`Amigo + ${avancada.nome}`)
    expect(new Set(ids(linhas)).size).toBe(linhas.length)
  })

  it('avancada pareada com cronograma na regular: o par some inteiro', async () => {
    const clube = await criarClube()
    const amigo = await classeOficial('Amigo')
    const avancada = await avancadaOficial(amigo.id)
    await criarCronograma({ clubeId: clube.id, classeId: amigo.id })
    const lista = ids(await semCronogramaDe(clube.id))
    expect(lista).not.toContain(amigo.id)
    expect(lista).not.toContain(avancada.id)
  })

  it('avancada cujo par esta desligado no clube vira linha propria; regular segue com o nome sozinho', async () => {
    const clube = await criarClube()
    const amigo = await classeOficial('Amigo')
    const avancada = await avancadaOficial(amigo.id)
    await admDefinirClasseClube({ clubeId: clube.id, classeId: avancada.id, ativa: false })
    await admDefinirClasseClube({ clubeId: clube.id, classeId: amigo.id, ativa: false })
    const companheiro = await classeOficial('Companheiro')
    const avancadaDoCompanheiro = await avancadaOficial(companheiro.id)
    await admDefinirClasseClube({ clubeId: clube.id, classeId: companheiro.id, ativa: false })

    const linhas = await semCronogramaDe(clube.id)
    expect(ids(linhas)).not.toContain(amigo.id)
    expect(ids(linhas)).not.toContain(avancada.id)
    expect(ids(linhas)).not.toContain(companheiro.id)
    expect(ids(linhas)).toContain(avancadaDoCompanheiro.id)
  })

  it('classe inativa no clube ou inativa no catalogo e ignorada', async () => {
    const clube = await criarClube()
    const pesquisador = await classeOficial('Pesquisador')
    await admDefinirClasseClube({ clubeId: clube.id, classeId: pesquisador.id, ativa: false })
    const propria = await criarClasseDoClube(clube.id, 'Classe propria')
    expect(ids(await semCronogramaDe(clube.id))).toContain(propria.id)
    expect(ids(await semCronogramaDe(clube.id))).not.toContain(pesquisador.id)

    const retirada = await criarClasseDoClube(clube.id, 'Retirada do catalogo')
    await prismaDeTeste().classe.update({ where: { id: retirada.id }, data: { ativa: false } })
    expect(ids(await semCronogramaDe(clube.id))).not.toContain(retirada.id)
  })

  it('nao enxerga classe propria de outro clube, nem cronograma dele conta', async () => {
    const clube = await criarClube()
    const outro = await criarClube()
    const doOutro = await criarClasseDoClube(outro.id, 'So do outro')
    const amigo = await classeOficial('Amigo')
    await criarCronograma({ clubeId: outro.id, classeId: amigo.id })
    const lista = ids(await semCronogramaDe(clube.id))
    expect(lista).not.toContain(doOutro.id)
    expect(lista).toContain(amigo.id)
    expect(ids(await semCronogramaDe(outro.id))).toContain(doOutro.id)
  })
})
