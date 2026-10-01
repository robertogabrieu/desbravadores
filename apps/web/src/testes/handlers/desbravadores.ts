import { HttpResponse, http } from 'msw'
import type { JsonBodyType } from 'msw'
import type { Aviso, Desbravador, ListaDesbravadores } from '../../api/desbravadores'
import type { LinhaDaPreviaImportacao } from '../../api/importacao'
import { uuid } from './sessao'

export function criarDesbravador(parcial: Partial<Desbravador> = {}): Desbravador {
  return {
    id: uuid(300),
    nome: 'Ana Clara Souza',
    nomePublico: 'Ana S.',
    tipo: 'DBV',
    nascimento: '2015-03-10',
    idade: 11,
    sexo: 'F',
    ativo: true,
    entradaEm: '2026-02-01',
    saidaEm: null,
    autorizacaoImagem: false,
    autorizacaoImagemEm: null,
    usuarioId: null,
    unidade: null,
    classeAtual: null,
    avancadaAtual: null,
    diretoria: { membro: false, motivos: [] },
    ...parcial,
  }
}

export const criarLista = (itens: Desbravador[], parcial: Partial<ListaDesbravadores> = {}): ListaDesbravadores => ({
  itens,
  total: itens.length,
  pagina: 1,
  porPagina: 25,
  ...parcial,
})

/** Responde a lista aplicando a paginação e os filtros que a tela envia; `aoConsultar` recebe a URL de cada chamada. */
export const handlerDesbravadores = (todos: Desbravador[] = [], aoConsultar?: (url: URL) => void) =>
  http.get('/api/desbravadores', ({ request }) => {
    const url = new URL(request.url)
    aoConsultar?.(url)
    const consulta = url.searchParams
    const ativo = consulta.get('ativo') ?? 'true'
    const pagina = Number(consulta.get('pagina') ?? 1)
    const porPagina = Number(consulta.get('porPagina') ?? 25)
    const filtrados = todos.filter(
      (d) =>
        (ativo === 'todos' || String(d.ativo) === ativo) &&
        (!consulta.get('busca') || d.nome.toLowerCase().includes((consulta.get('busca') ?? '').toLowerCase())) &&
        (!consulta.get('unidadeId') || d.unidade?.id === consulta.get('unidadeId')) &&
        (consulta.get('semUnidade') !== 'true' || d.unidade === null) &&
        (!consulta.get('classeId') || d.classeAtual?.id === consulta.get('classeId')) &&
        (!consulta.get('diretoria') || d.diretoria.membro === (consulta.get('diretoria') === 'sim')),
    )
    const itens = filtrados.slice((pagina - 1) * porPagina, pagina * porPagina)
    return HttpResponse.json({ itens, total: filtrados.length, pagina, porPagina })
  })

type AoReceber = (corpo: unknown) => void

export const handlerCriarDesbravador = (criado: Desbravador = criarDesbravador(), avisos: Aviso[] = [], aoReceber?: AoReceber) =>
  http.post('/api/desbravadores', async ({ request }) => {
    aoReceber?.(await request.json())
    return HttpResponse.json({ dados: criado, avisos }, { status: 201 })
  })

export const handlerEditarDesbravador = (editado: Desbravador = criarDesbravador(), avisos: Aviso[] = [], aoReceber?: AoReceber) =>
  http.patch('/api/desbravadores/:id', async ({ request }) => {
    aoReceber?.(await request.json())
    return HttpResponse.json({ dados: editado, avisos })
  })

export const handlerInativarDesbravador = (aoReceber?: AoReceber) =>
  http.post('/api/desbravadores/:id/inativar', async ({ request, params }) => {
    aoReceber?.({ id: params['id'], ...(await request.json() as object) })
    return HttpResponse.json(criarDesbravador({ ativo: false, saidaEm: '2026-09-27' }))
  })

export const handlerReativarDesbravador = (aoReceber?: (id: string) => void) =>
  http.post('/api/desbravadores/:id/reativar', ({ params }) => {
    aoReceber?.(String(params['id']))
    return HttpResponse.json(criarDesbravador())
  })

/** `aoReceber` recebe o id do desbravador e o corpo `{ unidadeId, desde }`. */
export const handlerMoverUnidade = (aoReceber?: (id: string, corpo: { unidadeId: string | null; desde: string }) => void) =>
  http.put('/api/desbravadores/:id/unidade', async ({ request, params }) => {
    const corpo = (await request.json()) as { unidadeId: string | null; desde: string }
    aoReceber?.(String(params['id']), corpo)
    return HttpResponse.json(criarDesbravador())
  })

export const handlerErroDesbravador = (metodo: 'get' | 'post' | 'patch', caminho: string, status: number, erro: { codigo: string; mensagem: string; campos?: Record<string, string> }) =>
  http[metodo](caminho, () => HttpResponse.json(erro, { status }))

export function criarLinhaDaPrevia(parcial: Partial<LinhaDaPreviaImportacao> = {}): LinhaDaPreviaImportacao {
  return {
    linha: 2,
    nome: 'Ana Clara Souza',
    nascimento: '2015-03-10',
    sexo: 'F',
    unidadeId: null,
    classeId: null,
    responsavelNome: null,
    responsavelTelefone: null,
    responsavelEmail: null,
    entradaEm: '2026-02-01',
    erros: [],
    avisos: [],
    duplicado: false,
    ...parcial,
  }
}

export const handlerConfirmarImportacao = (resposta: JsonBodyType, status = 201, aoReceber?: AoReceber) =>
  http.post('/api/desbravadores/importacao', async ({ request }) => {
    aoReceber?.(await request.json())
    return HttpResponse.json(resposta, { status })
  })
