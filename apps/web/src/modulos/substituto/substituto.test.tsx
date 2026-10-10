import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { useSyncExternalStore } from 'react'
import { z } from 'zod'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ItemFila, ModoConexao, PacoteGuardado, TipoFila } from '../../offline'
import { registrarTipo } from '../../offline'
import { banco } from '../../offline/banco'
import { registrarSubstituicaoLocal } from '../../offline/limpeza'
import { configurarCliente, entrarNoModoSubstituicao, requisitar } from '../../api/cliente'
import { reiniciarRelogio } from '../../substituicao/relogio'
import { criarDetalheReuniao } from '../../testes/handlers/chamada'
import { criarPacote, handlerPacote } from '../../testes/handlers/offline'
import { criarResumo, handlerReunioes } from '../../testes/handlers/reunioes'
import { uuid } from '../../testes/handlers/sessao'
import {
  criarEntradaDoLink,
  criarLinkPublico,
  handlersDoLink,
  novoRegistroDoLink,
  recusaDoEntrar,
} from '../../testes/handlers/substituicao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { rotas } from '../../rotas'
import { TelaRegistroAula } from '../aulas/TelaRegistroAula'
import { rotasAcessoPublicas } from '../acesso/rotas'
import { TelaChamada } from '../reunioes/chamada/TelaChamada'
import { rotaDoSubstituto } from './rotas'
import { chaveDoLink } from './TelaDoLink'

const estado = vi.hoisted(() => ({
  modo: 'ONLINE' as ModoConexao,
  pacote: { pacote: null, carregando: false, baixadoEm: null } as PacoteGuardado,
  ouvintes: new Set<() => void>(),
  enfileirar: vi.fn<(entrada: unknown) => Promise<string>>(() => Promise.resolve('id')),
  aviso: { success: vi.fn(), warning: vi.fn() },
}))

vi.mock('sonner', () => ({ toast: estado.aviso }))
vi.mock('../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../offline')>()),
  useConexao: () => ({
    modo: useSyncExternalStore(
      (ouvinte) => {
        estado.ouvintes.add(ouvinte)
        return () => estado.ouvintes.delete(ouvinte)
      },
      () => estado.modo,
    ),
  }),
  usePacote: () => estado.pacote,
  useFila: () => ({ itens: [], contagem: { pendentes: 0, erros: 0 }, avisos: { instalarNaTelaInicial: false } }),
  itensDaChave: () => Promise.resolve([]),
  lerRascunho: () => Promise.resolve(null),
  gravarRascunho: () => Promise.resolve(),
  apagarRascunho: () => Promise.resolve(),
  enfileirar: estado.enfileirar,
}))

const TOKEN = 'token-do-link'
const ENDERECO = `/substituto/${TOKEN}`
const SUBSTITUICAO = uuid(950)
const UNIDADE = uuid(30)
const REUNIAO = uuid(70)
const SEGREDO = 'segredo-do-aparelho'

const membro = (n: number, nome: string) => ({
  dbvId: uuid(300 + n), nome, nomePublico: nome, sexo: 'F' as const, idade: 11, classeAtual: null, autorizacaoImagem: true,
})

function guardarPacote() {
  const pacote = criarPacote({
    usuarioId: SUBSTITUICAO,
    vinculoId: SUBSTITUICAO,
    unidades: [{ id: UNIDADE, nome: 'Águia', membros: [membro(1, 'Bruno Alves'), membro(2, 'Carla Nunes')] }],
    reunioesRecentes: [
      {
        id: REUNIAO, unidadeId: UNIDADE, data: '2026-10-11', horario: '09:00', local: null, observacoes: null,
        cabecalhoVersao: '2026-10-11T13:00:00.000Z', chamada: [],
      },
    ] as unknown as ReturnType<typeof criarPacote>['reunioesRecentes'],
  })
  estado.pacote = { pacote, carregando: false, baixadoEm: Date.now() }
}

const montar = (endereco = ENDERECO) => renderizarRotas(rotas, endereco, { enderecoDoNavegador: endereco })

function guardarAparelho(extra: Record<string, string> = {}) {
  localStorage.setItem(chaveDoLink(TOKEN), JSON.stringify({ substituicaoId: SUBSTITUICAO, segredo: SEGREDO, fimEnvioEm: '2026-10-12T03:00:00.000Z', ...extra }))
}

function itemNaFila(n: number): ItemFila {
  return {
    id: uuid(800 + n), versaoPayload: 1, usuarioId: SUBSTITUICAO, vinculoId: SUBSTITUICAO, tipo: 'REUNIAO',
    chave: `${UNIDADE}:2026-10-11:${n}`, rotulo: 'Chamada', detalhe: 'Águia', payload: {}, estado: 'NA_FILA',
    progresso: 0, tentativas: 0, proximaTentativaEm: null, criadoEm: Date.now(), atualizadoEm: Date.now(),
  }
}

const tipoFalso: TipoFila<{ valor: string }, z.ZodObject<{ ok: z.ZodLiteral<true> }>> = {
  tipo: 'FALSO',
  rotulo: (carga) => `Falso ${carga.valor}`,
  detalhe: (carga) => carga.valor,
  fundir: (_anterior, novo) => novo,
  enviar: (item, ctx) => ctx.requisitar('/api/falso', { metodo: 'PUT', corpo: item.payload }),
  saida: z.object({ ok: z.literal(true) }),
}

const itensDaSubstituicao = () => banco.fila.where('[usuarioId+estado]').between([SUBSTITUICAO, ''], [SUBSTITUICAO, '￿']).count()

/** Critério 27: nenhum texto visível novo usa "aula". */
const semAula = () => expect(document.body.textContent ?? '').not.toMatch(/aula/i)

/** Instantes relativos ao relógio real: a virada da janela roda sem relógio falso. */
const daqui = (ms: number) => new Date(Date.now() + ms).toISOString()

beforeEach(() => {
  estado.modo = 'SEM_CONEXAO'
  estado.pacote = { pacote: null, carregando: false, baixadoEm: null }
  estado.enfileirar.mockClear()
  localStorage.clear()
  servidor.use(handlerPacote(criarPacote({ usuarioId: SUBSTITUICAO, vinculoId: SUBSTITUICAO })))
})

afterEach(() => {
  window.history.pushState({}, '', '/')
  reiniciarRelogio()
  localStorage.clear()
})

describe('critério 7: antes do horário', () => {
  it('S1 diz o alvo, o dia, o início e o fim, e não pede nome nem entra', async () => {
    const registro = novoRegistroDoLink()
    servidor.use(...handlersDoLink({ links: [criarLinkPublico({ estado: 'ANTES', agora: '2026-10-11T11:00:00.000Z' })], registro }))
    montar()
    expect(await screen.findByRole('heading', { name: 'Chamada da Unidade Águia' })).toBeInTheDocument()
    expect(screen.getByText(/domingo, 11 de outubro/)).toBeInTheDocument()
    expect(screen.getByText('09:00')).toBeInTheDocument()
    expect(screen.getByText('12:00')).toBeInTheDocument()
    expect(screen.getByText('Não precisa criar conta nem senha.')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(registro.entradas).toEqual([])
    semAula()
  })

  it('o entrar recusado com ANTES leva a S1', async () => {
    servidor.use(...handlersDoLink({ links: [criarLinkPublico()], entrar: () => recusaDoEntrar('ANTES') }))
    montar()
    await userEvent.type(await screen.findByLabelText('Qual é o seu nome?'), 'Ana Souza')
    await userEvent.click(screen.getByRole('button', { name: 'Começar a chamada' }))
    expect(await screen.findByText('Não precisa criar conta nem senha.')).toBeInTheDocument()
  })

  it('pelo relógio do servidor, S1 vira S2 sem recarregar', async () => {
    const agora = daqui(0)
    servidor.use(
      ...handlersDoLink({
        links: [criarLinkPublico({ estado: 'ANTES', agora, inicioEm: daqui(300) }), criarLinkPublico({ agora: daqui(400) })],
      }),
    )
    montar()
    await screen.findByText('Não precisa criar conta nem senha.')
    expect(await screen.findByLabelText('Qual é o seu nome?', {}, { timeout: 3000 })).toBeInTheDocument()
  })
})

describe('critério 8: primeira abertura sem conta', () => {
  it('nome curto mostra a mensagem junto do campo ao sair e ao confirmar, sem apagar o digitado', async () => {
    const registro = novoRegistroDoLink()
    servidor.use(...handlersDoLink({ registro }))
    montar()
    const campo = await screen.findByLabelText('Qual é o seu nome?')
    expect(screen.getByText('Domingo, 11 de outubro · até 12:00')).toBeInTheDocument()
    await userEvent.type(campo, 'Al')
    await userEvent.tab()
    expect(await screen.findByText('Escreva seu nome e sobrenome')).toBeInTheDocument()
    expect(campo).toHaveValue('Al')
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Começar a chamada' }))
    expect(screen.getByText('Escreva seu nome e sobrenome')).toBeInTheDocument()
    expect(campo).toHaveValue('Al')
    expect(registro.entradas).toEqual([])
    // Critério 26: o aviso não some sozinho.
    await act(async () => await new Promise((resolver) => setTimeout(resolver, 100)))
    expect(screen.getByText('Escreva seu nome e sobrenome')).toBeInTheDocument()
    semAula()
  })

  it('depois da mensagem, corrigir o nome já a tira antes de sair do campo, e um toque em "Começar a chamada" entra', async () => {
    guardarPacote()
    const registro = novoRegistroDoLink()
    servidor.use(...handlersDoLink({ registro }))
    montar()
    const campo = await screen.findByLabelText('Qual é o seu nome?')
    await userEvent.type(campo, 'Al')
    await userEvent.tab()
    expect(await screen.findByText('Escreva seu nome e sobrenome')).toBeInTheDocument()
    await userEvent.clear(campo)
    await userEvent.type(campo, 'Ana Souza')
    // Sumir só no blur encolhe a tela entre o toque e o clique, e o botão sai de baixo do dedo.
    expect(screen.queryByText('Escreva seu nome e sobrenome')).not.toBeInTheDocument()
    expect(campo).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Começar a chamada' }))
    expect(await screen.findByText(/Substituindo na Unidade Águia/)).toBeInTheDocument()
    expect(registro.entradas).toEqual([{ nome: 'Ana Souza' }])
  })

  it('nome com mais de 80 caracteres também é recusado', async () => {
    servidor.use(...handlersDoLink())
    montar()
    await userEvent.type(await screen.findByLabelText('Qual é o seu nome?'), 'a'.repeat(81))
    await userEvent.click(screen.getByRole('button', { name: 'Começar a chamada' }))
    expect(await screen.findByText('Escreva seu nome e sobrenome')).toBeInTheDocument()
  })

  it('com nome válido entra, guarda o segredo e cai na chamada com a faixa no topo, rolando junto', async () => {
    guardarPacote()
    const registro = novoRegistroDoLink()
    servidor.use(...handlersDoLink({ registro }))
    const { roteador } = montar()
    await userEvent.type(await screen.findByLabelText('Qual é o seu nome?'), '  Ana Souza  ')
    await userEvent.click(screen.getByRole('button', { name: 'Começar a chamada' }))
    const faixa = await screen.findByText(/Substituindo na Unidade Águia/)
    expect(faixa).toHaveTextContent('Substituindo na Unidade Águia · aberto até 12:00')
    expect(registro.entradas).toEqual([{ nome: 'Ana Souza' }])
    await waitFor(() => expect(roteador.state.location.pathname).toBe(`${ENDERECO}/chamada`))
    expect(await screen.findByText('Bruno Alves')).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem(chaveDoLink(TOKEN)) ?? '{}')).toMatchObject({ substituicaoId: SUBSTITUICAO, segredo: SEGREDO })
    for (let elemento: HTMLElement | null = faixa; elemento; elemento = elemento.parentElement) {
      expect(elemento.className).not.toMatch(/\b(fixed|sticky)\b/)
    }
  })
})

describe('critério 9: já logado no clube', () => {
  it('S3 mostra o nome da conta e "Começar a chamada" entra como ela', async () => {
    guardarPacote()
    const registro = novoRegistroDoLink()
    servidor.use(...handlersDoLink({ links: [criarLinkPublico({ conta: { nome: 'Marcos Lima' } })], registro }))
    montar()
    expect(await screen.findByText('Você vai lançar como')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Marcos Lima' })).toBeInTheDocument()
    semAula()
    await userEvent.click(screen.getByRole('button', { name: 'Começar a chamada' }))
    await screen.findByText(/Substituindo na Unidade Águia/)
    expect(registro.entradas).toEqual([{ usarConta: true }])
  })

  it('"Não sou Marcos" leva a S2', async () => {
    servidor.use(...handlersDoLink({ links: [criarLinkPublico({ conta: { nome: 'Marcos Lima' } })] }))
    montar()
    await userEvent.click(await screen.findByRole('button', { name: 'Não sou Marcos' }))
    expect(screen.getByLabelText('Qual é o seu nome?')).toBeInTheDocument()
    expect(screen.queryByText('Você vai lançar como')).not.toBeInTheDocument()
  })
})

describe('critério 10: reabrir e outro aparelho', () => {
  it('reabrir no mesmo navegador manda o segredo e entra direto', async () => {
    guardarPacote()
    guardarAparelho()
    const registro = novoRegistroDoLink()
    servidor.use(...handlersDoLink({ links: [criarLinkPublico({ identificado: true })], entrada: criarEntradaDoLink({}, { segredo: null }), registro }))
    montar()
    expect(await screen.findByText(/Substituindo na Unidade Águia/)).toBeInTheDocument()
    expect(registro.segredosLidos[0]).toBe(SEGREDO)
    expect(registro.entradas).toEqual([{ segredo: SEGREDO }])
    expect(screen.queryByLabelText('Qual é o seu nome?')).not.toBeInTheDocument()
    // A entrada de reingresso não traz segredo: o guardado continua.
    expect(JSON.parse(localStorage.getItem(chaveDoLink(TOKEN)) ?? '{}')).toMatchObject({ segredo: SEGREDO })
  })

  it('outro aparelho vê S7', async () => {
    servidor.use(...handlersDoLink({ links: [criarLinkPublico({ estado: 'EM_OUTRO_APARELHO' })] }))
    montar()
    expect(await screen.findByRole('heading', { name: 'Este link já está aberto em outro celular' })).toBeInTheDocument()
    expect(screen.getByText(/no mesmo navegador em que foi aberto da primeira vez/)).toBeInTheDocument()
    semAula()
  })

  it('o entrar recusado com EM_OUTRO_APARELHO também leva a S7', async () => {
    servidor.use(...handlersDoLink({ entrar: () => recusaDoEntrar('EM_OUTRO_APARELHO') }))
    montar()
    await userEvent.type(await screen.findByLabelText('Qual é o seu nome?'), 'Ana Souza')
    await userEvent.click(screen.getByRole('button', { name: 'Começar a chamada' }))
    expect(await screen.findByRole('heading', { name: 'Este link já está aberto em outro celular' })).toBeInTheDocument()
  })

  it('link que não existe vê S7', async () => {
    servidor.use(
      ...handlersDoLink({
        links: [criarLinkPublico({ estado: 'INEXISTENTE', tipo: null, alvo: null, data: null, inicioEm: null, fimEm: null, fimEnvioEm: null, fuso: null })],
      }),
    )
    montar()
    expect(await screen.findByRole('heading', { name: 'Este link não existe' })).toBeInTheDocument()
    expect(screen.getByText('Confira se copiou o endereço inteiro da mensagem.')).toBeInTheDocument()
  })
})

describe('critério 11: depois de salvar', () => {
  it('salvar mostra S8; "Abrir a chamada de novo" volta à mesma chamada', async () => {
    guardarPacote()
    servidor.use(...handlersDoLink())
    const { roteador } = montar()
    await userEvent.type(await screen.findByLabelText('Qual é o seu nome?'), 'Ana Souza')
    await userEvent.click(screen.getByRole('button', { name: 'Começar a chamada' }))
    for (const nome of ['Bruno Alves', 'Carla Nunes']) {
      await userEvent.click(within(await screen.findByRole('listitem', { name: nome })).getByRole('button', { name: new RegExp(nome) }))
    }
    await userEvent.click(screen.getByRole('button', { name: /^Salvar chamada/ }))
    expect(await screen.findByRole('heading', { name: 'Chamada salva' })).toBeInTheDocument()
    expect(estado.enfileirar).toHaveBeenCalledTimes(1)
    expect(roteador.state.location.pathname).toBe(`${ENDERECO}/salvo`)
    expect(screen.getByText(/Substituindo na Unidade Águia/)).toBeInTheDocument()
    expect(screen.getByText('Chamada salva neste celular. Ela vai sozinha quando a internet voltar.')).toBeInTheDocument()
    semAula()
    await userEvent.click(screen.getByRole('link', { name: 'Abrir a chamada de novo' }))
    await waitFor(() => expect(roteador.state.location.pathname).toBe(`${ENDERECO}/chamada/${REUNIAO}`))
  })

  it('com internet, "Abrir a chamada de novo" mostra o que o servidor gravou, não o que a tela leu antes de salvar', async () => {
    estado.modo = 'ONLINE'
    guardarPacote()
    guardarAparelho()
    let uniformeNoServidor = false
    const linha = (n: number, nome: string) => ({
      dbvId: uuid(300 + n), nome, nomePublico: nome, situacao: 'PRESENTE' as const, uniforme: n === 1 && uniformeNoServidor,
      biblia: false, licao: false, versao: '2026-10-11T13:00:00.000Z', pontos: 0,
    })
    servidor.use(
      ...handlersDoLink({ links: [criarLinkPublico({ identificado: true })], entrada: criarEntradaDoLink({}, { segredo: null }) }),
      handlerReunioes({ '2026-10': [criarResumo({ id: REUNIAO, data: '2026-10-11' })] }),
      http.get(`/api/reunioes/${REUNIAO}`, () =>
        HttpResponse.json(
          criarDetalheReuniao({ id: REUNIAO, unidade: { id: UNIDADE, nome: 'Águia' }, data: '2026-10-11', chamada: [linha(1, 'Bruno Alves'), linha(2, 'Carla Nunes')] }),
        ),
      ),
    )
    const { roteador } = montar()
    const uniformeDoBruno = async () => within(await screen.findByRole('listitem', { name: 'Bruno Alves' })).getByRole('button', { name: 'Uniforme' })
    await userEvent.click(await uniformeDoBruno())
    await userEvent.click(screen.getByRole('button', { name: /^Salvar chamada/ }))
    expect(await screen.findByRole('heading', { name: 'Chamada salva' })).toBeInTheDocument()
    // A fila enviou e o servidor gravou enquanto S8 estava na tela.
    uniformeNoServidor = true
    await userEvent.click(screen.getByRole('link', { name: 'Abrir a chamada de novo' }))
    await waitFor(() => expect(roteador.state.location.pathname).toBe(`${ENDERECO}/chamada/${REUNIAO}`))
    await waitFor(async () => expect(await uniformeDoBruno()).toHaveAttribute('aria-pressed', 'true'))
  })

  it('com internet, S8 diz que a chamada já aparece para os conselheiros', async () => {
    estado.modo = 'ONLINE'
    guardarPacote()
    servidor.use(...handlersDoLink({ links: [criarLinkPublico({ identificado: true })] }))
    guardarAparelho()
    montar(`${ENDERECO}/salvo`)
    expect(await screen.findByRole('heading', { name: 'Chamada salva' })).toBeInTheDocument()
    expect(screen.getByText('Ela já aparece para os conselheiros da unidade e para o Adm, com o seu nome.')).toBeInTheDocument()
    expect(screen.getByText('12:00')).toBeInTheDocument()
  })

  it('link de classe: faixa da classe, tela de registro da classe e S8 da classe', async () => {
    const CLASSE = uuid(40)
    servidor.use(
      ...handlersDoLink({
        links: [criarLinkPublico({ tipo: 'CLASSE', alvo: { nome: 'Amigo' }, identificado: true })],
        entrada: criarEntradaDoLink({ tipo: 'CLASSE', alvoId: CLASSE, alvoNome: 'Amigo' }),
      }),
    )
    guardarAparelho()
    const { roteador } = montar()
    expect(await screen.findByText(/Substituindo na classe Amigo/)).toBeInTheDocument()
    await waitFor(() => expect(roteador.state.location.pathname).toBe(`${ENDERECO}/classe`))
    await act(async () => void (await roteador.navigate(`${ENDERECO}/salvo`)))
    expect(await screen.findByRole('heading', { name: 'Registro da classe salvo' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir o registro da classe de novo' })).toHaveAttribute('href', `${ENDERECO}/classe`)
    semAula()
  })
})

describe('critério 12: as telas do titular', () => {
  const filho = (caminho: string) => rotaDoSubstituto.children?.find((rota) => rota.path === caminho)?.element as ReactElement

  it('as rotas do substituto renderizam os mesmos TelaChamada e TelaRegistroAula', () => {
    expect(rotaDoSubstituto.path).toBe('/substituto/:token')
    expect(filho('chamada').type).toBe(TelaChamada)
    expect(filho('chamada/:id').type).toBe(TelaChamada)
    expect(filho('classe').type).toBe(TelaRegistroAula)
    expect(rotasAcessoPublicas).toContain(rotaDoSubstituto)
  })
})

describe('critério 15: depois do fim', () => {
  it('fim sem nada na fila: S6, e os dados locais da substituição somem', async () => {
    guardarAparelho()
    await banco.pacotes.put({ usuarioId: SUBSTITUICAO, vinculoId: SUBSTITUICAO, pacote: criarPacote(), baixadoEm: Date.now() })
    servidor.use(...handlersDoLink({ links: [criarLinkPublico({ estado: 'ENCERRADO', agora: '2026-10-11T16:00:00.000Z' })] }))
    montar()
    expect(await screen.findByRole('heading', { name: 'Este link fechou às 12:00' })).toBeInTheDocument()
    expect(screen.getByText('Ele valia para a chamada da Unidade Águia no domingo, 11 de outubro.')).toBeInTheDocument()
    expect(screen.getByText('Se ainda precisa lançar alguma coisa, peça um novo link ao Adm do clube.')).toBeInTheDocument()
    await waitFor(async () => expect(await banco.pacotes.get([SUBSTITUICAO, SUBSTITUICAO])).toBeUndefined())
    await waitFor(() => expect(localStorage.getItem(chaveDoLink(TOKEN))).toBeNull())
    semAula()
  })

  it('com item na fila e antes do fim do envio: S5 com o progresso numa região viva educada', async () => {
    guardarAparelho()
    await banco.fila.bulkPut([itemNaFila(1), itemNaFila(2)])
    const depoisDoFim = '2026-10-11T16:00:00.000Z'
    servidor.use(
      ...handlersDoLink({
        links: [criarLinkPublico({ estado: 'ENCERRADO', agora: depoisDoFim })],
        entrada: criarEntradaDoLink({}, { segredo: null, agora: depoisDoFim }),
      }),
    )
    montar()
    expect(await screen.findByRole('heading', { name: 'O horário acabou, mas ainda falta enviar' })).toBeInTheDocument()
    expect(screen.getByText('2 lançamentos')).toBeInTheDocument()
    expect(screen.getByText('Deixe esta página aberta. Eles vão sozinhos assim que a internet voltar.')).toBeInTheDocument()
    const progresso = screen.getByRole('status')
    expect(progresso).toHaveAttribute('aria-live', 'polite')
    expect(progresso).toHaveTextContent('Enviando… 1 de 2')
    expect(await itensDaSubstituicao()).toBe(2)
    semAula()
  })

  it('recarregar em S5: reentra com o segredo, sem formulário, o item sobe com a credencial e a tela vai a S6', async () => {
    registrarTipo(tipoFalso)
    guardarAparelho()
    await banco.fila.put({ ...itemNaFila(1), tipo: 'FALSO', payload: { valor: 'x' } })
    const registro = novoRegistroDoLink()
    const autorizacoes: (string | null)[] = []
    const depoisDoFim = '2026-10-11T16:00:00.000Z'
    servidor.use(
      ...handlersDoLink({
        links: [criarLinkPublico({ estado: 'ENCERRADO', agora: depoisDoFim })],
        entrada: criarEntradaDoLink({}, { segredo: null, agora: depoisDoFim }),
        registro,
      }),
      http.put('/api/falso', ({ request }) => {
        autorizacoes.push(request.headers.get('Authorization'))
        return HttpResponse.json({ ok: true })
      }),
    )
    montar()
    await waitFor(() => expect(autorizacoes).toEqual(['Bearer credencial-do-link']))
    expect(registro.entradas).toEqual([{ segredo: SEGREDO }])
    expect(await screen.findByRole('heading', { name: 'Este link fechou às 12:00' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Qual é o seu nome?')).not.toBeInTheDocument()
    expect(screen.queryByText(/Substituindo na/)).not.toBeInTheDocument()
  })

  it('recarregar depois do fim sem nada na fila não reentra', async () => {
    guardarAparelho()
    const registro = novoRegistroDoLink()
    servidor.use(...handlersDoLink({ links: [criarLinkPublico({ estado: 'ENCERRADO', agora: '2026-10-11T16:00:00.000Z' })], registro }))
    montar()
    expect(await screen.findByRole('heading', { name: 'Este link fechou às 12:00' })).toBeInTheDocument()
    expect(registro.entradas).toEqual([])
  })

  it('com item na fila mas depois do fim do envio: S6 e a fila da substituição é apagada', async () => {
    guardarAparelho()
    await banco.fila.bulkPut([itemNaFila(1)])
    servidor.use(...handlersDoLink({ links: [criarLinkPublico({ estado: 'ENCERRADO', agora: '2026-10-12T04:00:00.000Z' })] }))
    montar()
    expect(await screen.findByRole('heading', { name: 'Este link fechou às 12:00' })).toBeInTheDocument()
    await waitFor(async () => expect(await itensDaSubstituicao()).toBe(0))
  })

  it('o horário acaba com a tela aberta: a faixa e a chamada dão lugar a S6 sem recarregar', async () => {
    guardarPacote()
    guardarAparelho()
    const fim = daqui(500)
    servidor.use(
      ...handlersDoLink({
        links: [criarLinkPublico({ identificado: true, agora: daqui(0), fimEm: fim })],
        entrada: criarEntradaDoLink({ fimEm: fim }, { agora: daqui(0) }),
      }),
    )
    montar()
    expect(await screen.findByText(/Substituindo na Unidade Águia/)).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: /Este link fechou às/ }, { timeout: 3000 })).toBeInTheDocument()
    expect(screen.queryByText(/Substituindo na Unidade Águia/)).not.toBeInTheDocument()
    expect(screen.queryByText('Bruno Alves')).not.toBeInTheDocument()
  })

  it('só com item recusado de vez: S6 diz quantos não foram enviados, não reentra e os dados somem', async () => {
    guardarAparelho()
    await banco.fila.bulkPut([{ ...itemNaFila(1), estado: 'ERRO' }])
    const registro = novoRegistroDoLink()
    servidor.use(...handlersDoLink({ links: [criarLinkPublico({ estado: 'ENCERRADO', agora: '2026-10-11T16:00:00.000Z' })], registro }))
    montar()
    expect(await screen.findByRole('heading', { name: 'Este link fechou às 12:00' })).toBeInTheDocument()
    expect(screen.queryByText(/Enviando…/)).not.toBeInTheDocument()
    expect(screen.getByText('1 lançamento feito aqui não foi enviado e não vai mais ser. Avise o Adm.')).toBeInTheDocument()
    await waitFor(async () => expect(await itensDaSubstituicao()).toBe(0))
    expect(screen.getByText('1 lançamento feito aqui não foi enviado e não vai mais ser. Avise o Adm.')).toBeInTheDocument()
    expect(registro.entradas).toEqual([])
  })

  it('na fila e recusado juntos: S5 conta só o que ainda vai subir', async () => {
    guardarAparelho()
    await banco.fila.bulkPut([itemNaFila(1), { ...itemNaFila(2), estado: 'ERRO' }])
    const depoisDoFim = '2026-10-11T16:00:00.000Z'
    servidor.use(
      ...handlersDoLink({
        links: [criarLinkPublico({ estado: 'ENCERRADO', agora: depoisDoFim })],
        entrada: criarEntradaDoLink({}, { segredo: null, agora: depoisDoFim }),
      }),
    )
    montar()
    expect(await screen.findByRole('heading', { name: 'O horário acabou, mas ainda falta enviar' })).toBeInTheDocument()
    expect(screen.getByText('1 lançamento')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Enviando… 1 de 1')
  })

  it('cancelado com lançamentos não enviados: S7 diz quantos, e os dados somem', async () => {
    guardarAparelho()
    await banco.fila.bulkPut([itemNaFila(1), itemNaFila(2)])
    servidor.use(...handlersDoLink({ links: [criarLinkPublico({ estado: 'CANCELADO' })] }))
    montar()
    expect(await screen.findByRole('heading', { name: 'O Adm cancelou este link' })).toBeInTheDocument()
    expect(screen.getByText('Se você ainda vai substituir, peça um novo link ao Adm.')).toBeInTheDocument()
    expect(screen.getByText('2 lançamentos feitos aqui não foram enviados e não vão mais ser. Avise o Adm.')).toBeInTheDocument()
    await waitFor(async () => expect(await itensDaSubstituicao()).toBe(0))
    // Critério 26: o aviso continua depois da limpeza.
    expect(screen.getByText('2 lançamentos feitos aqui não foram enviados e não vão mais ser. Avise o Adm.')).toBeInTheDocument()
    semAula()
  })

  it('cancelado sem nada pendente: S7 sem a contagem', async () => {
    servidor.use(...handlersDoLink({ links: [criarLinkPublico({ estado: 'CANCELADO' })] }))
    montar()
    expect(await screen.findByRole('heading', { name: 'O Adm cancelou este link' })).toBeInTheDocument()
    expect(screen.queryByText(/não foram enviados/)).not.toBeInTheDocument()
  })
})

describe('limpeza ao abrir o link', () => {
  it('os dados de outra substituição já vencida somem; os do link aberto ficam', async () => {
    const vencida = uuid(951)
    registrarSubstituicaoLocal({ id: vencida, fimEnvioEm: '2020-01-01T00:00:00.000Z' })
    registrarSubstituicaoLocal({ id: SUBSTITUICAO, fimEnvioEm: '2999-01-01T00:00:00.000Z' })
    await banco.pacotes.bulkPut([
      { usuarioId: vencida, vinculoId: vencida, pacote: criarPacote(), baixadoEm: Date.now() },
      { usuarioId: SUBSTITUICAO, vinculoId: SUBSTITUICAO, pacote: criarPacote(), baixadoEm: Date.now() },
    ])
    await banco.fila.put({ ...itemNaFila(9), usuarioId: vencida, vinculoId: vencida })
    servidor.use(...handlersDoLink({ links: [criarLinkPublico()] }))
    montar()
    expect(await screen.findByLabelText('Qual é o seu nome?')).toBeInTheDocument()
    await waitFor(async () => expect(await banco.pacotes.get([vencida, vencida])).toBeUndefined())
    expect(await banco.fila.where('[usuarioId+estado]').between([vencida, ''], [vencida, '\uffff']).count()).toBe(0)
    expect(await banco.pacotes.get([SUBSTITUICAO, SUBSTITUICAO])).toBeDefined()
  })
})

describe('horas no fuso do clube', () => {
  it('S1 e a faixa mostram as horas no fuso dado: Manaus uma hora antes de São Paulo', async () => {
    servidor.use(...handlersDoLink({ links: [criarLinkPublico({ estado: 'ANTES', agora: '2026-10-11T11:00:00.000Z', fuso: 'America/Manaus' })] }))
    montar()
    await screen.findByText('Não precisa criar conta nem senha.')
    expect(screen.getByText('08:00')).toBeInTheDocument()
    expect(screen.getByText('11:00')).toBeInTheDocument()
  })

  it('a faixa usa o fuso da identidade', async () => {
    guardarPacote()
    guardarAparelho()
    servidor.use(
      ...handlersDoLink({
        links: [criarLinkPublico({ identificado: true, fuso: 'America/Manaus' })],
        entrada: criarEntradaDoLink({ fuso: 'America/Manaus' }, { segredo: null }),
      }),
    )
    montar()
    expect(await screen.findByText(/Substituindo na Unidade Águia/)).toHaveTextContent('Substituindo na Unidade Águia · aberto até 11:00')
  })
})

describe('falha ao abrir o link', () => {
  it('sem resposta da API mostra o erro com "Tentar de novo"', async () => {
    servidor.use(http.get('/api/auth/substituicao/:token', () => HttpResponse.error()))
    montar()
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })
})

describe('cliente e sessão no modo do link', () => {
  it('a sondagem da volta da conexão reapresenta o segredo do aparelho', async () => {
    guardarPacote()
    guardarAparelho()
    const registro = novoRegistroDoLink()
    servidor.use(...handlersDoLink({ links: [criarLinkPublico({ identificado: true })], entrada: criarEntradaDoLink({}, { segredo: null }), registro }))
    montar()
    await screen.findByText(/Substituindo na Unidade Águia/)
    act(() => void window.dispatchEvent(new Event('online')))
    await waitFor(() => expect(registro.segredosLidos).toHaveLength(2))
    expect(registro.segredosLidos[1]).toBe(SEGREDO)
  })

  it('403 VINCULO_INATIVO com a credencial do link não leva a /papel', async () => {
    const navegar = vi.fn()
    configurarCliente({ navegar })
    entrarNoModoSubstituicao('credencial-do-link', () => undefined)
    servidor.use(http.get('/api/qualquer', () => HttpResponse.json({ codigo: 'VINCULO_INATIVO', mensagem: 'Sem vínculo' }, { status: 403 })))
    await expect(requisitar('/api/qualquer', z.object({}))).rejects.toMatchObject({ status: 403 })
    expect(navegar).not.toHaveBeenCalled()
  })
})
