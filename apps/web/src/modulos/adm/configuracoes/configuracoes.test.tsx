import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { criarConfiguracao, handlerConfiguracao, handlerErroConfiguracao, handlerErroSalvarConfiguracao, handlerSalvarConfiguracao } from '../../../testes/handlers/clube'
import { criarPontosCB, handlersClasseBiblica } from '../../../testes/handlers/classe-biblica'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { rotasAdmConfiguracoes } from './rotas'

const estado = vi.hoisted(() => ({ modo: 'ONLINE' as 'ONLINE' | 'SEM_CONEXAO' }))
vi.mock('../../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../../offline')>()),
  useConexao: () => ({ modo: estado.modo }),
}))

beforeEach(() => {
  estado.modo = 'ONLINE'
})

const abrir = (...handlers: Parameters<typeof servidor.use>) => {
  servidor.use(...handlers, ...handlersClasseBiblica())
  return renderizarRotas(rotasAdmConfiguracoes, '/adm/configuracoes')
}

describe('Configurações do clube · estados', () => {
  it('carregando', () => {
    abrir(http.get('/api/clube/configuracao', () => new Promise(() => undefined)))
    expect(screen.getByRole('status', { name: 'Carregando as configurações' })).toBeInTheDocument()
  })

  it('erro com botão de tentar de novo', async () => {
    abrir(handlerErroConfiguracao())
    expect(await screen.findByText('Falha ao ler as configurações')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('sem conexão', async () => {
    estado.modo = 'SEM_CONEXAO'
    abrir(handlerErroConfiguracao())
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
  })

  it('vazio não existe: local nulo abre um campo em branco; fuso e início do ano são só texto', async () => {
    abrir(handlerConfiguracao(criarConfiguracao({ localReuniaoPadrao: null })))
    expect(await screen.findByLabelText('Local padrão')).toHaveValue('')
    expect(screen.getByLabelText('Dia da reunião')).toHaveValue('6')
    expect(screen.getByText(/America\/Sao_Paulo/)).toHaveTextContent('01/02')
    expect(screen.queryByLabelText('Fuso horário')).not.toBeInTheDocument()
  })

  it('a meta de frequência não aparece: nenhuma tela a usa ainda', async () => {
    abrir(handlerConfiguracao())
    await screen.findByLabelText('Dia da reunião')
    expect(screen.queryByLabelText(/Meta de frequência/)).not.toBeInTheDocument()
  })
})

describe('Configurações do clube · salvar', () => {
  it('envia os campos editáveis, mantém a meta gravada e confirma', async () => {
    let corpo: Record<string, unknown> = {}
    abrir(handlerConfiguracao(), handlerSalvarConfiguracao(criarConfiguracao(), (c) => (corpo = c as Record<string, unknown>)))
    await userEvent.selectOptions(await screen.findByLabelText('Dia da reunião'), '0')
    await userEvent.clear(screen.getByLabelText('Alerta de frequência'))
    await userEvent.type(screen.getByLabelText('Alerta de frequência'), '70')
    await userEvent.clear(screen.getByLabelText('Local padrão'))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar configurações' }))

    expect(await screen.findByText('Configurações salvas.')).toBeInTheDocument()
    expect(corpo).toEqual({
      diaReuniao: 0,
      horaReuniao: '15:00',
      localReuniaoPadrao: null,
      limiarFrequenciaAlerta: 70,
      limiarProgressoAlerta: 40,
      metaFrequencia: criarConfiguracao().metaFrequencia,
    })
  })

  it('mostra o 422 do dia da reunião com aula futura', async () => {
    const mensagem = 'Há aulas marcadas no dia atual de reunião: Amigo. Mova-as antes.'
    abrir(handlerConfiguracao(), handlerErroSalvarConfiguracao(422, { codigo: 'REGRA', mensagem }))
    await userEvent.selectOptions(await screen.findByLabelText('Dia da reunião'), '2')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar configurações' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(mensagem)
    expect(screen.queryByText('Configurações salvas.')).not.toBeInTheDocument()
  })

  it('número fora de 0–100 é barrado antes de enviar', async () => {
    let chamadas = 0
    abrir(handlerConfiguracao(), handlerSalvarConfiguracao(criarConfiguracao(), () => chamadas++))
    await userEvent.clear(await screen.findByLabelText('Alerta de frequência'))
    await userEvent.type(screen.getByLabelText('Alerta de frequência'), '150')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar configurações' }))

    expect(await screen.findByText('Informe um número de 0 a 100')).toBeInTheDocument()
    await waitFor(() => expect(chamadas).toBe(0))
  })
})

describe('Configurações do clube · pontos da Classe Bíblica', () => {
  const PRESENCA = 'Presença na Classe Bíblica'
  const PARTICIPACAO = 'Participou ativamente da Classe Bíblica'

  it('mostra os dois valores e "Contar" de cada um, lidos da API', async () => {
    abrir(handlerConfiguracao(), ...handlersClasseBiblica({ pontos: criarPontosCB({
      itens: [
        { gatilho: 'CLASSE_BIBLICA_PRESENCA', nome: PRESENCA, pontos: 10, ativo: true },
        { gatilho: 'CLASSE_BIBLICA_PARTICIPACAO', nome: PARTICIPACAO, pontos: 5, ativo: false },
      ],
    }) }))
    expect(await screen.findByRole('heading', { name: 'Pontos da Classe Bíblica' })).toBeInTheDocument()
    expect(await screen.findByRole('spinbutton', { name: PRESENCA })).toHaveValue(10)
    expect(screen.getByRole('spinbutton', { name: PARTICIPACAO })).toHaveValue(5)
    expect(screen.getByRole('switch', { name: `Contar ${PRESENCA}` })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('switch', { name: `Contar ${PARTICIPACAO}` })).toHaveAttribute('aria-checked', 'false')
  })

  it('"Salvar configurações" grava os pontos junto: presença 8 e participação sem contar', async () => {
    const escritas: Array<{ metodo: string; caminho: string; corpo: unknown }> = []
    abrir(
      handlerConfiguracao(),
      handlerSalvarConfiguracao(criarConfiguracao()),
      ...handlersClasseBiblica({ aoGravar: (metodo, caminho, corpo) => escritas.push({ metodo, caminho, corpo }) }),
    )
    await userEvent.clear(await screen.findByRole('spinbutton', { name: PRESENCA }))
    await userEvent.type(screen.getByRole('spinbutton', { name: PRESENCA }), '8')
    await userEvent.click(screen.getByRole('switch', { name: `Contar ${PARTICIPACAO}` }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar configurações' }))

    expect(await screen.findByText('Configurações salvas.')).toBeInTheDocument()
    expect(escritas).toEqual([{
      metodo: 'PATCH',
      caminho: '/api/classe-biblica/pontos',
      corpo: { itens: [
        { gatilho: 'CLASSE_BIBLICA_PRESENCA', pontos: 8, ativo: true },
        { gatilho: 'CLASSE_BIBLICA_PARTICIPACAO', pontos: 5, ativo: false },
      ] },
    }])
  })

  it('valor fora de 0–1000 é barrado antes de enviar qualquer coisa', async () => {
    let configuracoes = 0
    const escritas: string[] = []
    abrir(
      handlerConfiguracao(),
      handlerSalvarConfiguracao(criarConfiguracao(), () => configuracoes++),
      ...handlersClasseBiblica({ aoGravar: (_metodo, caminho) => escritas.push(caminho) }),
    )
    await userEvent.clear(await screen.findByRole('spinbutton', { name: PARTICIPACAO }))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar configurações' }))

    expect(await screen.findByText('Informe um número de 0 a 1000')).toBeInTheDocument()
    await waitFor(() => expect(configuracoes).toBe(0))
    expect(escritas).toEqual([])
  })

  it('falha ao ler os pontos: a seção avisa e o resto da tela continua salvando', async () => {
    let configuracoes = 0
    abrir(
      handlerConfiguracao(),
      handlerSalvarConfiguracao(criarConfiguracao(), () => configuracoes++),
      http.get('/api/classe-biblica/pontos', () => HttpResponse.json({ codigo: 'ERRO_INTERNO', mensagem: 'Falha ao ler os pontos' }, { status: 500 })),
    )
    expect(await screen.findByText('Falha ao ler os pontos')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Salvar configurações' }))
    expect(await screen.findByText('Configurações salvas.')).toBeInTheDocument()
    expect(configuracoes).toBe(1)
  })
})
