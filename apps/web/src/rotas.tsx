import type { RouteObject } from 'react-router-dom'
import { LayoutAdm } from './layouts/LayoutAdm'
import { LayoutCelular } from './layouts/LayoutCelular'
import { rotasAcessoPapel, rotasAcessoPublicas } from './modulos/acesso/rotas'
import { rotasAdmDesbravadores } from './modulos/adm/desbravadores/rotas'
import { rotasAdmUnidades } from './modulos/adm/unidades/rotas'
import { rotasAdmUsuarios } from './modulos/adm/usuarios/rotas'
import { TelaConectar } from './modulos/conectar/TelaConectar'
import { PaginaNaoEncontrada } from './modulos/erro/PaginaNaoEncontrada'
import { PaginaFila } from './modulos/fila/PaginaFila'
import { rotasInicio } from './modulos/inicio/rotas'
import { rotasUnidade } from './modulos/unidade/rotas'
import { GuardaRota } from './sessao/GuardaRota'
import { RedirecionamentoRaiz } from './sessao/RedirecionamentoRaiz'

// Um arquivo de rotas por módulo: cada pacote (e cada fase) edita só o seu.
export const rotas: RouteObject[] = [
  { path: '/', element: <RedirecionamentoRaiz /> },
  ...rotasAcessoPublicas,
  { path: '/conectar', element: <TelaConectar /> },
  { element: <GuardaRota semVinculo />, children: rotasAcessoPapel },
  {
    element: <GuardaRota papeis={['CONSELHEIRO', 'INSTRUTOR']} />,
    children: [
      {
        element: <LayoutCelular />,
        children: [
          ...rotasInicio,
          { path: '/fila', element: <PaginaFila /> },
          { element: <GuardaRota papeis={['CONSELHEIRO']} />, children: rotasUnidade },
        ],
      },
    ],
  },
  {
    element: <GuardaRota papeis={['ADM']} />,
    children: [
      { element: <LayoutAdm />, children: [...rotasAdmDesbravadores, ...rotasAdmUnidades, ...rotasAdmUsuarios] },
    ],
  },
  { path: '*', element: <PaginaNaoEncontrada /> },
]
