import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Unidade } from '../../../api/leitura'
import { erroDaApi } from '../../../testes/handlers/auth'
import { caixa } from '../../../testes/handlers/caixa'
import { criarDetalhe, handlerDetalheDaClasse } from '../../../testes/handlers/classes-adm'
import { criarClasse, criarUnidade, handlerClasses, handlerMembrosUnidade, handlerSemMembros, handlerUnidades } from '../../../testes/handlers/leitura'
import { handlerReunioes } from '../../../testes/handlers/reunioes'
import { criarVinculo, handlersSessao, uuid } from '../../../testes/handlers/sessao'
import {
  LINK_SUBSTITUICAO,
  criarDatas,
  handlersSubstituicao,
  novoRegistroSubstituicao,
} from '../../../testes/handlers/substituicao'
import { handlerUnidade } from '../../../testes/handlers/unidades'
import { simularLargura } from '../../../testes/midia'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { rotasAdmClasses } from '../classes/rotas'
import { linkDoWhatsApp } from '../desbravadores/mensagem-convite'
import { rotasAdmUnidades } from '../unidades/rotas'
import { mensagemDaSubstituicao } from './mensagem-substituicao'

const UNIDADE = uuid(201)
const CLASSE = uuid(101)

const aguias = (parcial: Partial<Unidade> = {}) =>
  criarUnidade({ id: UNIDADE, nome: 'Águias', conselheiros: [{ usuarioId: uuid(501), nome: 'Carla Mendes' }], ...parcial })

const comPermissao = () => servidor.use(...handlersSessao([criarVinculo('ADM')], undefined, ['usuario.gerenciar']))

const MENSAGEM_UNIDADE =
  'Olá! Você vai fazer a chamada da Unidade Águias no domingo, 11/10. O link abre às 09:00 e fecha às 12:00. ' +
  `Não precisa de senha: ${LINK_SUBSTITUICAO}`

function abrirUnidade(rota: string, unidade: Unidade = aguias(), extras: Parameters<typeof servidor.use> = []) {
  servidor.use(
    handlerUnidade(caixa(unidade)),
    handlerUnidades([unidade]),
    handlerMembrosUnidade([]),
    handlerSemMembros([]),
    handlerReunioes({}),
    ...extras,
  )
  return renderizarRotas(
    [...rotasAdmUnidades, { path: '/adm/calendario', element: <p>calendário</p> }],
    rota,
  )
}

const cartao = () => screen.findByRole('region', { name: 'Substituto para um dia' })

beforeEach(() => {
  simularLargura(1280)
})

describe('cartão "Substituto para um dia" na ficha da unidade', () => {
  it('A1: sem link, ensina o que é e oferece o único botão, depois dos conselheiros', async () => {
    comPermissao()
    abrirUnidade(`/adm/unidades/${UNIDADE}`)
    const regiao = await cartao()
    expect(
      await within(regiao).findByText('Se nenhum conselheiro puder vir, mande um link para outra pessoa fazer a chamada. Ela não precisa de conta.'),
    ).toBeInTheDocument()
    const botao = await within(regiao).findByRole('link', { name: 'Gerar link de substituição' })
    expect(botao).toHaveAttribute('href', `/adm/unidades/${UNIDADE}/substituicao`)
    expect(within(regiao).getAllByRole('link')).toHaveLength(1)
    const conselheiros = screen.getByText('Conselheiros', { selector: 'dt' })
    const membros = screen.getByRole('region', { name: 'Membros' })
    expect(conselheiros.compareDocumentPosition(regiao) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(regiao.compareDocumentPosition(membros) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('sem a permissão de gerenciar usuários, o cartão não aparece', async () => {
    servidor.use(...handlersSessao([criarVinculo('ADM')]))
    abrirUnidade(`/adm/unidades/${UNIDADE}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Águias' })).toBeInTheDocument()
    expect(screen.queryByText('Substituto para um dia')).not.toBeInTheDocument()
  })

  it('unidade inativa não mostra o cartão', async () => {
    comPermissao()
    abrirUnidade(`/adm/unidades/${UNIDADE}`, aguias({ ativa: false }))
    expect(await screen.findByText(/· Inativa/)).toBeInTheDocument()
    expect(screen.queryByText('Substituto para um dia')).not.toBeInTheDocument()
  })

  it('erro ao ler o link mostra a falha com nova tentativa', async () => {
    comPermissao()
    abrirUnidade(`/adm/unidades/${UNIDADE}`, aguias(), [
      http.get('/api/unidades/:id/substituicao', () => erroDaApi(500, 'ERRO', 'Falhou ao ler o link.')),
    ])
    const regiao = await cartao()
    expect(await within(regiao).findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('A4: link ainda não aberto mostra o dia, a janela e "Ainda não foi aberto"', async () => {
    comPermissao()
    abrirUnidade(`/adm/unidades/${UNIDADE}`, aguias(), [
      ...handlersSubstituicao({ inicial: { id: uuid(950), ...criarDatas()[0], identificadaEm: null, substituto: null } }),
    ])
    const regiao = await cartao()
    expect(await within(regiao).findByText('Ainda não foi aberto')).toBeInTheDocument()
    expect(within(regiao).getByText('Reunião', { selector: 'dt' }).nextElementSibling).toHaveTextContent('Dom., 11/10, 09:00 às 12:00')
    expect(within(regiao).queryByRole('link', { name: 'Gerar link de substituição' })).not.toBeInTheDocument()
  })

  it('A4: link aberto mostra quem abriu e a hora; cancelar pede confirmação e, confirmado, volta a A1', async () => {
    comPermissao()
    const registro = novoRegistroSubstituicao()
    const aberto = { id: uuid(950), ...criarDatas()[0], identificadaEm: '2026-10-11T12:05:00.000Z', substituto: { nome: 'Marcos Lima' } }
    abrirUnidade(`/adm/unidades/${UNIDADE}`, aguias(), [...handlersSubstituicao({ inicial: aberto, registro })])
    const regiao = await cartao()
    expect(await within(regiao).findByText('Aberto por Marcos Lima às 09:05')).toBeInTheDocument()

    await userEvent.click(within(regiao).getByRole('button', { name: 'Cancelar link' }))
    const dialogo = screen.getByRole('dialog', { name: 'Cancelar?' })
    expect(dialogo).toHaveTextContent('Marcos não vai conseguir lançar mais nada por este link.')
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Voltar' }))
    expect(registro.cancelados).toHaveLength(0)
    expect(within(regiao).getByText('Aberto por Marcos Lima às 09:05')).toBeInTheDocument()

    await userEvent.click(within(regiao).getByRole('button', { name: 'Cancelar link' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Cancelar?' })).getByRole('button', { name: 'Sim, cancelar' }))
    expect(await within(regiao).findByRole('link', { name: 'Gerar link de substituição' })).toBeInTheDocument()
    expect(registro.cancelados).toEqual([{ alvo: 'unidades', id: UNIDADE }])
  })
})

describe('A2 · escolher o dia', () => {
  it('lista os dias com a próxima reunião marcada, e o botão diz o dia escolhido', async () => {
    comPermissao()
    const registro = novoRegistroSubstituicao()
    abrirUnidade(`/adm/unidades/${UNIDADE}`, aguias(), [...handlersSubstituicao({ registro })])
    await userEvent.click(await within(await cartao()).findByRole('link', { name: 'Gerar link de substituição' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Link de substituição' })).toBeInTheDocument()
    const grupo = await screen.findByRole('radiogroup', { name: 'Para qual reunião?' })
    const opcoes = within(grupo).getAllByRole('radio')
    expect(opcoes).toHaveLength(3)
    expect(within(grupo).getByRole('radio', { name: /Domingo, 11 de outubro/ })).toBeChecked()
    expect(within(grupo).getByRole('radio', { name: /Domingo, 11 de outubro/ })).toHaveAccessibleName(/das 09:00 às 12:00 · próxima reunião/)
    expect(within(grupo).getByRole('radio', { name: /Sábado, 17 de outubro/ })).toHaveAccessibleName(/das 15:00 às 18:00$/)
    expect(screen.getByText('Só aparecem dias com reunião no calendário, de hoje até 4 semanas à frente.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Gerar link para 11 de outubro' })).toBeInTheDocument()

    await userEvent.click(within(grupo).getByRole('radio', { name: /Sábado, 17 de outubro/ }))
    expect(screen.getByRole('button', { name: 'Gerar link para 17 de outubro' })).toBeInTheDocument()
    expect(registro.datasPedidas).toContain('CHAMADA')
  })

  it('sem nenhum dia, diz que não há reunião e leva ao calendário', async () => {
    comPermissao()
    abrirUnidade(`/adm/unidades/${UNIDADE}/substituicao`, aguias(), [...handlersSubstituicao({ datas: [] })])
    expect(await screen.findByText('Não há reunião no calendário nas próximas 4 semanas')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Abrir o calendário' })).toHaveAttribute('href', '/adm/calendario')
    expect(screen.queryByRole('button', { name: /Gerar link/ })).not.toBeInTheDocument()
  })

  it('erro ao ler os dias mostra a falha com nova tentativa', async () => {
    comPermissao()
    abrirUnidade(`/adm/unidades/${UNIDADE}/substituicao`, aguias(), [
      http.get('/api/substituicoes/datas', () => erroDaApi(500, 'ERRO', 'Falhou ao ler os dias.')),
    ])
    expect(await screen.findByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
  })

  it('a geração recusada mostra o motivo e continua na escolha', async () => {
    comPermissao()
    abrirUnidade(`/adm/unidades/${UNIDADE}/substituicao`, aguias(), [
      http.post('/api/unidades/:id/substituicao', () => erroDaApi(403, 'SEM_PERMISSAO', 'Você não pode gerar este link.')),
    ])
    await userEvent.click(await screen.findByRole('button', { name: 'Gerar link para 11 de outubro' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Você não pode gerar este link.')
    expect(screen.getByRole('radiogroup', { name: 'Para qual reunião?' })).toBeInTheDocument()
  })
})

describe('A3 · link gerado', () => {
  it('mostra para quê, quando e a mensagem do WhatsApp; "Copiar link" confirma sem sumir', async () => {
    comPermissao()
    const usuario = userEvent.setup()
    const registro = novoRegistroSubstituicao()
    abrirUnidade(`/adm/unidades/${UNIDADE}/substituicao`, aguias(), [...handlersSubstituicao({ registro })])
    await usuario.click(await screen.findByRole('button', { name: 'Gerar link para 11 de outubro' }))

    expect(await screen.findByText('Link pronto')).toBeInTheDocument()
    expect(registro.gerados).toEqual([{ alvo: 'unidades', id: UNIDADE, corpo: { data: '2026-10-11' } }])
    expect(screen.getByText('Para', { selector: 'dt' }).nextElementSibling).toHaveTextContent('Chamada da Unidade Águias')
    expect(screen.getByText('Quando', { selector: 'dt' }).nextElementSibling).toHaveTextContent('Dom., 11/10, das 09:00 às 12:00')
    expect(screen.getByText(MENSAGEM_UNIDADE)).toBeInTheDocument()
    expect(screen.getByText('O link aparece só agora. Para mandar de novo, gere outro: o anterior deixa de valer.')).toBeInTheDocument()
    const whatsapp = screen.getByRole('link', { name: 'Enviar por WhatsApp' })
    expect(whatsapp).toHaveAttribute('href', linkDoWhatsApp(MENSAGEM_UNIDADE))

    await usuario.click(screen.getByRole('button', { name: 'Copiar link' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Link copiado.')
    expect(await navigator.clipboard.readText()).toBe(LINK_SUBSTITUICAO)
    await usuario.click(screen.getByText('Link pronto'))
    expect(screen.getByRole('status')).toHaveTextContent('Link copiado.')
  })

  it('voltando à ficha, o cartão mostra o link em uso (A4), sem o link', async () => {
    comPermissao()
    abrirUnidade(`/adm/unidades/${UNIDADE}/substituicao`, aguias(), [...handlersSubstituicao()])
    await userEvent.click(await screen.findByRole('button', { name: 'Gerar link para 11 de outubro' }))
    await screen.findByText('Link pronto')
    await userEvent.click(screen.getByRole('link', { name: /Voltar para/ }))
    const regiao = await cartao()
    expect(await within(regiao).findByText('Ainda não foi aberto')).toBeInTheDocument()
    expect(within(regiao).queryByText(LINK_SUBSTITUICAO)).not.toBeInTheDocument()
  })
})

describe('link de substituição da classe', () => {
  const amigo = criarClasse({ id: CLASSE, nome: 'Amigo', idade: 10, ordem: 1 })

  function abrirClasse(rota: string, ativa = true, extras: Parameters<typeof servidor.use> = []) {
    servidor.use(handlerClasses([{ ...amigo, ativa }]), handlerDetalheDaClasse(criarDetalhe({ ...amigo, ativa })), ...extras)
    return renderizarRotas([...rotasAdmClasses, { path: '/adm/calendario', element: <p>calendário</p> }], rota)
  }

  it('o detalhe da classe ativa mostra A1 com o texto da classe', async () => {
    comPermissao()
    abrirClasse(`/adm/classes?classe=${CLASSE}`)
    const regiao = await cartao()
    expect(
      await within(regiao).findByText(
        'Se nenhum instrutor puder vir, mande um link para outra pessoa fazer o registro da classe Amigo. Ela não precisa de conta.',
      ),
    ).toBeInTheDocument()
    expect(await within(regiao).findByRole('link', { name: 'Gerar link de substituição' })).toHaveAttribute(
      'href',
      `/adm/classes/${CLASSE}/substituicao`,
    )
  })

  it('classe desativada no clube não mostra o cartão', async () => {
    comPermissao()
    abrirClasse(`/adm/classes?classe=${CLASSE}`, false)
    expect(await screen.findByText('Requisitos')).toBeInTheDocument()
    expect(screen.queryByText('Substituto para um dia')).not.toBeInTheDocument()
  })

  it('sem a permissão, o detalhe da classe não mostra o cartão', async () => {
    servidor.use(...handlersSessao([criarVinculo('ADM')]))
    abrirClasse(`/adm/classes?classe=${CLASSE}`)
    expect(await screen.findByText('Requisitos')).toBeInTheDocument()
    expect(screen.queryByText('Substituto para um dia')).not.toBeInTheDocument()
  })

  it('gera o link da classe com os dias de classe e a mensagem do registro da classe', async () => {
    comPermissao()
    const registro = novoRegistroSubstituicao()
    const { container } = abrirClasse(`/adm/classes/${CLASSE}/substituicao`, true, [...handlersSubstituicao({ registro })])
    await userEvent.click(await screen.findByRole('button', { name: 'Gerar link para 11 de outubro' }))
    expect(await screen.findByText('Link pronto')).toBeInTheDocument()
    expect(registro.datasPedidas).toContain('CLASSE')
    expect(registro.gerados).toEqual([{ alvo: 'classes', id: CLASSE, corpo: { data: '2026-10-11' } }])
    expect(screen.getByText('Para', { selector: 'dt' }).nextElementSibling).toHaveTextContent('Registro da classe Amigo')
    expect(
      screen.getByText(
        `Olá! Você vai fazer o registro da classe Amigo no domingo, 11/10. O link abre às 09:00 e fecha às 12:00. Não precisa de senha: ${LINK_SUBSTITUICAO}`,
      ),
    ).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/aula/i)
  })
})

describe('texto novo', () => {
  it('nenhum texto das telas do link usa "aula"', async () => {
    comPermissao()
    const { container } = abrirUnidade(`/adm/unidades/${UNIDADE}/substituicao`, aguias(), [...handlersSubstituicao({ datas: [] })])
    await screen.findByText('Não há reunião no calendário nas próximas 4 semanas')
    expect(container.textContent).not.toMatch(/aula/i)
  })

  it('a mensagem do WhatsApp sai no fuso do clube', () => {
    const [janela] = criarDatas()
    expect(
      mensagemDaSubstituicao({ alvo: { tipo: 'unidade', nome: 'Águias' }, janela, link: 'L', fuso: 'America/Manaus' }),
    ).toBe('Olá! Você vai fazer a chamada da Unidade Águias no domingo, 11/10. O link abre às 08:00 e fecha às 11:00. Não precisa de senha: L')
  })

  it('tela do link: o botão de gerar e as opções têm alvo de toque mínimo', async () => {
    comPermissao()
    abrirUnidade(`/adm/unidades/${UNIDADE}/substituicao`)
    const botao = await screen.findByRole('button', { name: 'Gerar link para 11 de outubro' })
    expect(botao.className).toContain('min-h-[var(--touch-min)]')
    for (const radio of screen.getAllByRole('radio')) expect(radio.closest('label')?.className).toContain('min-h-[var(--touch-min)]')
  })
})
