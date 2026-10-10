import type { RouteObject } from 'react-router-dom'
import { GerarLinkDaClasse } from '../substituicao/GerarLinkDeSubstituicao'
import { AdmClasses } from './AdmClasses'

export const rotasAdmClasses: RouteObject[] = [
  { path: '/adm/classes', element: <AdmClasses /> },
  { path: '/adm/classes/:id/substituicao', element: <GerarLinkDaClasse /> },
]
