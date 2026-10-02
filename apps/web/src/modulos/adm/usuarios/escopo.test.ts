import { describe, expect, it } from 'vitest'
import { criarClasse, criarUnidade } from '../../../testes/handlers/leitura'
import { uuid } from '../../../testes/handlers/sessao'
import { filtrarGrupos, gruposDeClasses, gruposDeUnidades } from './escopo'

const amigo = criarClasse({ id: uuid(101), nome: 'Amigo', tipo: 'REGULAR', trilha: 'INDIVIDUAL' })
const amigoDaNatureza = criarClasse({ id: uuid(102), nome: 'Amigo da Natureza', tipo: 'AVANCADA', trilha: 'INDIVIDUAL' })
const agrupadas = criarClasse({ id: uuid(103), nome: 'Agrupadas (Amigo a Guia)', tipo: 'REGULAR', trilha: 'AGRUPADAS' })
const agrupadasAvancada = criarClasse({ id: uuid(104), nome: 'Agrupadas — avançada', tipo: 'AVANCADA', trilha: 'AGRUPADAS' })

describe('gruposDeClasses', () => {
  it('separa em Regulares, Avançadas e Agrupadas, e o grupo vazio some', () => {
    const grupos = gruposDeClasses([amigo, amigoDaNatureza, agrupadas, agrupadasAvancada], [])
    expect(grupos.map((g) => [g.titulo, g.opcoes.map((o) => o.nome)])).toEqual([
      ['Regulares', ['Amigo']],
      ['Avançadas', ['Amigo da Natureza']],
      ['Agrupadas', ['Agrupadas (Amigo a Guia)', 'Agrupadas — avançada']],
    ])
    expect(gruposDeClasses([amigo], []).map((g) => g.titulo)).toEqual(['Regulares'])
  })

  it('só as ativas; a inativa do papel entra marcável, com inativa: true, no grupo dela', () => {
    const inativa = criarClasse({ id: uuid(105), nome: 'Guia', ativa: false })
    const outraInativa = criarClasse({ id: uuid(106), nome: 'Pioneiro', ativa: false })
    const doPapel = [{ id: inativa.id, nome: 'Guia', tipo: inativa.tipo, trilha: inativa.trilha, corToken: inativa.corToken }]
    const grupos = gruposDeClasses([amigo, inativa, outraInativa], doPapel)
    expect(grupos).toEqual([
      {
        titulo: 'Regulares',
        opcoes: [
          { id: amigo.id, nome: 'Amigo', inativa: false },
          { id: inativa.id, nome: 'Guia', inativa: true },
        ],
      },
    ])
  })

  it('classe do papel que nem veio na lista também entra, pelo nome que o papel traz', () => {
    const doPapel = [{ id: uuid(107), nome: 'Sumida', tipo: 'AVANCADA' as const, trilha: 'INDIVIDUAL' as const, corToken: '--x' }]
    expect(gruposDeClasses([amigo], doPapel)[1]).toEqual({ titulo: 'Avançadas', opcoes: [{ id: uuid(107), nome: 'Sumida', inativa: true }] })
  })
})

describe('gruposDeUnidades', () => {
  it('um grupo só, "Unidades"; a inativa do papel entra com inativa: true', () => {
    const aguias = criarUnidade({ id: uuid(201), nome: 'Águias' })
    const doPapel = [{ id: uuid(202), nome: 'Falcões' }, { id: aguias.id, nome: 'Águias' }]
    expect(gruposDeUnidades([aguias], doPapel)).toEqual([
      {
        titulo: 'Unidades',
        opcoes: [
          { id: aguias.id, nome: 'Águias', inativa: false },
          { id: uuid(202), nome: 'Falcões', inativa: true },
        ],
      },
    ])
  })

  it('sem nenhuma, não há grupo', () => {
    expect(gruposDeUnidades([], [])).toEqual([])
  })
})

describe('filtrarGrupos', () => {
  it('busca sem acento e sem caixa; grupos sem resultado somem', () => {
    const grupos = gruposDeUnidades([criarUnidade({ id: uuid(201), nome: 'Águias' }), criarUnidade({ id: uuid(203), nome: 'Lobos' })], [])
    expect(filtrarGrupos(grupos, 'AGUI')[0]?.opcoes.map((o) => o.nome)).toEqual(['Águias'])
    expect(filtrarGrupos(grupos, 'zzz')).toEqual([])
    expect(filtrarGrupos(grupos, '  ')).toEqual(grupos)
    const classes = gruposDeClasses([amigo, amigoDaNatureza], [])
    expect(filtrarGrupos(classes, 'natureza').map((g) => g.titulo)).toEqual(['Avançadas'])
  })
})
