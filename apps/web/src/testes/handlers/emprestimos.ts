import type { DesbravadorParaEmprestimoSaida, EmprestimoSaida, EmprestimosSaida, ExemplarSaida, LivroFisicoDetalheSaida } from '@desbravadores/shared'
import { HttpResponse, http } from 'msw'
import { criarItemFisico } from './biblioteca'
import { uuid } from './sessao'

type Emprestimo = NonNullable<ExemplarSaida['emprestimo']>
type LinhaDeEmprestimo = EmprestimosSaida['itens'][number]

export function criarExemplarDisponivel(numero: number): ExemplarSaida {
  return { id: uuid(8000 + numero), numero, situacao: 'DISPONIVEL', emprestimo: null }
}

/** Exemplar emprestado a Pedro Rocha (Leões), de 14/10 a 28/10, no prazo, salvo o que `parcial` mudar. */
export function criarExemplarEmprestado(numero: number, parcial: Partial<Emprestimo> = {}): ExemplarSaida {
  return {
    id: uuid(8000 + numero),
    numero,
    situacao: 'EMPRESTADO',
    emprestimo: {
      id: uuid(8500 + numero),
      desbravadorId: uuid(8600 + numero),
      desbravadorNome: 'Pedro Rocha',
      desbravadorAtivo: true,
      unidade: 'Leões',
      emprestadoEm: '2026-10-14',
      devolverAte: '2026-10-28',
      situacao: 'NO_PRAZO',
      dias: 0,
      ...parcial,
    },
  }
}

/** Detalhe do livro físico 1 com os exemplares dados; `total` e `disponiveis` saem da lista. */
export function criarDetalheDoLivro(exemplares: ExemplarSaida[], parcial: Partial<LivroFisicoDetalheSaida> = {}): LivroFisicoDetalheSaida {
  const ativos = exemplares.filter((exemplar) => exemplar.situacao !== 'BAIXADO')
  const item = criarItemFisico(1, {
    nome: 'Amigo',
    descricao: 'Classe regular',
    total: ativos.length,
    disponiveis: ativos.filter((exemplar) => exemplar.situacao === 'DISPONIVEL').length,
  })
  return { item, exemplares, jaDevolveram: [], ...parcial }
}

export function criarLinhaDeEmprestimo(n: number, parcial: Partial<LinhaDeEmprestimo> = {}): LinhaDeEmprestimo {
  return {
    emprestimoId: uuid(8500 + n),
    titulo: 'Amigo',
    numeroDoExemplar: n,
    desbravadorNome: `Desbravador ${n}`,
    desbravadorAtivo: true,
    unidade: 'Leões',
    emprestadoEm: '2026-10-14',
    devolverAte: '2026-10-28',
    situacao: 'NO_PRAZO',
    dias: 0,
    ...parcial,
  }
}

export function criarEmprestimos(itens: LinhaDeEmprestimo[]): EmprestimosSaida {
  return {
    totais: {
      emprestados: itens.length,
      atrasados: itens.filter((linha) => linha.situacao === 'ATRASADO').length,
      vencemHoje: itens.filter((linha) => linha.situacao === 'VENCE_HOJE').length,
    },
    itens,
  }
}

export function criarDesbravadorParaEmprestimo(n: number, parcial: Partial<DesbravadorParaEmprestimoSaida> = {}): DesbravadorParaEmprestimoSaida {
  return { id: uuid(8600 + n), nome: `Desbravador ${n}`, unidade: 'Leões', entradaEm: '2024-02-10', livroEmAberto: null, ...parcial }
}

export interface RecusaDaApi {
  status: number
  codigo: 'CONFLITO' | 'NAO_ENCONTRADO' | 'VALIDACAO' | 'SEM_PERMISSAO' | 'ERRO_INTERNO'
  mensagem: string
}

const recusa = ({ status, codigo, mensagem }: RecusaDaApi) => HttpResponse.json({ codigo, mensagem }, { status })

export const handlerDetalheDoLivro = (detalhe: LivroFisicoDetalheSaida | RecusaDaApi) =>
  http.get('/api/biblioteca/itens/:id/exemplares', () => ('exemplares' in detalhe ? HttpResponse.json(detalhe) : recusa(detalhe)))

/** Devolve o que `resposta` guarda; é uma função para o teste trocar o conteúdo entre uma leitura e outra. */
export const handlerEmprestimos = (resposta: () => EmprestimosSaida | RecusaDaApi, pedidos: URLSearchParams[] = []) =>
  http.get('/api/biblioteca/emprestimos', ({ request }) => {
    pedidos.push(new URL(request.url).searchParams)
    const lida = resposta()
    return 'totais' in lida ? HttpResponse.json(lida) : recusa(lida)
  })

/** A busca do empréstimo: filtra `desbravadores` pelo trecho do nome, como a API (mínimo 2 letras, até 20). */
export const handlerBuscaDeDesbravadores = (desbravadores: DesbravadorParaEmprestimoSaida[]) =>
  http.get('/api/biblioteca/desbravadores', ({ request }) => {
    const busca = (new URL(request.url).searchParams.get('busca') ?? '').toLowerCase()
    return HttpResponse.json(desbravadores.filter((desbravador) => desbravador.nome.toLowerCase().includes(busca)).slice(0, 20))
  })

export interface ChamadaDeEmprestimo {
  metodo: string
  caminho: string
  corpo: unknown
}

async function registrar(chamadas: ChamadaDeEmprestimo[], request: Request): Promise<void> {
  const texto = await request.text()
  chamadas.push({ metodo: request.method, caminho: new URL(request.url).pathname, corpo: texto === '' ? null : (JSON.parse(texto) as unknown) })
}

const emprestimoGravado = (parcial: Partial<EmprestimoSaida> = {}): EmprestimoSaida => ({
  id: uuid(8999),
  exemplarId: uuid(8002),
  desbravadorId: uuid(8600),
  emprestadoEm: '2026-10-21',
  devolverAte: '2026-11-04',
  devolvidoEm: null,
  ...parcial,
})

/**
 * Escritas do empréstimo: cada chamada vai para `chamadas`. `recusar` faz a próxima resposta ser a recusa
 * (a mensagem que a API escreve); sem ela, as escritas dão certo.
 */
export const handlersEscritaEmprestimos = (chamadas: ChamadaDeEmprestimo[], recusar?: RecusaDaApi) => [
  http.post('/api/biblioteca/emprestimos', async ({ request }) => {
    await registrar(chamadas, request)
    return recusar ? recusa(recusar) : HttpResponse.json(emprestimoGravado(), { status: 201 })
  }),
  http.post('/api/biblioteca/emprestimos/:id/devolucao', async ({ request }) => {
    await registrar(chamadas, request)
    return recusar ? recusa(recusar) : HttpResponse.json(emprestimoGravado({ devolvidoEm: '2026-10-21' }))
  }),
  http.post('/api/biblioteca/itens/:id/exemplares', async ({ request }) => {
    await registrar(chamadas, request)
    return recusar ? recusa(recusar) : HttpResponse.json(criarItemFisico(1), { status: 201 })
  }),
  http.post('/api/biblioteca/itens/:id/exemplares/:exemplarId/baixa', async ({ request }) => {
    await registrar(chamadas, request)
    return recusar ? recusa(recusar) : HttpResponse.json(criarItemFisico(1))
  }),
]
