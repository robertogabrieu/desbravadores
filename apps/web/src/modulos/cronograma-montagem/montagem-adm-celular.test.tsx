import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Montagem, RequisitoDaMontagem } from '../../api/montagem'
import type { ModoConexao } from '../../offline'
import { handlerClasses } from '../../testes/handlers/leitura'
import {
  CRONOGRAMA_ID,
  REQ_CAMPO,
  REQ_COLOCADO,
  REQ_EM_CONFLITO,
  REQ_LIVRE,
  criarDataMontagem,
  criarMontagem,
  criarMontagemDeExemplo,
  handlersMontagem,
} from '../../testes/handlers/montagem'
import { criarVinculo, handlersSessao, uuid } from '../../testes/handlers/sessao'
import { simularLargura } from '../../testes/midia'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { rotasAdmCronogramas } from './rotas'

const offline = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao }))

vi.mock('../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../offline')>()),
  useConexao: () => ({ modo: offline.modo }),
}))

const rolarAte = vi.fn()

beforeEach(() => {
  offline.modo = 'ONLINE'
  rolarAte.mockClear()
  Element.prototype.scrollIntoView = rolarAte
})

afterEach(() => {
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
})

async function abrirNoCelular(montagem: Montagem = criarMontagemDeExemplo()) {
  simularLargura(390)
  const { handlers, registro } = handlersMontagem(montagem)
  servidor.use(...handlersSessao([criarVinculo('ADM')]), handlerClasses(), ...handlers)
  renderizarRotas(rotasAdmCronogramas, '/adm/cronogramas')
  await screen.findByText(/requisitos com data/)
  return { registro, usuario: userEvent.setup() }
}

/** A mesma montagem de exemplo, com `requisito` já na `data`. */
function comRequisitoNaData(requisito: RequisitoDaMontagem, data: string): Montagem {
  const montagem = criarMontagemDeExemplo()
  return {
    ...montagem,
    requisitos: montagem.requisitos.map((item) => (item.id === requisito.id ? { ...item, data, aulaId: uuid(2999) } : item)),
  }
}

const folha = () => screen.getByRole('dialog', { name: 'Em qual data?' })
const botaoDaData = (diaEMes: string) => within(folha()).getByRole('button', { name: new RegExp(diaEMes) })
const cartaoDaData = (data: string) => document.querySelector<HTMLElement>(`li[data-data="${data}"]`) as HTMLElement
const requisitoNaLista = (requisito: RequisitoDaMontagem) => screen.getByRole('button', { name: new RegExp(requisito.texto) })

describe('A7 celular · início', () => {
  it('abre em "Sem data" com a contagem, só com os requisitos sem data, e o cartão de estado', async () => {
    await abrirNoCelular()
    expect(screen.getByRole('tab', { name: 'Sem data · 2' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Com data · 3' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: 'Por data' })).toBeInTheDocument()
    expect(screen.getByText('3 de 5 requisitos com data')).toBeInTheDocument()
    expect(screen.getByText('Rascunho')).toBeInTheDocument()
    expect(requisitoNaLista(REQ_LIVRE)).toBeInTheDocument()
    expect(requisitoNaLista(REQ_CAMPO)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: new RegExp(REQ_COLOCADO.texto) })).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Classe' })).not.toBeInTheDocument()
  })

  it('"Com data" lista só os requisitos com data e mostra a data de cada um', async () => {
    const { usuario } = await abrirNoCelular()
    await usuario.click(screen.getByRole('tab', { name: 'Com data · 3' }))
    expect(requisitoNaLista(REQ_COLOCADO)).toHaveTextContent('04/10')
    expect(screen.queryByRole('button', { name: new RegExp(REQ_LIVRE.texto) })).not.toBeInTheDocument()
  })

  it('o botão de contexto mostra classe e ano e abre a folha com os seletores de hoje', async () => {
    const { usuario } = await abrirNoCelular()
    const contexto = screen.getByRole('button', { name: /Trocar classe ou ano/ })
    expect(contexto).toHaveTextContent('Amigo · Regular')
    expect(contexto).toHaveTextContent(/Ano do clube \d{4}/)
    await usuario.click(contexto)
    const troca = screen.getByRole('dialog', { name: 'Trocar classe ou ano' })
    expect(within(troca).getByRole('combobox', { name: 'Classe' })).toBeInTheDocument()
    expect(within(troca).getByRole('combobox', { name: 'Ano do clube' })).toBeInTheDocument()
  })
})

describe('A7 celular · folha "Em qual data?"', () => {
  it('esconde as datas que não aceitam e diz por quê, mês a mês, com atalhos e a "Próxima"', async () => {
    const { usuario } = await abrirNoCelular()
    await usuario.click(requisitoNaLista(REQ_LIVRE))
    expect(within(folha()).getByRole('checkbox', { name: 'Esconder datas que não aceitam' })).toBeChecked()
    expect(within(folha()).queryByRole('button', { name: /11\/10/ })).not.toBeInTheDocument()
    expect(folha()).toHaveTextContent('11/10 não aceita: sem classe (Feriado prolongado).')
    expect(folha()).toHaveTextContent('25/10 não aceita: sem classe (Ensaio da investidura).')
    expect(folha()).toHaveTextContent('01/11 não aceita: classe já dada.')
    expect(within(folha()).getByRole('heading', { name: 'Outubro de 2026' })).toBeInTheDocument()
    expect(within(folha()).getByRole('heading', { name: 'Novembro de 2026' })).toBeInTheDocument()
    expect(botaoDaData('18/10')).toHaveTextContent('Próxima')
    expect(botaoDaData('04/10')).not.toHaveTextContent('Próxima')

    const atalhos = within(folha()).getByRole('navigation', { name: 'Ir para o mês' })
    await usuario.click(within(atalhos).getByRole('button', { name: 'Nov' }))
    expect(rolarAte).toHaveBeenCalledTimes(1)
    expect(rolarAte.mock.contexts[0]).toBe(within(folha()).getByRole('heading', { name: 'Novembro de 2026' }))
  })

  it('desmarcar a caixa mostra as datas que não aceitam, desligadas e com o motivo', async () => {
    const { usuario } = await abrirNoCelular()
    await usuario.click(requisitoNaLista(REQ_LIVRE))
    await usuario.click(within(folha()).getByRole('checkbox', { name: 'Esconder datas que não aceitam' }))
    expect(botaoDaData('11/10')).toBeDisabled()
    expect(folha()).not.toHaveTextContent('não aceita:')
  })
})

describe('A7 celular · depois de colocar', () => {
  it('confirma, oferece o próximo sem data e "Escolher data do X" abre a folha para ele', async () => {
    const { registro, usuario } = await abrirNoCelular()
    registro.responder(comRequisitoNaData(REQ_LIVRE, '2026-10-18'))
    await usuario.click(requisitoNaLista(REQ_LIVRE))
    await usuario.click(botaoDaData('18/10'))
    expect(await screen.findByText(`${REQ_LIVRE.codigo} ficou em 18/10`)).toHaveAttribute('role', 'status')
    const proximo = screen.getByRole('region', { name: 'Próximo sem data' })
    expect(proximo).toHaveTextContent(REQ_CAMPO.texto)
    await usuario.click(within(proximo).getByRole('button', { name: `Escolher data do ${REQ_CAMPO.codigo}` }))
    expect(folha()).toHaveTextContent(`${REQ_CAMPO.codigo} · ${REQ_CAMPO.texto}`)
  })

  it('sem mais requisitos sem data, o cartão diz que todos têm data', async () => {
    const data = criarDataMontagem('2026-10-04', { aulaId: uuid(2001) })
    const montagem = criarMontagem({ requisitos: [REQ_LIVRE], datas: [data] })
    const { registro, usuario } = await abrirNoCelular(montagem)
    registro.responder({ ...montagem, requisitos: [{ ...REQ_LIVRE, data: '2026-10-04', aulaId: uuid(2001) }] })
    await usuario.click(requisitoNaLista(REQ_LIVRE))
    await usuario.click(botaoDaData('04/10'))
    const proximo = await screen.findByRole('region', { name: 'Próximo sem data' })
    expect(proximo).toHaveTextContent('Todos os requisitos têm data')
    expect(within(proximo).queryByRole('button')).not.toBeInTheDocument()
  })

  it('409 na folha: a faixa aparece dentro dela e "Atualizar" refaz a busca', async () => {
    const { registro, usuario } = await abrirNoCelular()
    registro.falharProxima(409, { codigo: 'CONFLITO', mensagem: 'Outra pessoa acabou de mudar esta data. Atualize a tela.' })
    await usuario.click(requisitoNaLista(REQ_LIVRE))
    await usuario.click(botaoDaData('18/10'))
    await usuario.click(await within(folha()).findByRole('button', { name: 'Atualizar' }))
    await waitFor(() => expect(registro.leituras).toBe(2))
  })

  it('Desfazer de quem não tinha data tira o requisito da data', async () => {
    const { registro, usuario } = await abrirNoCelular()
    registro.responder(comRequisitoNaData(REQ_LIVRE, '2026-10-18'))
    await usuario.click(requisitoNaLista(REQ_LIVRE))
    await usuario.click(botaoDaData('18/10'))
    await usuario.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(registro.chamadas).toHaveLength(2))
    expect(registro.chamadas[1]).toMatchObject({ metodo: 'DELETE', caminho: `/api/cronogramas/${CRONOGRAMA_ID}/requisitos/${REQ_LIVRE.id}` })
    expect(await screen.findByText(`${REQ_LIVRE.codigo} voltou a ficar sem data`)).toBeInTheDocument()
  })

  it('Desfazer de quem já tinha data devolve o requisito para a data anterior', async () => {
    const { registro, usuario } = await abrirNoCelular()
    registro.responder(comRequisitoNaData(REQ_COLOCADO, '2026-10-18'))
    await usuario.click(screen.getByRole('tab', { name: 'Com data · 3' }))
    await usuario.click(requisitoNaLista(REQ_COLOCADO))
    await usuario.click(botaoDaData('18/10'))
    await usuario.click(await screen.findByRole('button', { name: 'Desfazer' }))
    await waitFor(() => expect(registro.chamadas).toHaveLength(2))
    expect(registro.chamadas[1]).toMatchObject({
      metodo: 'PUT',
      caminho: `/api/cronogramas/${CRONOGRAMA_ID}/requisitos/${REQ_COLOCADO.id}`,
      corpo: { data: '2026-10-04' },
    })
    expect(await screen.findByText(`${REQ_COLOCADO.codigo} voltou para 04/10`)).toBeInTheDocument()
  })
})

describe('A7 celular · por data', () => {
  async function abrirPorData(montagem?: Montagem) {
    const aberto = await abrirNoCelular(montagem)
    await aberto.usuario.click(screen.getByRole('tab', { name: 'Por data' }))
    return aberto
  }

  it('cada data em ordem num cartão; "Trocar data" abre a folha e "Tirar da data" remove', async () => {
    const { registro, usuario } = await abrirPorData()
    const datas = [...document.querySelectorAll<HTMLElement>('li[data-data]')].map((item) => item.dataset['data'])
    expect(datas).toEqual(['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25', '2026-11-01'])
    expect(cartaoDaData('2026-10-04')).toHaveTextContent('Dom, 04/10')
    expect(cartaoDaData('2026-10-18')).toHaveTextContent('Acampamento do clube')

    const trocar = within(cartaoDaData('2026-10-04')).getByRole('button', { name: `Trocar data do ${REQ_COLOCADO.codigo}` })
    const tirar = within(cartaoDaData('2026-10-04')).getByRole('button', { name: `Tirar ${REQ_COLOCADO.codigo} da data` })
    expect(trocar).toHaveTextContent('Trocar data')
    expect(tirar).toHaveTextContent('Tirar da data')
    expect(tirar.className).toContain('min-h-[var(--touch-min)]')
    await usuario.click(trocar)
    expect(within(folha()).getByText('Hoje em 04/10')).toBeInTheDocument()
    await usuario.click(within(folha()).getByRole('button', { name: 'Fechar' }))

    await usuario.click(within(cartaoDaData('2026-10-04')).getByRole('button', { name: `Tirar ${REQ_COLOCADO.codigo} da data` }))
    await waitFor(() => expect(registro.chamadas).toHaveLength(1))
    expect(registro.chamadas[0]).toMatchObject({ metodo: 'DELETE', caminho: `/api/cronogramas/${CRONOGRAMA_ID}/requisitos/${REQ_COLOCADO.id}` })
  })

  it('data em conflito: contorno de perigo, o aviso em texto e "Escolher outra data" que abre a folha', async () => {
    const { usuario } = await abrirPorData()
    const conflito = cartaoDaData('2026-10-25')
    expect(conflito).toHaveAttribute('data-estado', 'conflito')
    expect(conflito.className).toContain('border-perigo')
    expect(conflito).toHaveTextContent('Não haverá classe nesta data. Escolha outra para o requisito abaixo.')
    expect(within(conflito).queryByRole('button', { name: /Trocar data/ })).not.toBeInTheDocument()
    await usuario.click(within(conflito).getByRole('button', { name: `Escolher outra data para ${REQ_EM_CONFLITO.codigo}` }))
    expect(folha()).toHaveTextContent(`${REQ_EM_CONFLITO.codigo} · ${REQ_EM_CONFLITO.texto}`)
  })

  it('data com classe dada: selo "Classe dada" e nenhuma ação', async () => {
    await abrirPorData()
    const dada = cartaoDaData('2026-11-01')
    expect(within(dada).getByText('Classe dada')).toBeInTheDocument()
    expect(within(dada).queryByRole('button')).not.toBeInTheDocument()
  })

  it('as ações do dia de classe ficam aqui: editar, remover e, nas agrupadas, novo dia de classe', async () => {
    const { usuario } = await abrirPorData(criarMontagemDeExemplo({ datasLivres: true }))
    const comAula = cartaoDaData('2026-10-04')
    expect(within(comAula).getByRole('button', { name: 'Editar horário, local e título' })).toBeInTheDocument()
    await usuario.click(within(comAula).getByRole('button', { name: 'Remover dia de classe' }))
    expect(screen.getByRole('dialog', { name: 'Remover este dia de classe?' })).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.getByRole('button', { name: '+ Novo dia de classe' })).toBeInTheDocument()
  })
})

describe('A7 celular · publicar no rodapé', () => {
  const rodape = () => screen.getByRole('region', { name: 'Publicação' })

  it('com requisito sem data: resumo, "Dá para publicar assim mesmo" e botão secundário', async () => {
    const semConflito = criarMontagemDeExemplo()
    semConflito.datas = semConflito.datas.map((dado) => ({ ...dado, conflito: false }))
    await abrirNoCelular(semConflito)
    expect(rodape()).toHaveTextContent('2 sem data')
    expect(rodape()).toHaveTextContent('Dá para publicar assim mesmo.')
    const publicar = within(rodape()).getByRole('button', { name: 'Publicar…' })
    expect(publicar.className).not.toContain('bg-marca')
    expect(screen.queryByRole('button', { name: 'Publicar' })).not.toBeInTheDocument()
  })

  it('com data em conflito, o resumo diz quantas', async () => {
    await abrirNoCelular()
    expect(rodape()).toHaveTextContent('1 data com conflito')
  })

  it('todos com data: botão primário', async () => {
    const data = criarDataMontagem('2026-10-04', { aulaId: uuid(2001), requisitoIds: [REQ_COLOCADO.id] })
    await abrirNoCelular(criarMontagem({ requisitos: [REQ_COLOCADO], datas: [data] }))
    expect(rodape()).toHaveTextContent('Todos os requisitos têm data')
    expect(within(rodape()).getByRole('button', { name: 'Publicar…' }).className).toContain('bg-marca')
  })

  it('publicado: o rodapé diz "Publicado" e não tem botão', async () => {
    const montagem = criarMontagemDeExemplo()
    if (montagem.cronograma) montagem.cronograma.status = 'PUBLICADO'
    await abrirNoCelular(montagem)
    expect(rodape()).toHaveTextContent('Publicado')
    expect(within(rodape()).queryByRole('button')).not.toBeInTheDocument()
  })

  it('"Publicar…" pede confirmação; "Continuar montando" não grava e "Publicar cronograma" publica', async () => {
    const { registro, usuario } = await abrirNoCelular()
    await usuario.click(within(rodape()).getByRole('button', { name: 'Publicar…' }))
    const dialogo = screen.getByRole('dialog', { name: 'Publicar o cronograma de Amigo?' })
    expect(dialogo).toHaveTextContent('Os instrutores da classe recebem um aviso e passam a ver as datas.')
    expect(dialogo).toHaveTextContent('2 requisitos ainda estão sem data. Você pode colocá-los depois.')
    expect(dialogo).toHaveTextContent('Se você mudar algo depois, o cronograma volta a Rascunho até ser publicado de novo.')
    await usuario.click(within(dialogo).getByRole('button', { name: 'Continuar montando' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(registro.chamadas).toHaveLength(0)

    await usuario.click(within(rodape()).getByRole('button', { name: 'Publicar…' }))
    await usuario.click(screen.getByRole('button', { name: 'Publicar cronograma' }))
    await waitFor(() => expect(registro.chamadas).toHaveLength(1))
    expect(registro.chamadas[0]).toMatchObject({ metodo: 'POST', caminho: `/api/cronogramas/${CRONOGRAMA_ID}/publicar` })
  })
})
