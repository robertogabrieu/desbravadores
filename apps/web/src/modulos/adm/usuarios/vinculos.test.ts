import { describe, expect, it } from 'vitest'
import { ErroDaApi } from '../../../api/cliente'
import { criarCatalogoUsuarios, criarVinculoUsuario } from '../../../testes/handlers/usuarios'
import {
  contarAjustes,
  ESCOPO_VAZIO,
  frasesDosAjustes,
  mensagemDeErro,
  papelDaUrl,
  papelNoGenero,
  primeiroNome,
  rascunhoLimpo,
  textoDasAlteracoes,
  textoDoSelo,
  urlDoPapel,
} from './vinculos'

const catalogo = criarCatalogoUsuarios()

describe('rascunhoLimpo', () => {
  it('descarta ajuste igual ao padrão, de chave que não vale para o papel e repetido (vale o último)', () => {
    const vinculo = criarVinculoUsuario('CONSELHEIRO', 1, {
      unidades: [{ id: 'u1', nome: 'Águias' }],
      ajustes: [
        { permissao: 'dbv.ver', concedida: true },
        { permissao: 'cronograma.montar', concedida: true },
        { permissao: 'dbv.editar', concedida: false },
        { permissao: 'dbv.editar', concedida: true },
      ],
    })
    expect(rascunhoLimpo(vinculo, catalogo)).toEqual({
      papel: 'CONSELHEIRO',
      unidadeIds: ['u1'],
      classeIds: [],
      ajustes: { 'dbv.editar': true },
    })
  })

  it('repetido cujo último é o padrão some', () => {
    const vinculo = criarVinculoUsuario('CONSELHEIRO', 1, {
      ajustes: [
        { permissao: 'dbv.editar', concedida: true },
        { permissao: 'dbv.editar', concedida: false },
      ],
    })
    expect(rascunhoLimpo(vinculo, catalogo).ajustes).toEqual({})
  })
})

describe('contagem e textos dos ajustes', () => {
  it('contarAjustes conta só o que muda alguma coisa', () => {
    const vinculo = criarVinculoUsuario('CONSELHEIRO', 1, { ajustes: [{ permissao: 'dbv.ver', concedida: true }] })
    expect(contarAjustes(vinculo, catalogo)).toBe(0)
    const comAjuste = criarVinculoUsuario('CONSELHEIRO', 1, {
      ajustes: [
        { permissao: 'dbv.ver', concedida: false },
        { permissao: 'dbv.editar', concedida: true },
      ],
    })
    expect(contarAjustes(comAjuste, catalogo)).toBe(2)
  })

  it('selo e alterações: zero, um e plural', () => {
    expect(textoDoSelo(0)).toBe('sem ajustes')
    expect(textoDoSelo(1)).toBe('+ 1 ajuste')
    expect(textoDoSelo(2)).toBe('+ 2 ajustes')
    expect(textoDasAlteracoes(0)).toBe('')
    expect(textoDasAlteracoes(1)).toBe('1 alteração')
    expect(textoDasAlteracoes(2)).toBe('2 alterações')
  })

  it('frasesDosAjustes: uma por ajuste, na ordem do catálogo', () => {
    const vinculo = criarVinculoUsuario('CONSELHEIRO', 1, {
      ajustes: [
        { permissao: 'dbv.editar', concedida: true },
        { permissao: 'dbv.ver', concedida: false },
      ],
    })
    expect(frasesDosAjustes(vinculo, catalogo)).toEqual([
      'Ajuste: não pode Ver desbravadores',
      'Ajuste: também pode Editar dados dos desbravadores',
    ])
    expect(frasesDosAjustes(criarVinculoUsuario('CONSELHEIRO'), catalogo)).toEqual([])
  })
})

describe('nomes e endereço do papel', () => {
  it('papelNoGenero: feminino; masculino e sem gênero no masculino; Adm igual', () => {
    expect(papelNoGenero('CONSELHEIRO', 'F')).toBe('Conselheira')
    expect(papelNoGenero('INSTRUTOR', 'F')).toBe('Instrutora')
    expect(papelNoGenero('INSTRUTOR', 'M')).toBe('Instrutor')
    expect(papelNoGenero('CONSELHEIRO', null)).toBe('Conselheiro')
    expect(papelNoGenero('ADM', 'F')).toBe('Adm')
  })

  it('primeiroNome', () => {
    expect(primeiroNome('Carla Mendes')).toBe('Carla')
    expect(primeiroNome('  Alex  ')).toBe('Alex')
  })

  it('papelDaUrl e urlDoPapel: ida e volta; inválido vira null', () => {
    expect(papelDaUrl('adm')).toBe('ADM')
    expect(papelDaUrl('conselheiro')).toBe('CONSELHEIRO')
    expect(papelDaUrl('instrutor')).toBe('INSTRUTOR')
    expect(papelDaUrl('ADM')).toBeNull()
    expect(papelDaUrl('x')).toBeNull()
    expect(papelDaUrl(null)).toBeNull()
    expect(urlDoPapel('INSTRUTOR')).toBe('instrutor')
    expect(papelDaUrl(urlDoPapel('CONSELHEIRO'))).toBe('CONSELHEIRO')
  })

  it('ESCOPO_VAZIO', () => {
    expect(ESCOPO_VAZIO.CONSELHEIRO).toBe('Escolha pelo menos uma unidade.')
    expect(ESCOPO_VAZIO.INSTRUTOR).toBe('Escolha pelo menos uma classe.')
  })
})

describe('mensagemDeErro', () => {
  it('ULTIMO_ADM fala em remover este papel', () => {
    const erro = new ErroDaApi(422, { codigo: 'ULTIMO_ADM', mensagem: 'x' })
    expect(mensagemDeErro(erro)).toBe('O clube precisa de pelo menos um Adm ativo. Torne outra pessoa Adm antes de remover este papel.')
  })
})
