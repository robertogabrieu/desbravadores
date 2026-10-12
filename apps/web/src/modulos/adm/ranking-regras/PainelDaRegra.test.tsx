import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { criarRegras, handlerErroSalvarRegra, handlerRedeCaidaAoSalvarRegra, handlersRegras } from '../../../testes/handlers/ranking-regras'
import { criarVinculo, handlersSessao } from '../../../testes/handlers/sessao'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { rotasAdmRankingRegras } from './rotas'

async function abrirPainel(nomeDaRegra: string, ...handlers: Parameters<typeof servidor.use>) {
  servidor.use(...handlersSessao([criarVinculo('ADM')], undefined, ['ranking.configurar', 'calendario.gerenciar']), ...(handlers.length ? handlers : handlersRegras()))
  renderizarRotas(rotasAdmRankingRegras, '/adm/ranking/regras')
  const editar = await screen.findByRole('button', { name: `Editar ${nomeDaRegra}` })
  await userEvent.click(editar)
  return { editar, campo: await screen.findByLabelText(`Pontos por ${nomeDaRegra.toLowerCase()}`) }
}

const salvar = () => screen.getByRole('button', { name: 'Salvar pontos' })

async function digitar(campo: HTMLElement, texto: string) {
  await userEvent.clear(campo)
  if (texto) await userEvent.type(campo, texto)
}

describe('Painel da regra · abertura', () => {
  it('traz quem lança, título, descrição, valor, opção ligada e a frase de vigência', async () => {
    const { campo } = await abrirPainel('Presença')
    expect(screen.getByRole('dialog', { name: 'Presença' })).toBeInTheDocument()
    expect(screen.getByText('Lançado por o conselheiro, na chamada da reunião')).toBeInTheDocument()
    expect(screen.getAllByText('O desbravador foi marcado como presente na chamada.').length).toBeGreaterThan(1)
    expect(campo).toHaveValue('10')
    expect(screen.getByText('pontos', { selector: 'span' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Esta regra dá ponto' })).toBeChecked()
    expect(screen.getByText('Desligue para parar de dar ponto. O valor fica guardado.')).toBeInTheDocument()
    expect(screen.getByText('Vale a partir de agora. Os pontos que já foram lançados não mudam.')).toBeInTheDocument()
  })

  it('o foco inicial vai para o campo de pontos', async () => {
    const { campo } = await abrirPainel('Presença')
    await waitFor(() => expect(campo).toHaveFocus())
  })

  it('regra desligada abre com a opção desmarcada e o convite para ligar', async () => {
    await abrirPainel('Lição ou devocional em dia')
    expect(screen.getByRole('checkbox', { name: 'Esta regra dá ponto' })).not.toBeChecked()
    expect(screen.getByText('Ligue para voltar a dar ponto. Está desligada agora.')).toBeInTheDocument()
    expect(screen.getByText(/deixa de dar ponto/)).toHaveTextContent('Desligada: Lição ou devocional em dia deixa de dar ponto.')
  })
})

describe('Painel da regra · caixa de efeito', () => {
  it('na reunião mostra de quanto para quanto vai a reunião perfeita, e se atualiza ao digitar', async () => {
    const { campo } = await abrirPainel('Presença')
    expect(screen.getByText(/Uma reunião perfeita vai de/)).toHaveTextContent('Uma reunião perfeita vai de 23 para 23 pontos.')
    await digitar(campo, '12')
    expect(screen.getByText(/Uma reunião perfeita vai de/)).toHaveTextContent('Uma reunião perfeita vai de 23 para 25 pontos.')
  })

  it('desligar troca o texto para o de regra desligada', async () => {
    await abrirPainel('Presença')
    await userEvent.click(screen.getByRole('checkbox', { name: 'Esta regra dá ponto' }))
    expect(screen.getByText(/deixa de dar ponto/)).toHaveTextContent('Desligada: Presença deixa de dar ponto.')
  })

  it('fora da reunião o texto é o de cada vez que acontecer', async () => {
    await abrirPainel('Especialidade concluída')
    expect(screen.getByText(/Cada vez que isso acontecer/)).toHaveTextContent('Cada vez que isso acontecer, o desbravador ganha 15 pontos.')
  })

  it('valor inválido pede a correção em vez de mostrar o efeito', async () => {
    const { campo } = await abrirPainel('Presença')
    await digitar(campo, 'abc')
    expect(screen.getByText('Corrija o valor para ver o efeito.')).toBeInTheDocument()
  })
})

describe('Painel da regra · − e +', () => {
  it('+ soma 1 e − tira 1, sem passar de 0 a 1000', async () => {
    const { campo } = await abrirPainel('Presença')
    await userEvent.click(screen.getByRole('button', { name: 'Aumentar 1 ponto' }))
    expect(campo).toHaveValue('11')
    await userEvent.click(screen.getByRole('button', { name: 'Diminuir 1 ponto' }))
    await userEvent.click(screen.getByRole('button', { name: 'Diminuir 1 ponto' }))
    expect(campo).toHaveValue('9')

    await digitar(campo, '0')
    await userEvent.click(screen.getByRole('button', { name: 'Diminuir 1 ponto' }))
    expect(campo).toHaveValue('0')

    await digitar(campo, '1000')
    await userEvent.click(screen.getByRole('button', { name: 'Aumentar 1 ponto' }))
    expect(campo).toHaveValue('1000')
  })

  it('os botões têm área de toque de 48px', async () => {
    await abrirPainel('Presença')
    expect(screen.getByRole('button', { name: 'Aumentar 1 ponto' }).className).toContain('size-12')
    expect(screen.getByRole('button', { name: 'Diminuir 1 ponto' }).className).toContain('size-12')
  })
})

describe('Painel da regra · validação', () => {
  it.each([['abc'], ['1001'], ['-1'], ['10,5'], ['']])('"%s" mostra o erro ao sair do campo', async (texto) => {
    const { campo } = await abrirPainel('Presença')
    await digitar(campo, texto)
    expect(screen.queryByText('Use um número inteiro entre 0 e 1000.')).not.toBeInTheDocument()
    await userEvent.tab()
    expect(await screen.findByText('Use um número inteiro entre 0 e 1000.')).toBeInTheDocument()
    expect(campo).toHaveAttribute('aria-invalid', 'true')
  })

  it('salvar com valor inválido não envia e leva o foco ao campo', async () => {
    const enviados: string[] = []
    const { campo } = await abrirPainel('Presença', ...handlersRegras(criarRegras(), (gatilho) => enviados.push(gatilho)))
    await digitar(campo, '1001')
    await userEvent.click(salvar())

    expect(screen.getByText('Use um número inteiro entre 0 e 1000.')).toBeInTheDocument()
    expect(campo).toHaveFocus()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(enviados).toEqual([])
  })

  it('aceita os limites 0 e 1000', async () => {
    const corpos: unknown[] = []
    const { campo } = await abrirPainel('Presença', ...handlersRegras(criarRegras(), (_g, corpo) => corpos.push(corpo)))
    await digitar(campo, '1000')
    await userEvent.click(salvar())
    await waitFor(() => expect(corpos).toEqual([{ pontos: 1000, ativo: true }]))
  })
})

describe('Painel da regra · fechar sem salvar', () => {
  it('Esc fecha, não envia e devolve o foco ao Editar', async () => {
    const enviados: string[] = []
    const { editar, campo } = await abrirPainel('Presença', ...handlersRegras(criarRegras(), (g) => enviados.push(g)))
    await digitar(campo, '99')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(editar).toHaveFocus()
    expect(screen.queryByText(/agora vale/)).not.toBeInTheDocument()
    expect(enviados).toEqual([])
    expect(screen.getByRole('button', { name: 'Editar Presença' }).closest('li')).toHaveTextContent('+10')
  })

  it('clicar fora fecha sem salvar', async () => {
    await abrirPainel('Presença')
    await userEvent.click(screen.getByTestId('fundo-da-folha'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Cancelar fecha sem salvar', async () => {
    await abrirPainel('Presença')
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('Painel da regra · salvar', () => {
  it('envia pontos e ativo, fecha, destaca a linha, confirma no topo e devolve o foco', async () => {
    const recebidos: Array<[string, unknown]> = []
    const { editar, campo } = await abrirPainel('Presença', ...handlersRegras(criarRegras(), (g, c) => recebidos.push([g, c])))
    await digitar(campo, '12')
    await userEvent.click(salvar())

    expect(await screen.findByText('Presença agora vale 12 pontos. Vale a partir de agora; o que já foi lançado não mudou.')).toBeInTheDocument()
    expect(recebidos).toEqual([['PRESENCA', { pontos: 12, ativo: true }]])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Presença').closest('li')).toHaveTextContent('+12')
    expect(screen.getByText('Presença').closest('li')).toHaveAttribute('data-destacada', 'true')
    expect(editar).toHaveFocus()
  })

  it('desligar guarda o valor e confirma que ninguém mais ganha ponto', async () => {
    const recebidos: unknown[] = []
    await abrirPainel('Bíblia', ...handlersRegras(criarRegras(), (_g, c) => recebidos.push(c)))
    await userEvent.click(screen.getByRole('checkbox', { name: 'Esta regra dá ponto' }))
    await userEvent.click(salvar())

    expect(await screen.findByText('Bíblia foi desligada. Ninguém mais ganha ponto por isso a partir de agora.')).toBeInTheDocument()
    expect(recebidos).toEqual([{ pontos: 3, ativo: false }])
    expect(screen.getByText('7 de 9')).toBeInTheDocument()
  })
})

describe('Painel da regra · falha ao salvar', () => {
  it('erro 5xx mantém o painel aberto com a mensagem acima do botão', async () => {
    const { campo } = await abrirPainel('Presença', handlerErroSalvarRegra(500), ...handlersRegras())
    await digitar(campo, '12')
    await userEvent.click(salvar())

    const alerta = await screen.findByText('Falha ao gravar a regra')
    expect(alerta).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(campo).toHaveValue('12')
    expect(screen.queryByText(/agora vale/)).not.toBeInTheDocument()
    expect(alerta.compareDocumentPosition(salvar()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(salvar()).toBeEnabled()
  })

  it('rede caída mantém o painel aberto e deixa tentar de novo', async () => {
    await abrirPainel('Presença', handlerRedeCaidaAoSalvarRegra(), ...handlersRegras())
    await userEvent.click(salvar())

    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão. Confira a internet e tente de novo.')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(salvar()).toBeEnabled()
  })
})
