import { HttpResponse, http } from 'msw'
import type { CatalogoPermissao, Classe, ListaUsuarios, Unidade } from '../../api/leitura'
import { uuid } from './sessao'

export function criarClasse(parcial: Partial<Classe> = {}): Classe {
  return {
    id: uuid(100),
    nome: 'Amigo',
    idade: 10,
    tipo: 'REGULAR',
    trilha: 'INDIVIDUAL',
    origem: 'OFICIAL',
    classeBaseId: null,
    ordem: 1,
    corToken: '--classe-amigo',
    ativa: true,
    quemMontaCronograma: 'ADM',
    totalRequisitos: 30,
    ...parcial,
  }
}

export function criarUnidade(parcial: Partial<Unidade> = {}): Unidade {
  return {
    id: uuid(200),
    nome: 'Águias',
    tipo: 'MISTA',
    gritoDeGuerra: null,
    ativa: true,
    conselheiros: [],
    totalMembros: 0,
    ...parcial,
  }
}

export function criarListaUsuarios(parcial: Partial<ListaUsuarios> = {}): ListaUsuarios {
  return {
    itens: [],
    total: 0,
    pagina: 1,
    porPagina: 100,
    contagens: { todos: 0, ADM: 0, CONSELHEIRO: 0, INSTRUTOR: 0 },
    ...parcial,
  }
}

export const criarCatalogo = (): CatalogoPermissao[] => [
  { chave: 'dbv.ver', rotulo: 'Ver desbravadores', padrao: { ADM: true, CONSELHEIRO: true, INSTRUTOR: true } },
]

export const handlerClasses = (classes: Classe[] = [criarClasse()]) =>
  http.get('/api/classes', () => HttpResponse.json(classes))

export const handlerUnidades = (unidades: Unidade[] = [criarUnidade()]) =>
  http.get('/api/unidades', () => HttpResponse.json(unidades))

export const handlerUsuarios = (lista: ListaUsuarios = criarListaUsuarios()) =>
  http.get('/api/usuarios', () => HttpResponse.json(lista))

export const handlerCatalogoPermissoes = (catalogo: CatalogoPermissao[] = criarCatalogo()) =>
  http.get('/api/permissoes/catalogo', () => HttpResponse.json(catalogo))

export const handlersLeitura = () => [
  handlerClasses(),
  handlerUnidades(),
  handlerUsuarios(),
  handlerCatalogoPermissoes(),
]
