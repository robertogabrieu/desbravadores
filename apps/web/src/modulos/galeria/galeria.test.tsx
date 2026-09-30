import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, delay, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModoConexao } from '../../offline'
import {
  UNIDADE_AGUIAS,
  UNIDADE_LEOES,
  criarAlbum,
  criarDetalhe,
  criarFoto,
  handlerAlbum,
  handlerAlbuns,
  handlerErroAlbum,
  handlerErroAlbuns,
  handlerErroRemoverFoto,
  handlerRemoverFoto,
} from '../../testes/handlers/fotos'
import { criarVinculo, handlersSessao, uuid } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { rotasGaleria } from './rotas'

const estado = vi.hoisted(() => ({ modo: 'ONLINE' as ModoConexao, avisos: { erro: vi.fn(), sucesso: vi.fn() } }))

vi.mock('sonner', () => ({ toast: { error: estado.avisos.erro, success: estado.avisos.sucesso, warning: vi.fn() } }))
vi.mock('../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../offline')>()),
  useConexao: () => ({ modo: estado.modo }),
}))

function entrar(unidades = [UNIDADE_AGUIAS]) {
  servidor.use(...handlersSessao([criarVinculo('CONSELHEIRO', 1, { unidades })]))
}

beforeEach(() => {
  estado.modo = 'ONLINE'
  estado.avisos.erro.mockClear()
  entrar()
})

describe('Galeria da unidade', () => {
  it('mostra o total de fotos no cabeçalho e cada álbum com capa, data, contagem e quem enviou', async () => {
    let consulta = new URLSearchParams()
    servidor.use(
      handlerAlbuns(
        [
          criarAlbum({ id: uuid(701), titulo: 'Reunião · 20 set', data: '2030-09-20', totalFotos: 6, enviadoPor: ['Thiago'] }),
          criarAlbum({ id: uuid(702), titulo: 'Passeio ecológico', data: '2030-08-23', totalFotos: 3, enviadoPor: ['Thiago', 'Bia', 'Caio'], capaUrl: null }),
        ],
        (c) => {
          consulta = c
        },
      ),
    )
    renderizarRotas(rotasGaleria, '/galeria')
    expect(await screen.findByText('Águias · 9 fotos')).toBeInTheDocument()
    expect(consulta.get('unidadeId')).toBe(UNIDADE_AGUIAS.id)
    const primeiro = screen.getByRole('link', { name: /Reunião · 20 set/ })
    expect(primeiro).toHaveAttribute('href', `/galeria/${uuid(701)}`)
    expect(within(primeiro).getByText('20/09')).toBeInTheDocument()
    expect(within(primeiro).getByText('6 fotos')).toBeInTheDocument()
    expect(within(primeiro).getByText('Thiago')).toBeInTheDocument()
    expect(within(primeiro).getByRole('img')).toHaveAttribute('src', '/api/arquivos/capa.jpg')
    const segundo = screen.getByRole('link', { name: /Passeio ecológico/ })
    expect(within(segundo).getByText('Thiago e mais 2')).toBeInTheDocument()
    expect(within(segundo).queryByRole('img')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Enviar fotos' })).toHaveAttribute('href', `/galeria/enviar?unidade=${UNIDADE_AGUIAS.id}`)
  })

  it('com duas unidades, oferece o seletor e busca os álbuns da escolhida', async () => {
    entrar([UNIDADE_AGUIAS, UNIDADE_LEOES])
    const consultas: string[] = []
    servidor.use(handlerAlbuns([criarAlbum()], (c) => consultas.push(c.get('unidadeId') ?? '')))
    renderizarRotas(rotasGaleria, '/galeria')
    await screen.findByText('Águias · 6 fotos')
    await userEvent.selectOptions(screen.getByLabelText('Unidade'), UNIDADE_LEOES.id)
    expect(await screen.findByText('Leões · 6 fotos')).toBeInTheDocument()
    expect(consultas).toEqual([UNIDADE_AGUIAS.id, UNIDADE_LEOES.id])
  })

  it('com uma só unidade não mostra o seletor', async () => {
    servidor.use(handlerAlbuns())
    renderizarRotas(rotasGaleria, '/galeria')
    await screen.findByText('Águias · 6 fotos')
    expect(screen.queryByLabelText('Unidade')).not.toBeInTheDocument()
  })

  it('carregando: mostra o esqueleto', async () => {
    servidor.use(http.get('/api/albuns', async () => { await delay('infinite'); return HttpResponse.json([]) }))
    renderizarRotas(rotasGaleria, '/galeria')
    expect(await screen.findByRole('status', { name: 'Carregando a galeria' })).toBeInTheDocument()
  })

  it('vazio: "Nenhuma foto ainda." com a ação de enviar as primeiras', async () => {
    servidor.use(handlerAlbuns([]))
    renderizarRotas(rotasGaleria, '/galeria')
    expect(await screen.findByText('Nenhuma foto ainda.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Enviar primeiras fotos' })).toHaveAttribute('href', `/galeria/enviar?unidade=${UNIDADE_AGUIAS.id}`)
  })

  it('erro da API: mostra a mensagem e "Tentar de novo" busca outra vez', async () => {
    servidor.use(handlerErroAlbuns(403, { codigo: 'SEM_PERMISSAO', mensagem: 'Você não tem acesso a esta galeria' }))
    renderizarRotas(rotasGaleria, '/galeria')
    expect(await screen.findByText('Você não tem acesso a esta galeria')).toBeInTheDocument()
    servidor.use(handlerAlbuns())
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Águias · 6 fotos')).toBeInTheDocument()
  })

  it('sem conexão e sem nada guardado: "Disponível quando houver internet"', async () => {
    estado.modo = 'SEM_CONEXAO'
    renderizarRotas(rotasGaleria, '/galeria')
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
  })

  it('rede que cai durante a busca também vira "Disponível quando houver internet"', async () => {
    servidor.use(http.get('/api/albuns', () => HttpResponse.error()))
    renderizarRotas(rotasGaleria, '/galeria')
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
  })

  it('conselheiro sem unidade: explica e não busca nada', async () => {
    entrar([])
    renderizarRotas(rotasGaleria, '/galeria')
    expect(await screen.findByText('Você ainda não tem unidade. Fale com o Adm do clube.')).toBeInTheDocument()
  })
})

describe('Álbum', () => {
  const ALBUM = uuid(700)
  const abrir = () => renderizarRotas(rotasGaleria, `/galeria/${ALBUM}`)

  it('mostra o título e a grade de fotos, com a ação de enviar para este álbum', async () => {
    servidor.use(handlerAlbum())
    abrir()
    expect(await screen.findByRole('heading', { name: 'Reunião · 20 set' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Abrir foto/ })).toHaveLength(3)
    expect(screen.getAllByRole('img')[0]).toHaveAttribute('src', '/api/arquivos/foto-800-mini.jpg')
    expect(screen.getByRole('link', { name: 'Enviar fotos' })).toHaveAttribute('href', `/galeria/enviar?unidade=${UNIDADE_AGUIAS.id}&album=${ALBUM}`)
  })

  it('abre a foto em tela cheia, desliza para a próxima e fecha', async () => {
    servidor.use(handlerAlbum())
    abrir()
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir foto 1' }))
    const tela = screen.getByRole('dialog', { name: 'Foto 1 de 3' })
    expect(within(tela).getByRole('img')).toHaveAttribute('src', '/api/arquivos/foto-800.jpg')
    await userEvent.click(within(tela).getByRole('button', { name: 'Próxima foto' }))
    const segunda = screen.getByRole('dialog', { name: 'Foto 2 de 3' })
    expect(within(segunda).getByText('Grito de guerra')).toBeInTheDocument()
    expect(within(segunda).getByText('Enviada por Thiago')).toBeInTheDocument()
    await userEvent.click(within(segunda).getByRole('button', { name: 'Foto anterior' }))
    expect(screen.getByRole('dialog', { name: 'Foto 1 de 3' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('o gesto de arrastar para a esquerda avança e para a direita volta; toque curto não faz nada', async () => {
    servidor.use(handlerAlbum())
    abrir()
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir foto 1' }))
    const area = screen.getByTestId('area-da-foto')
    fireEvent.touchStart(area, { touches: [{ clientX: 300 }] })
    fireEvent.touchEnd(area, { changedTouches: [{ clientX: 290 }] })
    expect(screen.getByRole('dialog', { name: 'Foto 1 de 3' })).toBeInTheDocument()
    fireEvent.touchStart(area, { touches: [{ clientX: 300 }] })
    fireEvent.touchEnd(area, { changedTouches: [{ clientX: 100 }] })
    expect(screen.getByRole('dialog', { name: 'Foto 2 de 3' })).toBeInTheDocument()
    fireEvent.touchStart(area, { touches: [{ clientX: 100 }] })
    fireEvent.touchEnd(area, { changedTouches: [{ clientX: 300 }] })
    expect(screen.getByRole('dialog', { name: 'Foto 1 de 3' })).toBeInTheDocument()
  })

  it('não oferece "Remover" quando a foto não é do usuário', async () => {
    servidor.use(handlerAlbum())
    abrir()
    await userEvent.click(await screen.findByRole('button', { name: 'Abrir foto 1' }))
    expect(screen.queryByRole('button', { name: 'Remover' })).not.toBeInTheDocument()
  })

  describe('remover', () => {
    const comRemovivel = () =>
      handlerAlbum(criarDetalhe({ fotos: [criarFoto({ id: uuid(801), podeRemover: true }), criarFoto({ id: uuid(802) })] }))

    it('pede confirmação e só apaga depois de confirmar', async () => {
      const removidas: string[] = []
      servidor.use(comRemovivel(), handlerRemoverFoto(removidas))
      abrir()
      await userEvent.click(await screen.findByRole('button', { name: 'Abrir foto 1' }))
      await userEvent.click(screen.getByRole('button', { name: 'Remover' }))
      const confirmacao = screen.getByRole('dialog', { name: 'Remover esta foto?' })
      await userEvent.click(within(confirmacao).getByRole('button', { name: 'Cancelar' }))
      expect(removidas).toEqual([])
      await userEvent.click(screen.getByRole('button', { name: 'Remover' }))
      servidor.use(handlerAlbum(criarDetalhe({ fotos: [criarFoto({ id: uuid(802) })] })))
      await userEvent.click(within(screen.getByRole('dialog', { name: 'Remover esta foto?' })).getByRole('button', { name: 'Remover' }))
      await waitFor(() => expect(removidas).toEqual([uuid(801)]))
      await waitFor(() => expect(screen.getAllByRole('button', { name: /^Abrir foto/ })).toHaveLength(1))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('se a API recusa, avisa com a mensagem dela e mantém a foto', async () => {
      servidor.use(comRemovivel(), handlerErroRemoverFoto(404, { codigo: 'NAO_ENCONTRADO', mensagem: 'A foto já foi removida' }))
      abrir()
      await userEvent.click(await screen.findByRole('button', { name: 'Abrir foto 1' }))
      await userEvent.click(screen.getByRole('button', { name: 'Remover' }))
      await userEvent.click(within(screen.getByRole('dialog', { name: 'Remover esta foto?' })).getByRole('button', { name: 'Remover' }))
      await waitFor(() => expect(estado.avisos.erro).toHaveBeenCalledWith('A foto já foi removida'))
      expect(screen.getAllByRole('button', { name: /^Abrir foto/ })).toHaveLength(2)
    })
  })

  it('álbum sem fotos: "Nenhuma foto ainda." com a ação de enviar', async () => {
    servidor.use(handlerAlbum(criarDetalhe({ fotos: [] })))
    abrir()
    expect(await screen.findByText('Nenhuma foto ainda.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Enviar primeiras fotos' })).toBeInTheDocument()
  })

  it('carregando: mostra o esqueleto', async () => {
    servidor.use(http.get('/api/albuns/:id', async () => { await delay('infinite'); return HttpResponse.json({}) }))
    abrir()
    expect(await screen.findByRole('status', { name: 'Carregando o álbum' })).toBeInTheDocument()
  })

  it('erro da API: mensagem e "Tentar de novo"', async () => {
    servidor.use(handlerErroAlbum(404, { codigo: 'NAO_ENCONTRADO', mensagem: 'Álbum não encontrado' }))
    abrir()
    expect(await screen.findByText('Álbum não encontrado')).toBeInTheDocument()
    servidor.use(handlerAlbum())
    await userEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('heading', { name: 'Reunião · 20 set' })).toBeInTheDocument()
  })

  it('sem conexão e sem nada guardado: "Disponível quando houver internet"', async () => {
    estado.modo = 'SEM_CONEXAO'
    abrir()
    expect(await screen.findByText('Disponível quando houver internet')).toBeInTheDocument()
  })
})
