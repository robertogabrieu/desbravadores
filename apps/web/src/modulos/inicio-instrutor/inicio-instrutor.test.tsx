import { screen, within } from '@testing-library/react'
import { delay, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
import { ENCONTRO_CB_ID, GRUPO_DANIEL_ID, criarPacoteClasseBiblica } from '../../testes/handlers/classe-biblica'
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
      pontosEspecialidade: { pontos: 0, ativo: false },
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
    const cartao = await screen.findByRole('region', { name: 'Próxima classe de Amigo' })
    expect(within(cartao).getByText('Descoberta espiritual')).toBeInTheDocument()
    expect(within(cartao).getByText('Próxima classe · 27/09 · 9h15')).toBeInTheDocument()
    expect(within(cartao).getByText('2 requisitos planejados · 9 desbravadores')).toBeInTheDocument()
    expect(screen.getByText('64%')).toBeInTheDocument()
  })

  it('sem aula publicada diz que não há, e sem matriculados o progresso é "—"', async () => {
    servidor.use(handlerInicioInstrutor(criarInicioInstrutor({ classes: [criarClasseDoInstrutor({ proximaAula: null, progressoMedio: null, totalDbvs: 0 })] })))
    abrir([CLASSE_AMIGO])
    expect(await screen.findByText('Nenhuma classe publicada ainda')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('destaca "Registrar classe" só quando é dia de classe e ela não foi registrada', async () => {
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
    const amigo = await screen.findByRole('region', { name: 'Próxima classe de Amigo' })
    expect(within(amigo).getByRole('link', { name: 'Registrar classe' })).toHaveAttribute('href', `/aulas/nova?classe=${CLASSE_AMIGO.id}&data=2030-09-27`)
    const companheiro = screen.getByRole('region', { name: 'Próxima classe de Companheiro' })
    expect(within(companheiro).queryByRole('link', { name: 'Registrar classe' })).not.toBeInTheDocument()
    expect(within(companheiro).getByText('Classe de hoje registrada')).toBeInTheDocument()
  })

  it('não mostra "Registrar classe" em destaque quando hoje não é dia de classe', async () => {
    servidor.use(handlerInicioInstrutor())
    abrir([CLASSE_AMIGO])
    const cartao = await screen.findByRole('region', { name: 'Próxima classe de Amigo' })
    expect(within(cartao).queryByRole('link', { name: 'Registrar classe' })).not.toBeInTheDocument()
  })

  it('põe as Agrupadas num bloco depois, sem cartão de próxima aula', async () => {
    servidor.use(handlerInicioInstrutor(criarInicioInstrutor({ classes: [criarClasseDoInstrutor(), criarClasseDoInstrutor({ classe: CLASSE_AGRUPADAS })] })))
    abrir([CLASSE_AMIGO, CLASSE_AGRUPADAS])
    const bloco = await screen.findByRole('region', { name: 'Agrupadas' })
    expect(within(bloco).getByText('Aventureiros')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Próxima classe de Aventureiros' })).not.toBeInTheDocument()
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
    expect(await screen.findByText('2 desbravadores faltaram às duas últimas classes de Amigo: Gabriel, Laura.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Cronograma' })).toHaveAttribute('href', `/cronograma?classe=${CLASSE_AMIGO.id}`)
    expect(screen.getByRole('link', { name: 'Materiais' })).toHaveAttribute('href', `/classes/${CLASSE_AMIGO.id}/materiais`)
    expect(screen.getByRole('link', { name: 'Progresso' })).toHaveAttribute('href', `/classes/${CLASSE_AMIGO.id}/progresso`)
  })

  it('sem alerta não mostra faixa de aviso', async () => {
    servidor.use(handlerInicioInstrutor())
    abrir([CLASSE_AMIGO])
    await screen.findByRole('region', { name: 'Próxima classe de Amigo' })
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

  describe('lembrete "Para cobrar"', () => {
    const paraCobrar = { requisitos: 2, especialidades: 1, desbravadores: 5 }

    it('aparece abaixo do resumo da próxima classe, só no cartão da classe que tem pendência', async () => {
      servidor.use(handlerInicioInstrutor(criarInicioInstrutor({ classes: [criarClasseDoInstrutor({ paraCobrar }), criarClasseDoInstrutor({ classe: CLASSE_COMPANHEIRO })] })))
      abrir()
      const amigo = await screen.findByRole('region', { name: 'Próxima classe de Amigo' })
      const lembrete = within(amigo).getByText('Para cobrar: 2 requisitos · 1 especialidade · 5 desbravadores')
      const resumo = within(amigo).getByText('2 requisitos planejados · 9 desbravadores')
      expect(resumo.compareDocumentPosition(lembrete) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      const companheiro = screen.getByRole('region', { name: 'Próxima classe de Companheiro' })
      expect(within(companheiro).queryByText(/Para cobrar/)).not.toBeInTheDocument()
    })

    it('a parte com zero não aparece', async () => {
      servidor.use(handlerInicioInstrutor(criarInicioInstrutor({ classes: [criarClasseDoInstrutor({ paraCobrar: { requisitos: 2, especialidades: 0, desbravadores: 5 } })] })))
      abrir([CLASSE_AMIGO])
      expect(await screen.findByText('Para cobrar: 2 requisitos · 5 desbravadores')).toBeInTheDocument()
    })

    it('usa o singular quando é um só', async () => {
      servidor.use(handlerInicioInstrutor(criarInicioInstrutor({ classes: [criarClasseDoInstrutor({ paraCobrar: { requisitos: 1, especialidades: 1, desbravadores: 1 } })] })))
      abrir([CLASSE_AMIGO])
      expect(await screen.findByText('Para cobrar: 1 requisito · 1 especialidade · 1 desbravador')).toBeInTheDocument()
    })

    it('é texto, não link: o caminho é "Registrar classe"', async () => {
      servidor.use(handlerInicioInstrutor(criarInicioInstrutor({ classes: [criarClasseDoInstrutor({ paraCobrar, aulaHoje: true })] })))
      abrir([CLASSE_AMIGO])
      await screen.findByText(/Para cobrar/)
      expect(screen.queryByRole('link', { name: /Para cobrar/ })).not.toBeInTheDocument()
      expect(screen.getByText(/Para cobrar/).closest('a')).toBeNull()
      const cartao = screen.getByRole('region', { name: 'Próxima classe de Amigo' })
      expect(within(cartao).getByRole('link', { name: 'Registrar classe' })).toBeInTheDocument()
    })

    it('fica fora das Agrupadas e some quando paraCobrar é nulo', async () => {
      servidor.use(handlerInicioInstrutor(criarInicioInstrutor({ classes: [criarClasseDoInstrutor({ paraCobrar: null }), criarClasseDoInstrutor({ classe: CLASSE_AGRUPADAS, paraCobrar })] })))
      abrir([CLASSE_AMIGO, CLASSE_AGRUPADAS])
      await screen.findByRole('region', { name: 'Agrupadas' })
      expect(screen.queryByText(/Para cobrar/)).not.toBeInTheDocument()
    })

    it('sem conexão não há lembrete', async () => {
      offline.modo = 'SEM_CONEXAO'
      guardarPacote()
      servidor.use(handlerErroInicioInstrutor(500, { codigo: 'ERRO_INTERNO', mensagem: 'x' }))
      abrir([CLASSE_AMIGO])
      await screen.findByRole('region', { name: 'Classe Amigo' })
      expect(screen.queryByText(/Para cobrar/)).not.toBeInTheDocument()
    })
  })

  it('sem conexão e sem pacote baixado diz que precisa de internet', async () => {
    offline.modo = 'SEM_CONEXAO'
    servidor.use(handlerErroInicioInstrutor(500, { codigo: 'ERRO_INTERNO', mensagem: 'x' }))
    abrir([CLASSE_AMIGO])
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
  })

  it('sem conexão, com pacote: mostra a classe e leva ao registro de classe, sem progresso nem atalhos da API', async () => {
    offline.modo = 'SEM_CONEXAO'
    guardarPacote()
    servidor.use(handlerErroInicioInstrutor(500, { codigo: 'ERRO_INTERNO', mensagem: 'x' }))
    abrir([CLASSE_AMIGO])
    expect(await screen.findByText('Sem conexão: dá para registrar a classe; o resto volta com a internet.')).toBeInTheDocument()
    const cartao = screen.getByRole('region', { name: 'Classe Amigo' })
    expect(within(cartao).getByText(/Próxima classe · .*Descoberta espiritual/)).toBeInTheDocument()
    expect(within(cartao).getByRole('link', { name: 'Registrar classe' })).toHaveAttribute('href', `/aulas/nova?classe=${CLASSE_AMIGO.id}`)
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
    for (const rotulo of ['Cronograma', 'Registrar classe', 'Materiais', 'Observações', 'Progresso', 'Especialidades']) {
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
    expect(await screen.findByRole('region', { name: 'Próxima classe de Amigo' })).toHaveClass('border-borda-controle')
  })
})

describe('cartão da Classe Bíblica no início do instrutor', () => {
  const linkDaniel = `/classe-biblica/encontros/${ENCONTRO_CB_ID}/grupos/${GRUPO_DANIEL_ID}/chamada`

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-11T15:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const abrirComPermissoes = (permissoes: string[]) => {
    servidor.use(...handlersSessao([criarVinculo('INSTRUTOR', 1, { classes: [CLASSE_AMIGO] })], undefined, permissoes))
    return renderizarRotas(rotas, '/inicio')
  }

  it('com a permissão: "Classe Bíblica · domingo 11/10" com o link da chamada do grupo', async () => {
    servidor.use(handlerInicioInstrutor())
    offline.pacote = criarPacote({ classeBiblica: criarPacoteClasseBiblica() })
    abrirComPermissoes(['classebiblica.chamada'])
    const cartao = await screen.findByRole('region', { name: 'Classe Bíblica · domingo 11/10' })
    expect(within(cartao).getByRole('link', { name: 'Fazer a chamada do Grupo Daniel' })).toHaveAttribute('href', linkDaniel)
  })

  it('sem a permissão: nenhum cartão', async () => {
    servidor.use(handlerInicioInstrutor())
    offline.pacote = criarPacote({ classeBiblica: criarPacoteClasseBiblica() })
    abrirComPermissoes([])
    await screen.findByRole('region', { name: 'Próxima classe de Amigo' })
    expect(screen.queryByText(/Fazer a chamada do Grupo/)).not.toBeInTheDocument()
  })

  it('sem conexão: o cartão vem do pacote guardado', async () => {
    offline.modo = 'SEM_CONEXAO'
    offline.pacote = criarPacote({ classeBiblica: criarPacoteClasseBiblica() })
    abrirComPermissoes(['classebiblica.chamada'])
    expect(await screen.findByRole('link', { name: 'Fazer a chamada do Grupo Daniel' })).toHaveAttribute('href', linkDaniel)
  })
})
