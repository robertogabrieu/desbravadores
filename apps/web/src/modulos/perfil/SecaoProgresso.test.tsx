import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModoConexao } from '../../offline'
import { criarClasseBiblicaDoRequisito } from '../../testes/handlers/classe-biblica'
import { handlerPerfil } from '../../testes/handlers/perfil'
import {
  criarProgressoDbv,
  handlerDesmarcarRequisito,
  handlerErroRequisito,
  handlerMarcarRequisito,
  handlerProgressoDbv,
} from '../../testes/handlers/progresso'
import { criarVinculo, handlersSessao } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { rotasPerfil } from './rotas'

const offline = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao }))

vi.mock('../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../offline')>()),
  useConexao: () => ({ modo: offline.modo }),
}))

beforeEach(() => {
  offline.modo = 'ONLINE'
})

const ID = '00000000-0000-4000-8000-000000000201'

function abrir(...handlers: Parameters<typeof servidor.use>) {
  servidor.use(handlerPerfil(), ...handlers, ...handlersSessao([criarVinculo('INSTRUTOR')]))
  return renderizarRotas(rotasPerfil, `/dbv/${ID}`)
}

/** Abre a seção se ela ainda estiver fechada: a primeira incompleta já começa aberta. */
async function abrirSecao(nome: string) {
  const cabecalho = await screen.findByRole('button', { name: new RegExp(nome) })
  if (cabecalho.getAttribute('aria-expanded') !== 'true') await userEvent.click(cabecalho)
}

describe('seção de progresso do perfil', () => {
  it('mostra o anel da regular, o anel menor da avançada recomendada e as seções verde/cinza', async () => {
    abrir(handlerProgressoDbv())
    expect(await screen.findByRole('img', { name: '67% da classe Amigo concluída' })).toBeInTheDocument()
    expect(screen.getByText('2 de 3 requisitos concluídos')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: '0% da avançada Amigo da Natureza concluída' })).toBeInTheDocument()
    expect(screen.getByText('Avançada recomendada')).toBeInTheDocument()
    expect(screen.getByTestId('barra-GE')).toHaveAttribute('data-completa', 'true')
    expect(screen.getByTestId('barra-DE')).toHaveAttribute('data-completa', 'false')
    expect(screen.queryByText('Pronto para investidura')).not.toBeInTheDocument()
  })

  it('em 100% da regular: "Pronto para investidura"', async () => {
    const base = criarProgressoDbv()
    abrir(handlerProgressoDbv({ matriculas: [{ ...base.matriculas[0], percentual: 100, concluidos: 3 }] }))
    expect(await screen.findByText('Pronto para investidura')).toBeInTheDocument()
    expect(screen.queryByText('Avançada recomendada')).not.toBeInTheDocument()
  })

  it('a primeira seção incompleta começa aberta; as outras abrem pelo "Ver requisitos"', async () => {
    abrir(handlerProgressoDbv())
    expect(await screen.findByText('1/1')).toBeInTheDocument()
    const gerais = screen.getByRole('button', { name: /Gerais/ })
    const descoberta = screen.getByRole('button', { name: /Descoberta espiritual/ })
    expect(descoberta).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/Requisito DE\.1/)).toBeInTheDocument()
    expect(screen.getByText('Concluído em 02/04/2020')).toBeInTheDocument()
    expect(screen.getByText('Ainda não concluído')).toBeInTheDocument()
    expect(gerais).toHaveAttribute('aria-expanded', 'false')
    expect(gerais).toHaveTextContent('Ver requisitos')
    expect(screen.queryByRole('list', { name: 'Requisitos de Gerais' })).not.toBeInTheDocument()
    await userEvent.click(gerais)
    expect(screen.getByRole('list', { name: 'Requisitos de Gerais' })).toBeInTheDocument()
  })

  it('tudo concluído: nenhuma seção começa aberta', async () => {
    const base = criarProgressoDbv()
    const [matricula] = base.matriculas
    const secoes = matricula.secoes.map((secao) => ({ ...secao, concluidos: secao.total }))
    abrir(handlerProgressoDbv({ matriculas: [{ ...matricula, secoes }] }))
    const descoberta = await screen.findByRole('button', { name: /Descoberta espiritual/ })
    expect(descoberta).toHaveAttribute('aria-expanded', 'false')
    expect(descoberta).toHaveTextContent('Ver requisitos')
  })

  it('marca o requisito com a data escolhida (limitada ao início do ano do clube e hoje)', async () => {
    const corpos: unknown[] = []
    abrir(handlerProgressoDbv(), handlerMarcarRequisito((c) => corpos.push(c)))
    await abrirSecao('Descoberta espiritual')
    await userEvent.click(screen.getByRole('button', { name: 'Marcar DE.2' }))
    const campo = screen.getByLabelText('Data de conclusão')
    expect(campo).toHaveAttribute('min', '2020-01-01')
    expect(campo).toHaveAttribute('max', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/))
    fireEvent.change(campo, { target: { value: '2020-05-05' } })
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    await vi.waitFor(() => expect(corpos).toEqual([{ concluidoEm: '2020-05-05' }]))
  })

  it('desmarca só depois da confirmação', async () => {
    const chamadas: number[] = []
    abrir(handlerProgressoDbv(), handlerDesmarcarRequisito(() => chamadas.push(1)))
    await abrirSecao('Gerais')
    await userEvent.click(screen.getByRole('button', { name: 'Desmarcar GE.1' }))
    expect(chamadas).toHaveLength(0)
    await userEvent.click(botaoDoDialogo('Cancelar'))
    expect(chamadas).toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'Desmarcar GE.1' }))
    await userEvent.click(botaoDoDialogo('Desmarcar'))
    await vi.waitFor(() => expect(chamadas).toHaveLength(1))
  })

  it('409 mostra "Já concluído em dd/mm." e 422 mostra a mensagem da API', async () => {
    abrir(handlerProgressoDbv(), handlerErroRequisito(409, { codigo: 'CONFLITO', mensagem: 'Já concluído em 02/04.' }))
    await abrirSecao('Descoberta espiritual')
    await userEvent.click(screen.getByRole('button', { name: 'Marcar DE.2' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(await screen.findByText('Já concluído em 02/04.')).toBeInTheDocument()
    servidor.use(handlerErroRequisito(422, { codigo: 'VALIDACAO', mensagem: 'Data fora do ano do clube.' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
    expect(await screen.findByText('Data fora do ano do clube.')).toBeInTheDocument()
  })

  it('quem não pode marcar (conselheiro) vê os requisitos sem controles', async () => {
    abrir(handlerProgressoDbv(criarProgressoDbv(false)))
    await abrirSecao('Descoberta espiritual')
    expect(screen.getByText(/Requisito DE\.2/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Marcar/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Desmarcar/ })).not.toBeInTheDocument()
  })

  it('sem conexão: só a seção pede internet e o resto do perfil segue', async () => {
    offline.modo = 'SEM_CONEXAO'
    abrir()
    expect(await screen.findByRole('heading', { name: 'Ana Clara Souza' })).toBeInTheDocument()
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
  })

  it('erro da API na seção: mensagem e "Tentar de novo"; sem matrícula: estado vazio', async () => {
    abrir(http.get('/api/desbravadores/:id/progresso', () => HttpResponse.json({ codigo: 'ERRO', mensagem: 'Falhou ao ler o progresso.' }, { status: 500 })))
    expect(await screen.findByText(/Não foi possível|Falhou ao ler/)).toBeInTheDocument()
    servidor.use(handlerProgressoDbv({ matriculas: [] }))
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Sem classe neste ano')).toBeInTheDocument()
  })
})

function botaoDoDialogo(nome: string) {
  const dialogo = screen.getByRole('dialog')
  const botao = Array.from(dialogo.querySelectorAll('button')).find((b) => b.textContent === nome)
  if (!botao) throw new Error(`botão ${nome} não está no diálogo`)
  return botao
}

describe('quadro da Classe Bíblica sob o requisito', () => {
  type DoRequisito = ReturnType<typeof criarClasseBiblicaDoRequisito>

  /** DE.1 concluído e DE.2 pendente, cada um com o quadro dado (a seção DE já abre sozinha). */
  function progressoCom(pendente: DoRequisito | null | undefined, concluido?: DoRequisito) {
    const base = criarProgressoDbv()
    const [regular, avancada] = base.matriculas
    const [gerais, descoberta] = regular.secoes
    const [feito, aberto] = descoberta.requisitos
    return {
      matriculas: [
        { ...regular, secoes: [gerais, { ...descoberta, requisitos: [{ ...feito, classeBiblica: concluido }, { ...aberto, classeBiblica: pendente }] }] },
        avancada,
      ],
    }
  }

  const textoDoRequisito = (codigo: string) => {
    const botao = screen.queryByRole('button', { name: `Marcar ${codigo}` }) ?? screen.getByRole('button', { name: `Desmarcar ${codigo}` })
    const linha = botao.closest('li')
    return (linha as HTMLElement).textContent ?? ''
  }

  it('requisito pendente: a edição em destaque, a participação com o grupo e a linha "Antes"', async () => {
    abrir(handlerProgressoDbv(progressoCom(criarClasseBiblicaDoRequisito())))
    expect(await screen.findByText('Classe Bíblica 2026 · 2º semestre: 6 de 8 encontros')).toBeInTheDocument()
    expect(screen.getByText('Participou ativamente em 5 · Grupo Daniel')).toBeInTheDocument()
    expect(screen.getByText('Antes: Classe Bíblica 2026 · 1º semestre — 12 de 16 encontros · participou ativamente em 9')).toBeInTheDocument()
    expect(textoDoRequisito('DE.2')).toContain('Ainda não concluído')
  })

  it('sem edição anterior: sem a linha "Antes"; sem grupo na linha mais recente: só a participação', async () => {
    abrir(handlerProgressoDbv(progressoCom(criarClasseBiblicaDoRequisito({ anteriores: [], grupo: null }))))
    expect(await screen.findByText('Classe Bíblica 2026 · 2º semestre: 6 de 8 encontros')).toBeInTheDocument()
    expect(screen.getByText('Participou ativamente em 5')).toBeInTheDocument()
    expect(screen.queryByText(/^Antes:/)).not.toBeInTheDocument()
  })

  it('unidade fora de qualquer grupo: "<edição>: a unidade dele(a) não está em nenhum grupo", sem números', async () => {
    abrir(handlerProgressoDbv(progressoCom(criarClasseBiblicaDoRequisito({ semGrupo: true, encontros: 0, presencas: 0, participacoes: 0, grupo: null, anteriores: [] }))))
    expect(await screen.findByText('Classe Bíblica 2026 · 2º semestre: a unidade dele(a) não está em nenhum grupo')).toBeInTheDocument()
    expect(screen.queryByText(/encontros$/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Participou ativamente em/)).not.toBeInTheDocument()
  })

  it('requisito concluído também mostra o quadro, abaixo de "Concluído em"', async () => {
    abrir(handlerProgressoDbv(progressoCom(undefined, criarClasseBiblicaDoRequisito())))
    expect(await screen.findByText('Classe Bíblica 2026 · 2º semestre: 6 de 8 encontros')).toBeInTheDocument()
    const texto = textoDoRequisito('DE.1')
    expect(texto).toContain('Concluído em')
    expect(texto.indexOf('Concluído em')).toBeLessThan(texto.indexOf('Classe Bíblica 2026'))
  })

  it('requisito sem a marca (sem o campo ou nulo) não mostra quadro', async () => {
    abrir(handlerProgressoDbv(progressoCom(null)))
    await screen.findByRole('button', { name: 'Marcar DE.2' })
    expect(screen.queryByText(/Classe Bíblica/)).not.toBeInTheDocument()
  })
})
