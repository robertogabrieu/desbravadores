import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HttpResponse, http } from 'msw'
import { describe, expect, it, vi } from 'vitest'
import { useSessao } from '../sessao/useSessao'
import { criarEu, criarVinculo, handlersSessao, uuid } from '../testes/handlers/sessao'
import { criarUsuario, criarVinculoUsuario, handlerEditarVinculo } from '../testes/handlers/usuarios'
import { renderizarRotas } from '../testes/renderizar'
import { servidor } from '../testes/servidor'
import { chavesUsuarios, useEditarVinculo } from './usuarios'
import type { Usuario } from './usuarios'

const EU_ID = uuid(500)
const VINCULO_DA_SESSAO = uuid(1)

function Gravar({ vinculoId }: { vinculoId: string }) {
  const { situacao } = useSessao()
  const editar = useEditarVinculo()
  if (situacao !== 'autenticada') return null
  return (
    <>
      <button type="button" onClick={() => editar.mutate({ vinculoId, corpo: { ativo: false } })}>
        Gravar
      </button>
      {editar.isSuccess && <p>Gravou</p>}
    </>
  )
}

/** Sessão de Adm com /api/eu contando as leituras; o PUT responde com `resposta`. */
function abrir(resposta: Usuario, vinculoId = uuid(601)) {
  const leiturasDoEu = { total: 0 }
  servidor.use(
    http.get('/api/eu', () => {
      leiturasDoEu.total += 1
      return HttpResponse.json(criarEu([criarVinculo('ADM')]))
    }),
    ...handlersSessao(),
    handlerEditarVinculo(resposta),
  )
  const montado = renderizarRotas([{ path: '/', element: <Gravar vinculoId={vinculoId} /> }])
  const invalidar = vi.spyOn(montado.clienteConsultas, 'invalidateQueries')
  return { ...montado, leiturasDoEu, invalidar }
}

const chavesInvalidadas = (invalidar: { mock: { calls: unknown[][] } }) =>
  invalidar.mock.calls.map(([filtro]) =>
    typeof filtro === 'object' && filtro !== null && 'queryKey' in filtro ? filtro.queryKey : undefined,
  )

describe('gravação de papel', () => {
  it('refaz usuários, unidades e desbravadores', async () => {
    const { invalidar, leiturasDoEu } = abrir(criarUsuario())
    await userEvent.click(await screen.findByRole('button', { name: 'Gravar' }))
    await screen.findByText('Gravou')
    expect(chavesInvalidadas(invalidar)).toEqual(
      expect.arrayContaining([chavesUsuarios.todas, ['unidades'], ['desbravadores']]),
    )
    expect(leiturasDoEu.total).toBe(1)
  })

  it('de quem está logado: relê a sessão uma vez a mais', async () => {
    const resposta = criarUsuario({ id: EU_ID, vinculos: [criarVinculoUsuario('ADM', 1, { id: VINCULO_DA_SESSAO }), criarVinculoUsuario('INSTRUTOR', 2, { ativo: false })] })
    const { leiturasDoEu } = abrir(resposta, uuid(602))
    await userEvent.click(await screen.findByRole('button', { name: 'Gravar' }))
    await screen.findByText('Gravou')
    await waitFor(() => expect(leiturasDoEu.total).toBe(2))
  })

  it('de quem está logado: falha ao reler a sessão depois de gravar não vira erro da gravação', async () => {
    const resposta = criarUsuario({ id: EU_ID, vinculos: [criarVinculoUsuario('ADM', 1, { id: VINCULO_DA_SESSAO }), criarVinculoUsuario('INSTRUTOR', 2, { ativo: false })] })
    abrir(resposta, uuid(602))
    const botao = await screen.findByRole('button', { name: 'Gravar' })
    servidor.use(http.get('/api/eu', () => new HttpResponse(null, { status: 500 })))
    await userEvent.click(botao)
    expect(await screen.findByText('Gravou')).toBeInTheDocument()
  })

  it('tirando o papel da sessão de quem está logado: não relê a sessão nem a ficha (a tela decide)', async () => {
    const resposta = criarUsuario({ id: EU_ID, vinculos: [criarVinculoUsuario('ADM', 1, { id: VINCULO_DA_SESSAO, ativo: false })] })
    const { leiturasDoEu, invalidar, clienteConsultas } = abrir(resposta, VINCULO_DA_SESSAO)
    await userEvent.click(await screen.findByRole('button', { name: 'Gravar' }))
    await screen.findByText('Gravou')
    expect(leiturasDoEu.total).toBe(1)
    expect(invalidar).toHaveBeenCalledWith({ queryKey: chavesUsuarios.todas, refetchType: 'none' })
    expect(chavesInvalidadas(invalidar)).not.toContainEqual(['unidades'])
    expect(clienteConsultas.getQueryData(chavesUsuarios.um(EU_ID))).toBeUndefined()
  })
})
