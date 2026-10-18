import type { RouteObject } from 'react-router-dom'
import { AceitarConviteAcesso } from './AceitarConviteAcesso'
import { DefinirSenha } from './DefinirSenha'
import { EscolherPapel } from './EscolherPapel'
import { EsqueciSenha } from './EsqueciSenha'
import { Login } from './Login'
import { RedefinirSenha } from './RedefinirSenha'
import { ConviteDePasskey } from '../passkey/ConviteDePasskey'
import { ROTA_DO_CONVITE } from '../passkey/convite'
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

/** Com sessão, mesmo sem vínculo ativo: a escolha de papel e o convite da digital, que vem antes dela. */
export const rotasAcessoPapel: RouteObject[] = [
  { path: '/papel', element: <EscolherPapel /> },
  { path: ROTA_DO_CONVITE, element: <ConviteDePasskey /> },
]
