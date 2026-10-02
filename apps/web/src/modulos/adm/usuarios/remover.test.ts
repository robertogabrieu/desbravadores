import { describe, expect, it } from 'vitest'
import { uuid } from '../../../testes/handlers/sessao'
import { criarUsuario, criarVinculoUsuario } from '../../../testes/handlers/usuarios'
import type { Usuario, VinculoUsuario } from '../../../api/usuarios'
import { textosDaRemocao } from './remover'

const aguias = { id: uuid(201), nome: 'Águias' }
const lobos = { id: uuid(202), nome: 'Lobos' }
const amigo = { id: uuid(301), nome: 'Amigo', tipo: 'REGULAR' as const, trilha: 'INDIVIDUAL' as const, corToken: '--classe-amigo' }
const companheiro = { ...amigo, id: uuid(302), nome: 'Companheiro' }
const guia = { ...amigo, id: uuid(303), nome: 'Guia' }

const adm = (n = 1) => criarVinculoUsuario('ADM', n)
const conselheiro = (n = 2, unidades = [aguias]) => criarVinculoUsuario('CONSELHEIRO', n, { unidades })
const instrutor = (n = 3, classes = [amigo, companheiro]) => criarVinculoUsuario('INSTRUTOR', n, { classes })

const usuario = (vinculos: VinculoUsuario[], parcial: Partial<Usuario> = {}) =>
  criarUsuario({ nome: 'Carla Mendes', genero: 'F', vinculos, ...parcial })

const textos = (u: Usuario, vinculo: VinculoUsuario, ehVoce = false) => textosDaRemocao({ usuario: u, vinculo, ehVoce })

describe('textos da confirmação de remover', () => {
  it('conselheira que segue com outro papel', () => {
    const c = conselheiro()
    expect(textos(usuario([adm(), c]), c)).toEqual({
      titulo: 'Remover o papel de Conselheira de Carla?',
      paragrafos: [
        'Carla deixa de acompanhar a unidade Águias e não vê mais os desbravadores, as reuniões nem as fotos dela, assim que o aparelho se conectar.',
        'O que já chegou ao clube continua guardado. Se Carla registrou algo sem internet, peça que abra o app com internet antes.',
        'Ela segue como Adm.',
      ],
    })
  })

  it('várias unidades vão no plural', () => {
    const c = conselheiro(2, [aguias, lobos])
    expect(textos(usuario([c, instrutor()]), c).paragrafos[0]).toBe(
      'Carla deixa de acompanhar as unidades Águias e Lobos e não vê mais os desbravadores, as reuniões nem as fotos delas, assim que o aparelho se conectar.',
    )
  })

  it('instrutora com duas classes, segue como Adm e conselheira', () => {
    const i = instrutor()
    const u = usuario([adm(), conselheiro(), i])
    expect(textos(u, i)).toEqual({
      titulo: 'Remover o papel de Instrutora de Carla?',
      paragrafos: [
        'Carla deixa de instruir as classes Amigo e Companheiro e não vê mais as chamadas nem os requisitos delas, assim que o aparelho se conectar.',
        'O que já chegou ao clube continua guardado. Se Carla registrou algo sem internet, peça que abra o app com internet antes.',
        'Ela segue como Adm e conselheira da unidade Águias.',
      ],
    })
  })

  it('uma classe só vai no singular', () => {
    const i = instrutor(3, [amigo])
    expect(textos(usuario([i, adm()]), i).paragrafos[0]).toBe(
      'Carla deixa de instruir a classe Amigo e não vê mais as chamadas nem os requisitos dela, assim que o aparelho se conectar.',
    )
  })

  it('Adm: não pede para abrir o app com internet', () => {
    const a = adm()
    expect(textos(usuario([a, conselheiro()]), a)).toEqual({
      titulo: 'Remover o papel de Adm de Carla?',
      paragrafos: [
        'Carla deixa de cuidar do clube: usuários, unidades, classes, calendário e ranking.',
        'O que já chegou ao clube continua guardado.',
        'Ela segue como conselheira da unidade Águias.',
      ],
    })
  })

  it('sem gênero: o primeiro nome no lugar do pronome e o papel no masculino', () => {
    const i = instrutor(3, [amigo, guia])
    const u = usuario([conselheiro(), i], { nome: 'Alex Souza', genero: null })
    expect(textos(u, conselheiro()).titulo).toBe('Remover o papel de Conselheiro de Alex?')
    expect(textos(u, conselheiro()).paragrafos[2]).toBe('Alex segue como instrutor das classes Amigo e Guia.')
  })

  it('último papel: diz que deixa de entrar no clube', () => {
    const c = conselheiro()
    expect(textos(usuario([c]), c).paragrafos[2]).toBe(
      'Era o último papel de Carla neste clube: ela deixa de entrar no clube. Para voltar, acrescente um papel.',
    )
    const semGenero = usuario([c], { nome: 'Alex Souza', genero: null })
    expect(textos(semGenero, c).paragrafos[2]).toBe(
      'Era o último papel de Alex neste clube: Alex deixa de entrar no clube. Para voltar, acrescente um papel.',
    )
  })

  it('papéis inativos não contam como os que restam', () => {
    const c = conselheiro()
    const velho = criarVinculoUsuario('INSTRUTOR', 4, { ativo: false, classes: [amigo] })
    expect(textos(usuario([c, velho]), c).paragrafos[2]).toMatch(/^Era o último papel/)
  })

  it('conselheiro ou instrutor sem unidade ou classe', () => {
    const c = conselheiro(2, [])
    expect(textos(usuario([c, adm()]), c).paragrafos[0]).toBe('Carla deixa de ser conselheira neste clube, assim que o aparelho se conectar.')
    const i = instrutor(3, [])
    expect(textos(usuario([i, adm()]), i).paragrafos[0]).toBe('Carla deixa de ser instrutora neste clube, assim que o aparelho se conectar.')
  })

  it('é você: título e frases na segunda pessoa', () => {
    const a = adm()
    expect(textos(usuario([a, instrutor()]), a, true)).toEqual({
      titulo: 'Remover o seu papel de Adm?',
      paragrafos: ['Você perde esse acesso na hora.', 'O que já chegou ao clube continua guardado.', 'Você segue como instrutora das classes Amigo e Companheiro.'],
    })
  })

  it('é você, conselheira e último papel', () => {
    const c = conselheiro()
    expect(textos(usuario([c]), c, true)).toEqual({
      titulo: 'Remover o seu papel de Conselheira?',
      paragrafos: [
        'Você perde esse acesso na hora.',
        'O que já chegou ao clube continua guardado. Se você registrou algo sem internet, abra o app com internet antes.',
        'Era o seu último papel neste clube: você deixa de entrar no clube.',
      ],
    })
  })
})
