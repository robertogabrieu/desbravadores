import { hojeNoFuso } from '@desbravadores/shared'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, delay, http } from 'msw'
import { useSyncExternalStore } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EntradaFila, ItemFila, ModoConexao, PacoteGuardado } from '../../offline'
import { criarPacote } from '../../testes/handlers/offline'
import { UNIDADE_AGUIAS, UNIDADE_LEOES, criarAlbum, handlerAlbum, handlerAlbuns, handlerSemAutorizacao, criarDetalhe as criarAlbumDetalhe } from '../../testes/handlers/fotos'
import { criarDetalhe as criarReuniao, criarResumo, handlerErroReuniao, handlerReuniao } from '../../testes/handlers/reunioes'
import { criarVinculo, handlersSessao, uuid } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { ErroFormatoFoto } from './reducao'
import { rotasGaleria } from './rotas'

const HOJE = hojeNoFuso('America/Sao_Paulo', new Date())
const MES = HOJE.slice(0, 7)

const estado = vi.hoisted(() => {
  const ouvintes = new Set<() => void>()
  let itens: unknown[] = []
  return {
    modo: 'ONLINE' as ModoConexao,
    pacote: { pacote: null, carregando: false, baixadoEm: null } as PacoteGuardado,
    itensDaChave: [] as unknown[],
    enfileirar: vi.fn<(entrada: unknown) => Promise<string>>(() => Promise.resolve('id')),
    reduzir: vi.fn<(arquivo: File) => Promise<Blob>>(),
    fila: {
      ler: () => itens,
      definir(novos: unknown[]) {
        itens = novos
        ouvintes.forEach((ouvinte) => ouvinte())
      },
      assinar(ouvinte: () => void) {
        ouvintes.add(ouvinte)
        return () => ouvintes.delete(ouvinte)
      },
    },
  }
})

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))
vi.mock('./reducao', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('./reducao')>()),
  reduzirFoto: (arquivo: File) => estado.reduzir(arquivo),
}))
vi.mock('../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../offline')>()),
  useConexao: () => ({ modo: estado.modo }),
  usePacote: () => estado.pacote,
  useFila: () => ({ itens: useSyncExternalStore((ouvinte) => estado.fila.assinar(ouvinte), () => estado.fila.ler()) }),
  itensDaChave: () => Promise.resolve(estado.itensDaChave),
  enfileirar: estado.enfileirar,
}))

const foto = (nome = 'a.jpg', tamanho = 1_000_000) => new File([new Uint8Array(tamanho)], nome, { type: 'image/jpeg' })

const membro = (n: number, nomePublico: string, autorizacaoImagem: boolean) => ({
  dbvId: uuid(n), nome: nomePublico, nomePublico, sexo: 'F' as const, idade: 11, classeAtual: null, autorizacaoImagem,
})

function guardar(parcial: Parameters<typeof criarPacote>[0] = {}) {
  estado.pacote = { pacote: criarPacote(parcial), carregando: false, baixadoEm: 1 }
}

function entrar(unidades = [UNIDADE_AGUIAS]) {
  servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO', 1, { unidades })]))
}

const abrir = (rota = '/galeria/enviar') => renderizarRotas(rotasGaleria, rota)

async function escolher(...arquivos: File[]) {
  await userEvent.upload(await screen.findByLabelText('Fotos da galeria'), arquivos)
}

const entradasEnfileiradas = () => estado.enfileirar.mock.calls.map(([entrada]) => entrada as EntradaFila<{ dados: { album: Record<string, unknown>; legenda: string | null }; albumTitulo: string; fotoId: string }>)

beforeEach(() => {
  estado.modo = 'ONLINE'
  estado.pacote = { pacote: null, carregando: false, baixadoEm: null }
  estado.itensDaChave = []
  estado.enfileirar.mockClear()
  estado.fila.definir([])
  estado.reduzir.mockReset()
  estado.reduzir.mockImplementation(() => Promise.resolve(new Blob(['reduzida'], { type: 'image/jpeg' })))
  URL.createObjectURL = vi.fn(() => 'blob:previa')
  URL.revokeObjectURL = vi.fn()
  entrar()
  servidor.use(
    http.get('/api/reunioes', () => HttpResponse.json([])),
    handlerSemAutorizacao([]),
  )
})

describe('Enviar fotos: álbum', () => {
  it('sem chamada de hoje não oferece "Reunião de hoje"; oferece álbuns recentes do pacote e "Novo álbum"', async () => {
    guardar({ albunsRecentes: [{ id: uuid(700), unidadeId: UNIDADE_AGUIAS.id, titulo: 'Passeio ecológico', data: '2030-08-23', reuniaoId: null }, { id: uuid(701), unidadeId: UNIDADE_LEOES.id, titulo: 'Outra unidade', data: '2030-08-23', reuniaoId: null }] })
    abrir()
    expect(await screen.findByRole('radio', { name: /Passeio ecológico/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /Novo álbum/ })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /Reunião de hoje/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: /Outra unidade/ })).not.toBeInTheDocument()
  })

  it('chamada de hoje no servidor: oferece "Reunião de hoje" e envia REUNIAO sem depender de nada na fila', async () => {
    servidor.use(http.get('/api/reunioes', () => HttpResponse.json([criarResumo({ data: HOJE })])))
    abrir()
    const opcao = await screen.findByRole('radio', { name: /Reunião de hoje/ })
    expect(opcao).toBeChecked()
    await escolher(foto())
    await userEvent.click(screen.getByRole('button', { name: 'Enviar 1 foto' }))
    await waitFor(() => expect(estado.enfileirar).toHaveBeenCalledTimes(1))
    const [entrada] = entradasEnfileiradas()
    expect(entrada.tipo).toBe('FOTO')
    expect(entrada.dependeDe).toBeUndefined()
    expect(entrada.payload.dados.album).toEqual({ tipo: 'REUNIAO', unidadeId: UNIDADE_AGUIAS.id, data: HOJE })
  })

  it('a consulta do servidor pede o mês de hoje da unidade', async () => {
    const consultas: string[] = []
    servidor.use(http.get('/api/reunioes', ({ request }) => { consultas.push(new URL(request.url).search); return HttpResponse.json([]) }))
    abrir()
    await screen.findByRole('radio', { name: /Novo álbum/ })
    await waitFor(() => expect(consultas).toEqual([`?unidadeId=${UNIDADE_AGUIAS.id}&mes=${MES}`]))
  })

  it('reunião de outro dia no servidor não conta como chamada de hoje', async () => {
    servidor.use(http.get('/api/reunioes', () => HttpResponse.json([criarResumo({ data: '2020-01-05' })])))
    abrir()
    await screen.findByRole('radio', { name: /Novo álbum/ })
    expect(screen.queryByRole('radio', { name: /Reunião de hoje/ })).not.toBeInTheDocument()
  })

  it('chamada de hoje só na fila (sem conexão): oferece "Reunião de hoje" e depende da chave da chamada', async () => {
    estado.modo = 'SEM_CONEXAO'
    estado.itensDaChave = [{ id: 'x', tipo: 'REUNIAO', estado: 'NA_FILA' } as ItemFila]
    guardar()
    abrir()
    expect(await screen.findByRole('radio', { name: /Reunião de hoje/ })).toBeInTheDocument()
    await escolher(foto())
    await userEvent.click(screen.getByRole('button', { name: 'Enviar 1 foto' }))
    await waitFor(() => expect(estado.enfileirar).toHaveBeenCalled())
    expect(entradasEnfileiradas()[0].dependeDe).toBe(`${UNIDADE_AGUIAS.id}:${HOJE}`)
  })

  it('sem conexão, sem item na fila e com a reunião de hoje no pacote: oferece "Reunião de hoje" sem dependência', async () => {
    estado.modo = 'SEM_CONEXAO'
    estado.itensDaChave = []
    guardar({ reunioesRecentes: [{ id: uuid(610), unidadeId: UNIDADE_AGUIAS.id, data: HOJE, horario: '09:00', local: null, observacoes: null, cabecalhoVersao: '2030-01-01T00:00:00.000Z', chamada: [] }] })
    servidor.use(http.get('/api/reunioes', () => HttpResponse.error()))
    abrir()
    expect(await screen.findByRole('radio', { name: /Reunião de hoje/ })).toBeInTheDocument()
    await escolher(foto())
    await userEvent.click(screen.getByRole('button', { name: 'Enviar 1 foto' }))
    await waitFor(() => expect(estado.enfileirar).toHaveBeenCalled())
    const [entrada] = entradasEnfileiradas()
    expect(entrada.payload.dados.album).toEqual({ tipo: 'REUNIAO', unidadeId: UNIDADE_AGUIAS.id, data: HOJE })
    expect(entrada.dependeDe).toBeUndefined()
  })

  it('vindo de ?reuniao=, usa a data daquela reunião (REUNIAO)', async () => {
    servidor.use(handlerReuniao(criarReuniao({ id: uuid(600), data: '2030-03-10', unidade: UNIDADE_AGUIAS })))
    abrir(`/galeria/enviar?reuniao=${uuid(600)}`)
    const opcao = await screen.findByRole('radio', { name: /Reunião · 10\/03/ })
    expect(opcao).toBeChecked()
    await escolher(foto())
    await userEvent.click(screen.getByRole('button', { name: 'Enviar 1 foto' }))
    await waitFor(() => expect(estado.enfileirar).toHaveBeenCalled())
    const [entrada] = entradasEnfileiradas()
    expect(entrada.payload.dados.album).toEqual({ tipo: 'REUNIAO', unidadeId: UNIDADE_AGUIAS.id, data: '2030-03-10' })
    expect(entrada.payload.albumTitulo).toBe('Reunião · 10/03')
  })

  it('álbum recente do pacote vira EXISTENTE, com uma entrada por foto e a legenda do lote', async () => {
    guardar({ albunsRecentes: [{ id: uuid(700), unidadeId: UNIDADE_AGUIAS.id, titulo: 'Passeio ecológico', data: '2030-08-23', reuniaoId: null }] })
    abrir()
    await userEvent.click(await screen.findByRole('radio', { name: /Passeio ecológico/ }))
    await escolher(foto('a.jpg'), foto('b.jpg'))
    await userEvent.type(screen.getByLabelText('Legenda (opcional)'), '  Ensaio  ')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar 2 fotos' }))
    await waitFor(() => expect(estado.enfileirar).toHaveBeenCalledTimes(2))
    const entradas = entradasEnfileiradas()
    expect(entradas.map((e) => e.payload.dados.album)).toEqual([{ tipo: 'EXISTENTE', id: uuid(700) }, { tipo: 'EXISTENTE', id: uuid(700) }])
    expect(entradas.every((e) => e.payload.dados.legenda === 'Ensaio')).toBe(true)
    expect(entradas.every((e) => e.dependeDe === undefined)).toBe(true)
    expect(entradas[0].chave).toBe(`foto:${entradas[0].payload.fotoId}`)
    expect(entradas[0].chave).not.toBe(entradas[1].chave)
    expect(entradas[0].blob).toBeInstanceOf(Blob)
  })

  it('"Novo álbum" exige nome; depois envia NOVO com um só UUID para o lote todo', async () => {
    abrir()
    await userEvent.click(await screen.findByRole('radio', { name: /Novo álbum/ }))
    await escolher(foto('a.jpg'), foto('b.jpg'))
    expect(screen.getByRole('button', { name: 'Enviar 2 fotos' })).toBeDisabled()
    await userEvent.type(screen.getByLabelText('Nome do álbum'), 'Acampamento')
    const data = screen.getByLabelText('Data do álbum')
    expect(data).toHaveValue(HOJE)
    await userEvent.clear(data)
    await userEvent.type(data, '2030-10-16')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar 2 fotos' }))
    await waitFor(() => expect(estado.enfileirar).toHaveBeenCalledTimes(2))
    const [primeira, segunda] = entradasEnfileiradas().map((e) => e.payload.dados.album)
    expect(primeira).toEqual({ tipo: 'NOVO', id: expect.stringMatching(/^[0-9a-f-]{36}$/) as string, unidadeId: UNIDADE_AGUIAS.id, titulo: 'Acampamento', data: '2030-10-16' })
    expect(segunda).toEqual(primeira)
  })

  it('com duas unidades, oferece o seletor e usa a escolhida', async () => {
    entrar([UNIDADE_AGUIAS, UNIDADE_LEOES])
    abrir()
    await userEvent.selectOptions(await screen.findByLabelText('Unidade'), UNIDADE_LEOES.id)
    await userEvent.click(screen.getByRole('radio', { name: /Novo álbum/ }))
    await userEvent.type(screen.getByLabelText('Nome do álbum'), 'Treino')
    await escolher(foto())
    await userEvent.click(screen.getByRole('button', { name: 'Enviar 1 foto' }))
    await waitFor(() => expect(estado.enfileirar).toHaveBeenCalled())
    expect(entradasEnfileiradas()[0].payload.dados.album).toMatchObject({ tipo: 'NOVO', unidadeId: UNIDADE_LEOES.id })
  })

  it('vindo de ?album= (da tela do álbum), já vem com esse álbum marcado', async () => {
    servidor.use(handlerAlbum(criarAlbumDetalhe({ id: uuid(700), titulo: 'Treino de ordem unida' })))
    abrir(`/galeria/enviar?unidade=${UNIDADE_AGUIAS.id}&album=${uuid(700)}`)
    expect(await screen.findByRole('radio', { name: /Treino de ordem unida/ })).toBeChecked()
    await escolher(foto())
    await userEvent.click(screen.getByRole('button', { name: 'Enviar 1 foto' }))
    await waitFor(() => expect(estado.enfileirar).toHaveBeenCalled())
    expect(entradasEnfileiradas()[0].payload.dados.album).toEqual({ tipo: 'EXISTENTE', id: uuid(700) })
  })
})

describe('Enviar fotos: escolha das fotos', () => {
  it('a câmera pede foto direto do aparelho e a galeria aceita várias', async () => {
    abrir()
    const camera = await screen.findByLabelText('Foto da câmera')
    expect(camera).toHaveAttribute('accept', 'image/*')
    expect(camera).toHaveAttribute('capture', 'environment')
    const galeria = screen.getByLabelText('Fotos da galeria')
    expect(galeria).toHaveAttribute('accept', 'image/*')
    expect(galeria).toHaveAttribute('multiple')
  })

  it('mostra a prévia, o total e o tamanho; remover tira a foto do lote', async () => {
    guardar({ albunsRecentes: [{ id: uuid(700), unidadeId: UNIDADE_AGUIAS.id, titulo: 'Passeio ecológico', data: '2030-08-23', reuniaoId: null }] })
    abrir()
    expect(await screen.findByRole('button', { name: 'Selecione fotos' })).toBeDisabled()
    await escolher(foto('a.jpg', 1_048_576), foto('b.jpg', 524_288))
    expect(screen.getByText(/2 fotos · 1,5 MB/)).toBeInTheDocument()
    expect(screen.getAllByRole('img')).toHaveLength(2)
    await userEvent.click(screen.getAllByRole('button', { name: 'Remover foto' })[0])
    expect(screen.getByText(/1 foto · 512 KB/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar 1 foto' })).toBeEnabled()
  })

  it('formato que o aparelho não decodifica: recusa na hora, sem enfileirar nada, e tira a foto ruim da prévia', async () => {
    estado.reduzir.mockImplementation((arquivo) => (arquivo.name === 'ruim.heic' ? Promise.reject(new ErroFormatoFoto()) : Promise.resolve(new Blob(['ok']))))
    guardar({ albunsRecentes: [{ id: uuid(700), unidadeId: UNIDADE_AGUIAS.id, titulo: 'Passeio ecológico', data: '2030-08-23', reuniaoId: null }] })
    abrir()
    await escolher(foto('boa.jpg'), foto('ruim.heic'))
    await userEvent.click(screen.getByRole('button', { name: /^Enviar 2 fotos/ }))
    const alerta = await screen.findByRole('alert')
    expect(alerta).toHaveTextContent('Formato de foto não aceito')
    expect(alerta).toHaveTextContent('ruim.heic')
    expect(estado.enfileirar).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Enviar 1 foto' })).toBeEnabled()
  })
})

describe('Enviar fotos: faixa "Não fotografe"', () => {
  it('online, lista quem a API diz que não tem autorização', async () => {
    servidor.use(handlerSemAutorizacao(['Ana S.', 'Pedro L.']))
    abrir()
    expect(await screen.findByText('Não fotografe: Ana S., Pedro L.')).toBeInTheDocument()
  })

  it('some quando todos têm autorização', async () => {
    abrir()
    await screen.findByRole('radio', { name: /Novo álbum/ })
    await waitFor(() => expect(screen.queryByText(/Não fotografe/)).not.toBeInTheDocument())
  })

  it('sem conexão, vem do pacote (ordem alfabética)', async () => {
    estado.modo = 'SEM_CONEXAO'
    guardar({ unidades: [{ ...UNIDADE_AGUIAS, membros: [membro(1, 'Pedro L.', false), membro(2, 'Bia C.', true), membro(3, 'Ana S.', false)] }] })
    abrir()
    expect(await screen.findByText('Não fotografe: Ana S., Pedro L.')).toBeInTheDocument()
  })
})

describe('Enviar fotos: progresso e fim', () => {
  const itemDaFila = (entrada: EntradaFila<{ fotoId: string }>, parcial: Partial<ItemFila>): ItemFila => ({
    id: entrada.chave, versaoPayload: 1, usuarioId: 'u', vinculoId: 'v', tipo: 'FOTO', chave: entrada.chave, rotulo: 'Foto', detalhe: '1 MB',
    payload: entrada.payload, estado: 'NA_FILA', progresso: 0, tentativas: 0, proximaTentativaEm: null, criadoEm: 1, atualizadoEm: 1, ...parcial,
  })

  async function enviarDuas() {
    guardar({ albunsRecentes: [{ id: uuid(700), unidadeId: UNIDADE_AGUIAS.id, titulo: 'Passeio ecológico', data: '2030-08-23', reuniaoId: null }] })
    abrir()
    await userEvent.click(await screen.findByRole('radio', { name: /Passeio ecológico/ }))
    await escolher(foto('a.jpg'), foto('b.jpg'))
    await userEvent.click(screen.getByRole('button', { name: 'Enviar 2 fotos' }))
    await waitFor(() => expect(estado.enfileirar).toHaveBeenCalledTimes(2))
    return entradasEnfileiradas()
  }

  it('acompanha a fila: barra de progresso, contagem e aviso de que pode sair da tela', async () => {
    const [a, b] = await enviarDuas()
    estado.fila.definir([itemDaFila(a, { estado: 'ENVIADO', progresso: 100 }), itemDaFila(b, { estado: 'ENVIANDO', progresso: 50 })])
    expect(await screen.findByRole('button', { name: 'Enviando 1 de 2…' })).toBeDisabled()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75')
    expect(screen.getByText('Pode sair desta tela — o envio continua enquanto o app estiver aberto.')).toBeInTheDocument()
  })

  it('terminou: "2 fotos enviadas" e "Ver álbum" leva ao álbum', async () => {
    const [a, b] = await enviarDuas()
    estado.fila.definir([itemDaFila(a, { estado: 'ENVIADO', progresso: 100 }), itemDaFila(b, { estado: 'ENVIADO', progresso: 100 })])
    expect(await screen.findByText('2 fotos enviadas')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver álbum' })).toHaveAttribute('href', `/galeria/${uuid(700)}`)
  })

  it('foto que deu erro na fila é avisada, sem esconder as demais', async () => {
    const [a, b] = await enviarDuas()
    estado.fila.definir([itemDaFila(a, { estado: 'ENVIADO', progresso: 100 }), itemDaFila(b, { estado: 'ERRO', erro: { codigo: 'X', mensagem: 'Foto grande demais.' } })])
    expect(await screen.findByText(/1 foto não foi enviada/)).toBeInTheDocument()
    expect(screen.getByText(/Foto grande demais\./)).toBeInTheDocument()
  })

  it('reunião de hoje: "Ver álbum" acha o álbum da reunião pela data', async () => {
    servidor.use(http.get('/api/reunioes', () => HttpResponse.json([criarResumo({ data: HOJE })])), handlerAlbuns([criarAlbum({ id: uuid(777), data: HOJE, reuniaoId: uuid(600) })]))
    abrir()
    await screen.findByRole('radio', { name: /Reunião de hoje/ })
    await escolher(foto('a.jpg'))
    await userEvent.click(screen.getByRole('button', { name: 'Enviar 1 foto' }))
    await waitFor(() => expect(estado.enfileirar).toHaveBeenCalled())
    estado.fila.definir([itemDaFila(entradasEnfileiradas()[0], { estado: 'ENVIADO', progresso: 100 })])
    expect(await screen.findByText('1 foto enviada')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('link', { name: 'Ver álbum' })).toHaveAttribute('href', `/galeria/${uuid(777)}`))
  })
})

describe('Enviar fotos: estados da tela', () => {
  it('carregando (?reuniao= ainda chegando): esqueleto', async () => {
    servidor.use(http.get('/api/reunioes/:id', async () => { await delay('infinite'); return HttpResponse.json({}) }))
    abrir(`/galeria/enviar?reuniao=${uuid(600)}`)
    expect(await screen.findByRole('status', { name: 'Carregando os álbuns' })).toBeInTheDocument()
  })

  it('erro ao buscar a reunião: mensagem da API e "Tentar de novo"', async () => {
    servidor.use(handlerErroReuniao(404, { codigo: 'NAO_ENCONTRADO', mensagem: 'Reunião não encontrada' }))
    abrir(`/galeria/enviar?reuniao=${uuid(600)}`)
    expect(await screen.findByText('Reunião não encontrada')).toBeInTheDocument()
    servidor.use(handlerReuniao(criarReuniao({ id: uuid(600), data: '2030-03-10' })))
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('radio', { name: /Reunião · 10\/03/ })).toBeInTheDocument()
  })

  it('sem conexão e com ?reuniao= não guardado: "Disponível quando houver internet"', async () => {
    estado.modo = 'SEM_CONEXAO'
    servidor.use(http.get('/api/reunioes/:id', () => HttpResponse.error()))
    abrir(`/galeria/enviar?reuniao=${uuid(600)}`)
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
  })

  it('sem unidade: explica e não deixa enviar', async () => {
    entrar([])
    abrir()
    expect(await screen.findByText('Você ainda não tem unidade. Fale com o Adm do clube.')).toBeInTheDocument()
    expect(within(document.body).queryByRole('button', { name: /Enviar/ })).not.toBeInTheDocument()
  })
})

describe('Enviar fotos: navegador offline', () => {
  it('guarda as fotos na fila mesmo com o navegador sem rede (não depende de mutação do react-query)', async () => {
    const original = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine')
    Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => false })
    try {
      estado.modo = 'SEM_CONEXAO'
      guardar({ albunsRecentes: [{ id: uuid(700), unidadeId: UNIDADE_AGUIAS.id, titulo: 'Passeio', data: '2030-08-23', reuniaoId: null }] })
      abrir()
      await userEvent.click(await screen.findByRole('radio', { name: /Passeio/ }))
      await escolher(foto())
      await userEvent.click(screen.getByRole('button', { name: 'Enviar 1 foto' }))
      await waitFor(() => expect(estado.enfileirar).toHaveBeenCalledTimes(1))
    } finally {
      if (original) Object.defineProperty(Navigator.prototype, 'onLine', original)
    }
  })
})
