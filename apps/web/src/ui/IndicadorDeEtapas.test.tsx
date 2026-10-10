import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { IndicadorDeEtapas } from './IndicadorDeEtapas'

const ETAPAS = ['Dados da edição', 'Grupos', 'Datas']

describe('IndicadorDeEtapas', () => {
  it('diz em texto a etapa, o total e as próximas', () => {
    render(<IndicadorDeEtapas etapas={ETAPAS} atual={1} />)
    expect(screen.getByText('Etapa 1 de 3 — Dados da edição · depois: Grupos e Datas')).toBeInTheDocument()
  })

  it('expõe a barra com valuetext, valuenow e o total fixo', () => {
    render(<IndicadorDeEtapas etapas={ETAPAS} atual={2} />)
    const barra = screen.getByRole('progressbar')
    expect(barra).toHaveAttribute('aria-valuetext', 'Etapa 2 de 3 — Grupos')
    expect(barra).toHaveAttribute('aria-valuenow', '1')
    expect(barra).toHaveAttribute('aria-valuemax', '3')
    expect(barra.children).toHaveLength(3)
  })

  it('na última etapa diz que é a última, e o total continua 3', () => {
    render(<IndicadorDeEtapas etapas={ETAPAS} atual={3} />)
    expect(screen.getByText('Etapa 3 de 3 — Datas · última etapa')).toBeInTheDocument()
    expect(screen.getByRole('progressbar').children).toHaveLength(3)
  })
})
