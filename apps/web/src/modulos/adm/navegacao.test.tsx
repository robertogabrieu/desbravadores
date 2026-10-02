import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { useAvisosDaFicha, useEstadoDeVolta, useFiltrosNaUrl, useVoltar, useVoltarPara } from './navegacao'

function Sonda() {
  const voltarPara = useVoltarPara('/adm/desbravadores')
  const { avisos, dispensar } = useAvisosDaFicha()
  const deVolta = useEstadoDeVolta('Desbravadores')
  const voltar = useVoltar({ para: '/adm/padrao', rotulo: 'Padrão' })
  const { ler, mudar } = useFiltrosNaUrl()
  const local = useLocation()
  return (
    <>
      <p data-testid="voltar">{voltarPara}</p>
      <p data-testid="de-volta">{deVolta.voltarPara}</p>
      <p data-testid="de-volta-rotulo">{deVolta.voltarRotulo}</p>
      <p data-testid="voltar-destino">{`${voltar.para}|${voltar.rotulo}`}</p>
      <p data-testid="estado">{JSON.stringify(local.state)}</p>
      <p data-testid="busca">{ler('busca')}</p>
      <p data-testid="endereco">{`${local.pathname}${local.search}`}</p>
      <ul>{avisos.map((a) => <li key={a}>{a}</li>)}</ul>
      <button type="button" onClick={dispensar}>Dispensar</button>
      <button type="button" onClick={() => mudar({ busca: 'Bia', pagina: '' })}>Filtrar</button>
    </>
  )
}

const abrir = (estado: unknown, endereco = '/adm/desbravadores/1?pagina=3') =>
  render(
    <MemoryRouter initialEntries={[{ pathname: endereco.split('?')[0], search: `?${endereco.split('?')[1] ?? ''}`, state: estado }]}>
      <Routes>
        <Route path="*" element={<Sonda />} />
      </Routes>
    </MemoryRouter>,
  )

describe('navegação das fichas', () => {
  it('Voltar usa o endereço que a lista deixou; sem ele, o padrão', () => {
    abrir({ voltarPara: '/adm/desbravadores?busca=Ana&pagina=2' })
    expect(screen.getByTestId('voltar')).toHaveTextContent('/adm/desbravadores?busca=Ana&pagina=2')
  })

  it('ignora destino de fora do painel do Adm', () => {
    abrir({ voltarPara: 'https://exemplo.org/adm' })
    expect(screen.getByTestId('voltar')).toHaveTextContent('/adm/desbravadores')
  })

  it('estado de volta é o endereço atual com a busca', () => {
    abrir(null)
    expect(screen.getByTestId('de-volta')).toHaveTextContent('/adm/desbravadores/1?pagina=3')
  })

  it('avisos chegam pelo estado e saem ao dispensar, sem perder o Voltar', async () => {
    abrir({ voltarPara: '/adm/desbravadores?pagina=2', avisos: ['Sai da unidade.'] })
    expect(screen.getByText('Sai da unidade.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Dispensar' }))
    expect(screen.queryByText('Sai da unidade.')).not.toBeInTheDocument()
    expect(screen.getByTestId('voltar')).toHaveTextContent('/adm/desbravadores?pagina=2')
  })

  it('o rótulo do Voltar acompanha o destino; sem estado, vale o padrão', () => {
    abrir({ voltarPara: '/adm/unidades/1', voltarRotulo: 'Águias' })
    expect(screen.getByTestId('voltar-destino')).toHaveTextContent('/adm/unidades/1|Águias')
  })

  it('destino sem rótulo no estado cai no rótulo padrão; sem estado, no par padrão', () => {
    abrir({ voltarPara: '/adm/unidades/1' })
    expect(screen.getByTestId('voltar-destino')).toHaveTextContent('/adm/unidades/1|Padrão')
  })

  it('sem estado, o par padrão', () => {
    abrir(null)
    expect(screen.getByTestId('voltar-destino')).toHaveTextContent('/adm/padrao|Padrão')
  })

  it('o estado de volta leva o rótulo de quem manda', () => {
    abrir(null)
    expect(screen.getByTestId('de-volta-rotulo')).toHaveTextContent('Desbravadores')
  })

  it('os avisos são lidos uma vez: saem do estado do histórico, e o Voltar fica', () => {
    abrir({ voltarPara: '/adm/desbravadores?pagina=2', voltarRotulo: 'Desbravadores', avisos: ['Sai da unidade.'] })
    expect(screen.getByText('Sai da unidade.')).toBeInTheDocument()
    expect(JSON.parse(screen.getByTestId('estado').textContent ?? '')).toEqual({ voltarPara: '/adm/desbravadores?pagina=2', voltarRotulo: 'Desbravadores' })
  })

  it('filtros: grava no endereço e apaga o que ficou vazio', async () => {
    abrir(null)
    await userEvent.click(screen.getByRole('button', { name: 'Filtrar' }))
    expect(screen.getByTestId('endereco')).toHaveTextContent('/adm/desbravadores/1?busca=Bia')
    expect(screen.getByTestId('busca')).toHaveTextContent('Bia')
  })
})
