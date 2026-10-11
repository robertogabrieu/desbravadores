import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Montagem } from '../../api/montagem'
import type { ModoConexao } from '../../offline'
import { GuardaRota } from '../../sessao/GuardaRota'
import { criarClasse, handlerClasses } from '../../testes/handlers/leitura'
import {
  AVANCADA_MONTAGEM,
  CLASSE_AVANCADA_MONTAGEM,
  CLASSE_MONTAGEM,
  CRONOGRAMA_ID,
  criarDataMontagem,
  criarMontagem,
  criarRequisitoAvancada,
  criarRequisitoMontagem,
  handlersMontagem,
  situacaoDoDia,
} from '../../testes/handlers/montagem'
import { criarVinculo, handlersSessao, uuid } from '../../testes/handlers/sessao'
import { simularLargura } from '../../testes/midia'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { rotasAdmCronogramas, rotasCronogramaMontagem } from './rotas'

const offline = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao }))

vi.mock('../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../offline')>()),
  useConexao: () => ({ modo: offline.modo }),
}))

beforeEach(() => {
  offline.modo = 'ONLINE'
})

const CLASSE_REGULAR = criarClasse({ avancadaPareadaId: AVANCADA_MONTAGEM.id })
const CLASSE_AVANCADA = criarClasse({ id: AVANCADA_MONTAGEM.id, nome: 'Amigo da Natureza', tipo: 'AVANCADA', classeBaseId: uuid(100), regularDoParId: uuid(100), ordem: 2 })

// Um cronograma só, o da regular. Regular: R1 sem data, R3 em 04/10. Avançada: AN1 e AN5 sem data; AN2, AN3 e AN4 em 04/10; AN6 em 25/10.
const R1 = criarRequisitoMontagem(1)
const R3 = criarRequisitoMontagem(3, { aulaId: uuid(2001), data: '2026-10-04' })
const AN1 = criarRequisitoAvancada(1)
const AN2 = criarRequisitoAvancada(2, { aulaId: uuid(2001), data: '2026-10-04' })
const AN3 = criarRequisitoAvancada(3, { aulaId: uuid(2001), data: '2026-10-04' })
const AN4 = criarRequisitoAvancada(4, { aulaId: uuid(2001), data: '2026-10-04' })
const AN5 = criarRequisitoAvancada(5)
const AN6 = criarRequisitoAvancada(6, { aulaId: uuid(2002), data: '2026-10-25' })

const DATAS = [
  criarDataMontagem('2026-10-04', { aulaId: uuid(2001), requisitoIds: [R3.id, AN2.id, AN3.id, AN4.id] }),
  criarDataMontagem('2026-10-11', { situacao: situacaoDoDia('2026-10-11', [{ nome: 'Feriado prolongado', tipo: 'SEM_REUNIAO' }]) }),
  criarDataMontagem('2026-10-18'),
  criarDataMontagem('2026-10-25', { aulaId: uuid(2002), requisitoIds: [AN6.id] }),
]

/** Regular + avançada: 04/10 cheia (1 + 3), 11/10 bloqueada, 18/10 vazia, 25/10 com 1. */
function criarPar(parcial: Partial<Montagem> = {}): Montagem {
  return criarMontagem({
    requisitos: [R1, R3, AN1, AN2, AN3, AN4, AN5, AN6],
    datas: DATAS,
    avancada: AVANCADA_MONTAGEM,
    ...parcial,
  })
}

const linha = (data: string) => document.querySelector<HTMLElement>(`li[data-data="${data}"]`) as HTMLElement
const datasNaOrdem = () => Array.from(document.querySelectorAll('li[data-data]')).map((item) => item.getAttribute('data-data'))

function abrirAdm(montagem: Montagem = criarPar(), rota = '/adm/cronogramas', classes = [CLASSE_REGULAR, CLASSE_AVANCADA]) {
  const { handlers, registro } = handlersMontagem(montagem)
  servidor.use(...handlersSessao([criarVinculo('ADM')]), handlerClasses(classes), ...handlers)
  renderizarRotas(rotasAdmCronogramas, rota)
  return registro
}

const rotasInstrutor = [{ element: <GuardaRota papeis={['INSTRUTOR', 'ADM']} />, children: rotasCronogramaMontagem }]

function abrirInstrutor(montagem: Montagem = criarPar(), rota = '/cronograma/montar') {
  const { handlers, registro } = handlersMontagem(montagem)
  servidor.use(
    ...handlersSessao([criarVinculo('INSTRUTOR', 1, { classes: [CLASSE_MONTAGEM, CLASSE_AVANCADA_MONTAGEM] })]),
    handlerClasses([CLASSE_REGULAR, CLASSE_AVANCADA]),
    ...handlers,
  )
  renderizarRotas(rotasInstrutor, rota)
  return registro
}

describe('Regular e avançada · seletor de classe', () => {
  it('mostra o par como uma opção só e não tem mais o alternador Regular | Avançada', async () => {
    abrirAdm()
    const seletor = await screen.findByRole('combobox', { name: 'Classe' })
    expect(await within(seletor).findByRole('option', { name: 'Amigo + Amigo da Natureza' })).toBeInTheDocument()
    expect(within(seletor).getAllByRole('option')).toHaveLength(1)
    expect(screen.queryByRole('radiogroup', { name: 'Tipo da classe' })).not.toBeInTheDocument()
  })

  it('regular sem avançada ativa mostra só o nome', async () => {
    abrirAdm(criarMontagem(), '/adm/cronogramas', [criarClasse(), { ...CLASSE_AVANCADA, ativa: false, regularDoParId: null }])
    const seletor = await screen.findByRole('combobox', { name: 'Classe' })
    expect(await within(seletor).findByRole('option', { name: 'Amigo' })).toBeInTheDocument()
  })

  it('abrir com ?classe=<avançada> lê a montagem da regular', async () => {
    const registro = abrirAdm(criarPar(), `/adm/cronogramas?classe=${CLASSE_AVANCADA.id}`)
    await screen.findByRole('heading', { name: 'Requisitos' })
    expect(registro.classesLidas).toEqual([uuid(100)])
  })
})

describe('Regular e avançada · regular inativa', () => {
  const REGULAR_INATIVA = criarClasse({ ativa: false })
  const AVANCADA_SOLTA = { ...CLASSE_AVANCADA, regularDoParId: null }
  const montagemDaAvancada = criarMontagem({ classe: CLASSE_AVANCADA_MONTAGEM, requisitos: [AN1], datas: DATAS })

  it('Adm: a avançada vale sozinha — aparece no seletor pelo próprio nome, e a regular inativa não', async () => {
    abrirAdm(montagemDaAvancada, '/adm/cronogramas', [REGULAR_INATIVA, AVANCADA_SOLTA])
    const seletor = await screen.findByRole('combobox', { name: 'Classe' })
    expect(await within(seletor).findByRole('option', { name: 'Amigo da Natureza' })).toBeInTheDocument()
    expect(within(seletor).getAllByRole('option')).toHaveLength(1)
  })

  it('Adm: ?classe=<avançada> abre a montagem da própria avançada, sem ir para a regular inativa', async () => {
    const registro = abrirAdm(montagemDaAvancada, `/adm/cronogramas?classe=${CLASSE_AVANCADA.id}`, [REGULAR_INATIVA, AVANCADA_SOLTA])
    await screen.findByRole('heading', { name: 'Requisitos da classe' })
    expect(registro.classesLidas).toEqual([CLASSE_AVANCADA.id])
  })

  it('instrutor: ?classe=<avançada> abre a avançada e o seletor oferece as duas como itens próprios', async () => {
    const { handlers, registro } = handlersMontagem(montagemDaAvancada)
    servidor.use(
      ...handlersSessao([criarVinculo('INSTRUTOR', 1, { classes: [CLASSE_MONTAGEM, CLASSE_AVANCADA_MONTAGEM] })]),
      handlerClasses([REGULAR_INATIVA, AVANCADA_SOLTA]),
      ...handlers,
    )
    renderizarRotas(rotasInstrutor, `/cronograma/montar?classe=${CLASSE_AVANCADA.id}`)
    const seletor = await screen.findByRole('combobox', { name: 'Classe' })
    expect(within(seletor).getAllByRole('option').map((opcao) => opcao.textContent)).toEqual(['Amigo', 'Amigo da Natureza'])
    await waitFor(() => expect(registro.classesLidas).not.toHaveLength(0))
    expect(registro.classesLidas).toEqual([CLASSE_AVANCADA.id])
  })
})

describe('Regular e avançada · requisitos no computador', () => {
  it('um cartão "Requisitos" com duas barras, cada uma escrita com o nome e a contagem', async () => {
    abrirAdm()
    await screen.findByRole('heading', { name: 'Requisitos' })
    expect(screen.getByRole('progressbar', { name: 'Regular · Amigo — 1 de 2 com data' })).toHaveAttribute('aria-valuenow', '50')
    const avancada = screen.getByRole('progressbar', { name: 'Avançada · Amigo da Natureza — 4 de 6 com data' })
    expect(avancada).toHaveAttribute('aria-valuenow', '67')
    expect(avancada.firstElementChild?.className).toContain('repeating-linear-gradient')
  })

  it('o filtro começa em "Sem data" com as duas classes; "Regular" e "Avançada" mostram todos da classe', async () => {
    abrirAdm()
    const usuario = userEvent.setup()
    await screen.findByRole('heading', { name: 'Requisitos' })
    const secao = within(screen.getByRole('region', { name: 'Requisitos' }))
    expect(secao.getByRole('tab', { name: 'Sem data (3)' })).toHaveAttribute('aria-selected', 'true')
    expect(secao.getByText(R1.texto)).toBeInTheDocument()
    expect(secao.getByText(AN1.texto)).toBeInTheDocument()
    expect(secao.getByText(AN5.texto)).toBeInTheDocument()
    expect(secao.queryByText(R3.texto)).not.toBeInTheDocument()
    expect(secao.queryByText(AN2.texto)).not.toBeInTheDocument()

    await usuario.click(secao.getByRole('tab', { name: 'Regular' }))
    expect(secao.getByText(R1.texto)).toBeInTheDocument()
    expect(secao.getByText(R3.texto)).toBeInTheDocument()
    expect(secao.queryByText(AN1.texto)).not.toBeInTheDocument()

    await usuario.click(secao.getByRole('tab', { name: 'Avançada' }))
    expect(secao.getByText(AN2.texto)).toBeInTheDocument()
    expect(secao.queryByText(R1.texto)).not.toBeInTheDocument()
  })

  it('cada requisito leva a etiqueta escrita da classe', async () => {
    abrirAdm()
    await screen.findByRole('heading', { name: 'Requisitos' })
    const secao = within(screen.getByRole('region', { name: 'Requisitos' }))
    const regular = secao.getByRole('button', { name: new RegExp(R1.texto) })
    const avancada = secao.getByRole('button', { name: new RegExp(AN1.texto) })
    expect(within(regular).getByText('Regular')).toHaveAttribute('data-lado', 'REGULAR')
    const etiquetaAvancada = within(avancada).getByText('Avançada')
    expect(etiquetaAvancada).toHaveAttribute('data-lado', 'AVANCADA')
    expect(etiquetaAvancada.className).toContain('border-dashed')
  })
})

describe('Regular e avançada · datas no computador', () => {
  it('cada linha mostra os requisitos das duas classes, cada chip com a etiqueta escrita', async () => {
    abrirAdm()
    await screen.findByRole('heading', { name: 'Requisitos' })
    const cheia = linha('2026-10-04')
    expect(within(cheia).getAllByText('Avançada')).toHaveLength(3)
    expect(within(cheia).getAllByText('Regular')).toHaveLength(1)
    expect(within(cheia).getByText(`${AN2.codigo} · ${AN2.texto}`)).toBeInTheDocument()
    expect(within(cheia).getByText(`${R3.codigo} · ${R3.texto}`)).toBeInTheDocument()
  })

  it('medidor: Vazia, 1 requisito e "n requisitos · cheia" a partir de 4; bloqueada não conta', async () => {
    abrirAdm()
    await screen.findByRole('heading', { name: 'Requisitos' })
    expect(within(linha('2026-10-18')).getByText('Vazia')).toBeInTheDocument()
    expect(within(linha('2026-10-25')).getByText('1 requisito')).toBeInTheDocument()
    const cheia = within(linha('2026-10-04')).getByText('4 requisitos · cheia')
    expect(cheia.closest('[data-ocupacao]')).toHaveAttribute('data-ocupacao', 'cheia')
    const bloqueada = linha('2026-10-11')
    expect(bloqueada.querySelector('[data-ocupacao]')).toBeNull()
    expect(within(bloqueada).getByText('Feriado prolongado · sem classe')).toBeInTheDocument()
  })

  it('"Mais vazias primeiro" ordena pela soma das duas classes e deixa a bloqueada no fim', async () => {
    abrirAdm()
    const usuario = userEvent.setup()
    await screen.findByRole('heading', { name: 'Requisitos' })
    expect(datasNaOrdem()).toEqual(['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25'])
    await usuario.click(screen.getByRole('tab', { name: 'Mais vazias primeiro' }))
    expect(datasNaOrdem()).toEqual(['2026-10-18', '2026-10-25', '2026-10-04', '2026-10-11'])
    await usuario.click(screen.getByRole('tab', { name: 'Pela data' }))
    expect(datasNaOrdem()).toEqual(['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25'])
  })

  it('o subtítulo explica que a data mostra as duas classes e "Escolhido" diz classe e código', async () => {
    abrirAdm()
    const usuario = userEvent.setup()
    await screen.findByRole('heading', { name: 'Requisitos' })
    expect(screen.getByText('Cada data mostra o que já está nela das duas classes.')).toBeInTheDocument()
    expect(screen.queryByText(/Escolhido:/)).not.toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: new RegExp(AN1.texto) }))
    expect(screen.getByText(/Escolhido:/)).toHaveTextContent('Escolhido: Avançada · AN1')
  })

  it('colocar um requisito da avançada chama o PUT no cronograma único, como o da regular', async () => {
    const registro = abrirAdm()
    const usuario = userEvent.setup()
    await screen.findByRole('heading', { name: 'Requisitos' })
    await usuario.click(screen.getByRole('button', { name: new RegExp(AN1.texto) }))
    await usuario.click(within(linha('2026-10-18')).getByRole('button', { name: 'Colocar aqui em 18/10' }))
    await waitFor(() => expect(registro.chamadas).toHaveLength(1))
    expect(registro.chamadas[0]).toMatchObject({
      metodo: 'PUT',
      caminho: `/api/cronogramas/${CRONOGRAMA_ID}/requisitos/${AN1.id}`,
      corpo: { data: '2026-10-18' },
    })

    await usuario.click(screen.getByRole('button', { name: new RegExp(R1.texto) }))
    await usuario.click(within(linha('2026-10-18')).getByRole('button', { name: 'Colocar aqui em 18/10' }))
    await waitFor(() => expect(registro.chamadas).toHaveLength(2))
    expect(registro.chamadas[1]).toMatchObject({ metodo: 'PUT', caminho: `/api/cronogramas/${CRONOGRAMA_ID}/requisitos/${R1.id}` })
  })

  it('tirar um requisito da avançada da data chama DELETE no cronograma único', async () => {
    const registro = abrirAdm()
    const usuario = userEvent.setup()
    await screen.findByRole('heading', { name: 'Requisitos' })
    await usuario.click(within(linha('2026-10-25')).getByRole('button', { name: `remover ${AN6.codigo} desta data` }))
    await waitFor(() => expect(registro.chamadas).toHaveLength(1))
    expect(registro.chamadas[0]).toMatchObject({ metodo: 'DELETE', caminho: `/api/cronogramas/${CRONOGRAMA_ID}/requisitos/${AN6.id}` })
  })
})

describe('Regular e avançada · topo e publicação', () => {
  it('um selo só (o da regular); o Adm publica as duas juntas pela regular', async () => {
    const registro = abrirAdm()
    const usuario = userEvent.setup()
    await screen.findByRole('heading', { name: 'Requisitos' })
    expect(screen.getAllByText('Rascunho')).toHaveLength(1)
    expect(screen.getByText('Publica a regular e a avançada juntas')).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Publicar cronograma' }))
    const dialogo = screen.getByRole('dialog', { name: 'Publicar o cronograma de Amigo + Amigo da Natureza?' })
    await usuario.click(within(dialogo).getByRole('button', { name: 'Publicar cronograma' }))
    await waitFor(() => expect(registro.chamadas).toHaveLength(1))
    expect(registro.chamadas[0]).toMatchObject({ metodo: 'POST', caminho: `/api/cronogramas/${CRONOGRAMA_ID}/publicar` })
  })

  it('regular sem avançada fica como hoje: sem filtro de classe, sem a segunda barra e sem ordem', async () => {
    abrirAdm(criarMontagem({ requisitos: [R1, R3], datas: DATAS }))
    await screen.findByText('1/2 agendados')
    expect(screen.queryByRole('tab', { name: 'Avançada' })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Mais vazias primeiro' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('progressbar')).toHaveLength(1)
    expect(screen.queryByText('Vazia')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Publicar' })).toBeInTheDocument()
    expect(screen.queryByText('Publica a regular e a avançada juntas')).not.toBeInTheDocument()
  })

  it('sem cronograma: "Criar cronograma" cria o par pela regular', async () => {
    const registro = abrirAdm(criarMontagem({ cronograma: null }))
    const usuario = userEvent.setup()
    await usuario.click(await screen.findByRole('button', { name: 'Criar cronograma' }))
    await waitFor(() => expect(registro.chamadas).toHaveLength(1))
    expect(registro.chamadas[0]).toMatchObject({ metodo: 'POST', caminho: '/api/cronogramas' })
    expect(screen.getByText('Amigo + Amigo da Natureza ainda não tem cronograma em ' + (registro.chamadas[0]?.corpo as { anoClube: number }).anoClube)).toBeInTheDocument()
  })
})

/** O par com 04/10 já dada pela classe pedida (regular: R3; avançada: AN2, AN3, AN4). */
function parComClasseDadaSo(lado: 'REGULAR' | 'AVANCADA'): Montagem {
  const classeId = lado === 'REGULAR' ? CLASSE_MONTAGEM.id : AVANCADA_MONTAGEM.id
  const datas = DATAS.map((dado) => (dado.data === '2026-10-04' ? { ...dado, classeIdsComAulaDada: [classeId] } : dado))
  return criarPar({ datas })
}

describe('Regular e avançada · classe dada por lado', () => {
  it('computador: só a avançada deu aula em 04/10 — chips dela com "Classe dada" e sem remover; o da regular segue livre', async () => {
    abrirAdm(parComClasseDadaSo('AVANCADA'))
    await screen.findByRole('heading', { name: 'Requisitos' })
    const dia = within(linha('2026-10-04'))
    expect(dia.getAllByText('Classe dada')).toHaveLength(3)
    expect(dia.queryByRole('button', { name: `remover ${AN2.codigo} desta data` })).not.toBeInTheDocument()
    expect(dia.getByRole('button', { name: `remover ${R3.codigo} desta data` })).toBeInTheDocument()
  })

  it('computador: só a avançada deu aula — não oferece "Colocar aqui" para requisito da avançada, mas oferece para o da regular', async () => {
    abrirAdm(parComClasseDadaSo('AVANCADA'))
    const usuario = userEvent.setup()
    await screen.findByRole('heading', { name: 'Requisitos' })
    await usuario.click(screen.getByRole('button', { name: new RegExp(AN1.texto) }))
    expect(within(linha('2026-10-04')).queryByRole('button', { name: 'Colocar aqui em 04/10' })).not.toBeInTheDocument()
    expect(within(linha('2026-10-18')).getByRole('button', { name: 'Colocar aqui em 18/10' })).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: new RegExp(R1.texto) }))
    expect(within(linha('2026-10-04')).getByRole('button', { name: 'Colocar aqui em 04/10' })).toBeInTheDocument()
  })

  it('computador: só a regular deu aula — o inverso: chip da regular travado, da avançada livre', async () => {
    abrirAdm(parComClasseDadaSo('REGULAR'))
    const usuario = userEvent.setup()
    await screen.findByRole('heading', { name: 'Requisitos' })
    const dia = within(linha('2026-10-04'))
    expect(dia.getAllByText('Classe dada')).toHaveLength(1)
    expect(dia.queryByRole('button', { name: `remover ${R3.codigo} desta data` })).not.toBeInTheDocument()
    expect(dia.getByRole('button', { name: `remover ${AN2.codigo} desta data` })).toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: new RegExp(R1.texto) }))
    expect(within(linha('2026-10-04')).queryByRole('button', { name: 'Colocar aqui em 04/10' })).not.toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: new RegExp(AN1.texto) }))
    expect(within(linha('2026-10-04')).getByRole('button', { name: 'Colocar aqui em 04/10' })).toBeInTheDocument()
  })

  it('computador: aula dada só da avançada trava editar e remover o dia; sem classe dada, aparecem', async () => {
    abrirAdm(parComClasseDadaSo('AVANCADA'))
    await screen.findByRole('heading', { name: 'Requisitos' })
    const dia = within(linha('2026-10-04'))
    expect(dia.queryByRole('button', { name: 'Editar horário, local e título' })).not.toBeInTheDocument()
    expect(dia.queryByRole('button', { name: 'Remover dia de classe' })).not.toBeInTheDocument()
  })

  it('computador: sem aula dada, editar e remover o dia aparecem e remover faz uma chamada só', async () => {
    const registro = abrirAdm()
    const usuario = userEvent.setup()
    await screen.findByRole('heading', { name: 'Requisitos' })
    const dia = within(linha('2026-10-04'))
    expect(dia.getByRole('button', { name: 'Editar horário, local e título' })).toBeInTheDocument()
    await usuario.click(dia.getByRole('button', { name: 'Remover dia de classe' }))
    await usuario.click(screen.getByRole('button', { name: 'Remover' }))
    await waitFor(() => expect(registro.chamadas).toHaveLength(1))
    expect(registro.chamadas[0]).toMatchObject({ metodo: 'DELETE', caminho: `/api/aulas-planejadas/${uuid(2001)}` })
  })

  it('computador: conflito é um só por data e aparece na linha', async () => {
    const datas = [criarDataMontagem('2026-10-25', { aulaId: uuid(2002), requisitoIds: [AN6.id], conflito: true, situacao: situacaoDoDia('2026-10-25', [{ nome: 'Ensaio da investidura', tipo: 'EVENTO' }]) })]
    abrirAdm(criarMontagem({ requisitos: [R1, AN6], datas, avancada: AVANCADA_MONTAGEM }))
    await screen.findByRole('heading', { name: 'Requisitos' })
    expect(within(linha('2026-10-25')).getAllByText(/Conflito:/)).toHaveLength(1)
  })

  it('instrutor: só a avançada deu aula — sem remover nos chips dela e a folha "Adicionar" só lista a regular', async () => {
    abrirInstrutor(parComClasseDadaSo('AVANCADA'))
    const usuario = userEvent.setup()
    await screen.findByRole('progressbar', { name: /Regular/ })
    expect(within(linha('2026-10-04')).getAllByText('Classe dada')).toHaveLength(3)
    expect(within(linha('2026-10-04')).queryByRole('button', { name: `remover ${AN2.codigo} desta data` })).not.toBeInTheDocument()
    await usuario.click(within(linha('2026-10-04')).getByRole('button', { name: 'Adicionar requisito nesta data' }))
    const folha = within(screen.getByRole('dialog'))
    expect(folha.getByRole('button', { name: new RegExp(R1.texto) })).toBeInTheDocument()
    expect(folha.queryByRole('button', { name: new RegExp(AN1.texto) })).not.toBeInTheDocument()
  })

  it('celular: a folha "Em qual data?" não oferece a data onde só a avançada deu aula para requisito da avançada', async () => {
    simularLargura(390)
    abrirAdm(parComClasseDadaSo('AVANCADA'))
    const usuario = userEvent.setup()
    await screen.findByText('Regular 1/2 · Avançada 4/6')
    await usuario.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: new RegExp(AN1.texto) }))
    const folha = within(screen.getByRole('dialog', { name: 'Em qual data?' }))
    expect(folha.queryByRole('button', { name: /04\/10/ })).not.toBeInTheDocument()
    expect(folha.getByText(/04\/10 não aceita: classe já dada/)).toBeInTheDocument()
  })

  it('celular: no cartão "Por data" o selo vai só nos requisitos do lado que deu aula', async () => {
    simularLargura(390)
    abrirAdm(parComClasseDadaSo('AVANCADA'))
    const usuario = userEvent.setup()
    await screen.findByText('Regular 1/2 · Avançada 4/6')
    await usuario.click(screen.getByRole('tab', { name: 'Por data' }))
    expect(within(linha('2026-10-04')).getAllByText('Classe dada')).toHaveLength(3)
  })
})

describe('Regular e avançada · agrupadas', () => {
  it('agrupadas não formam par: ?classe=<avançada> abre a própria, sem avançada junto', async () => {
    const agrupada = criarClasse({ id: uuid(104), nome: 'Agrupadas (Amigo a Guia)', trilha: 'AGRUPADAS', ordem: 13 })
    const agrupadaAvancada = criarClasse({ id: uuid(105), nome: 'Agrupadas — avançada', tipo: 'AVANCADA', trilha: 'AGRUPADAS', classeBaseId: uuid(104), ordem: 14 })
    const montagem = criarMontagem({ classe: { ...CLASSE_AVANCADA_MONTAGEM, id: agrupadaAvancada.id, trilha: 'AGRUPADAS' }, datasLivres: true })
    const registro = abrirAdm(montagem, `/adm/cronogramas?classe=${agrupadaAvancada.id}`, [agrupada, agrupadaAvancada])
    await waitFor(() => expect(registro.classesLidas).toEqual([agrupadaAvancada.id]))
    expect(screen.queryByRole('tab', { name: 'Avançada' })).not.toBeInTheDocument()
  })
})

describe('Regular e avançada · instrutor', () => {
  it('vê "Enviar", não "Publicar", com a frase de que leva as duas; seletor com o par', async () => {
    const registro = abrirInstrutor()
    const usuario = userEvent.setup()
    await screen.findByRole('progressbar', { name: 'Regular · Amigo — 1 de 2 com data' })
    expect(screen.queryByRole('button', { name: /Publicar/ })).not.toBeInTheDocument()
    expect(screen.getByText('Envia a regular e a avançada juntas')).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup', { name: 'Tipo da classe' })).not.toBeInTheDocument()
    await usuario.click(screen.getByRole('button', { name: 'Enviar para o Adm publicar' }))
    await usuario.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Enviar' }))
    await waitFor(() => expect(registro.chamadas).toHaveLength(1))
    expect(registro.chamadas[0]).toMatchObject({ metodo: 'POST', caminho: `/api/cronogramas/${CRONOGRAMA_ID}/enviar` })
  })

  it('"Sem data" junta as duas classes com etiqueta; as datas mostram etiqueta e medidor; colocar usa o cronograma único', async () => {
    const registro = abrirInstrutor()
    const usuario = userEvent.setup()
    await screen.findByRole('progressbar', { name: 'Avançada · Amigo da Natureza — 4 de 6 com data' })
    expect(within(linha('2026-10-04')).getByText('4 requisitos · cheia')).toBeInTheDocument()
    expect(within(linha('2026-10-04')).getAllByText('Avançada')).toHaveLength(3)
    await usuario.click(screen.getByRole('tab', { name: 'Sem data (3)' }))
    const botaoAvancado = screen.getByRole('button', { name: new RegExp(AN1.texto) })
    expect(within(botaoAvancado).getByText('Avançada')).toBeInTheDocument()
    expect(within(screen.getByRole('button', { name: new RegExp(R1.texto) })).getByText('Regular')).toBeInTheDocument()
    await usuario.click(botaoAvancado)
    await usuario.click(await screen.findByRole('button', { name: /18\/10/ }))
    await waitFor(() => expect(registro.chamadas).toHaveLength(1))
    expect(registro.chamadas[0]).toMatchObject({ caminho: `/api/cronogramas/${CRONOGRAMA_ID}/requisitos/${AN1.id}`, corpo: { data: '2026-10-18' } })
  })

  it('?classe=<avançada> abre a regular', async () => {
    const registro = abrirInstrutor(criarPar(), `/cronograma/montar?classe=${CLASSE_AVANCADA.id}`)
    await screen.findByRole('progressbar', { name: 'Regular · Amigo — 1 de 2 com data' })
    expect(registro.classesLidas).toEqual([uuid(100)])
  })
})

describe('Regular e avançada · instrutor só da avançada', () => {
  it('?classe=<avançada> sem a regular no vínculo: depois de colocar um requisito, a tela mostra a data nova', async () => {
    const { handlers, registro } = handlersMontagem(criarPar())
    servidor.use(
      ...handlersSessao([criarVinculo('INSTRUTOR', 1, { classes: [CLASSE_AVANCADA_MONTAGEM] })]),
      handlerClasses([CLASSE_REGULAR, CLASSE_AVANCADA]),
      ...handlers,
    )
    renderizarRotas(rotasInstrutor, `/cronograma/montar?classe=${CLASSE_AVANCADA.id}`)
    const usuario = userEvent.setup()
    await screen.findByRole('progressbar', { name: 'Avançada · Amigo da Natureza — 4 de 6 com data' })

    const colocado = { ...AN1, aulaId: uuid(2003), data: '2026-10-18' }
    registro.responder(
      criarPar({
        requisitos: [R1, R3, colocado, AN2, AN3, AN4, AN5, AN6],
        datas: DATAS.map((dado) => (dado.data === '2026-10-18' ? { ...dado, aulaId: uuid(2003), requisitoIds: [AN1.id] } : dado)),
      }),
    )
    await usuario.click(screen.getByRole('tab', { name: 'Sem data (3)' }))
    await usuario.click(screen.getByRole('button', { name: new RegExp(AN1.texto) }))
    await usuario.click(await screen.findByRole('button', { name: /18\/10/ }))

    await waitFor(() => expect(registro.chamadas).toHaveLength(1))
    expect(await screen.findByRole('progressbar', { name: 'Avançada · Amigo da Natureza — 5 de 6 com data' })).toBeInTheDocument()
    expect(registro.leituras).toBe(1)
  })
})

describe('Regular e avançada · celular', () => {
  async function abrirNoCelular() {
    simularLargura(390)
    const registro = abrirAdm()
    await screen.findByText('Regular 1/2 · Avançada 4/6')
    return { registro, usuario: userEvent.setup() }
  }

  it('o resumo vira "Regular n/N · Avançada n/N" e "Sem data" lista as duas classes com etiqueta', async () => {
    const { usuario } = await abrirNoCelular()
    expect(screen.getByRole('tab', { name: 'Sem data · 3' })).toBeInTheDocument()
    const painel = within(screen.getByRole('tabpanel'))
    expect(within(painel.getByRole('button', { name: new RegExp(AN1.texto) })).getByText('Avançada')).toBeInTheDocument()
    expect(within(painel.getByRole('button', { name: new RegExp(R1.texto) })).getByText('Regular')).toBeInTheDocument()
    await usuario.click(screen.getByRole('tab', { name: 'Por data' }))
    expect(within(linha('2026-10-04')).getByText('4 requisitos · cheia')).toBeInTheDocument()
    expect(within(linha('2026-10-04')).getAllByText('Avançada')).toHaveLength(3)
  })

  it('a folha "Em qual data?" mostra a etiqueta do requisito e, em cada data, medidor, texto e "x da regular · y da avançada"', async () => {
    const { registro, usuario } = await abrirNoCelular()
    await usuario.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: new RegExp(AN1.texto) }))
    const folha = within(screen.getByRole('dialog', { name: 'Em qual data?' }))
    expect(folha.getByText('Avançada')).toHaveAttribute('data-lado', 'AVANCADA')
    const cheia = folha.getByRole('button', { name: /04\/10/ })
    expect(within(cheia).getByText('4 requisitos · cheia')).toBeInTheDocument()
    expect(within(cheia).getByText('1 da regular · 3 da avançada')).toBeInTheDocument()
    const vazia = folha.getByRole('button', { name: /18\/10/ })
    expect(within(vazia).getByText('Vazia')).toBeInTheDocument()
    expect(within(vazia).getByText('Nenhum requisito ainda')).toBeInTheDocument()
    await usuario.click(vazia)
    await waitFor(() => expect(registro.chamadas).toHaveLength(1))
    expect(registro.chamadas[0]).toMatchObject({ caminho: `/api/cronogramas/${CRONOGRAMA_ID}/requisitos/${AN1.id}` })
  })

  it('"Próximo sem data" percorre os sem data das duas classes', async () => {
    const { usuario } = await abrirNoCelular()
    await usuario.click(within(screen.getByRole('tabpanel')).getByRole('button', { name: new RegExp(R1.texto) }))
    await usuario.click(within(screen.getByRole('dialog', { name: 'Em qual data?' })).getByRole('button', { name: /18\/10/ }))
    const proximo = await screen.findByRole('region', { name: 'Próximo sem data' })
    expect(proximo).toHaveTextContent(AN1.codigo)
  })
})
