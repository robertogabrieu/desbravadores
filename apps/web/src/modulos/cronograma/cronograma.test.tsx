import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModoConexao, PacoteGuardado } from '../../offline'
import { criarAulaDoCronograma, criarCronograma, handlerCronograma, handlerErroCronograma } from '../../testes/handlers/cronograma'
import { CLASSE_AMIGO, CLASSE_COMPANHEIRO, handlerPedirLiberacao } from '../../testes/handlers/instrutor'
import { criarClasse, handlerClasses } from '../../testes/handlers/leitura'
import { criarClasseInstrutor } from '../../testes/handlers/aulas'
import { criarPacote } from '../../testes/handlers/offline'
import { criarVinculo, handlersSessao, uuid } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { TelaCronograma } from './TelaCronograma'

const offline = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao, pacote: null as PacoteGuardado['pacote'] }))

vi.mock('../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../offline')>()),
  useConexao: () => ({ modo: offline.modo }),
  usePacote: () => ({ pacote: offline.pacote, carregando: false, baixadoEm: null }),
}))

beforeEach(() => {
  offline.modo = 'ONLINE'
  offline.pacote = null
})

const guardarPacote = () => {
  offline.pacote = criarPacote({
    instrutor: {
      classes: [criarClasseInstrutor({ classe: CLASSE_AMIGO, aulasProximas: [{ aulaPlanejadaId: uuid(50), data: '2030-09-27', horario: '09:15', titulo: 'Descoberta espiritual', requisitoIds: [] }] })],
      pontosRequisito: { pontos: 5, ativo: true },
      pontosEspecialidade: { pontos: 0, ativo: false },
    },
  })
}

function abrir(rota = '/cronograma?classe=' + CLASSE_AMIGO.id, classes = [CLASSE_AMIGO, CLASSE_COMPANHEIRO]) {
  servidor.use(...handlersSessao([criarVinculo('INSTRUTOR', 1, { classes })]))
  return renderizarRotas([{ path: '/cronograma', element: <TelaCronograma /> }], rota)
}

const aulaDe = (nome: string) => within(screen.getByRole('article', { name: nome }))

describe('cronograma em leitura', () => {
  it('mostra as seis situações com o que cada uma pede', async () => {
    const registro = uuid(700)
    servidor.use(
      handlerCronograma(
        criarCronograma({
          aulas: [
            criarAulaDoCronograma({ data: '2030-09-01', situacao: 'DADA', registroAulaId: registro }),
            criarAulaDoCronograma({ id: uuid(401), data: '2030-09-08', situacao: 'CONFLITO', registroAulaId: uuid(701) }),
            criarAulaDoCronograma({ id: uuid(402), data: '2030-09-10', situacao: 'NAO_REGISTRADA' }),
            criarAulaDoCronograma({ id: uuid(403), data: '2030-09-15', situacao: 'HOJE' }),
            criarAulaDoCronograma({ id: uuid(404), data: '2030-09-22', situacao: 'PLANEJADA' }),
            criarAulaDoCronograma({ origem: 'EXTRA', id: null, data: '2030-09-25', situacao: 'DADA', titulo: 'Reposição', requisitos: [], registroAulaId: uuid(702) }),
          ],
        }),
      ),
    )
    abrir()
    await screen.findByRole('article', { name: 'Classe de 2030-09-01' })
    const dada = aulaDe('Classe de 2030-09-01')
    expect(dada.getByText('Dada')).toBeInTheDocument()
    expect(dada.getByRole('link', { name: 'Ver registro' })).toHaveAttribute('href', `/aulas/${registro}/editar`)
    expect(aulaDe('Classe de 2030-09-08').getByText('Conflito')).toBeInTheDocument()
    const semRegistro = aulaDe('Classe de 2030-09-10')
    expect(semRegistro.getByText('Sem registro')).toBeInTheDocument()
    expect(semRegistro.getByRole('link', { name: 'Registrar' })).toHaveAttribute('href', `/aulas/nova?classe=${CLASSE_AMIGO.id}&data=2030-09-10`)
    const hoje = aulaDe('Classe de 2030-09-15')
    expect(hoje.getByText('Hoje')).toBeInTheDocument()
    expect(hoje.getByRole('link', { name: 'Registrar' })).toHaveAttribute('href', `/aulas/nova?classe=${CLASSE_AMIGO.id}&data=2030-09-15`)
    const planejada = aulaDe('Classe de 2030-09-22')
    expect(planejada.getByText('Planejada')).toBeInTheDocument()
    expect(planejada.queryByRole('link')).not.toBeInTheDocument()
    const extra = aulaDe('Classe de 2030-09-25')
    expect(extra.getByText('Fora do cronograma')).toBeInTheDocument()
    expect(extra.getByRole('link', { name: 'Ver registro' })).toHaveAttribute('href', `/aulas/${uuid(702)}/editar`)
  })

  it('lista requisitos com código, texto e a marca CAMPO', async () => {
    servidor.use(
      handlerCronograma(
        criarCronograma({
          aulas: [
            criarAulaDoCronograma({
              requisitos: [
                { id: uuid(510), codigo: 'AC 2', texto: 'Nós básicos', campo: false, secaoCodigo: 'AC' },
                { id: uuid(511), codigo: 'AC 3', texto: 'Montar uma barraca', campo: true, secaoCodigo: 'AC' },
              ],
            }),
          ],
        }),
      ),
    )
    abrir()
    const aula = await screen.findByRole('article', { name: 'Classe de 2030-09-20' })
    expect(within(aula).getByText('Nós básicos', { exact: false })).toBeInTheDocument()
    expect(within(aula).getByText('AC 3')).toBeInTheDocument()
    expect(within(aula).getAllByText('CAMPO')).toHaveLength(1)
    expect(within(aula).getByText('9h15')).toBeInTheDocument()
  })

  it('troca de classe pelos chips e busca o cronograma da escolhida', async () => {
    const pedidas: string[] = []
    servidor.use(handlerCronograma(criarCronograma(), (id) => pedidas.push(id)))
    abrir()
    await screen.findByRole('article', { name: 'Classe de 2030-09-20' })
    await userEvent.click(screen.getByRole('button', { name: 'Companheiro' }))
    await vi.waitFor(() => expect(pedidas).toContain(CLASSE_COMPANHEIRO.id))
    expect(screen.getByRole('button', { name: 'Companheiro' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('sem parâmetro abre a primeira classe', async () => {
    const pedidas: string[] = []
    servidor.use(handlerCronograma(criarCronograma(), (id) => pedidas.push(id)))
    abrir('/cronograma')
    await screen.findByRole('article', { name: 'Classe de 2030-09-20' })
    expect(pedidas).toEqual([CLASSE_AMIGO.id])
  })

  it('oferece "Montar cronograma" só a quem pode montar', async () => {
    servidor.use(handlerCronograma(criarCronograma({ podeMontar: true, fonte: 'VIVO', status: 'RASCUNHO' })))
    abrir()
    expect(await screen.findByRole('link', { name: 'Montar cronograma' })).toHaveAttribute('href', `/cronograma/montar?classe=${CLASSE_AMIGO.id}`)
  })

  it('não oferece "Montar cronograma" a quem não pode', async () => {
    servidor.use(handlerCronograma())
    abrir()
    await screen.findByRole('article', { name: 'Classe de 2030-09-20' })
    expect(screen.queryByRole('link', { name: 'Montar cronograma' })).not.toBeInTheDocument()
  })

  it('sem publicação e montagem do Adm: mostra o aviso e pede liberação uma vez', async () => {
    const pedidos: string[] = []
    servidor.use(handlerCronograma(criarCronograma({ cronogramaId: null, status: null, fonte: null, publicadoEm: null, aulas: [] })), handlerClasses([criarClasse({ id: CLASSE_AMIGO.id, quemMontaCronograma: 'ADM' })]), handlerPedirLiberacao((id) => pedidos.push(id)))
    abrir()
    expect(await screen.findByText('O cronograma ainda não foi publicado.')).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Pedir para eu montar' }))
    expect(await screen.findByText('Pedido enviado ao Adm do clube.')).toBeInTheDocument()
    expect(pedidos).toEqual([CLASSE_AMIGO.id])
    expect(screen.queryByRole('button', { name: 'Pedir para eu montar' })).not.toBeInTheDocument()
  })

  it('sem publicação e montagem do instrutor: não oferece pedir liberação', async () => {
    servidor.use(handlerCronograma(criarCronograma({ cronogramaId: null, status: null, fonte: null, publicadoEm: null, aulas: [] })), handlerClasses([criarClasse({ id: CLASSE_AMIGO.id, quemMontaCronograma: 'INSTRUTOR' })]))
    abrir()
    await screen.findByText('O cronograma ainda não foi publicado.')
    await vi.waitFor(() => expect(screen.queryByRole('button', { name: 'Pedir para eu montar' })).not.toBeInTheDocument())
  })

  it('mostra a mensagem da API quando o pedido falha', async () => {
    servidor.use(
      handlerCronograma(criarCronograma({ cronogramaId: null, status: null, fonte: null, publicadoEm: null, aulas: [] })),
      handlerClasses([criarClasse({ id: CLASSE_AMIGO.id })]),
      http.post('/api/classes/:id/pedir-liberacao', () => HttpResponse.json({ codigo: 'REGRA', mensagem: 'Não dá para pedir agora.' }, { status: 422 })),
    )
    abrir()
    await userEvent.click(await screen.findByRole('button', { name: 'Pedir para eu montar' }))
    expect(await screen.findByText('Não dá para pedir agora.')).toBeInTheDocument()
  })

  it('classe que não é do instrutor dá "Classe não encontrada" sem buscar o cronograma', async () => {
    const pedidas: string[] = []
    servidor.use(handlerCronograma(criarCronograma(), (id) => pedidas.push(id)))
    abrir('/cronograma?classe=' + uuid(999))
    expect(await screen.findByText('Classe não encontrada')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver minhas classes' })).toHaveAttribute('href', '/classes')
    expect(pedidas).toEqual([])
  })

  it('404 da API também vira "Classe não encontrada"', async () => {
    servidor.use(handlerErroCronograma(404, { codigo: 'NAO_ENCONTRADO', mensagem: 'Não encontrado' }))
    abrir()
    expect(await screen.findByText('Classe não encontrada')).toBeInTheDocument()
  })

  it('sem classes explica que o Adm atribui', async () => {
    abrir('/cronograma', [])
    expect(await screen.findByText('Você ainda não tem classes. O Adm do clube as atribui.')).toBeInTheDocument()
  })

  it('mostra carregando e erro com "Tentar de novo"', async () => {
    servidor.use(handlerErroCronograma(500, { codigo: 'ERRO_INTERNO', mensagem: 'Falha no servidor' }))
    abrir()
    expect(await screen.findByRole('status', { name: 'Carregando o cronograma' })).toBeInTheDocument()
    expect(await screen.findByText('Falha no servidor')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('sem conexão e sem pacote baixado diz que precisa de internet, sem botão de registro', async () => {
    offline.modo = 'SEM_CONEXAO'
    servidor.use(handlerErroCronograma(500, { codigo: 'ERRO_INTERNO', mensagem: 'x' }))
    abrir()
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Registrar classe de hoje' })).not.toBeInTheDocument()
  })

  it('sem conexão, com pacote: mantém a mensagem e oferece "Registrar classe de hoje" da classe escolhida', async () => {
    offline.modo = 'SEM_CONEXAO'
    guardarPacote()
    servidor.use(handlerErroCronograma(500, { codigo: 'ERRO_INTERNO', mensagem: 'x' }))
    abrir()
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Registrar classe de hoje' })).toHaveAttribute('href', `/aulas/nova?classe=${CLASSE_AMIGO.id}`)
  })
})
