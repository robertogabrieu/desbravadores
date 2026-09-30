import type { ReuniaoEnvio } from '@desbravadores/shared'
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import { obterTipo } from '../../../offline/registro'
import type { ContextoAposEnvio, ItemFila } from '../../../offline'
import { aoEnviar, fundir } from '../../../offline/tipos/reuniao'
import type { PayloadReuniaoFila } from '../../../offline/tipos/reuniao'

const avisos = vi.hoisted(() => ({ warning: vi.fn<(texto: string) => void>(), success: vi.fn() }))
vi.mock('sonner', () => ({ toast: avisos }))

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
type Corpo = z.infer<typeof ReuniaoEnvio>

const linha = (n: number, situacao: 'PRESENTE' | 'FALTA', versaoVista: string | null = null) =>
  ({ dbvId: uuid(n), situacao, uniforme: false, biblia: false, licao: false, versaoVista }) as const

function payload(parcial: Partial<Corpo> = {}, extras: Partial<PayloadReuniaoFila> = {}): PayloadReuniaoFila {
  return {
    reuniaoId: uuid(700),
    correcao: false,
    unidadeNome: 'Águias',
    pontosProvisorios: 30,
    corpo: {
      versaoPayload: 1,
      envioId: uuid(800),
      unidadeId: uuid(201),
      data: '2030-03-10',
      feitaNoAparelhoEm: '2030-03-10T12:00:00.000Z',
      cabecalho: { horario: '09:00', local: null, observacoes: null, versaoVista: null },
      linhas: [linha(1, 'PRESENTE'), linha(2, 'FALTA'), linha(3, 'PRESENTE')],
      ...parcial,
    },
    ...extras,
  }
}

describe('tipo REUNIAO da fila', () => {
  const tipo = obterTipo('REUNIAO')

  it('registra o tipo, com rótulo e detalhe de chamada nova e de correção', () => {
    expect(tipo).toBeDefined()
    const nova = payload()
    expect(tipo?.rotulo(nova)).toBe('Chamada · Águias · 10/03')
    expect(tipo?.detalhe(nova)).toBe('3 DBVs · 30 pts (provisório)')
    expect(tipo?.rotulo(payload({}, { correcao: true }))).toBe('Correção na chamada · Águias · 10/03')
  })

  it('correção sobre chamada nova ainda na fila mantém todos os membros e o horário', () => {
    const correcao = payload(
      { envioId: uuid(801), cabecalho: null, linhas: [linha(2, 'PRESENTE')] },
      { reuniaoId: uuid(999), correcao: true, pontosProvisorios: 40 },
    )
    const fundido = fundir(payload({ cabecalho: { horario: '08:30', local: null, observacoes: null, versaoVista: null } }), correcao)
    expect(fundido.corpo.linhas.map((l) => [l.dbvId, l.situacao])).toEqual([
      [uuid(1), 'PRESENTE'],
      [uuid(2), 'PRESENTE'],
      [uuid(3), 'PRESENTE'],
    ])
    expect(fundido.corpo.cabecalho?.horario).toBe('08:30')
    expect(fundido.corpo.envioId).toBe(uuid(801))
    expect(fundido.reuniaoId).toBe(uuid(700))
    expect(fundido.correcao).toBe(false)
    expect(fundido.pontosProvisorios).toBe(40)
  })

  it('cabeçalho novo vence o anterior', () => {
    const novo = payload({ cabecalho: { horario: '10:00', local: 'Sala 2', observacoes: null, versaoVista: null } })
    expect(fundir(payload(), novo).corpo.cabecalho?.horario).toBe('10:00')
  })

  it('envia com PUT em /api/sync/reunioes/:reuniaoId levando só o corpo', async () => {
    const requisitar = vi.fn(() => Promise.resolve({}))
    const item = { payload: payload() } as ItemFila<PayloadReuniaoFila>
    await tipo?.enviar(item as ItemFila, { requisitar, enviarArquivo: vi.fn(), queryClient: new QueryClient() })
    expect(requisitar).toHaveBeenCalledWith(`/api/sync/reunioes/${uuid(700)}`, { metodo: 'PUT', corpo: item.payload.corpo })
  })
})

describe('aoEnviar', () => {
  const saida = {
    reuniaoId: uuid(700),
    pontos: [],
    totalPontos: 0,
    linhas: [{ dbvId: uuid(1), versao: '2030-03-10T13:00:00.000Z' }],
    cabecalhoVersao: '2030-03-10T13:00:00.000Z',
    conflitoCabecalho: false,
    conflitos: [],
    ignorados: [],
  }

  function contexto(seguintes: ItemFila<PayloadReuniaoFila>[]) {
    const queryClient = new QueryClient()
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries')
    const atualizarPayload = vi.fn(() => Promise.resolve())
    const baixarPacote = vi.fn(() => Promise.resolve())
    const ctx: ContextoAposEnvio<PayloadReuniaoFila> = {
      item: seguintes[0] ?? ({} as ItemFila<PayloadReuniaoFila>),
      queryClient,
      seguintesDaChave: () => Promise.resolve(seguintes),
      atualizarPayload,
      baixarPacote,
    }
    return { ctx, invalidar, atualizarPayload, baixarPacote }
  }

  it('atualiza a versaoVista dos itens seguintes, invalida as raízes e baixa o pacote', async () => {
    const seguinte = {
      id: 'item-2',
      payload: payload({
        cabecalho: { horario: '09:00', local: null, observacoes: null, versaoVista: null },
        linhas: [linha(1, 'FALTA', null), linha(2, 'FALTA', 'antiga')],
      }),
    } as ItemFila<PayloadReuniaoFila>
    const { ctx, invalidar, atualizarPayload, baixarPacote } = contexto([seguinte])
    await aoEnviar(saida, ctx)

    const [id, novo] = atualizarPayload.mock.calls[0] as unknown as [string, PayloadReuniaoFila]
    expect(id).toBe('item-2')
    expect(novo.corpo.linhas.map((l) => l.versaoVista)).toEqual(['2030-03-10T13:00:00.000Z', 'antiga'])
    expect(novo.corpo.cabecalho?.versaoVista).toBe('2030-03-10T13:00:00.000Z')
    expect(invalidar.mock.calls.map(([filtro]) => filtro?.queryKey?.[0])).toEqual(['reunioes', 'reuniao', 'grade', 'inicio', 'ranking'])
    expect(baixarPacote).toHaveBeenCalledOnce()
  })

  it('avisa conflito de cabeçalho, linhas alteradas por outra pessoa e ignorados', async () => {
    avisos.warning.mockClear()
    const { ctx } = contexto([])
    await aoEnviar(
      {
        ...saida,
        conflitoCabecalho: true,
        conflitos: [{ dbvId: uuid(1), nome: 'Ana' }, { dbvId: uuid(2), nome: 'Bia' }],
        ignorados: [{ dbvId: uuid(3), nome: 'Caio' }],
      },
      ctx,
    )
    expect(avisos.warning.mock.calls.map(([texto]) => texto)).toEqual([
      'O horário ou as observações tinham sido mudados por outra pessoa; a sua versão valeu.',
      '2 linhas tinham sido alteradas por outra pessoa; a sua versão valeu e a anterior ficou registrada: Ana, Bia.',
      'Caio não eram da unidade nessa data e ficaram fora.',
    ])
  })

  it('sem nada a avisar, não avisa', async () => {
    avisos.warning.mockClear()
    await aoEnviar(saida, contexto([]).ctx)
    expect(avisos.warning).not.toHaveBeenCalled()
  })
})
