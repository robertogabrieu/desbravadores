import { describe, expect, it } from 'vitest'
import { criarClasse, criarUnidade } from '../../../testes/handlers/leitura'
import { uuid } from '../../../testes/handlers/sessao'
import { contarMarcadas, filtrarGrupos, gruposDeClasses, gruposDeUnidades, idsDaOpcao, opcaoMarcada, resumoDasClasses } from './escopo'

const amigo = criarClasse({ id: uuid(101), nome: 'Amigo', tipo: 'REGULAR', trilha: 'INDIVIDUAL', avancadaPareadaId: uuid(102) })
const amigoDaNatureza = criarClasse({ id: uuid(102), nome: 'Amigo da Natureza', tipo: 'AVANCADA', trilha: 'INDIVIDUAL', classeBaseId: uuid(101), regularDoParId: uuid(101) })
const agrupadas = criarClasse({ id: uuid(103), nome: 'Agrupadas (Amigo a Guia)', tipo: 'REGULAR', trilha: 'AGRUPADAS' })
const agrupadasAvancada = criarClasse({ id: uuid(104), nome: 'Agrupadas — avançada', tipo: 'AVANCADA', trilha: 'AGRUPADAS' })

describe('gruposDeClasses', () => {
  it('a avançada vai embaixo da regular dela; as agrupadas ficam à parte, sem par, e o grupo vazio some', () => {
    const grupos = gruposDeClasses([amigo, amigoDaNatureza, agrupadas, agrupadasAvancada], [])
    expect(grupos.map((g) => [g.titulo, g.opcoes.map((o) => o.nome)])).toEqual([
      ['Regulares', ['Amigo']],
      ['Agrupadas', ['Agrupadas (Amigo a Guia)', 'Agrupadas — avançada']],
    ])
    expect(grupos[0]?.opcoes[0]?.avancada).toEqual({ id: amigoDaNatureza.id, nome: 'Amigo da Natureza' })
    expect(grupos[1]?.opcoes.every((o) => o.avancada === undefined)).toBe(true)
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

describe('classes do par', () => {
  it('avançada sem regular na lista continua visível, no grupo Avançadas', () => {
    const solta = criarClasse({ id: uuid(108), nome: 'Solta', tipo: 'AVANCADA', classeBaseId: uuid(999) })
    expect(gruposDeClasses([amigo, solta], []).map((g) => [g.titulo, g.opcoes.map((o) => o.nome)])).toEqual([
      ['Regulares', ['Amigo']],
      ['Avançadas', ['Solta']],
    ])
  })

  it('avançada ativa cuja regular está inativa no papel vira item próprio em Avançadas, sem par', () => {
    const regularInativa = { id: amigo.id, nome: 'Amigo', tipo: amigo.tipo, trilha: amigo.trilha, corToken: amigo.corToken }
    const grupos = gruposDeClasses([{ ...amigo, ativa: false }, amigoDaNatureza], [regularInativa])
    expect(grupos.map((g) => [g.titulo, g.opcoes.map((o) => [o.nome, o.inativa, o.avancada])])).toEqual([
      ['Regulares', [['Amigo', true, undefined]]],
      ['Avançadas', [['Amigo da Natureza', false, undefined]]],
    ])
  })

  it('marcar a regular grava os dois ids; vínculo só com a avançada também aparece marcado', () => {
    const [opcao] = gruposDeClasses([amigo, amigoDaNatureza], [])[0]?.opcoes ?? []
    expect(opcao && idsDaOpcao(opcao)).toEqual([amigo.id, amigoDaNatureza.id])
    expect(opcao && opcaoMarcada(opcao, [amigoDaNatureza.id])).toBe(true)
    expect(opcao && opcaoMarcada(opcao, [])).toBe(false)
  })

  it('resumo nomeia as duas; sem marcação não há resumo', () => {
    const grupos = gruposDeClasses([amigo, amigoDaNatureza, agrupadas], [])
    expect(resumoDasClasses('Maria', grupos, [amigo.id, amigoDaNatureza.id])).toBe('Maria vai instruir Amigo e Amigo da Natureza.')
    expect(resumoDasClasses('Maria', grupos, [amigo.id, agrupadas.id])).toBe('Maria vai instruir Amigo, Amigo da Natureza e Agrupadas (Amigo a Guia).')
    expect(resumoDasClasses('Maria', grupos, [])).toBeNull()
    expect(contarMarcadas(grupos, [amigo.id, amigoDaNatureza.id])).toBe(1)
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
    expect(filtrarGrupos(classes, 'natureza')[0]?.opcoes.map((o) => o.nome)).toEqual(['Amigo'])
  })
})
