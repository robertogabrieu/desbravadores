import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ModoConexao } from '../../../offline'
import type { Previa } from '../../../api/importacao'
import { criarClasse, criarUnidade, handlerClasses, handlerUnidades } from '../../../testes/handlers/leitura'
import {
  criarLinhaDaPrevia,
  handlerConfirmarImportacao,
  handlerDesbravadores,
} from '../../../testes/handlers/desbravadores'
import { uuid } from '../../../testes/handlers/sessao'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { paraEnvio } from './revisao-importacao'
import { rotasAdmDesbravadores } from './rotas'

const offline = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao }))
vi.mock('../../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../../offline')>()),
  useConexao: () => ({ modo: offline.modo }),
}))

afterEach(() => {
  offline.modo = 'ONLINE'
  vi.unstubAllGlobals()
})

/** O interceptador de XHR do msw não lê o FormData do jsdom: a prévia usa um XHR falso, como os testes de materiais. */
function simularPrevia(corpo: unknown, status = 200, { responder = true } = {}) {
  const enviados: string[] = []
  class XhrFalso {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    ontimeout: (() => void) | null = null
    onabort: (() => void) | null = null
    status = 0
    responseText = ''
    private url = ''
    open(_metodo: string, url: string) {
      this.url = url
    }
    setRequestHeader() {}
    send(formulario: FormData) {
      const arquivo = formulario.get('arquivo')
      enviados.push(`${this.url} ${arquivo instanceof File ? arquivo.name : ''}`)
      if (!responder) return
      this.status = status
      this.responseText = JSON.stringify(corpo)
      this.onload?.()
    }
  }
  vi.stubGlobal('XMLHttpRequest', XhrFalso)
  return { enviados }
}

const aguias = criarUnidade({ id: uuid(201), nome: 'Águias', tipo: 'MASCULINA' })
const amigo = criarClasse({ id: uuid(101), nome: 'Amigo' })
const planilha = () => new File(['conteudo'], 'desbravadores.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

const pronta = criarLinhaDaPrevia({ linha: 2, nome: 'Ana Clara Souza' })
const outraPronta = criarLinhaDaPrevia({ linha: 3, nome: 'Bruno Lima', sexo: 'M' })
const duplicada = criarLinhaDaPrevia({
  linha: 4,
  nome: 'Caio Duplicado',
  duplicado: true,
  avisos: [{ codigo: 'AVISO_DUPLICADO', mensagem: 'Já existe no clube um desbravador com este nome e nascimento.' }],
})
const comErro = criarLinhaDaPrevia({ linha: 5, nome: 'D', erros: ['O nome precisa ter de 2 a 120 letras.'] })
const previaCompleta: Previa = { colunasFaltando: [], linhas: [pronta, outraPronta, duplicada, comErro] }

function abrir() {
  servidor.use(handlerUnidades([aguias]), handlerClasses([amigo]), handlerDesbravadores([]))
  return renderizarRotas(rotasAdmDesbravadores, '/adm/desbravadores/importar')
}

async function enviar() {
  await userEvent.upload(await screen.findByLabelText('Planilha'), planilha())
  await userEvent.click(screen.getByRole('button', { name: 'Enviar planilha' }))
}

describe('importar planilha · enviar', () => {
  it('estado inicial: diz as colunas obrigatórias e oferece o modelo', async () => {
    abrir()
    expect(await screen.findByRole('heading', { name: 'Importar planilha' })).toBeInTheDocument()
    expect(screen.getByText(/Obrigatórias: Nome, Data de nascimento e Sexo/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Baixar modelo' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('carregando enquanto a planilha é lida', async () => {
    simularPrevia(previaCompleta, 200, { responder: false })
    abrir()
    await enviar()
    expect(await screen.findByRole('status', { name: 'Lendo a planilha' })).toBeInTheDocument()
  })

  it('erro: mostra a recusa da API e deixa enviar de novo', async () => {
    simularPrevia({ codigo: 'REGRA', mensagem: 'A planilha tem 600 linhas; o limite é 500. Divida a planilha.' }, 422)
    abrir()
    await enviar()
    expect(await screen.findByRole('alert')).toHaveTextContent('A planilha tem 600 linhas; o limite é 500. Divida a planilha.')
    expect(screen.getByRole('button', { name: 'Enviar planilha' })).toBeEnabled()
  })

  it('sem conexão: a tela avisa que depende da internet', async () => {
    offline.modo = 'SEM_CONEXAO'
    abrir()
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
    expect(screen.queryByLabelText('Planilha')).not.toBeInTheDocument()
  })

  it('colunas faltando: diz quais e não mostra grade', async () => {
    simularPrevia({ colunasFaltando: ['Data de nascimento', 'Sexo'], linhas: [] })
    abrir()
    await enviar()
    expect(await screen.findByRole('alert')).toHaveTextContent('Faltam as colunas Data de nascimento e Sexo')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('planilha sem linhas: estado vazio', async () => {
    simularPrevia({ colunasFaltando: [], linhas: [] })
    abrir()
    await enviar()
    expect(await screen.findByText('A planilha não tem ninguém para importar')).toBeInTheDocument()
  })
})

describe('importar planilha · revisar', () => {
  it('grade com a contagem de prontas, com aviso e com erro', async () => {
    const { enviados } = simularPrevia(previaCompleta)
    abrir()
    await enviar()
    expect(enviados).toEqual(['/api/desbravadores/importacao/previa desbravadores.xlsx'])
    expect(await screen.findByText('2 prontas · 1 com aviso · 1 com erro')).toBeInTheDocument()
    expect(screen.getByLabelText('Nome, linha 2')).toHaveValue('Ana Clara Souza')
    expect(screen.getByText('O nome precisa ter de 2 a 120 letras.')).toBeInTheDocument()
    expect(screen.getByText('Já existe no clube um desbravador com este nome e nascimento.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Importar 2 desbravadores' })).toBeEnabled()
  })

  it('linha com erro não pode ser marcada; duplicada chega desmarcada mas pode ser marcada', async () => {
    simularPrevia(previaCompleta)
    abrir()
    await enviar()
    const caixaErro = await screen.findByRole('checkbox', { name: 'Importar linha 5' })
    expect(caixaErro).toBeDisabled()
    expect(caixaErro).not.toBeChecked()
    const caixaDuplicada = screen.getByRole('checkbox', { name: 'Importar linha 4' })
    expect(caixaDuplicada).toBeEnabled()
    expect(caixaDuplicada).not.toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Importar linha 2' })).toBeChecked()
    await userEvent.click(caixaDuplicada)
    expect(screen.getByRole('button', { name: 'Importar 3 desbravadores' })).toBeInTheDocument()
  })

  it('editar a célula refaz a validação daquela linha', async () => {
    simularPrevia(previaCompleta)
    abrir()
    await enviar()
    const nome = await screen.findByLabelText('Nome, linha 5')
    await userEvent.type(nome, 'aniel Dias')
    expect(screen.queryByText('O nome precisa ter de 2 a 120 letras.')).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Importar linha 5' })).toBeChecked()
    expect(screen.getByText('3 prontas · 1 com aviso · 0 com erro')).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('Nome, linha 2'))
    expect(screen.getByText('O nome precisa ter de 2 a 120 letras.')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Importar linha 2' })).toBeDisabled()
  })

  it('trocar a unidade tira o aviso de unidade inexistente e avisa o sexo diferente', async () => {
    const semUnidade = criarLinhaDaPrevia({
      linha: 2,
      sexo: 'F',
      avisos: [{ codigo: 'AVISO_UNIDADE_INEXISTENTE', mensagem: 'A unidade Falcões não existe no clube' }],
    })
    simularPrevia({ colunasFaltando: [], linhas: [semUnidade] })
    abrir()
    await enviar()
    await screen.findByText('A unidade Falcões não existe no clube')
    await userEvent.selectOptions(screen.getByLabelText('Unidade, linha 2'), 'Águias')
    expect(screen.queryByText('A unidade Falcões não existe no clube')).not.toBeInTheDocument()
    expect(screen.getByText('A unidade Águias é masculina.')).toBeInTheDocument()
  })
})

describe('importar planilha · confirmar', () => {
  it('envia só as linhas marcadas, sem erros nem avisos, e volta à lista com a mensagem', async () => {
    const recebidos: unknown[] = []
    simularPrevia(previaCompleta)
    servidor.use(handlerConfirmarImportacao({ importados: 2 }, 201, (c) => recebidos.push(c)))
    const { roteador } = abrir()
    await enviar()
    await userEvent.click(await screen.findByRole('button', { name: 'Importar 2 desbravadores' }))
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/adm/desbravadores'))
    expect(recebidos).toEqual([{ linhas: [pronta, outraPronta].map((linha) => paraEnvio({ ...linha, marcada: true })) }])
    expect(await screen.findByText('2 desbravadores importados.')).toBeInTheDocument()
  })

  it('422: mostra os erros em cada linha, desmarca e não sai da tela', async () => {
    simularPrevia(previaCompleta)
    servidor.use(
      handlerConfirmarImportacao(
        {
          codigo: 'REGRA',
          mensagem: 'Há linhas com erro. Nada foi importado: corrija e confirme de novo.',
          erros: [{ linha: 3, mensagens: ['A unidade escolhida não existe no clube.'] }],
        },
        422,
      ),
    )
    const { roteador } = abrir()
    await enviar()
    await userEvent.click(await screen.findByRole('button', { name: 'Importar 2 desbravadores' }))
    expect(await screen.findByText('A unidade escolhida não existe no clube.')).toBeInTheDocument()
    expect(screen.getByText('Há linhas com erro. Nada foi importado: corrija e confirme de novo.')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Importar linha 3' })).toBeDisabled()
    expect(roteador.state.location.pathname).toBe('/adm/desbravadores/importar')
  })
})

describe('lista de desbravadores', () => {
  it('o botão "Importar planilha" leva à tela de importação', async () => {
    servidor.use(handlerUnidades([aguias]), handlerClasses([amigo]), handlerDesbravadores([]))
    const { roteador } = renderizarRotas(rotasAdmDesbravadores, '/adm/desbravadores')
    await userEvent.click(await screen.findByRole('button', { name: 'Importar planilha' }))
    expect(roteador.state.location.pathname).toBe('/adm/desbravadores/importar')
  })
})
