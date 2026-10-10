import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import type { RequestHandler } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RouteObject } from 'react-router-dom'
import type { ModoConexao } from '../../../offline'
import {
  EDICAO_CB_ID,
  GRUPO_DANIEL_ID,
  GRUPO_ESTER_ID,
  UNIDADES_CB,
  criarEdicaoCB,
  criarEdicaoResumo,
  criarEdicoes,
  criarGrupos,
  criarPainel,
  handlersClasseBiblica,
} from '../../../testes/handlers/classe-biblica'
import type { DadosClasseBiblica } from '../../../testes/handlers/classe-biblica'
import { criarVinculo, handlersSessao, uuid } from '../../../testes/handlers/sessao'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { EdicaoPronta } from './EdicaoPronta'
import { EtapaDados } from './EtapaDados'
import { EtapaDatas } from './EtapaDatas'
import { EtapaGrupos } from './EtapaGrupos'
import { ListaEdicoes } from './ListaEdicoes'

const conexao = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao, fuso: undefined as string | undefined }))

vi.mock('../../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../../offline')>()),
  useConexao: () => ({ modo: conexao.modo }),
  usePacote: () => ({ pacote: conexao.fuso ? { clube: { fuso: conexao.fuso } } : undefined }),
}))

beforeEach(() => {
  conexao.modo = 'ONLINE'
  conexao.fuso = undefined
})

interface Gravacao { metodo: string; caminho: string; corpo: unknown }

const RASCUNHO = criarEdicaoCB({
  nome: 'Classe Bíblica 2027 · 1º semestre', inicio: '2027-03-07', fim: '2027-06-27',
  etapa: 2, situacao: 'NAO_TERMINADA', terminadaEm: null,
})

const ROTAS: RouteObject[] = [
  { path: '/adm/classe-biblica', element: <ListaEdicoes /> },
  { path: '/adm/classe-biblica/nova', element: <EtapaDados /> },
  { path: '/adm/classe-biblica/:id/etapa/1', element: <EtapaDados /> },
  { path: '/adm/classe-biblica/:id/etapa/2', element: <EtapaGrupos /> },
  { path: '/adm/classe-biblica/:id/etapa/3', element: <EtapaDatas /> },
  { path: '/adm/classe-biblica/:id/pronta', element: <EdicaoPronta /> },
  { path: '/adm/classe-biblica/:id', element: <h1>Painel da edição</h1> },
]

function abrir(rota: string, dados: DadosClasseBiblica = {}, ...extras: RequestHandler[]) {
  const gravacoes: Gravacao[] = []
  servidor.use(
    ...handlersSessao([criarVinculo('ADM')], undefined, ['classebiblica.gerenciar']),
    ...handlersClasseBiblica({ edicao: RASCUNHO, ...dados, aoGravar: (metodo, caminho, corpo) => gravacoes.push({ metodo, caminho, corpo }) }),
  )
  servidor.use(...extras)
  return { ...renderizarRotas(ROTAS, rota), gravacoes }
}

const grupo = (nome: string) => within(screen.getByRole('region', { name: nome }))

describe('Lista de edições', () => {
  it('1 · sem unidade mostra o bloqueio com o caminho para cadastrar', async () => {
    abrir('/adm/classe-biblica', { edicoes: criarEdicoes({ edicoes: [], unidades: 0 }) })
    expect(await screen.findByRole('heading', { name: 'Antes, cadastre as unidades' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cadastrar unidade' })).toHaveAttribute('href', '/adm/unidades')
    expect(screen.queryByRole('link', { name: 'Criar a primeira edição' })).not.toBeInTheDocument()
  })

  it('2 · com unidades e sem edição ensina e leva a criar a primeira', async () => {
    abrir('/adm/classe-biblica', { edicoes: criarEdicoes({ edicoes: [] }) })
    expect(await screen.findByRole('heading', { name: 'Nenhuma edição da Classe Bíblica ainda' })).toBeInTheDocument()
    expect(screen.getByText('6 unidades cadastradas')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Criar a primeira edição' })).toHaveAttribute('href', '/adm/classe-biblica/nova')
  })

  it('5 e 8 · a não terminada diz onde parou; a terminada sem material está em andamento', async () => {
    abrir('/adm/classe-biblica')
    const naoTerminada = within(await screen.findByRole('region', { name: 'Classe Bíblica 2027 · 1º semestre' }))
    expect(naoTerminada.getByText('Não terminada')).toBeInTheDocument()
    expect(naoTerminada.getByText('Parou na etapa 2 de 3 — Grupos.')).toBeInTheDocument()
    expect(naoTerminada.getByRole('link', { name: 'Continuar de onde parou' })).toHaveAttribute('href', `/adm/classe-biblica/${criarEdicoes().edicoes[0].id}/etapa/2`)
    const emAndamento = within(screen.getByRole('link', { name: /Classe Bíblica 2026 · 2º semestre/ }))
    expect(emAndamento.getByText('Em andamento')).toBeInTheDocument()
    expect(emAndamento.getByText('8 de 17 encontros feitos · próximo: domingo 11/10, 14h')).toBeInTheDocument()
    expect(screen.getByText('16 encontros · 78% de presença')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Nova edição' })).toHaveAttribute('href', '/adm/classe-biblica/nova')
  })

  it('o voltar leva ao Início, como no modelo', async () => {
    abrir('/adm/classe-biblica')
    expect(await screen.findByRole('link', { name: 'Voltar para Início' })).toHaveAttribute('href', '/inicio')
    expect(screen.getByRole('heading', { level: 1, name: 'Classe Bíblica' })).toBeInTheDocument()
  })

  it('carregando', async () => {
    abrir('/adm/classe-biblica')
    expect(screen.getByRole('status', { name: 'Carregando as edições' })).toBeInTheDocument()
    await screen.findByText('Não terminada')
  })

  it('erro mostra a mensagem e o "Tentar de novo"', async () => {
    abrir('/adm/classe-biblica', {}, http.get('/api/classe-biblica/edicoes', () => HttpResponse.json({ codigo: 'ERRO_INTERNO', mensagem: 'Falhou aqui.' }, { status: 500 })))
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('sem conexão mostra que a tela depende da internet', async () => {
    conexao.modo = 'SEM_CONEXAO'
    abrir('/adm/classe-biblica', {}, http.get('/api/classe-biblica/edicoes', () => HttpResponse.error()))
    await waitFor(() => expect(screen.getByText('Disponível quando houver internet')).toBeInTheDocument())
  })
})

describe('Etapa 1 — dados', () => {
  it('3 · edição nova vem com dia e local do clube, horário vazio e o fim visível', async () => {
    const { gravacoes } = abrir('/adm/classe-biblica/nova')
    expect(await screen.findByText('Etapa 1 de 3 — Dados da edição · depois: Grupos e Datas')).toBeInTheDocument()
    expect(screen.getByText(/Leva uns 5 minutos/)).toBeInTheDocument()
    expect(await screen.findByLabelText('Dia da semana')).toHaveValue('0')
    expect(screen.getByLabelText('Local')).toHaveValue('Sala 3 da igreja')
    expect(screen.getByLabelText('Horário')).toHaveValue('')
    expect(gravacoes).toHaveLength(0)
  })

  it('4 · fim antes do início mostra o erro junto do campo, sem limpar nada', async () => {
    const usuario = userEvent.setup()
    abrir('/adm/classe-biblica/nova')
    const inicio = await screen.findByLabelText('Início')
    fireEvent.change(inicio, { target: { value: '2027-03-07' } })
    fireEvent.blur(inicio)
    const fim = screen.getByLabelText('Fim')
    fireEvent.change(fim, { target: { value: '2027-03-01' } })
    fireEvent.blur(fim)
    expect(await screen.findByText('O fim precisa ser depois do início (07/03/2027)')).toBeInTheDocument()
    expect(fim).toHaveAttribute('aria-invalid', 'true')
    expect(inicio).toHaveValue('2027-03-07')
    expect(fim).toHaveValue('2027-03-01')
    await usuario.click(screen.getByLabelText('Nome da edição'))
  })

  it('5 · sair do nome cria o rascunho uma vez e avisa "Salvo às" sem roubar o foco', async () => {
    const usuario = userEvent.setup()
    const { gravacoes } = abrir('/adm/classe-biblica/nova')
    await usuario.type(await screen.findByLabelText('Nome da edição'), 'Classe Bíblica 2027 · 1º semestre')
    await usuario.tab()
    const aviso = await screen.findByText('Salvo às 15:42. Pode sair e continuar depois de onde parou.')
    expect(aviso).toHaveAttribute('aria-live', 'polite')
    expect(screen.getByLabelText('Início')).toHaveFocus()
    expect(gravacoes).toHaveLength(1)
    expect(gravacoes[0]).toMatchObject({
      metodo: 'POST', caminho: '/api/classe-biblica/edicoes',
      corpo: { nome: 'Classe Bíblica 2027 · 1º semestre', diaSemana: 0, local: 'Sala 3 da igreja', etapa: 1 },
    })
    await usuario.click(screen.getByLabelText('Local'))
    await usuario.tab()
    expect(gravacoes).toHaveLength(1)
  })

  it('5 · reabrir o rascunho traz o nome preenchido, e o próximo campo salva por PATCH', async () => {
    const usuario = userEvent.setup()
    const { gravacoes } = abrir(`/adm/classe-biblica/${EDICAO_CB_ID}/etapa/1`, { edicao: { ...RASCUNHO, horario: null } })
    expect(await screen.findByLabelText('Nome da edição')).toHaveValue('Classe Bíblica 2027 · 1º semestre')
    await usuario.type(screen.getByLabelText('Horário'), '14:00')
    await usuario.tab()
    await waitFor(() => expect(gravacoes).toHaveLength(1))
    expect(gravacoes[0]).toMatchObject({ metodo: 'PATCH', caminho: `/api/classe-biblica/edicoes/${EDICAO_CB_ID}`, corpo: { horario: '14:00' } })
  })

  it('D11 · sem conexão avisa que não fica salvo e não envia', async () => {
    const usuario = userEvent.setup()
    conexao.modo = 'SEM_CONEXAO'
    const { gravacoes } = abrir(`/adm/classe-biblica/${EDICAO_CB_ID}/etapa/1`)
    const nome = await screen.findByLabelText('Nome da edição')
    await usuario.type(nome, ' bis')
    await usuario.tab()
    expect(await screen.findByText('Sem internet: o que você preencher agora não fica salvo.')).toHaveAttribute('aria-live', 'polite')
    expect(gravacoes).toHaveLength(0)
  })

  it('D18 · continuar cobra os obrigatórios; preenchido, segue para os grupos', async () => {
    const usuario = userEvent.setup()
    const { gravacoes } = abrir(`/adm/classe-biblica/${EDICAO_CB_ID}/etapa/1`, { edicao: { ...RASCUNHO, horario: null, local: null, etapa: 1 } })
    await usuario.click(await screen.findByRole('button', { name: 'Continuar para os grupos' }))
    expect(await screen.findByText('Falta o horário')).toBeInTheDocument()
    expect(screen.getByText('Revise 1 campo para salvar')).toBeInTheDocument()
    expect(gravacoes).toHaveLength(0)
    await usuario.type(screen.getByLabelText('Horário'), '14:00')
    await usuario.click(screen.getByRole('button', { name: 'Continuar para os grupos' }))
    expect(await screen.findByRole('heading', { name: 'Grupos' })).toBeInTheDocument()
    expect(gravacoes.at(-1)).toMatchObject({ metodo: 'PATCH', corpo: { etapa: 2 } })
  })
})

describe('Etapa 1 — edição terminada (13, D14)', () => {
  it('início, fim e dia ficam desabilitados e não vão no PATCH; horário continua editável', async () => {
    const usuario = userEvent.setup()
    const terminada = criarEdicaoCB({ horario: null })
    const { gravacoes } = abrir(`/adm/classe-biblica/${EDICAO_CB_ID}/etapa/1`, { edicao: terminada })
    expect(await screen.findByLabelText('Início')).toBeDisabled()
    expect(screen.getByLabelText('Fim')).toBeDisabled()
    expect(screen.getByLabelText('Dia da semana')).toBeDisabled()
    expect(screen.getByLabelText('Nome da edição')).toBeEnabled()
    expect(screen.getByLabelText('Local')).toBeEnabled()
    await usuario.type(screen.getByLabelText('Horário'), '15:00')
    await usuario.click(screen.getByRole('button', { name: 'Continuar para os grupos' }))
    await screen.findByRole('heading', { name: 'Grupos' })
    const corpos = gravacoes.filter((g) => g.metodo === 'PATCH').map((g) => g.corpo as Record<string, unknown>)
    expect(corpos.some((corpo) => corpo.horario === '15:00')).toBe(true)
    for (const corpo of corpos) {
      expect(corpo).not.toHaveProperty('inicio')
      expect(corpo).not.toHaveProperty('fim')
      expect(corpo).not.toHaveProperty('diaSemana')
    }
  })
})

describe('Etapa 2 — grupos', () => {
  it('12 · o indicador diz a etapa 2 de 3', async () => {
    abrir(`/adm/classe-biblica/${EDICAO_CB_ID}/etapa/2`)
    const barra = await screen.findByRole('progressbar')
    expect(barra).toHaveAttribute('aria-valuetext', 'Etapa 2 de 3 — Grupos')
    expect(barra.children).toHaveLength(3)
    expect(screen.getByText('Etapa 2 de 3 — Grupos · depois: Datas')).toBeInTheDocument()
  })

  it('6 · unidade de um grupo fica desabilitada no outro com "no <grupo>"; soltar libera e grava', async () => {
    const usuario = userEvent.setup()
    const { gravacoes } = abrir(`/adm/classe-biblica/${EDICAO_CB_ID}/etapa/2`)
    const aguiasNoEster = await waitFor(() => grupo('Grupo 2').getByRole('checkbox', { name: /^Águias/ }))
    expect(aguiasNoEster).toBeDisabled()
    expect(aguiasNoEster).toHaveAccessibleName('Águias · no Grupo Daniel')
    await usuario.click(grupo('Grupo 1').getByRole('checkbox', { name: /^Águias/ }))
    expect(grupo('Grupo 2').getByRole('checkbox', { name: /^Águias/ })).toBeEnabled()
    await waitFor(() => expect(gravacoes.some((g) => g.metodo === 'PUT')).toBe(true))
    const corpo = gravacoes.find((g) => g.metodo === 'PUT')?.corpo as { grupos: { unidadeIds: string[] }[] }
    expect(corpo.grupos[0].unidadeIds).not.toContain(UNIDADES_CB.aguias.id)
    expect(screen.getByText(/5 de 6 unidades estão em um grupo|4 de 6 unidades estão em um grupo/)).toBeInTheDocument()
  })

  it('14 · grupo com chamada não oferece "Tirar este grupo"; sem chamada, oferece', async () => {
    const base = criarGrupos()
    const comChamada = { ...base, grupos: base.grupos.map((g, i) => (i === 1 ? { ...g, temChamada: true } : g)) }
    const { unmount } = abrir(`/adm/classe-biblica/${EDICAO_CB_ID}/etapa/2`, { grupos: comChamada })
    await waitFor(() => grupo('Grupo 2').getByRole('checkbox', { name: /^Falcões/ }))
    expect(grupo('Grupo 2').queryByRole('button', { name: 'Tirar este grupo' })).not.toBeInTheDocument()
    unmount()
    abrir(`/adm/classe-biblica/${EDICAO_CB_ID}/etapa/2`)
    expect(await waitFor(() => grupo('Grupo 2').getByRole('button', { name: 'Tirar este grupo' }))).toBeInTheDocument()
  })

  it('7 · unidade numa edição terminada com período cruzado fica desabilitada com "na <edição>"', async () => {
    const base = criarGrupos()
    const grupos = {
      ...base,
      unidades: base.unidades.map((u) => u.id === UNIDADES_CB.tigres.id
        ? { ...u, ocupadaPor: { tipo: 'EDICAO' as const, nome: 'Classe Bíblica 2026 · 1º semestre', inicio: '2027-03-07', fim: '2027-06-27' } }
        : u),
    }
    abrir(`/adm/classe-biblica/${EDICAO_CB_ID}/etapa/2`, { grupos })
    const tigres = await waitFor(() => grupo('Grupo 1').getByRole('checkbox', { name: /^Tigres/ }))
    expect(tigres).toBeDisabled()
    expect(tigres).toHaveAccessibleName('Tigres · na Classe Bíblica 2026 · 1º semestre')
  })

  it('8 · material: link sem https é recusado; PDF acima de 20 MB também; sem material segue sem aviso', async () => {
    const usuario = userEvent.setup()
    const { gravacoes } = abrir(`/adm/classe-biblica/${EDICAO_CB_ID}/etapa/2`)
    expect(await screen.findByText('Estudo Bíblico Ilustrado — lições 1 a 20')).toBeInTheDocument()
    expect(screen.getByText('PDF enviado · 4,2 MB')).toBeInTheDocument()
    expect(grupo('Grupo 2').getByText(/Se ainda não tiver, pode anexar depois, na página da edição./)).toBeInTheDocument()

    await usuario.click(grupo('Grupo 2').getByRole('button', { name: 'Colar um link' }))
    await usuario.type(grupo('Grupo 2').getByLabelText('Nome do material'), 'Lições do Ester')
    await usuario.type(grupo('Grupo 2').getByLabelText('Link'), 'http://exemplo.org/licoes')
    await usuario.click(grupo('Grupo 2').getByRole('button', { name: 'Anexar o link' }))
    expect(await grupo('Grupo 2').findByText('Use um link https://')).toBeInTheDocument()
    expect(gravacoes.filter((g) => g.caminho.includes('material'))).toHaveLength(0)

    const grande = new File(['x'], 'grande.pdf', { type: 'application/pdf' })
    Object.defineProperty(grande, 'size', { value: 21 * 1024 * 1024 })
    await usuario.upload(grupo('Grupo 2').getByLabelText('Enviar PDF'), grande)
    expect(await grupo('Grupo 2').findByText('O PDF passa de 20 MB')).toBeInTheDocument()
    expect(gravacoes.filter((g) => g.caminho.includes('material'))).toHaveLength(0)

    await usuario.click(screen.getByRole('button', { name: 'Continuar para as datas' }))
    expect(await screen.findByRole('heading', { name: 'Datas dos encontros' })).toBeInTheDocument()
    expect(gravacoes.at(-1)).toMatchObject({ metodo: 'PATCH', corpo: { etapa: 3 } })
  })

  it('8 · link https é anexado ao grupo', async () => {
    const usuario = userEvent.setup()
    const { gravacoes } = abrir(`/adm/classe-biblica/${EDICAO_CB_ID}/etapa/2`)
    await usuario.click(await waitFor(() => grupo('Grupo 2').getByRole('button', { name: 'Colar um link' })))
    await usuario.type(grupo('Grupo 2').getByLabelText('Nome do material'), 'Lições do Ester')
    await usuario.type(grupo('Grupo 2').getByLabelText('Link'), 'https://exemplo.org/licoes')
    await usuario.click(grupo('Grupo 2').getByRole('button', { name: 'Anexar o link' }))
    await waitFor(() => expect(gravacoes.some((g) => g.caminho.endsWith('/material/link'))).toBe(true))
    expect(await grupo('Grupo 2').findByText('Lições do Ester')).toBeInTheDocument()
  })
})

describe('Etapa 3 — datas e terminar', () => {
  it('9 · a data em dia sem reunião vem desmarcada com o motivo; marcá-la soma 1', async () => {
    const usuario = userEvent.setup()
    abrir(`/adm/classe-biblica/${EDICAO_CB_ID}/etapa/3`)
    const pascoa = await screen.findByRole('checkbox', { name: 'domingo 28/03 · não terá · Sem reunião: Páscoa' })
    expect(pascoa).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'domingo 07/03 · 14h' })).toBeChecked()
    expect(screen.getByText('15 encontros vão para o calendário do clube, para os dois grupos. 2 datas ficam de fora.')).toBeInTheDocument()
    await usuario.click(pascoa)
    expect(screen.getByRole('button', { name: 'Criar 16 encontros' })).toBeInTheDocument()
  })

  it('10 e 11 · dois cliques em "Criar 15 encontros" fazem um envio só e abrem o fechamento', async () => {
    const usuario = userEvent.setup()
    const { gravacoes } = abrir(`/adm/classe-biblica/${EDICAO_CB_ID}/etapa/3`, {
      painel: criarPainel({ edicao: { ...RASCUNHO, situacao: 'EM_ANDAMENTO', etapa: 3 } }),
    })
    await usuario.dblClick(await screen.findByRole('button', { name: 'Criar 15 encontros' }))
    expect(await screen.findByRole('heading', { name: 'Classe Bíblica 2027 · 1º semestre criada' })).toBeInTheDocument()
    const envios = gravacoes.filter((g) => g.caminho.endsWith('/terminar'))
    expect(envios).toHaveLength(1)
    expect((envios[0].corpo as { datas: string[] }).datas).toHaveLength(15)
  })

  it('7 · terminar recusado mostra o texto da regra 3 e não sai da etapa', async () => {
    const usuario = userEvent.setup()
    const mensagem = 'A unidade Águias já está na edição Classe Bíblica 2027 · Turma A, de 07/03 a 27/06. Tire-a deste grupo para continuar.'
    abrir(`/adm/classe-biblica/${EDICAO_CB_ID}/etapa/3`, {}, http.post('/api/classe-biblica/edicoes/:id/terminar', () => HttpResponse.json({ codigo: 'CONFLITO', mensagem }, { status: 409 })))
    await usuario.click(await screen.findByRole('button', { name: 'Criar 15 encontros' }))
    expect(await screen.findByText(mensagem)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Datas dos encontros' })).toBeInTheDocument()
  })
})

const EDICOES_COM_A_NOVA = criarEdicoes({ edicoes: [criarEdicaoResumo(1, { nome: RASCUNHO.nome ?? '', encontros: 15, encontrosFeitos: 0 })] })

describe('Edição pronta', () => {
  it('10 · diz o que foi feito, os grupos com e sem material e um único botão', async () => {
    abrir(`/adm/classe-biblica/${EDICAO_CB_ID}/pronta`, { painel: criarPainel({ edicao: { ...RASCUNHO, situacao: 'EM_ANDAMENTO', etapa: 3 } }), edicoes: EDICOES_COM_A_NOVA })
    expect(await screen.findByRole('heading', { name: 'Classe Bíblica 2027 · 1º semestre criada' })).toBeInTheDocument()
    expect(screen.getByText('15 encontros estão no calendário do clube, aos domingos às 14h, na Sala 3 da igreja.')).toBeInTheDocument()
    expect(screen.getByText('Grupo Daniel: Águias, Leões e Gaviões · material enviado')).toBeInTheDocument()
    expect(screen.getByText('Grupo Ester: Falcões e Panteras · ainda sem material')).toBeInTheDocument()
    expect(screen.getByText(/A edição já está valendo sem ele./)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver a edição' })).toHaveAttribute('href', `/adm/classe-biblica/${EDICAO_CB_ID}`)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})

describe('Edição pronta — o texto do modelo', () => {
  it('conta todos os encontros criados, não os do painel; sem local, a frase termina no horário', async () => {
    const painel = criarPainel({ edicao: { ...RASCUNHO, local: null, situacao: 'EM_ANDAMENTO', etapa: 3 } })
    abrir(`/adm/classe-biblica/${EDICAO_CB_ID}/pronta`, { painel, edicoes: EDICOES_COM_A_NOVA })
    expect(await screen.findByText('15 encontros estão no calendário do clube, aos domingos às 14h.')).toBeInTheDocument()
  })
})

const NOVO_GRUPO_ID = uuid(5099)

type CorpoDosGrupos = { grupos: { id?: string; nome: string; unidadeIds: string[] }[] }

/** PUT dos grupos que devolve o que recebeu, com id para o novo; a primeira resposta espera `soltar()`. */
function putQueEspera() {
  const corpos: CorpoDosGrupos[] = []
  let soltar = () => {}
  const segurada = new Promise<void>((resolver) => { soltar = resolver })
  const handler = http.put('/api/classe-biblica/edicoes/:id/grupos', async ({ request }) => {
    const corpo = (await request.json()) as CorpoDosGrupos
    corpos.push(corpo)
    if (corpos.length === 1) await segurada
    return HttpResponse.json({
      ...criarGrupos(),
      grupos: corpo.grupos.map((g, ordem) => ({ id: g.id ?? NOVO_GRUPO_ID, nome: g.nome, ordem, unidadeIds: g.unidadeIds, temChamada: false, material: null })),
    })
  })
  return { corpos, handler, soltar: () => soltar() }
}

describe('Etapa 2 — gravação dos grupos', () => {
  it('"Continuar para as datas" para quando a gravação dos grupos foi recusada, com o erro à vista', async () => {
    const usuario = userEvent.setup()
    const mensagem = 'A unidade Tigres já está na edição Classe Bíblica 2027 · Turma A, de 07/03 a 27/06. Tire-a deste grupo para continuar.'
    const { gravacoes } = abrir(
      `/adm/classe-biblica/${EDICAO_CB_ID}/etapa/2`, {},
      http.put('/api/classe-biblica/edicoes/:id/grupos', () => HttpResponse.json({ codigo: 'CONFLITO', mensagem }, { status: 409 })),
    )
    await usuario.click(await waitFor(() => grupo('Grupo 2').getByRole('checkbox', { name: /^Tigres/ })))
    await usuario.click(screen.getByRole('button', { name: 'Continuar para as datas' }))
    expect(await screen.findByText(mensagem)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Grupos' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Datas dos encontros' })).not.toBeInTheDocument()
    expect(gravacoes.some((g) => g.metodo === 'PATCH')).toBe(false)
  })

  it('grupo novo só grava com nome, e ganha o id dele mesmo se outro grupo sair no meio do envio', async () => {
    const usuario = userEvent.setup()
    const put = putQueEspera()
    abrir(`/adm/classe-biblica/${EDICAO_CB_ID}/etapa/2`, {}, put.handler)
    await usuario.click(await screen.findByRole('button', { name: 'Adicionar outro grupo' }))
    await usuario.type(grupo('Grupo 3').getByLabelText('Nome do grupo'), 'Grupo Rute')
    await usuario.tab()
    await waitFor(() => expect(put.corpos).toHaveLength(1))
    expect(put.corpos[0].grupos.map((g) => g.nome)).toEqual(['Grupo Daniel', 'Grupo Ester', 'Grupo Rute'])

    await usuario.click(grupo('Grupo 2').getByRole('button', { name: 'Tirar este grupo' }))
    put.soltar()
    await waitFor(() => expect(put.corpos).toHaveLength(2))
    expect(put.corpos[1].grupos).toEqual([
      { id: GRUPO_DANIEL_ID, nome: 'Grupo Daniel', unidadeIds: expect.any(Array) as unknown },
      { id: NOVO_GRUPO_ID, nome: 'Grupo Rute', unidadeIds: [] },
    ])
    expect(put.corpos[1].grupos.some((g) => g.id === GRUPO_ESTER_ID)).toBe(false)
  })

  it('gravar os grupos invalida o painel da edição, para o "voltar à edição" não mostrar nomes antigos', async () => {
    const usuario = userEvent.setup()
    let leiturasDoPainel = 0
    abrir(`/adm/classe-biblica/${EDICAO_CB_ID}/etapa/2`, {}, http.get('/api/classe-biblica/edicoes/:id', () => {
      leiturasDoPainel += 1
      return HttpResponse.json(criarPainel({ edicao: RASCUNHO }))
    }))
    await usuario.click(await waitFor(() => grupo('Grupo 2').getByRole('checkbox', { name: /^Tigres/ })))
    await waitFor(() => expect(leiturasDoPainel).toBe(2))
  })

  it('o título de cada grupo leva o total de DBVs das unidades marcadas', async () => {
    abrir(`/adm/classe-biblica/${EDICAO_CB_ID}/etapa/2`)
    expect(await waitFor(() => grupo('Grupo 1').getByText('31 DBVs'))).toBeInTheDocument()
    expect(grupo('Grupo 2').getByText('19 DBVs')).toBeInTheDocument()
  })

  it('sem conexão, o material do grupo fica desabilitado com o aviso', async () => {
    conexao.modo = 'SEM_CONEXAO'
    abrir(`/adm/classe-biblica/${EDICAO_CB_ID}/etapa/2`)
    const colar = await waitFor(() => grupo('Grupo 2').getByRole('button', { name: 'Colar um link' }))
    expect(colar).toBeDisabled()
    expect(grupo('Grupo 2').getByLabelText('Enviar PDF')).toBeDisabled()
    expect(grupo('Grupo 2').getByText('Sem internet: o material só vai com conexão.')).toBeInTheDocument()
  })
})

describe('Editar uma edição terminada (D14)', () => {
  it('a etapa 1 diz "Editar a edição"; o rascunho continua "Nova edição"', async () => {
    const { unmount } = abrir(`/adm/classe-biblica/${EDICAO_CB_ID}/etapa/1`, { edicao: criarEdicaoCB() })
    expect(await screen.findByText('Editar a edição')).toBeInTheDocument()
    expect(screen.queryByText('Nova edição da Classe Bíblica')).not.toBeInTheDocument()
    unmount()
    abrir(`/adm/classe-biblica/${EDICAO_CB_ID}/etapa/1`)
    expect(await screen.findByText('Nova edição da Classe Bíblica')).toBeInTheDocument()
  })

  it('da etapa 2 o botão salva e volta ao painel, sem passar pelas datas', async () => {
    const usuario = userEvent.setup()
    const { gravacoes } = abrir(`/adm/classe-biblica/${EDICAO_CB_ID}/etapa/2`, { edicao: criarEdicaoCB() })
    expect(await screen.findByText('Editar a edição')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Continuar para as datas' })).not.toBeInTheDocument()
    await usuario.click(await screen.findByRole('button', { name: 'Salvar e voltar à edição' }))
    expect(await screen.findByRole('heading', { name: 'Painel da edição' })).toBeInTheDocument()
    expect(gravacoes.some((g) => g.metodo === 'PATCH')).toBe(false)
  })
})
