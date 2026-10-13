import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModoConexao } from '../../offline'
import { handlerClasses } from '../../testes/handlers/leitura'
import { CRONOGRAMA_ID, REQ_COLOCADO, REQ_LIVRE, criarMontagemDeExemplo, handlersMontagem } from '../../testes/handlers/montagem'
import { criarVinculo, handlersSessao } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { rotasAdmCronogramas } from './rotas'

const offline = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao }))

vi.mock('../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../offline')>()),
  useConexao: () => ({ modo: offline.modo }),
}))

beforeEach(() => {
  offline.modo = 'ONLINE'
})

function abrir() {
  const { handlers, registro } = handlersMontagem(criarMontagemDeExemplo())
  servidor.use(...handlersSessao([criarVinculo('ADM')]), handlerClasses(), ...handlers)
  renderizarRotas(rotasAdmCronogramas, '/adm/cronogramas')
  return registro
}

const linha = (data: string) => document.querySelector<HTMLElement>(`li[data-data="${data}"]`) as HTMLElement
const cartao = (texto: string) => screen.getByRole('button', { name: new RegExp(texto) }).parentElement as HTMLElement

function dataTransfer() {
  const dados: Record<string, string> = {}
  return { dropEffect: 'copy', effectAllowed: 'all', setData: (tipo: string, valor: string) => (dados[tipo] = valor), getData: (tipo: string) => dados[tipo] ?? '' }
}

describe('A7 · arrastar o requisito até a data (computador)', () => {
  it('soltar numa data que aceita grava o requisito e a data certos', async () => {
    const registro = abrir()
    await screen.findByText(/agendados/)
    const transferencia = dataTransfer()
    fireEvent.dragStart(cartao(REQ_LIVRE.texto), { dataTransfer: transferencia })
    expect(cartao(REQ_LIVRE.texto)).toHaveClass('opacity-50')
    const dragOverAceito = fireEvent.dragOver(linha('2026-10-04'), { dataTransfer: transferencia })
    // fireEvent devolve false quando o handler chamou preventDefault (soltar liberado).
    expect(dragOverAceito).toBe(false)
    expect(transferencia.dropEffect).toBe('move')
    expect(linha('2026-10-04')).toHaveAttribute('data-soltar', 'sobre')
    fireEvent.drop(linha('2026-10-04'), { dataTransfer: transferencia })
    await waitFor(() => expect(registro.chamadas).toHaveLength(1))
    expect(registro.chamadas[0]).toMatchObject({
      metodo: 'PUT',
      caminho: `/api/cronogramas/${CRONOGRAMA_ID}/requisitos/${REQ_LIVRE.id}`,
      corpo: { data: '2026-10-04' },
    })
  })

  it('soltar na data onde o requisito já está, ou numa data recusada, não grava nem realça', async () => {
    const registro = abrir()
    await screen.findByText(/agendados/)
    const transferencia = dataTransfer()
    fireEvent.dragStart(cartao(REQ_COLOCADO.texto), { dataTransfer: transferencia })
    // Data onde o requisito já está: o navegador não pode ser avisado de que o soltar é válido.
    const dragOverNoLugar = fireEvent.dragOver(linha('2026-10-04'), { dataTransfer: transferencia })
    expect(dragOverNoLugar).toBe(true)
    expect(transferencia.dropEffect).toBe('none')
    expect(linha('2026-10-04')).toHaveAttribute('data-estado')
    expect(linha('2026-10-04')).not.toHaveAttribute('data-soltar')
    fireEvent.drop(linha('2026-10-04'), { dataTransfer: transferencia })
    // Data com aula dada (11/01): a regra do botão também a recusa.
    transferencia.dropEffect = 'copy'
    const dragOverRecusada = fireEvent.dragOver(linha('2026-11-01'), { dataTransfer: transferencia })
    expect(dragOverRecusada).toBe(true)
    expect(transferencia.dropEffect).toBe('none')
    expect(linha('2026-11-01')).not.toHaveAttribute('data-soltar')
    const dropRecusado = fireEvent.drop(linha('2026-11-01'), { dataTransfer: transferencia })
    expect(dropRecusado).toBe(true)
    await new Promise((resolver) => setTimeout(resolver, 50))
    expect(registro.chamadas).toHaveLength(0)
  })

  it('terminar o arrasto tira o esmaecido e o botão "Colocar aqui" segue funcionando', async () => {
    const registro = abrir()
    const usuario = userEvent.setup()
    await screen.findByText(/agendados/)
    fireEvent.dragStart(cartao(REQ_LIVRE.texto), { dataTransfer: dataTransfer() })
    fireEvent.dragEnd(cartao(REQ_LIVRE.texto))
    expect(cartao(REQ_LIVRE.texto)).not.toHaveClass('opacity-50')
    expect(linha('2026-10-04')).not.toHaveAttribute('data-soltar')
    await usuario.click(screen.getByRole('button', { name: new RegExp(REQ_LIVRE.texto) }))
    await usuario.click(within(linha('2026-10-04')).getByRole('button', { name: 'Colocar aqui em 04/10' }))
    await waitFor(() => expect(registro.chamadas).toHaveLength(1))
    expect(registro.chamadas[0]).toMatchObject({ metodo: 'PUT', corpo: { data: '2026-10-04' } })
  })
})
