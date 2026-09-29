import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { hojeDoClube } from '../../../api/desbravadores'
import type { EstadoFila, ItemFilaNaTela, ModoConexao, PayloadReuniao } from '../../../offline'
import { criarResumo, handlerErroGrade, handlerErroReunioes, handlerGrade, handlerReunioes, criarGrade } from '../../../testes/handlers/reunioes'
import { criarVinculo, handlersSessao, uuid } from '../../../testes/handlers/sessao'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { rotasReunioes } from '../rotas'

const estado = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao, itens: [] as ItemFilaNaTela[] }))

vi.mock('../../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../../offline')>()),
  useConexao: () => ({ modo: estado.modo }),
  useFila: (): EstadoFila => ({
    itens: estado.itens,
    contagem: { pendentes: 0, erros: 0 },
    avisos: { pausadaPorSessao: false, poucoEspaco: false, descartadosDeOutraPessoa: 0, instalarNaTelaInicial: false },
    tentarAgora: () => undefined,
    tentarDeNovo: () => Promise.resolve(),
    descartar: () => Promise.resolve(),
    dependentes: () => [],
  }),
}))

const AGUIAS = { id: uuid(201), nome: 'Águias' }
const LEOES = { id: uuid(202), nome: 'Leões' }
const mesAtual = hojeDoClube().slice(0, 7)
const diaDoMes = (dia: string) => `${mesAtual}-${dia}`

function entrarComo(unidades: { id: string; nome: string }[]) {
  servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO', 1, { unidades })]))
}

function itemDaFila(unidadeId: string, data: string, linhas: PayloadReuniao['corpo']['linhas'], id = 'fila-1'): ItemFilaNaTela {
  const payload: PayloadReuniao = {
    reuniaoId: uuid(700),
    correcao: false,
    unidadeNome: 'Águias',
    corpo: { versaoPayload: 1, envioId: uuid(701), unidadeId, data, feitaNoAparelhoEm: `${data}T12:00:00.000Z`, cabecalho: null, linhas },
  }
  return {
    id,
    versaoPayload: 1,
    usuarioId: uuid(500),
    vinculoId: uuid(1),
    tipo: 'REUNIAO',
    chave: `${unidadeId}:${data}`,
    rotulo: 'Chamada',
    detalhe: 'Águias',
    payload,
    estado: 'NA_FILA',
    progresso: 0,
    tentativas: 0,
    proximaTentativaEm: null,
    criadoEm: 1,
    atualizadoEm: 1,
    esperandoDependencia: false,
  }
}

const linha = (n: number, situacao: 'PRESENTE' | 'ATRASADO' | 'FALTA', uniforme = false) => ({
  dbvId: uuid(n), situacao, uniforme, biblia: false, licao: false, versaoVista: null,
})

const abrir = () => renderizarRotas(rotasReunioes, '/reunioes')

beforeEach(() => {
  estado.modo = 'ONLINE'
  estado.itens = []
})

describe('Histórico de reuniões', () => {
  it('lista as reuniões do mês com números e link para o detalhe', async () => {
    entrarComo([AGUIAS])
    servidor.use(handlerReunioes({ [mesAtual]: [criarResumo({ id: uuid(610), data: diaDoMes('20') })] }))
    abrir()
    const link = await screen.findByRole('link', { name: /7\/8 presentes/ })
    expect(link).toHaveAttribute('href', `/reunioes/${uuid(610)}`)
    expect(within(link).getByText('88%')).toBeInTheDocument()
    expect(within(link).getByText('1 atraso')).toBeInTheDocument()
    expect(within(link).getByText('6 uniforme')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Nova/ })).toHaveAttribute('href', '/reunioes/nova')
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })

  it('pinta de vermelho a frequência abaixo do limiar e não a que está acima', async () => {
    entrarComo([AGUIAS])
    servidor.use(
      handlerReunioes({
        [mesAtual]: [
          criarResumo({ id: uuid(611), data: diaDoMes('20'), percentual: 50 }),
          criarResumo({ id: uuid(612), data: diaDoMes('13'), percentual: 90 }),
        ],
      }),
    )
    abrir()
    expect(await screen.findByText('50%')).toHaveClass('text-perigo')
    expect(screen.getByText('90%')).not.toHaveClass('text-perigo')
  })

  it('mescla a fila: item com par no servidor leva "não enviado" e mantém os números do servidor', async () => {
    entrarComo([AGUIAS])
    estado.itens = [itemDaFila(AGUIAS.id, diaDoMes('20'), [linha(301, 'PRESENTE')])]
    servidor.use(handlerReunioes({ [mesAtual]: [criarResumo({ id: uuid(610), data: diaDoMes('20') })] }))
    abrir()
    const link = await screen.findByRole('link', { name: /7\/8 presentes/ })
    expect(within(link).getByText('não enviado')).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
  })

  it('mescla a fila: item sem par no servidor aparece com os números do payload', async () => {
    entrarComo([AGUIAS])
    estado.itens = [itemDaFila(AGUIAS.id, diaDoMes('27'), [linha(301, 'PRESENTE', true), linha(302, 'ATRASADO'), linha(303, 'FALTA'), linha(304, 'PRESENTE')])]
    servidor.use(handlerReunioes({ [mesAtual]: [criarResumo({ id: uuid(610), data: diaDoMes('20') })] }))
    abrir()
    const itens = await screen.findAllByRole('listitem')
    expect(itens).toHaveLength(2)
    expect(within(itens[0]).getByText('3/4 presentes')).toBeInTheDocument()
    expect(within(itens[0]).getByText('1 atraso')).toBeInTheDocument()
    expect(within(itens[0]).getByText('1 uniforme')).toBeInTheDocument()
    expect(within(itens[0]).getByText('75%')).toBeInTheDocument()
    expect(within(itens[0]).getByText('não enviado')).toBeInTheDocument()
    expect(within(itens[1]).queryByText('não enviado')).not.toBeInTheDocument()
  })

  it('ignora da fila o que já foi enviado, o que é de outra unidade e o que é de outro mês', async () => {
    entrarComo([AGUIAS])
    const enviado = { ...itemDaFila(AGUIAS.id, diaDoMes('27'), [linha(301, 'PRESENTE')], 'a'), estado: 'ENVIADO' as const }
    const outraUnidade = itemDaFila(LEOES.id, diaDoMes('27'), [linha(301, 'PRESENTE')], 'b')
    const outroMes = itemDaFila(AGUIAS.id, '2020-01-05', [linha(301, 'PRESENTE')], 'c')
    estado.itens = [enviado, outraUnidade, outroMes]
    servidor.use(handlerReunioes({}))
    abrir()
    expect(await screen.findByText('Nenhuma chamada ainda.')).toBeInTheDocument()
  })

  it('setas trocam o mês e refazem a consulta; o mês corrente não avança', async () => {
    entrarComo([AGUIAS])
    const consultas: { unidadeId: string; mes: string }[] = []
    servidor.use(handlerReunioes({}, consultas))
    abrir()
    await screen.findByText('Nenhuma chamada ainda.')
    expect(screen.getByRole('button', { name: 'Próximo mês' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }))
    await screen.findByText('Nenhuma chamada ainda.')
    expect(consultas.map((c) => c.mes)).toContain(mesAtual)
    expect(consultas.at(-1)?.mes).not.toBe(mesAtual)
    expect(screen.getByRole('button', { name: 'Próximo mês' })).toBeEnabled()
  })

  it('estado vazio oferece a primeira chamada', async () => {
    entrarComo([AGUIAS])
    servidor.use(handlerReunioes({}))
    abrir()
    expect(await screen.findByText('Nenhuma chamada ainda.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Fazer a primeira chamada' })).toHaveAttribute('href', '/reunioes/nova')
  })

  it('mostra o esqueleto enquanto carrega', async () => {
    entrarComo([AGUIAS])
    servidor.use(http.get('/api/reunioes', () => new Promise<Response>(() => undefined)))
    abrir()
    expect(await screen.findByRole('status', { name: 'Carregando reuniões' })).toBeInTheDocument()
  })

  it('erro da API mostra a mensagem e "Tentar de novo" refaz a consulta', async () => {
    entrarComo([AGUIAS])
    servidor.use(handlerErroReunioes(500, { codigo: 'ERRO_INTERNO', mensagem: 'Deu ruim no servidor' }))
    abrir()
    expect(await screen.findByRole('alert')).toHaveTextContent('Deu ruim no servidor')
    servidor.use(handlerReunioes({ [mesAtual]: [criarResumo({ id: uuid(610), data: diaDoMes('20') })] }))
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('link', { name: /7\/8 presentes/ })).toBeInTheDocument()
  })

  it('sem conexão e sem dado mostra "Disponível quando houver internet" e a faixa', async () => {
    estado.modo = 'SEM_CONEXAO'
    entrarComo([AGUIAS])
    servidor.use(http.get('/api/reunioes', () => HttpResponse.error()))
    abrir()
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
    expect(screen.getByText(/Sem conexão/)).toBeInTheDocument()
  })

  it('sem conexão ainda mostra as chamadas da fila', async () => {
    estado.modo = 'SEM_CONEXAO'
    entrarComo([AGUIAS])
    estado.itens = [itemDaFila(AGUIAS.id, diaDoMes('27'), [linha(301, 'PRESENTE')])]
    servidor.use(http.get('/api/reunioes', () => HttpResponse.error()))
    abrir()
    expect(await screen.findByText('1/1 presentes')).toBeInTheDocument()
    expect(screen.getByText('não enviado')).toBeInTheDocument()
  })

  it('com duas unidades mostra o seletor e consulta a unidade escolhida', async () => {
    entrarComo([LEOES, AGUIAS])
    const consultas: { unidadeId: string; mes: string }[] = []
    servidor.use(handlerReunioes({}, consultas))
    abrir()
    const seletor = await screen.findByRole('combobox', { name: 'Unidade' })
    expect(seletor).toHaveValue(AGUIAS.id)
    await screen.findByText('Nenhuma chamada ainda.')
    await userEvent.selectOptions(seletor, LEOES.id)
    await vi.waitFor(() => expect(consultas.at(-1)?.unidadeId).toBe(LEOES.id))
  })

  it('aba "Por DBV" mostra a grade das últimas reuniões com percentual e marcas', async () => {
    entrarComo([AGUIAS])
    servidor.use(handlerReunioes({}), handlerGrade(criarGrade()))
    abrir()
    await userEvent.click(await screen.findByRole('tab', { name: 'Por DBV' }))
    expect(await screen.findByText('Últimas 8 reuniões')).toBeInTheDocument()
    const linhaPedro = screen.getByText('Pedro Lima').closest('li')
    expect(linhaPedro).not.toBeNull()
    if (!linhaPedro) return
    expect(within(linhaPedro).getByText('50%')).toHaveClass('text-perigo')
    expect(within(linhaPedro).getByText('falta')).toBeInTheDocument()
    expect(within(linhaPedro).getByText('sem registro')).toBeInTheDocument()
    const linhaAna = screen.getByText('Ana Clara Souza').closest('li')
    expect(linhaAna && within(linhaAna).getByText('atraso')).toBeTruthy()
  })

  it('aba "Por DBV" sem reuniões mostra o vazio', async () => {
    entrarComo([AGUIAS])
    servidor.use(handlerReunioes({}), handlerGrade(criarGrade({ reunioes: [], linhas: [] })))
    abrir()
    await userEvent.click(await screen.findByRole('tab', { name: 'Por DBV' }))
    expect(await screen.findByRole('link', { name: 'Fazer a primeira chamada' })).toBeInTheDocument()
  })

  it('aba "Por DBV" mostra o erro da API e tenta de novo', async () => {
    entrarComo([AGUIAS])
    servidor.use(handlerReunioes({}), handlerErroGrade(500, { codigo: 'ERRO_INTERNO', mensagem: 'Grade fora do ar' }))
    abrir()
    await userEvent.click(await screen.findByRole('tab', { name: 'Por DBV' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Grade fora do ar')
    servidor.use(handlerGrade(criarGrade()))
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Pedro Lima')).toBeInTheDocument()
  })

  it('sem unidade no vínculo avisa em vez de tela em branco', async () => {
    entrarComo([])
    abrir()
    expect(await screen.findByText('Você ainda não tem unidade')).toBeInTheDocument()
  })
})
