import type { RouteObject } from 'react-router-dom'
import { AceitarConviteAcesso } from './AceitarConviteAcesso'
import { DefinirSenha } from './DefinirSenha'
import { EscolherPapel } from './EscolherPapel'
import { EsqueciSenha } from './EsqueciSenha'
import { Login } from './Login'
import { RedefinirSenha } from './RedefinirSenha'
import { rotaDoSubstituto } from '../substituto/rotas'

/** Sem sessão: entrar, aceitar convite (por e-mail ou por link), recuperar senha, abrir o link de substituição. */
export const rotasAcessoPublicas: RouteObject[] = [
  { path: '/login', element: <Login /> },
  { path: '/convite/:token', element: <DefinirSenha /> },
  { path: '/acesso/:token', element: <AceitarConviteAcesso /> },
  { path: '/senha/esqueci', element: <EsqueciSenha /> },
  { path: '/senha/redefinir/:token', element: <RedefinirSenha /> },
  rotaDoSubstituto,
]

/** Com sessão, mesmo sem vínculo ativo. */
export const rotasAcessoPapel: RouteObject[] = [{ path: '/papel', element: <EscolherPapel /> }]
