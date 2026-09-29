import type { RouteObject } from 'react-router-dom'
import { rotasAcesso } from './modulos/acesso/rotas'
import { rotasAdmDesbravadores } from './modulos/adm/desbravadores/rotas'
import { rotasAdmUnidades } from './modulos/adm/unidades/rotas'
import { rotasAdmUsuarios } from './modulos/adm/usuarios/rotas'
import { rotasInicio } from './modulos/inicio/rotas'
import { rotasUnidade } from './modulos/unidade/rotas'

// Um arquivo de rotas por módulo: cada pacote (e cada fase) edita só o seu.
export const rotas: RouteObject[] = [
  ...rotasAcesso,
  ...rotasInicio,
  ...rotasUnidade,
  ...rotasAdmDesbravadores,
  ...rotasAdmUnidades,
  ...rotasAdmUsuarios,
]
