import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { HttpResponse, http } from 'msw'
import type { RouteObject } from 'react-router-dom'
import { caixa } from '../../../testes/handlers/caixa'
import { criarUnidade, handlerUnidades } from '../../../testes/handlers/leitura'
import { criarEu, criarVinculo, handlersSessao, uuid } from '../../../testes/handlers/sessao'
import {
  criarUsuario,
  criarVinculoUsuario,
  handlerCatalogoUsuarios,
  handlerEditarVinculo,
  handlerListaUsuarios,
  handlerUsuario,
} from '../../../testes/handlers/usuarios'
import { renderizarRotas } from '../../../testes/renderizar'
import { servidor } from '../../../testes/servidor'
import { GuardaRota } from '../../../sessao/GuardaRota'
import { rotasAcessoPapel, rotasAcessoPublicas } from '../../acesso/rotas'
import { rotasAdmUsuarios } from './rotas'

/** As rotas reais de acesso, com a guarda, e a ficha atrás da guarda do Adm: nada de tela falsa no caminho. */
const rotasReais: RouteObject[] = [
  ...rotasAcessoPublicas,
  { element: <GuardaRota semVinculo />, children: rotasAcessoPapel },
  { element: <GuardaRota papeis={['ADM']} />, children: rotasAdmUsuarios },
]

describe('Adm remove o próprio último papel, com as rotas reais', () => {
  it('termina no login com o aviso visível, sem passar pela escolha de papel', async () => {
    const aguias = criarUnidade({ id: uuid(201), nome: 'Águias' })
    const adm = caixa(
      criarUsuario({ id: uuid(500), nome: 'Ana Adm', genero: 'F', vinculos: [criarVinculoUsuario('ADM', 1, { id: uuid(1) })] }),
    )
    const saidas: string[] = []
    const depois = { ...adm.atual, situacao: 'INATIVO' as const, vinculos: adm.atual.vinculos.map((v) => ({ ...v, ativo: false })) }
    servidor.use(
      http.post('/api/auth/logout', () => {
        saidas.push('logout')
        return new HttpResponse(null, { status: 204 })
      }),
      ...handlersSessao([criarVinculo('ADM')]),
      handlerUsuario(adm),
      handlerListaUsuarios([adm.atual]),
      handlerCatalogoUsuarios(),
      handlerUnidades([aguias]),
      handlerEditarVinculo(depois),
    )
    const { roteador } = renderizarRotas(rotasReais, `/adm/usuarios/${uuid(500)}`)
    const visitados: string[] = []
    roteador.subscribe((estado) => visitados.push(estado.location.pathname))

    await userEvent.click(within(await screen.findByRole('region', { name: 'Adm' })).getByRole('button', { name: 'Remover papel' }))
    servidor.use(http.get('/api/eu', () => HttpResponse.json(criarEu([], null))))
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remover papel' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Você não tem mais acesso a nenhum clube.')
    await waitFor(() => expect(roteador.state.location.pathname).toBe('/login'))
    expect(visitados).not.toContain('/papel')
    await waitFor(() => expect(saidas).toEqual(['logout']))
  })
})
