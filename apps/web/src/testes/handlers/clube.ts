import { HttpResponse, http } from 'msw'
import type { ConfiguracaoClube } from '../../api/clube'

export function criarConfiguracao(parcial: Partial<ConfiguracaoClube> = {}): ConfiguracaoClube {
  return {
    diaReuniao: 6,
    horaReuniao: '15:00',
    localReuniaoPadrao: 'Salão da igreja',
    limiarFrequenciaAlerta: 60,
    limiarProgressoAlerta: 40,
    metaFrequencia: 80,
    fuso: 'America/Sao_Paulo',
    inicioAnoClube: '02-01',
    ...parcial,
  }
}

export const handlerConfiguracao = (configuracao: ConfiguracaoClube = criarConfiguracao()) =>
  http.get('/api/clube/configuracao', () => HttpResponse.json(configuracao))

export const handlerErroConfiguracao = (status = 500) =>
  http.get('/api/clube/configuracao', () => HttpResponse.json({ codigo: 'ERRO_INTERNO', mensagem: 'Falha ao ler as configurações' }, { status }))

export const handlerSalvarConfiguracao = (atual: ConfiguracaoClube = criarConfiguracao(), aoReceber?: (corpo: unknown) => void) =>
  http.patch('/api/clube/configuracao', async ({ request }) => {
    const corpo = await request.json()
    aoReceber?.(corpo)
    return HttpResponse.json({ ...atual, ...(corpo as object) })
  })

export const handlerErroSalvarConfiguracao = (status: number, erro: { codigo: string; mensagem: string }) =>
  http.patch('/api/clube/configuracao', () => HttpResponse.json(erro, { status }))
