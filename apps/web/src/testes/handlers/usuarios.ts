import type { Papel } from '@desbravadores/shared'
import { HttpResponse, http } from 'msw'
import type { CatalogoPermissao } from '../../api/leitura'
import type { Usuario, VinculoUsuario } from '../../api/usuarios'
import { lerPorId } from './caixa'
import type { Caixa } from './caixa'
import { uuid } from './sessao'

export function criarVinculoUsuario(papel: Papel, n = 1, parcial: Partial<VinculoUsuario> = {}): VinculoUsuario {
  return { id: uuid(600 + n), papel, ativo: true, unidades: [], classes: [], ajustes: [], ...parcial }
}

export function criarUsuario(parcial: Partial<Usuario> = {}): Usuario {
  return {
    id: uuid(700),
    nome: 'Thiago Mendes',
    email: 'thiago@clube.test',
    genero: 'M',
    situacao: 'ATIVO',
    ultimoAcessoEm: null,
    vinculos: [criarVinculoUsuario('CONSELHEIRO')],
    ...parcial,
  }
}

/** Duas chaves só do conselheiro, uma só do instrutor e uma dos três: cobre "só as chaves que se aplicam ao papel". */
export const criarCatalogoUsuarios = (): CatalogoPermissao[] => [
  { chave: 'dbv.ver', rotulo: 'Ver desbravadores', padrao: { ADM: true, CONSELHEIRO: true, INSTRUTOR: true } },
  { chave: 'dbv.editar', rotulo: 'Editar dados dos desbravadores', padrao: { ADM: true, CONSELHEIRO: false } },
  { chave: 'cronograma.montar', rotulo: 'Montar cronograma da classe', padrao: { ADM: true, INSTRUTOR: false } },
]

export const handlerCatalogoUsuarios = () =>
  http.get('/api/permissoes/catalogo', () => HttpResponse.json(criarCatalogoUsuarios()))

/** Lista filtrando por papel e busca e paginando como a API; grava as consultas recebidas em `consultas`. */
export function handlerListaUsuarios(usuarios: Usuario[], consultas: URLSearchParams[] = []) {
  return http.get('/api/usuarios', ({ request }) => {
    const consulta = new URL(request.url).searchParams
    consultas.push(consulta)
    const papel = consulta.get('papel')
    const busca = (consulta.get('busca') ?? '').toLowerCase()
    const pagina = Number(consulta.get('pagina') ?? 1)
    const porPagina = Number(consulta.get('porPagina') ?? 25)
    const filtrados = usuarios
      .filter((u) => !papel || u.vinculos.some((v) => v.ativo && v.papel === papel))
      .filter((u) => !busca || `${u.nome} ${u.email}`.toLowerCase().includes(busca))
    const contar = (p: Papel) => usuarios.filter((u) => u.vinculos.some((v) => v.ativo && v.papel === p)).length
    return HttpResponse.json({
      itens: filtrados.slice((pagina - 1) * porPagina, pagina * porPagina),
      total: filtrados.length,
      pagina,
      porPagina,
      contagens: { todos: usuarios.length, ADM: contar('ADM'), CONSELHEIRO: contar('CONSELHEIRO'), INSTRUTOR: contar('INSTRUTOR') },
    })
  })
}

/** Grava o corpo recebido em `corpos` e responde com `resposta`. */
function handlerEscrita(metodo: 'post' | 'put' | 'patch', caminho: string, resposta: Usuario, corpos: unknown[], status = 200) {
  return http[metodo](caminho, async ({ request }) => {
    corpos.push(await request.json())
    return HttpResponse.json(resposta, { status })
  })
}

export const handlerCriarUsuario = (resposta: Usuario, corpos: unknown[] = []) =>
  handlerEscrita('post', '/api/usuarios', resposta, corpos, 201)
export const handlerEditarUsuario = (resposta: Usuario, corpos: unknown[] = []) =>
  handlerEscrita('patch', '/api/usuarios/:id', resposta, corpos)
export const handlerNovoVinculo = (resposta: Usuario, corpos: unknown[] = []) =>
  handlerEscrita('post', '/api/usuarios/:id/vinculos', resposta, corpos)
export const handlerEditarVinculo = (resposta: Usuario, corpos: unknown[] = []) =>
  handlerEscrita('put', '/api/vinculos/:id', resposta, corpos)

export const handlerDesativarUsuario = (resposta: Usuario, chamadas: string[] = []) =>
  http.post('/api/usuarios/:id/desativar', ({ params }) => {
    chamadas.push(String(params['id']))
    return HttpResponse.json(resposta)
  })

export const handlerConvite = (chamadas: string[] = []) =>
  http.post('/api/usuarios/:id/convite', ({ params }) => {
    chamadas.push(String(params['id']))
    return new HttpResponse(null, { status: 204 })
  })

/** Recusa com 422 e o código dado, em qualquer método/caminho de escrita de usuários. */
export const handlerRegra422 = (metodo: 'post' | 'put' | 'patch', caminho: string, codigo: string, mensagem = 'Recusado') =>
  http[metodo](caminho, () => HttpResponse.json({ codigo, mensagem }, { status: 422 }))

export const handlerUsuario = (...caixas: Caixa<Usuario>[]) =>
  http.get('/api/usuarios/:id', ({ params }) => lerPorId(String(params['id']), caixas, 'Usuário não encontrado.'))
