import { nomeDoAutor } from './nome-do-autor'

describe('nomeDoAutor', () => {
  it('marca o usuario de substituicao', () => {
    expect(nomeDoAutor({ nome: 'Joana Lima', status: 'SUBSTITUTO' })).toBe('Joana Lima (substituto)')
  })

  it.each(['ATIVO', 'CONVIDADO', 'INATIVO'] as const)('membro com status %s aparece so com o nome', (status) => {
    expect(nomeDoAutor({ nome: 'Joana Lima', status })).toBe('Joana Lima')
  })
})
