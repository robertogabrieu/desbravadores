import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PacoteGuardado } from '../../../offline'
import { criarPacote } from '../../../testes/handlers/offline'
import { criarDetalhe, handlerErroReuniao, handlerReuniao } from '../../../testes/handlers/reunioes'
import { criarVinculo, handlersSessao, uuid } from '../../../testes/handlers/sessao'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { rotasReunioes } from '../rotas'

const estado = vi.hoisted(() => ({ licaoAtiva: false, modo: 'ONLINE' as 'ONLINE' | 'SEM_CONEXAO' }))

vi.mock('../../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../../offline')>()),
  useConexao: () => ({ modo: estado.modo }),
  usePacote: (): PacoteGuardado => ({
    pacote: criarPacote({ criterios: [{ gatilho: 'LICAO', nome: 'Lição', pontos: 3, ativo: estado.licaoAtiva }] }),
    carregando: false,
    baixadoEm: 1,
  }),
}))

const ID = uuid(600)
const abrir = () => renderizarRotas(rotasReunioes, `/reunioes/${ID}`)

beforeEach(() => {
  estado.licaoAtiva = false
  estado.modo = 'ONLINE'
  servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO')]))
})

describe('Detalhe da reunião', () => {
  it('mostra resumo, autoria, totais e cada DBV com suas marcas e pontos', async () => {
    servidor.use(handlerReuniao())
    abrir()
    expect(await screen.findByText(/Registrada por Thiago às 10h40/)).toBeInTheDocument()
    expect(screen.queryByText('Reunião regular')).not.toBeInTheDocument()
    expect(screen.getByText('2/3')).toBeInTheDocument()
    expect(screen.getByText('26')).toBeInTheDocument()
    const ana = screen.getByText('Ana Clara Souza').closest('li')
    const pedro = screen.getByText('Pedro Lima').closest('li')
    const davi = screen.getByText('Davi Carvalho').closest('li')
    if (!ana || !pedro || !davi) throw new Error('linhas ausentes')
    expect(within(ana).getByText('Pontual')).toBeInTheDocument()
    expect(within(ana).getByText('Uniforme')).toBeInTheDocument()
    expect(within(ana).getByText('+18')).toBeInTheDocument()
    expect(within(pedro).getByText('Atrasou')).toBeInTheDocument()
    expect(within(pedro).getByText('Uniforme')).toHaveClass('line-through')
    expect(within(davi).getByText('Falta justificada')).toBeInTheDocument()
    expect(within(davi).getByText('0')).toBeInTheDocument()
  })

  it('Lição só aparece quando o critério está ativo', async () => {
    servidor.use(handlerReuniao())
    const { unmount } = abrir()
    await screen.findByText('Ana Clara Souza')
    expect(screen.queryByText('Lição')).not.toBeInTheDocument()
    unmount()
    estado.licaoAtiva = true
    abrir()
    await screen.findByText('Ana Clara Souza')
    expect(screen.getAllByText('Lição').length).toBeGreaterThan(0)
  })

  it('filtra por Presentes e Ausentes com as contagens nos botões', async () => {
    servidor.use(handlerReuniao())
    abrir()
    await screen.findByText('Ana Clara Souza')
    expect(screen.getByRole('button', { name: 'Todos · 3' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Ausentes · 1' }))
    expect(screen.queryByText('Ana Clara Souza')).not.toBeInTheDocument()
    expect(screen.getByText('Davi Carvalho')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Presentes · 2' }))
    expect(screen.getByText('Pedro Lima')).toBeInTheDocument()
    expect(screen.queryByText('Davi Carvalho')).not.toBeInTheDocument()
  })

  it('"Editar" aparece só com podeEditar', async () => {
    servidor.use(handlerReuniao(criarDetalhe({ podeEditar: true })))
    const { unmount } = abrir()
    expect(await screen.findByRole('link', { name: /Editar/ })).toHaveAttribute('href', `/reunioes/${ID}/editar`)
    unmount()
    servidor.use(handlerReuniao(criarDetalhe({ podeEditar: false })))
    abrir()
    await screen.findByText('Ana Clara Souza')
    expect(screen.queryByRole('link', { name: /Editar/ })).not.toBeInTheDocument()
  })

  it('mostra quem alterou e o aviso de conflito entre aparelhos', async () => {
    servidor.use(handlerReuniao(criarDetalhe({ alterada: { por: 'Marta', em: '2026-09-20T15:05:00.000Z', conflito: true } })))
    abrir()
    expect(await screen.findByText(/Alterada por Marta às 12h05/)).toBeInTheDocument()
    expect(screen.getByText('Houve conflito entre aparelhos')).toBeInTheDocument()
  })

  it('sem alteração não mostra "alterada" nem conflito', async () => {
    servidor.use(handlerReuniao())
    abrir()
    await screen.findByText('Ana Clara Souza')
    expect(screen.queryByText(/Alterada por/)).not.toBeInTheDocument()
    expect(screen.queryByText(/conflito/)).not.toBeInTheDocument()
  })

  it('mostra observações, até 4 miniaturas, "Ver álbum (N)" e o "+" para enviar fotos', async () => {
    const albumId = uuid(800)
    servidor.use(
      handlerReuniao(
        criarDetalhe({
          observacoes: 'Ensaio do grito de guerra',
          album: { id: albumId, totalFotos: 6, miniaturas: ['/m/1.jpg', '/m/2.jpg', '/m/3.jpg', '/m/4.jpg'] },
        }),
      ),
    )
    abrir()
    expect(await screen.findByText('Ensaio do grito de guerra')).toBeInTheDocument()
    expect(screen.getAllByRole('img')).toHaveLength(4)
    expect(screen.getByRole('link', { name: 'Ver álbum (6)' })).toHaveAttribute('href', `/galeria/${albumId}`)
    expect(screen.getByRole('link', { name: 'Adicionar fotos a esta reunião' })).toHaveAttribute('href', `/galeria/enviar?reuniao=${ID}`)
  })

  it('sem álbum não mostra "Ver álbum" mas mantém o "+"', async () => {
    servidor.use(handlerReuniao())
    abrir()
    await screen.findByText('Ana Clara Souza')
    expect(screen.queryByRole('link', { name: /Ver álbum/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Adicionar fotos a esta reunião' })).toBeInTheDocument()
  })

  it('mostra o esqueleto enquanto carrega', async () => {
    servidor.use(http.get('/api/reunioes/:id', () => new Promise<Response>(() => undefined)))
    abrir()
    expect(await screen.findByRole('status', { name: 'Carregando reunião' })).toBeInTheDocument()
  })

  it('erro da API mostra a mensagem e tenta de novo', async () => {
    servidor.use(handlerErroReuniao(404, { codigo: 'NAO_ENCONTRADO', mensagem: 'Reunião não encontrada' }))
    abrir()
    expect(await screen.findByRole('alert')).toHaveTextContent('Reunião não encontrada')
    servidor.use(handlerReuniao())
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Ana Clara Souza')).toBeInTheDocument()
  })

  it('sem conexão e sem dado guardado mostra "Disponível quando houver internet"', async () => {
    estado.modo = 'SEM_CONEXAO'
    servidor.use(http.get('/api/reunioes/:id', () => Response.error()))
    abrir()
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
  })
})
