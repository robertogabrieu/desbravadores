import { screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { handlerClasses } from '../../testes/handlers/leitura'
import { CLASSE_MONTAGEM, criarMontagemDeExemplo, handlerErroMontagem, handlersMontagem } from '../../testes/handlers/montagem'
import { criarVinculo, handlersSessao, uuid } from '../../testes/handlers/sessao'
import { renderizarRotas } from '../../testes/renderizar'
import { servidor } from '../../testes/servidor'
import { GuardaRota } from '../../sessao/GuardaRota'
import { rotasCronogramaMontagem } from './rotas'

vi.mock('../../offline', async (importarOriginal) => ({
  ...(await importarOriginal<typeof import('../../offline')>()),
  useConexao: () => ({ modo: 'ONLINE' }),
}))

const rotas = [
  { element: <GuardaRota papeis={['INSTRUTOR', 'ADM']} />, children: [...rotasCronogramaMontagem, { path: '/cronograma', element: <p>leitura do cronograma</p> }] },
]

describe('G12 · /cronograma/montar', () => {
  it('Adm vê a tela do computador (A7)', async () => {
    const { handlers } = handlersMontagem(criarMontagemDeExemplo())
    servidor.use(...handlersSessao([criarVinculo('ADM')]), handlerClasses(), ...handlers)
    renderizarRotas(rotas, '/cronograma/montar')
    expect(await screen.findByRole('heading', { name: 'Montar cronograma da classe' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Publicar' })).toBeInTheDocument()
  })

  it('instrutor que monta vê a tela do celular (I3b)', async () => {
    const { handlers } = handlersMontagem(criarMontagemDeExemplo())
    servidor.use(...handlersSessao([criarVinculo('INSTRUTOR', 1, { classes: [CLASSE_MONTAGEM] })]), handlerClasses(), ...handlers)
    renderizarRotas(rotas, '/cronograma/montar')
    expect(await screen.findByRole('button', { name: 'Enviar para o Adm publicar' })).toBeInTheDocument()
  })

  it('instrutor que não monta (403) vai para a leitura da classe', async () => {
    servidor.use(
      ...handlersSessao([criarVinculo('INSTRUTOR', 1, { classes: [CLASSE_MONTAGEM] })]),
      handlerClasses(),
      handlerErroMontagem(403, { codigo: 'SEM_PERMISSAO', mensagem: 'Sem permissão' }),
    )
    const { roteador } = renderizarRotas(rotas, '/cronograma/montar')
    expect(await screen.findByText('leitura do cronograma')).toBeInTheDocument()
    await waitFor(() => expect(roteador.state.location.pathname + roteador.state.location.search).toBe(`/cronograma?classe=${CLASSE_MONTAGEM.id}`))
  })

  it('?classe= escolhe a classe do instrutor (link da notificação)', async () => {
    const segunda = { ...CLASSE_MONTAGEM, id: uuid(102), nome: 'Companheiro' }
    const { handlers, registro } = handlersMontagem(criarMontagemDeExemplo())
    servidor.use(...handlersSessao([criarVinculo('INSTRUTOR', 1, { classes: [CLASSE_MONTAGEM, segunda] })]), handlerClasses(), ...handlers)
    renderizarRotas(rotas, `/cronograma/montar?classe=${segunda.id}`)
    await screen.findByRole('button', { name: 'Enviar para o Adm publicar' })
    expect(registro.classesLidas).toEqual([segunda.id])
  })

  it('?classe= também escolhe a classe do Adm', async () => {
    const { handlers, registro } = handlersMontagem(criarMontagemDeExemplo())
    servidor.use(...handlersSessao([criarVinculo('ADM')]), handlerClasses(), ...handlers)
    renderizarRotas(rotas, `/cronograma/montar?classe=${uuid(100)}`)
    await screen.findByRole('button', { name: 'Publicar' })
    expect(registro.classesLidas[0]).toBe(uuid(100))
  })
})
