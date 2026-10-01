import type { RouteObject } from 'react-router-dom'
import { AceitarConviteAcesso } from './AceitarConviteAcesso'
import { DefinirSenha } from './DefinirSenha'
import { EscolherPapel } from './EscolherPapel'
import { EsqueciSenha } from './EsqueciSenha'
import { Login } from './Login'
import { RedefinirSenha } from './RedefinirSenha'

/** Sem sessão: entrar, aceitar convite (por e-mail ou por link), recuperar senha. */
export const rotasAcessoPublicas: RouteObject[] = [
  { path: '/login', element: <Login /> },
  { path: '/convite/:token', element: <DefinirSenha /> },
  { path: '/acesso/:token', element: <AceitarConviteAcesso /> },
  { path: '/senha/esqueci', element: <EsqueciSenha /> },
  { path: '/senha/redefinir/:token', element: <RedefinirSenha /> },
]

/** Com sessão, mesmo sem vínculo ativo. */
export const rotasAcessoPapel: RouteObject[] = [{ path: '/papel', element: <EscolherPapel /> }]
