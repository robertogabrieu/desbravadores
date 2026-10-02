import { HttpResponse, http } from 'msw'
import type { Desbravador } from '../../api/desbravadores'
import type { PerfilDbv } from '../../api/perfil'
import { lerPorId } from './caixa'
import type { Caixa } from './caixa'
import { uuid } from './sessao'

export const CLASSE_COMPANHEIRO = { id: uuid(301), nome: 'Companheiro', tipo: 'REGULAR' as const, trilha: 'INDIVIDUAL' as const, corToken: '--classe-companheiro' }
export const CLASSE_AMIGO = { id: uuid(302), nome: 'Amigo', tipo: 'REGULAR' as const, trilha: 'INDIVIDUAL' as const, corToken: '--classe-amigo' }

export function criarPerfil(parcial: Partial<PerfilDbv> = {}): PerfilDbv {
  return {
    dbv: {
      id: uuid(201),
      nome: 'Ana Clara Souza',
      nomePublico: 'Ana C.',
      tipo: 'DBV',
      nascimento: '2019-01-01',
      idade: 11,
      sexo: 'F',
      ativo: true,
      entradaEm: '2028-02-01',
      saidaEm: null,
      autorizacaoImagem: true,
      autorizacaoImagemEm: null,
      usuarioId: null,
      unidade: { id: uuid(101), nome: 'Águias' },
      classeAtual: CLASSE_COMPANHEIRO,
      avancadaAtual: null,
      motivosDiretoria: [],
      instrui: [],
      aconselha: [],
    },
    mes: '2030-09',
    posicaoMes: 1,
    pontosMes: 446,
    frequenciaMes: 94,
    classesInvestidas: [{ classe: CLASSE_AMIGO, anoClube: 2029 }],
    ...parcial,
  }
}

export const handlerPerfil = (perfil: PerfilDbv = criarPerfil()) =>
  http.get('/api/desbravadores/:id/perfil', () => HttpResponse.json(perfil))

export const handlerErroPerfil = (status: number, erro: { codigo: string; mensagem: string }) =>
  http.get('/api/desbravadores/:id/perfil', () => HttpResponse.json(erro, { status }))

/** Perfil montado sobre o desbravador da caixa: a ficha mostra o que a última gravação deixou. */
export const handlerPerfilDe = (dbvs: Caixa<Desbravador>[], parcial: Partial<PerfilDbv> = {}) =>
  http.get('/api/desbravadores/:id/perfil', ({ params }) => {
    const id = String(params['id'])
    const achado = dbvs.find((c) => c.atual.id === id)
    if (!achado) return lerPorId(id, dbvs, 'Desbravador não encontrado.')
    return HttpResponse.json(criarPerfil({ ...parcial, dbv: achado.atual }))
  })
