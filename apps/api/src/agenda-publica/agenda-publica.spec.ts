import { randomUUID } from 'node:crypto'
import type { Server } from 'node:http'
import type { INestApplication } from '@nestjs/common'
import { AgendaPublicaSaida, hojeNoFuso } from '@desbravadores/shared'
import request from 'supertest'
import { criarAppDeAuth } from '../../test/app-auth'
import { configurarClube, criarClube, criarEvento, desconectarPrismaDeTeste } from '../../test/fabricas'

let app: INestApplication
let proxyAnterior: string | undefined
const servidor = (): Server => app.getHttpServer() as Server
const ip = (): string => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`
const ver = (slug: string, xff = ip()): request.Test => request(servidor()).get(`/api/agenda-publica/${slug}`).set('X-Forwarded-For', xff)

function depoisDeHoje(dias: number): string {
  const d = new Date(`${hojeNoFuso('America/Sao_Paulo', new Date())}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

beforeAll(async () => {
  proxyAnterior = process.env['TRUST_PROXY']
  process.env['TRUST_PROXY'] = '1'
  app = await criarAppDeAuth({ limitar: true })
})

afterAll(async () => {
  await app.close()
  await desconectarPrismaDeTeste()
  if (proxyAnterior === undefined) delete process.env['TRUST_PROXY']
  else process.env['TRUST_PROXY'] = proxyAnterior
})

describe('GET /api/agenda-publica/:slug', () => {
  it('slug inexistente responde 404', async () => {
    await ver(`nao-existe-${randomUUID().slice(0, 8)}`).expect(404)
  })

  it('sem login responde 200, valida no contrato estrito e leva o cabeçalho de cache', async () => {
    const clube = await criarClube()
    await criarEvento({ clubeId: clube.id, tipo: 'EVENTO', inicio: depoisDeHoje(3), uniforme: 'GALA' })
    const resposta = await ver(clube.slug).expect(200)
    expect(resposta.headers['cache-control']).toBe('public, max-age=60')
    const saida = AgendaPublicaSaida.parse(resposta.body)
    expect(saida.clube.nome).toBe(clube.nome)
    expect(JSON.stringify(resposta.body)).not.toContain(clube.id)
  })

  it('isolamento: o clube A não vê o evento do clube B; Classe Bíblica não aparece', async () => {
    const [a, b] = [await criarClube(), await criarClube()]
    const doB = await criarEvento({ clubeId: b.id, tipo: 'EVENTO', inicio: depoisDeHoje(3), uniforme: 'CAMPO' })
    await criarEvento({ clubeId: a.id, tipo: 'CLASSE_BIBLICA', inicio: depoisDeHoje(4) })
    const saidaA = AgendaPublicaSaida.parse((await ver(a.slug).expect(200)).body)
    expect(saidaA.compromissos.map((c) => c.nome)).not.toContain(doB.nome)
    expect(saidaA.compromissos.some((c) => (c.tipo as string) === 'CLASSE_BIBLICA')).toBe(false)
    const saidaB = AgendaPublicaSaida.parse((await ver(b.slug).expect(200)).body)
    expect(saidaB.compromissos.map((c) => c.nome)).toContain(doB.nome)
  })

  it('usa a configuração do clube: horário e local da reunião semanal, com uniforme de campo', async () => {
    const clube = await criarClube()
    await configurarClube({ clubeId: clube.id, horaReuniao: '15:30', localReuniaoPadrao: 'Salão' })
    const saida = AgendaPublicaSaida.parse((await ver(clube.slug).expect(200)).body)
    const semanais = saida.compromissos.filter((c) => c.tipo === 'REUNIAO')
    expect(semanais.length).toBeGreaterThanOrEqual(17)
    expect(semanais[0]).toMatchObject({ horario: '15:30', local: 'Salão', uniforme: 'CAMPO' })
  })

  it('evento antigo sem uniforme devolve null', async () => {
    const clube = await criarClube()
    const semUniforme = await criarEvento({ clubeId: clube.id, tipo: 'ACAMPAMENTO', inicio: depoisDeHoje(5) })
    const saida = AgendaPublicaSaida.parse((await ver(clube.slug).expect(200)).body)
    expect(saida.compromissos.find((c) => c.nome === semUniforme.nome)?.uniforme).toBeNull()
  })

  it('limite próprio: a 121a leitura do mesmo IP em 1 min leva 429; a página abre além do limite do login (20)', async () => {
    const clube = await criarClube()
    const origem = ip()
    for (let i = 0; i < 120; i++) await ver(clube.slug, origem).expect(200)
    expect((await ver(clube.slug, origem).expect(429)).body).toMatchObject({ codigo: 'LIMITE_EXCEDIDO' })
    await ver(clube.slug, ip()).expect(200)
  })
})
