import { QueryClient } from '@tanstack/react-query'
import { waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpResponse, http } from 'msw'
import { servidor } from '../../testes/servidor'
import { criarPacote } from '../../testes/handlers/offline'
import { uuid } from '../../testes/handlers/sessao'
import { criarEnvioCBSaida, handlerChamadaCBRecusada, handlersClasseBiblica } from '../../testes/handlers/classe-biblica'
import { banco } from '../banco'
import { definirConexao } from '../conexao'
import { enfileirar, registrarTipo } from '../index'
import type { ContextoAposEnvio, ContextoEnvio, ItemFila } from '../index'
import { iniciarMotor, pararMotor } from '../motor'
import { obterTipo } from '../registro'
import { aoEnviar, chaveDaChamadaCB, fundir, pendentesDaChamadaCB } from './classe-biblica'
import type { PayloadChamadaCB } from './classe-biblica'

const avisos = vi.hoisted(() => ({ warning: vi.fn<(texto: string) => void>(), success: vi.fn() }))
vi.mock('sonner', () => ({ toast: avisos }))

const ENCONTRO = uuid(5101)
const GRUPO = uuid(5011)
const linha = (n: number, presente: boolean, participou = false, versaoVista: string | null = null) => ({ dbvId: uuid(n), presente, participou, versaoVista })

function payload(linhas = [linha(1, true, true), linha(2, false), linha(3, true)], envioId = uuid(800)): PayloadChamadaCB {
  return { encontroId: ENCONTRO, grupoId: GRUPO, grupoNome: 'Grupo Daniel', data: '2026-10-11', corpo: { envioId, linhas } }
}

describe('tipo CLASSE_BIBLICA da fila', () => {
  const tipo = obterTipo('CLASSE_BIBLICA')

  it('registra o tipo com rótulo e detalhe', () => {
    expect(tipo?.rotulo(payload())).toBe('Chamada da Classe Bíblica · Grupo Daniel · 11/10')
    expect(tipo?.detalhe(payload())).toBe('2 presentes · 1 falta')
    expect(tipo?.detalhe(payload([]))).toBe('Sem ninguém no grupo')
  })

  it('a chave é por encontro e grupo', () => {
    expect(chaveDaChamadaCB(ENCONTRO, GRUPO)).toBe(`classe-biblica:${ENCONTRO}:${GRUPO}`)
  })

  it('envia com PUT para o encontro e o grupo, levando só o corpo', async () => {
    const requisitar = vi.fn<ContextoEnvio['requisitar']>(() => Promise.resolve({}))
    const item = { payload: payload() } as ItemFila<PayloadChamadaCB>
    await tipo?.enviar(item as ItemFila, { requisitar } as unknown as ContextoEnvio)
    expect(requisitar).toHaveBeenCalledWith(`/api/sync/classe-biblica/encontros/${ENCONTRO}/grupos/${GRUPO}`, { metodo: 'PUT', corpo: item.payload.corpo })
  })

  it('fundir: a última ação por desbravador vence, os outros ficam, e o envioId é o novo', () => {
    const fundido = fundir(payload(), payload([linha(2, true, true), linha(1, false)], uuid(801)))
    expect(fundido.corpo.linhas.map((l) => [l.dbvId, l.presente, l.participou])).toEqual([
      [uuid(1), false, false],
      [uuid(2), true, true],
      [uuid(3), true, false],
    ])
    expect(fundido.corpo.envioId).toBe(uuid(801))
  })
})

describe('aoEnviar', () => {
  function contexto(seguintes: ItemFila<PayloadChamadaCB>[] = []) {
    const queryClient = new QueryClient()
    const invalidar = vi.spyOn(queryClient, 'invalidateQueries')
    const atualizarPayload = vi.fn<(id: string, p: PayloadChamadaCB) => Promise<void>>(() => Promise.resolve())
    const baixarPacote = vi.fn(() => Promise.resolve())
    const ctx: ContextoAposEnvio<PayloadChamadaCB> = {
      item: { payload: payload() } as ItemFila<PayloadChamadaCB>,
      queryClient,
      seguintesDaChave: () => Promise.resolve(seguintes),
      atualizarPayload,
      baixarPacote,
    }
    return { ctx, invalidar, atualizarPayload, baixarPacote }
  }

  it('passa as versões gravadas aos itens seguintes, invalida as consultas e baixa o pacote', async () => {
    const seguinte = { id: 'seg', payload: payload([linha(1, false, false, null), linha(4, true, false, 'antiga')]) } as ItemFila<PayloadChamadaCB>
    const { ctx, invalidar, atualizarPayload, baixarPacote } = contexto([seguinte])
    await aoEnviar(criarEnvioCBSaida({ linhas: [{ dbvId: uuid(1), presente: true, participou: true, versao: '2026-10-11T14:31:00.000-03:00' }] }), ctx)
    const [id, novo] = atualizarPayload.mock.calls[0] ?? []
    expect(id).toBe('seg')
    expect(novo?.corpo.linhas.map((l) => l.versaoVista)).toEqual(['2026-10-11T14:31:00.000-03:00', 'antiga'])
    expect(invalidar.mock.calls.map(([filtro]) => filtro?.queryKey?.[0])).toEqual(['classe-biblica', 'inicio', 'ranking', 'progresso'])
    expect(baixarPacote).toHaveBeenCalledOnce()
  })

  it('avisa conflitos e ignorados com os nomes; sem nada, não avisa', async () => {
    avisos.warning.mockClear()
    await aoEnviar(
      criarEnvioCBSaida({ conflitos: [{ dbvId: uuid(1), nome: 'Enzo Barros' }], ignorados: [{ dbvId: uuid(9), nome: 'Leão 1' }, { dbvId: uuid(8), nome: 'Leão 2' }] }),
      contexto().ctx,
    )
    expect(avisos.warning.mock.calls.map(([texto]) => texto)).toEqual([
      'Outra pessoa tinha mudado a chamada de Enzo Barros; a sua versão valeu.',
      'Leão 1, Leão 2 não estavam na lista desta chamada e ficaram fora.',
    ])
    avisos.warning.mockClear()
    await aoEnviar(criarEnvioCBSaida(), contexto().ctx)
    expect(avisos.warning).not.toHaveBeenCalled()
  })
})

// O registro é limpo depois de cada teste; o motor precisa do tipo registrado de novo.
const TIPO_REGISTRADO = obterTipo('CLASSE_BIBLICA')

describe('envio pela fila', () => {
  beforeEach(() => {
    if (TIPO_REGISTRADO) registrarTipo(TIPO_REGISTRADO)
  })
  afterEach(() => pararMotor())

  function iniciar() {
    servidor.use(http.get('/api/sync/pacote', () => HttpResponse.json(criarPacote())))
    definirConexao('ONLINE')
    iniciarMotor({ usuarioId: 'usuario-1', vinculoId: 'vinculo-1', queryClient: new QueryClient() })
  }

  it('a recusa do servidor fica no item como erro, com a mensagem', async () => {
    const mensagem = 'O encontro de 18/10 foi cancelado; a chamada não foi registrada.'
    servidor.use(handlerChamadaCBRecusada(mensagem))
    iniciar()
    const id = await enfileirar({ tipo: 'CLASSE_BIBLICA', chave: chaveDaChamadaCB(ENCONTRO, GRUPO), payload: payload() })
    await waitFor(async () => expect((await banco.fila.get(id))?.estado).toBe('ERRO'))
    expect((await banco.fila.get(id))?.erro).toEqual({ codigo: 'REGRA', mensagem })
  })

  it('aceito, o item fica enviado', async () => {
    const gravados: unknown[] = []
    servidor.use(...handlersClasseBiblica({ aoGravar: (_m, _c, corpo) => gravados.push(corpo) }))
    iniciar()
    const id = await enfileirar({ tipo: 'CLASSE_BIBLICA', chave: chaveDaChamadaCB(ENCONTRO, GRUPO), payload: payload() })
    await waitFor(async () => expect((await banco.fila.get(id))?.estado).toBe('ENVIADO'))
    expect(gravados).toEqual([payload().corpo])
  })
})

describe('pendentesDaChamadaCB', () => {
  const item = (estado: ItemFila['estado'], criadoEm: number, carga: unknown = payload(), tipo = 'CLASSE_BIBLICA') =>
    ({ id: `${estado}-${criadoEm}`, tipo, estado, criadoEm, payload: carga }) as ItemFila

  it('só os não enviados, do tipo, com payload válido, na ordem de criação', () => {
    const lista = pendentesDaChamadaCB([
      item('ERRO', 3),
      item('ENVIADO', 1),
      item('NA_FILA', 2),
      item('ENVIANDO', 4),
      item('NA_FILA', 5, { qualquer: true }),
      item('NA_FILA', 6, payload(), 'REUNIAO'),
    ])
    expect(lista.map((i) => i.id)).toEqual(['NA_FILA-2', 'ERRO-3', 'ENVIANDO-4'])
    expect(lista[0]?.payload.grupoNome).toBe('Grupo Daniel')
  })
})
