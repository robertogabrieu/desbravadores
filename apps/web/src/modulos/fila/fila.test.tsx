import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EstadoFila, ItemFilaNaTela, ModoConexao } from '../../offline'
import { PaginaFila } from './PaginaFila'

const estado = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao, fila: {} as EstadoFila }))

vi.mock('../../offline', () => ({
  useConexao: () => ({ modo: estado.modo }),
  useFila: () => estado.fila,
}))

function item(parcial: Partial<ItemFilaNaTela> & { id: string }): ItemFilaNaTela {
  return {
    versaoPayload: 1,
    usuarioId: 'u1',
    vinculoId: 'v1',
    tipo: 'REUNIAO',
    chave: `chave-${parcial.id}`,
    rotulo: `Item ${parcial.id}`,
    detalhe: `Detalhe ${parcial.id}`,
    payload: {},
    estado: 'NA_FILA',
    progresso: 0,
    tentativas: 0,
    proximaTentativaEm: null,
    criadoEm: 1,
    atualizadoEm: 1,
    esperandoDependencia: false,
    ...parcial,
  }
}

const tentarAgora = vi.fn()
const tentarDeNovo = vi.fn(() => Promise.resolve())
const descartar = vi.fn(() => Promise.resolve())
const dependentes = vi.fn((): ItemFilaNaTela[] => [])

function montar(itens: ItemFilaNaTela[], avisos: Partial<EstadoFila['avisos']> = {}) {
  const erros = itens.filter((i) => i.estado === 'ERRO').length
  const pendentes = itens.filter((i) => i.estado === 'NA_FILA' || i.estado === 'ENVIANDO').length
  estado.fila = {
    itens,
    contagem: { pendentes, erros },
    avisos: { pausadaPorSessao: false, poucoEspaco: false, descartadosDeOutraPessoa: 0, instalarNaTelaInicial: false, ...avisos },
    tentarAgora,
    tentarDeNovo,
    dependentes,
    descartar,
  }
  return render(
    <MemoryRouter>
      <PaginaFila />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  estado.modo = 'ONLINE'
  vi.clearAllMocks()
  dependentes.mockReturnValue([])
})

describe('PaginaFila', () => {
  it('vazia: mostra "Tudo enviado" e uma ação real de volta ao início', () => {
    montar([])
    expect(screen.getByText('Tudo enviado')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/inicio')
    expect(screen.queryByRole('button', { name: 'Tentar enviar agora' })).not.toBeInTheDocument()
  })

  it('lista rótulo, detalhe e estado, e lembra de manter o app aberto', () => {
    montar([item({ id: 'a' }), item({ id: 'b', estado: 'ENVIANDO', progresso: 60 })])

    expect(screen.getByText('Item a')).toBeInTheDocument()
    expect(screen.getByText('Detalhe a')).toBeInTheDocument()
    expect(screen.getByText('na fila')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '60')
    expect(screen.getByText('Mantenha o app aberto até terminar — com ele fechado, nada é enviado.')).toBeInTheDocument()
  })

  it('sem conexão: status geral avisa e "Tentar enviar agora" chama o motor', async () => {
    estado.modo = 'SEM_CONEXAO'
    montar([item({ id: 'a' }), item({ id: 'b' })])

    expect(screen.getByRole('status')).toHaveTextContent('Sem conexão')
    expect(screen.getByRole('status')).toHaveTextContent('2 itens aguardando envio')
    await userEvent.click(screen.getByRole('button', { name: 'Tentar enviar agora' }))
    expect(tentarAgora).toHaveBeenCalledTimes(1)
  })

  it('com erro: status conta os problemas', () => {
    montar([item({ id: 'a', estado: 'ERRO', erro: { codigo: 'X', mensagem: 'Arquivo muito grande' } })])
    expect(screen.getByRole('status')).toHaveTextContent('1 item com problema')
    expect(screen.getByText('Arquivo muito grande')).toBeInTheDocument()
  })

  it('item em erro: "Tentar de novo" chama o motor com o id', async () => {
    montar([item({ id: 'a', estado: 'ERRO' })])
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(tentarDeNovo).toHaveBeenCalledWith('a')
  })

  it('só item em erro tem as ações', () => {
    montar([item({ id: 'a' })])
    expect(screen.queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Descartar' })).not.toBeInTheDocument()
  })

  it('descartar pede confirmação e só depois apaga', async () => {
    montar([item({ id: 'a', estado: 'ERRO' })])
    await userEvent.click(screen.getByRole('button', { name: 'Descartar' }))

    const painel = screen.getByRole('dialog')
    expect(descartar).not.toHaveBeenCalled()
    await userEvent.click(within(painel).getByRole('button', { name: 'Descartar' }))

    expect(descartar).toHaveBeenCalledWith('a')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('descartar com dependentes: a confirmação lista os dependentes', async () => {
    dependentes.mockReturnValue([item({ id: 'f1', rotulo: '5 fotos · Reunião 27 set', dependeDe: 'a' })])
    montar([item({ id: 'a', estado: 'ERRO' })])
    await userEvent.click(screen.getByRole('button', { name: 'Descartar' }))

    expect(dependentes).toHaveBeenCalledWith('a')
    expect(within(screen.getByRole('dialog')).getByText('5 fotos · Reunião 27 set')).toBeInTheDocument()
  })

  it('cancelar o descarte não apaga nada', async () => {
    montar([item({ id: 'a', estado: 'ERRO' })])
    await userEvent.click(screen.getByRole('button', { name: 'Descartar' }))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancelar' }))

    expect(descartar).not.toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('esperando a dependência: mostra o texto próprio', () => {
    montar([item({ id: 'f1', esperandoDependencia: true, dependeDe: 'a' })])
    expect(screen.getByText('Esperando a chamada ser enviada')).toBeInTheDocument()
  })

  it('sem avisos, nenhum aviso aparece', () => {
    montar([item({ id: 'a' })])
    for (const texto of [/Entre de novo/, /Pouco espaço/, /envios antigos/, /Instale o app/]) {
      expect(screen.queryByText(texto)).not.toBeInTheDocument()
    }
  })

  it('cada aviso aparece com o seu texto', () => {
    montar([item({ id: 'a' })], { pausadaPorSessao: true, poucoEspaco: true, descartadosDeOutraPessoa: 3, instalarNaTelaInicial: true })

    expect(screen.getByText('Entre de novo para enviar')).toBeInTheDocument()
    expect(screen.getByText('Pouco espaço: envie as fotos quando houver internet')).toBeInTheDocument()
    expect(screen.getByText('3 envios antigos de outra pessoa foram descartados deste aparelho')).toBeInTheDocument()
    expect(screen.getByText('Instale o app na tela inicial para não perder chamadas guardadas')).toBeInTheDocument()
  })
})
