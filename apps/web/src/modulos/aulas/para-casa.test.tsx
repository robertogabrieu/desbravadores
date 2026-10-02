import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ParaCasa } from './ParaCasa'
import { chaveItem } from './estado'
import type { Requisito } from './estado'

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const R1 = uuid(11)
const R2 = uuid(12)
const R3 = uuid(13)
const NOS = uuid(21)
const CESTAS = uuid(22)
const HISTORIAS = uuid(23)

const requisitos: Requisito[] = [
  { id: R1, codigo: 'II.1', texto: 'Ler os capítulos 1 a 3 de Gênesis', campo: false, secaoCodigo: 'II' },
  { id: R2, codigo: 'III.2', texto: 'Decorar o lema da classe', campo: false, secaoCodigo: 'III' },
  { id: R3, codigo: 'IV.1', texto: 'Visitar um vizinho', campo: false, secaoCodigo: 'IV' },
]
const catalogo = [
  { id: NOS, nome: 'Nós e Amarras', area: 'Artes e habilidades manuais' },
  { id: CESTAS, nome: 'Arte de Fazer Cestas', area: 'Artes e habilidades manuais' },
  { id: HISTORIAS, nome: 'Arte de Contar Histórias', area: 'Atividades missionárias e comunitárias' },
]

function montar(parcial: Partial<Parameters<typeof ParaCasa>[0]> = {}) {
  const acoes = { aoPassarRequisito: vi.fn(), aoPassarEspecialidade: vi.fn(), aoTirar: vi.fn(), aoPassarOQueFaltou: vi.fn() }
  render(
    <ParaCasa itens={[]} requisitos={requisitos} catalogo={catalogo} indisponiveis={new Set()} podeEspecialidade haOQueFaltou {...acoes} {...parcial} />,
  )
  return acoes
}

const abrirBusca = () => userEvent.click(screen.getByRole('button', { name: '+ Especialidade' }))

describe('Para casa', () => {
  it('sem itens: "Nada para casa." e os botões que ensinam o resto', () => {
    montar()
    expect(screen.getByRole('heading', { name: 'Para casa' })).toBeInTheDocument()
    expect(screen.getByText('Nada para casa.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Passar o que faltou' })).toBeEnabled()
    expect(screen.getByLabelText('+ Requisito')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Especialidade' })).toBeInTheDocument()
  })

  it('item passado: código e texto do requisito, nome da especialidade, e "Tirar" em cada um', async () => {
    const { aoTirar } = montar({ itens: [{ requisitoId: R1 }, { especialidadeId: NOS }] })
    const lista = within(screen.getByRole('list', { name: 'Itens para casa' }))
    expect(lista.getByText('II.1 · Ler os capítulos 1 a 3 de Gênesis')).toBeInTheDocument()
    expect(lista.getByText('Nós e Amarras')).toBeInTheDocument()
    expect(screen.queryByText('Nada para casa.')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Tirar II.1' }))
    expect(aoTirar).toHaveBeenCalledWith({ requisitoId: R1 })
    await userEvent.click(screen.getByRole('button', { name: 'Tirar Nós e Amarras' }))
    expect(aoTirar).toHaveBeenCalledWith({ especialidadeId: NOS })
  })

  it('"Passar o que faltou" chama o atalho e fica desabilitado quando não falta nada', async () => {
    const { aoPassarOQueFaltou } = montar()
    await userEvent.click(screen.getByRole('button', { name: 'Passar o que faltou' }))
    expect(aoPassarOQueFaltou).toHaveBeenCalledOnce()
  })

  it('nada faltando: "Passar o que faltou" desabilitado', () => {
    montar({ haOQueFaltou: false })
    expect(screen.getByRole('button', { name: 'Passar o que faltou' })).toBeDisabled()
  })

  it('"+ Requisito" lista só os que não estão em tarefa aberta nem já foram passados', async () => {
    const { aoPassarRequisito } = montar({ indisponiveis: new Set([chaveItem({ requisitoId: R1 }), chaveItem({ requisitoId: R3 })]) })
    const selecao = screen.getByLabelText('+ Requisito')
    expect(within(selecao).getAllByRole('option').map((o) => o.textContent)).toEqual(['Escolha um requisito', 'III.2 · Decorar o lema da classe'])
    await userEvent.selectOptions(selecao, R2)
    expect(aoPassarRequisito).toHaveBeenCalledWith(R2)
  })

  it('sem requisito disponível, o "+ Requisito" some', () => {
    montar({ indisponiveis: new Set(requisitos.map((r) => chaveItem({ requisitoId: r.id }))) })
    expect(screen.queryByLabelText('+ Requisito')).not.toBeInTheDocument()
  })

  describe('busca de especialidade', () => {
    it('busca vazia: pede parte do nome; digitando, lista nome, área e "Passar"', async () => {
      montar()
      await abrirBusca()
      expect(screen.queryByRole('button', { name: '+ Especialidade' })).not.toBeInTheDocument()
      expect(screen.getByText('Digite parte do nome da especialidade')).toBeInTheDocument()
      await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar especialidade' }), 'art')
      const resultados = within(screen.getByRole('list', { name: 'Especialidades encontradas' }))
      expect(resultados.getAllByRole('listitem')).toHaveLength(2)
      const cestas = resultados.getByRole('button', { name: /Arte de Fazer Cestas/ })
      expect(cestas).toHaveTextContent('Artes e habilidades manuais')
      expect(cestas).toHaveTextContent('Passar')
      expect(screen.queryByText('Digite parte do nome da especialidade')).not.toBeInTheDocument()
    })

    it('ignora acento e caixa; escolher passa a especialidade e fecha a busca', async () => {
      const { aoPassarEspecialidade } = montar()
      await abrirBusca()
      await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar especialidade' }), 'NOS')
      await userEvent.click(screen.getByRole('button', { name: /Nós e Amarras/ }))
      expect(aoPassarEspecialidade).toHaveBeenCalledWith(NOS)
      expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: '+ Especialidade' })).toBeInTheDocument()
    })

    it('nada encontrado: "Nenhuma especialidade com esse nome"; "Fechar busca" volta ao botão', async () => {
      montar()
      await abrirBusca()
      await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar especialidade' }), 'xadrez')
      expect(screen.getByText('Nenhuma especialidade com esse nome')).toBeInTheDocument()
      await userEvent.click(screen.getByRole('button', { name: 'Fechar busca' }))
      expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: '+ Especialidade' })).toBeInTheDocument()
    })

    it('não oferece a especialidade que já está em tarefa aberta ou já foi passada', async () => {
      montar({ indisponiveis: new Set([chaveItem({ especialidadeId: CESTAS })]) })
      await abrirBusca()
      await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar especialidade' }), 'arte')
      const resultados = within(screen.getByRole('list', { name: 'Especialidades encontradas' }))
      expect(resultados.getAllByRole('listitem')).toHaveLength(1)
      expect(resultados.queryByText('Arte de Fazer Cestas')).not.toBeInTheDocument()
    })
  })

  it('pacote antigo, sem catálogo: o botão some e a tela pede internet uma vez', () => {
    montar({ catalogo: null })
    expect(screen.queryByRole('button', { name: '+ Especialidade' })).not.toBeInTheDocument()
    expect(screen.getByText('Para passar especialidade, abra o app com internet uma vez')).toBeInTheDocument()
  })

  it('sem permissão de marcar, nada de especialidade: sem busca, sem aviso e sem "Tirar" nelas', () => {
    montar({ podeEspecialidade: false, catalogo: null, itens: [{ requisitoId: R1 }, { especialidadeId: NOS }] })
    expect(screen.queryByRole('button', { name: '+ Especialidade' })).not.toBeInTheDocument()
    expect(screen.queryByText('Para passar especialidade, abra o app com internet uma vez')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tirar II.1' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Tirar Nós/ })).not.toBeInTheDocument()
  })
})
