import { screen, within } from '@testing-library/react'
import { delay, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModoConexao, PacoteGuardado } from '../../offline'
import {
  CLASSE_AGRUPADAS,
  CLASSE_AMIGO,
  CLASSE_COMPANHEIRO,
  criarClasseDoInstrutor,
  criarInicioInstrutor,
  handlerErroInicioInstrutor,
  handlerInicioInstrutor,
} from '../../testes/handlers/instrutor'
import { criarClasseInstrutor } from '../../testes/handlers/aulas'
import { criarPacote } from '../../testes/handlers/offline'
import { criarVinculo, handlersSessao, uuid } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { TelaInicioInstrutor } from './TelaInicioInstrutor'

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
    },
  })
}

const rotas = [{ path: '/inicio', element: <TelaInicioInstrutor /> }]

function abrir(classes = [CLASSE_AMIGO, CLASSE_COMPANHEIRO]) {
  servidor.use(...handlersSessao([criarVinculo('INSTRUTOR', 1, { classes })]))
  return renderizarRotas(rotas, '/inicio')
}

describe('início do instrutor', () => {
  it('mostra o título no feminino, a próxima aula e o progresso da classe', async () => {
    servidor.use(handlerInicioInstrutor())
    abrir()
    expect(await screen.findByRole('heading', { name: 'Olá, Ana' })).toBeInTheDocument()
    expect(screen.getByText('Instrutora · Amigo e Companheiro')).toBeInTheDocument()
    const cartao = await screen.findByRole('region', { name: 'Próxima aula de Amigo' })
    expect(within(cartao).getByText('Descoberta espiritual')).toBeInTheDocument()
    expect(within(cartao).getByText(/Sex, 27 set · 9h15/)).toBeInTheDocument()
    expect(within(cartao).getByText('2 requisitos planejados · 9 desbravadores')).toBeInTheDocument()
    expect(screen.getByText('64%')).toBeInTheDocument()
  })

  it('sem aula publicada diz que não há, e sem matriculados o progresso é "—"', async () => {
    servidor.use(handlerInicioInstrutor(criarInicioInstrutor({ classes: [criarClasseDoInstrutor({ proximaAula: null, progressoMedio: null, totalDbvs: 0 })] })))
    abrir([CLASSE_AMIGO])
    expect(await screen.findByText('Nenhuma aula publicada ainda')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('destaca "Registrar aula" só quando é dia de aula e ela não foi registrada', async () => {
    servidor.use(
      handlerInicioInstrutor(
        criarInicioInstrutor({
          classes: [
            criarClasseDoInstrutor({ aulaHoje: true, aulaHojeRegistrada: false }),
            criarClasseDoInstrutor({ classe: CLASSE_COMPANHEIRO, aulaHoje: true, aulaHojeRegistrada: true }),
          ],
        }),
      ),
    )
    abrir()
    const amigo = await screen.findByRole('region', { name: 'Próxima aula de Amigo' })
    expect(within(amigo).getByRole('link', { name: 'Registrar aula' })).toHaveAttribute('href', `/aulas/nova?classe=${CLASSE_AMIGO.id}&data=2030-09-27`)
    const companheiro = screen.getByRole('region', { name: 'Próxima aula de Companheiro' })
    expect(within(companheiro).queryByRole('link', { name: 'Registrar aula' })).not.toBeInTheDocument()
    expect(within(companheiro).getByText('Aula de hoje registrada')).toBeInTheDocument()
  })

  it('não mostra "Registrar aula" em destaque quando hoje não é dia de aula', async () => {
    servidor.use(handlerInicioInstrutor())
    abrir([CLASSE_AMIGO])
    const cartao = await screen.findByRole('region', { name: 'Próxima aula de Amigo' })
    expect(within(cartao).queryByRole('link', { name: 'Registrar aula' })).not.toBeInTheDocument()
  })

  it('põe as Agrupadas num bloco depois, sem cartão de próxima aula', async () => {
    servidor.use(handlerInicioInstrutor(criarInicioInstrutor({ classes: [criarClasseDoInstrutor(), criarClasseDoInstrutor({ classe: CLASSE_AGRUPADAS })] })))
    abrir([CLASSE_AMIGO, CLASSE_AGRUPADAS])
    const bloco = await screen.findByRole('region', { name: 'Agrupadas' })
    expect(within(bloco).getByText('Aventureiros')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Próxima aula de Aventureiros' })).not.toBeInTheDocument()
    const minhas = screen.getByRole('region', { name: 'Minhas classes' })
    expect(within(minhas).queryByText('Aventureiros')).not.toBeInTheDocument()
  })

  it('avisa quem faltou às duas últimas aulas e oferece os atalhos', async () => {
    servidor.use(
      handlerInicioInstrutor(
        criarInicioInstrutor({ alertaFaltas: [{ classe: CLASSE_AMIGO, dbvs: [{ dbvId: '00000000-0000-4000-8000-000000000701', nome: 'Gabriel' }, { dbvId: '00000000-0000-4000-8000-000000000702', nome: 'Laura' }] }] }),
      ),
    )
    abrir([CLASSE_AMIGO])
    expect(await screen.findByText('2 desbravadores faltaram às duas últimas aulas de Amigo: Gabriel, Laura.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cronograma' })).toHaveAttribute('href', `/cronograma?classe=${CLASSE_AMIGO.id}`)
    expect(screen.getByRole('link', { name: 'Materiais' })).toHaveAttribute('href', `/classes/${CLASSE_AMIGO.id}/materiais`)
    expect(screen.getByRole('link', { name: 'Progresso' })).toHaveAttribute('href', `/classes/${CLASSE_AMIGO.id}/progresso`)
  })

  it('sem alerta não mostra faixa de aviso', async () => {
    servidor.use(handlerInicioInstrutor())
    abrir([CLASSE_AMIGO])
    await screen.findByRole('region', { name: 'Próxima aula de Amigo' })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('sem classe explica que o Adm atribui', async () => {
    servidor.use(handlerInicioInstrutor(criarInicioInstrutor({ classes: [] })))
    abrir([])
    expect(await screen.findByText('Você ainda não tem classes. O Adm do clube as atribui.')).toBeInTheDocument()
  })

  it('mostra carregando enquanto espera', async () => {
    servidor.use(http.get('/api/inicio/instrutor', () => delay('infinite')))
    abrir([CLASSE_AMIGO])
    expect(await screen.findByRole('status', { name: 'Carregando o início' })).toBeInTheDocument()
  })

  it('mostra o erro da API com "Tentar de novo"', async () => {
    servidor.use(handlerErroInicioInstrutor(500, { codigo: 'ERRO_INTERNO', mensagem: 'Falha no servidor' }))
    abrir([CLASSE_AMIGO])
    expect(await screen.findByText('Falha no servidor')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('sem conexão e sem pacote baixado diz que precisa de internet', async () => {
    offline.modo = 'SEM_CONEXAO'
    servidor.use(handlerErroInicioInstrutor(500, { codigo: 'ERRO_INTERNO', mensagem: 'x' }))
    abrir([CLASSE_AMIGO])
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
  })

  it('sem conexão, com pacote: mostra a classe e leva ao registro de aula, sem progresso nem atalhos da API', async () => {
    offline.modo = 'SEM_CONEXAO'
    guardarPacote()
    servidor.use(handlerErroInicioInstrutor(500, { codigo: 'ERRO_INTERNO', mensagem: 'x' }))
    abrir([CLASSE_AMIGO])
    expect(await screen.findByText('Sem conexão: dá para registrar a aula; o resto volta com a internet.')).toBeInTheDocument()
    const cartao = screen.getByRole('region', { name: 'Classe Amigo' })
    expect(within(cartao).getByText(/Próxima aula · .*Descoberta espiritual/)).toBeInTheDocument()
    expect(within(cartao).getByRole('link', { name: 'Registrar aula' })).toHaveAttribute('href', `/aulas/nova?classe=${CLASSE_AMIGO.id}`)
    expect(screen.queryByText('Atalhos')).not.toBeInTheDocument()
    expect(screen.queryByText('Disponível quando houver internet')).not.toBeInTheDocument()
  })
})

describe('sinais do início do instrutor', () => {
  it('a linha da classe e cada atalho mostram a seta de que abrem', async () => {
    servidor.use(handlerInicioInstrutor())
    abrir([CLASSE_AMIGO])
    const minhas = await screen.findByRole('region', { name: 'Minhas classes' })
    const linha = within(minhas).getByRole('link', { name: /Amigo/ })
    expect(linha).toHaveAttribute('href', `/classes/${CLASSE_AMIGO.id}/progresso`)
    expect(linha.querySelector('[data-sinal="navega"]')).not.toBeNull()
    for (const rotulo of ['Cronograma', 'Registrar aula', 'Materiais', 'Observações', 'Progresso', 'Especialidades']) {
      expect(screen.getByRole('link', { name: rotulo }).querySelector('[data-sinal="navega"]')).not.toBeNull()
    }
  })

  it('"Agrupadas" sem transparência, que derrubava o contraste do título', async () => {
    servidor.use(handlerInicioInstrutor(criarInicioInstrutor({ classes: [criarClasseDoInstrutor(), criarClasseDoInstrutor({ classe: CLASSE_AGRUPADAS })] })))
    abrir([CLASSE_AMIGO, CLASSE_AGRUPADAS])
    const bloco = await screen.findByRole('region', { name: 'Agrupadas' })
    expect(bloco.className).not.toMatch(/opacity/)
    expect(within(bloco).getByRole('heading', { name: 'Agrupadas' }).className).not.toMatch(/opacity/)
  })

  it('o cartão da próxima aula usa o contorno de controle', async () => {
    servidor.use(handlerInicioInstrutor())
    abrir([CLASSE_AMIGO])
    expect(await screen.findByRole('region', { name: 'Próxima aula de Amigo' })).toHaveClass('border-borda-controle')
  })
})
