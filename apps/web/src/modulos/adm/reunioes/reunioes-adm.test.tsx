import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ModoConexao } from '../../../offline'
import { caixa } from '../../../testes/handlers/caixa'
import { criarDetalheReuniao, criarSaidaEnvio, handlerCorrigirChamada, handlerReuniaoDe } from '../../../testes/handlers/chamada'
import { uuid } from '../../../testes/handlers/sessao'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { chavesLeitura } from '../../../api/leitura'
import { chavesVisaoGeral } from '../../../api/visao-geral'
import { rotasAdmReunioes } from './rotas'

const offline = vi.hoisted(() => {
  const ouvintes = new Set<() => void>()
  return {
    modo: 'ONLINE' as ModoConexao,
    ouvintes,
    mudar(modo: ModoConexao) {
      this.modo = modo
      ouvintes.forEach((ouvinte) => ouvinte())
    },
  }
})
vi.mock('../../../offline', async (importarOriginal) => {
  const { useSyncExternalStore } = await import('react')
  return {
    ...(await importarOriginal<typeof import('../../../offline')>()),
    useConexao: () => ({
      modo: useSyncExternalStore(
        (ouvinte) => {
          offline.ouvintes.add(ouvinte)
          return () => offline.ouvintes.delete(ouvinte)
        },
        () => offline.modo,
      ),
    }),
  }
})
beforeEach(() => {
  offline.modo = 'ONLINE'
})

const linha = (n: number, nome: string, situacao: 'PRESENTE' | 'ATRASADO' | 'FALTA', extra: { uniforme?: boolean; biblia?: boolean } = {}) => ({
  dbvId: uuid(300 + n), nome, nomePublico: nome.split(' ')[0] ?? nome, situacao, uniforme: extra.uniforme ?? false, biblia: extra.biblia ?? false,
  licao: false, versao: `2026-09-27T12:0${n}:00.000Z`, pontos: 0,
})

const reuniao = () =>
  caixa(
    criarDetalheReuniao({
      id: uuid(601),
      unidade: { id: uuid(201), nome: 'Águias' },
      data: '2026-09-27',
      horario: '09:00',
      local: 'Igreja Central',
      registradaPor: { nome: 'Carla Mendes' },
      alterada: { por: 'Carla Mendes', em: '2026-09-27T14:02:00.000Z', conflito: false },
      chamada: [linha(1, 'Ana Beatriz Souza', 'PRESENTE', { uniforme: true, biblia: true }), linha(2, 'Carla Fernandes', 'ATRASADO'), linha(3, 'Júlia Rocha', 'FALTA')],
      totais: { presentes: 2, total: 3, atrasos: 1, uniformes: 1, biblias: 1, pontos: 0 },
      album: { id: uuid(901), totalFotos: 3, miniaturas: [] },
    }),
  )

function abrir(rota: string, registro = reuniao(), ...extras: Parameters<typeof servidor.use>) {
  servidor.use(handlerReuniaoDe(registro), ...extras)
  return { ...renderizarRotas([...rotasAdmReunioes, { path: '/adm/unidades/:id', element: <p>ficha da unidade</p> }], rota), registro }
}

describe('ficha da reunião (Adm)', () => {
  it('mostra cabeçalho, indicadores, chamada e alterações; Corrigir chamada; sem link de álbum', async () => {
    abrir(`/adm/reunioes/${uuid(601)}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Domingo, 27 de setembro' })).toBeInTheDocument()
    expect(screen.getByText('Reunião · Unidade Águias')).toBeInTheDocument()
    expect(screen.getByText('9h · Igreja Central · chamada feita por Carla Mendes')).toBeInTheDocument()
    expect(screen.getByText('Bíblias')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Chamada' })).getByText('Júlia Rocha')).toBeInTheDocument()
    expect(screen.getByText('Corrigida por Carla Mendes em 27/09 às 11:02.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Corrigir chamada' })).toHaveAttribute('href', `/adm/reunioes/${uuid(601)}/chamada`)
    expect(screen.queryByRole('link', { name: /Ver álbum/ })).not.toBeInTheDocument()
  })

  it('Voltar leva à ficha da unidade no mês da reunião', async () => {
    const { roteador } = abrir(`/adm/reunioes/${uuid(601)}`)
    await userEvent.click(await screen.findByRole('link', { name: 'Voltar para Águias' }))
    expect(roteador.state.location.pathname).toBe(`/adm/unidades/${uuid(201)}`)
    expect(roteador.state.location.search).toBe('?mes=2026-09')
  })

  it.each([`/adm/reunioes/${uuid(699)}`, '/adm/reunioes/abc'])('%s → "Não encontramos esta reunião"', async (rota) => {
    abrir(rota)
    expect(await screen.findByRole('heading', { name: 'Não encontramos esta reunião' })).toBeInTheDocument()
  })
})

describe('corrigir chamada (Adm)', () => {
  it('a lista vem das linhas da reunião; envia direto só o que mudou e volta à ficha atualizada', async () => {
    const registro = reuniao()
    const recebidos: { uuid: string; corpo: unknown }[] = []
    const { roteador } = abrir(
      `/adm/reunioes/${uuid(601)}/chamada`,
      registro,
      handlerCorrigirChamada((id) => {
        registro.atual = { ...registro.atual, alterada: { por: 'Ana Souza', em: '2026-09-28T13:00:00.000Z', conflito: false } }
        return criarSaidaEnvio(id)
      }, recebidos),
    )
    const lista = await screen.findAllByRole('listitem')
    expect(lista.map((li) => li.getAttribute('aria-label'))).toEqual(['Ana Beatriz Souza', 'Carla Fernandes', 'Júlia Rocha'])
    await userEvent.click(screen.getByRole('button', { name: /Júlia Rocha/ }))
    await userEvent.click(screen.getByRole('button', { name: /Salvar chamada/ }))
    await waitFor(() => expect(roteador.state.location.pathname).toBe(`/adm/reunioes/${uuid(601)}`))
    expect(recebidos).toHaveLength(1)
    expect(recebidos[0]?.uuid).toBe(uuid(601))
    expect(recebidos[0]?.corpo).toMatchObject({
      versaoPayload: 1,
      unidadeId: uuid(201),
      data: '2026-09-27',
      cabecalho: null,
      linhas: [{ dbvId: uuid(303), situacao: 'PRESENTE', versaoVista: '2026-09-27T12:03:00.000Z' }],
    })
    expect(await screen.findByText(/Corrigida por Ana Souza/)).toBeInTheDocument()
  })

  it('conflito e descartados aparecem na própria tela; Salvar fica desligado', async () => {
    abrir(
      `/adm/reunioes/${uuid(601)}/chamada`,
      reuniao(),
      handlerCorrigirChamada((id) => criarSaidaEnvio(id, { conflitos: [{ dbvId: uuid(303), nome: 'Júlia Rocha' }], ignorados: [{ dbvId: uuid(302), nome: 'Carla Fernandes' }] })),
    )
    await userEvent.click(await screen.findByRole('button', { name: /Júlia Rocha/ }))
    await userEvent.click(screen.getByRole('button', { name: /Salvar chamada/ }))
    expect(await screen.findByText(/a sua versão valeu e a anterior ficou registrada: Júlia Rocha/)).toBeInTheDocument()
    expect(screen.getByText('Carla Fernandes não eram da unidade nessa data e ficaram fora.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Salvar chamada/ })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Ver a reunião' })).toHaveAttribute('href', `/adm/reunioes/${uuid(601)}`)
  })

  it('"Ver a reunião" depois de salvar com avisos troca a tela em vez de empilhar', async () => {
    const { roteador } = abrir(
      `/adm/reunioes/${uuid(601)}/chamada`,
      reuniao(),
      handlerCorrigirChamada((id) => criarSaidaEnvio(id, { conflitos: [{ dbvId: uuid(303), nome: 'Júlia Rocha' }] })),
    )
    await userEvent.click(await screen.findByRole('button', { name: /Júlia Rocha/ }))
    await userEvent.click(screen.getByRole('button', { name: /Salvar chamada/ }))
    await userEvent.click(await screen.findByRole('link', { name: 'Ver a reunião' }))
    await waitFor(() => expect(roteador.state.location.pathname).toBe(`/adm/reunioes/${uuid(601)}`))
    expect(roteador.state.historyAction).toBe('REPLACE')
  })

  it('a releitura que chega com o formulário aberto não muda a versão enviada', async () => {
    const recebidos: { uuid: string; corpo: unknown }[] = []
    const registro = reuniao()
    const { clienteConsultas } = abrir(`/adm/reunioes/${uuid(601)}/chamada`, registro, handlerCorrigirChamada((id) => criarSaidaEnvio(id), recebidos))
    await userEvent.click(await screen.findByRole('button', { name: /Júlia Rocha/ }))
    registro.atual = { ...registro.atual, chamada: registro.atual.chamada.map((l) => (l.dbvId === uuid(303) ? { ...l, versao: '2026-09-27T15:30:00.000Z' } : l)) }
    await act(() => clienteConsultas.refetchQueries())
    await userEvent.click(screen.getByRole('button', { name: /Salvar chamada/ }))
    await waitFor(() => expect(recebidos).toHaveLength(1))
    expect(recebidos[0]?.corpo).toMatchObject({ linhas: [{ dbvId: uuid(303), versaoVista: '2026-09-27T12:03:00.000Z' }] })
  })

  it('a releitura que muda os membros com o formulário aberto não muda a lista nem o que é enviado', async () => {
    const registro = reuniao()
    const { clienteConsultas } = abrir(`/adm/reunioes/${uuid(601)}/chamada`, registro, handlerCorrigirChamada((id) => criarSaidaEnvio(id)))
    await screen.findByRole('button', { name: /Júlia Rocha/ })
    registro.atual = { ...registro.atual, chamada: [...registro.atual.chamada, linha(4, 'Davi Lima', 'PRESENTE')] }
    await act(() => clienteConsultas.refetchQueries())
    expect(screen.getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))).toEqual(['Ana Beatriz Souza', 'Carla Fernandes', 'Júlia Rocha'])
  })

  it('sem internet depois de salvar com avisos, o aviso de internet vem além do retorno, e o "Ver a reunião" ficam', async () => {
    abrir(
      `/adm/reunioes/${uuid(601)}/chamada`,
      reuniao(),
      handlerCorrigirChamada((id) => criarSaidaEnvio(id, { conflitos: [{ dbvId: uuid(303), nome: 'Júlia Rocha' }] })),
    )
    await userEvent.click(await screen.findByRole('button', { name: /Júlia Rocha/ }))
    await userEvent.click(screen.getByRole('button', { name: /Salvar chamada/ }))
    await screen.findByText('Chamada salva, com avisos')
    act(() => offline.mudar('SEM_CONEXAO'))
    expect(screen.getByText('Corrigir a chamada precisa de internet')).toBeInTheDocument()
    expect(screen.getByText('Chamada salva, com avisos')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ver a reunião' })).toBeInTheDocument()
  })

  it('recusa da API fica na tela', async () => {
    abrir(`/adm/reunioes/${uuid(601)}/chamada`, reuniao(), handlerCorrigirChamada((id) => criarSaidaEnvio(id), [], { status: 422, codigo: 'REGRA', mensagem: 'Reunião de unidade inativa.' }))
    await userEvent.click(await screen.findByRole('button', { name: /Júlia Rocha/ }))
    await userEvent.click(screen.getByRole('button', { name: /Salvar chamada/ }))
    expect(await screen.findByText('Reunião de unidade inativa.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Salvar chamada/ })).toBeEnabled()
  })

  it('sem internet, diz que precisa de internet', async () => {
    offline.modo = 'SEM_CONEXAO'
    abrir(`/adm/reunioes/${uuid(601)}/chamada`)
    expect(await screen.findByRole('heading', { name: 'Corrigir a chamada precisa de internet' })).toBeInTheDocument()
  })

  it('perder a conexão com o formulário aberto mantém o formulário e as marcas; Salvar desliga', async () => {
    abrir(`/adm/reunioes/${uuid(601)}/chamada`)
    await userEvent.click(await screen.findByRole('button', { name: /Júlia Rocha/ }))
    expect(screen.getByRole('button', { name: /Salvar chamada/ })).toBeEnabled()
    act(() => offline.mudar('SEM_CONEXAO'))
    expect(screen.getByRole('button', { name: /Júlia Rocha/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Salvar chamada/ })).toBeDisabled()
    expect(screen.queryByRole('heading', { name: 'Corrigir a chamada precisa de internet' })).not.toBeInTheDocument()
    expect(screen.getByText('Corrigir a chamada precisa de internet')).toBeInTheDocument()
    act(() => offline.mudar('ONLINE'))
    expect(screen.getByRole('button', { name: /Salvar chamada/ })).toBeEnabled()
    expect(screen.queryByText('Corrigir a chamada precisa de internet')).not.toBeInTheDocument()
  })

  it('sem permissão de corrigir, mostra o bloqueio no lugar do formulário, com Voltar à ficha', async () => {
    const bloqueada = caixa(criarDetalheReuniao({ ...reuniao().atual, podeEditar: false }))
    abrir(`/adm/reunioes/${uuid(601)}/chamada`, bloqueada)
    expect(await screen.findByRole('heading', { name: 'Esta reunião não pode ser corrigida' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Salvar chamada/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voltar à ficha' })).toHaveAttribute('href', `/adm/reunioes/${uuid(601)}`)
  })

  it('depois de corrigir, a frequência da unidade e a visão geral ficam para reler', async () => {
    const { clienteConsultas } = abrir(`/adm/reunioes/${uuid(601)}/chamada`, reuniao(), handlerCorrigirChamada((id) => criarSaidaEnvio(id)))
    clienteConsultas.setQueryData([chavesLeitura.semMembros[0], uuid(201)], { marcador: true })
    clienteConsultas.setQueryData(chavesVisaoGeral.todas, { marcador: true })
    await userEvent.click(await screen.findByRole('button', { name: /Júlia Rocha/ }))
    await userEvent.click(screen.getByRole('button', { name: /Salvar chamada/ }))
    await waitFor(() => expect(clienteConsultas.getQueryState(chavesVisaoGeral.todas)?.isInvalidated).toBe(true))
    expect(clienteConsultas.getQueryState([chavesLeitura.semMembros[0], uuid(201)])?.isInvalidated).toBe(true)
  })
})
