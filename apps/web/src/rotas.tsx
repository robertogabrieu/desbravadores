import type { RouteObject } from 'react-router-dom'
import { LayoutAdm } from './layouts/LayoutAdm'
import { LayoutCelular } from './layouts/LayoutCelular'
import { rotasAcessoPapel, rotasAcessoPublicas } from './modulos/acesso/rotas'
import { rotasAdmCalendario } from './modulos/adm/calendario/rotas'
import { rotasAdmReunioes } from './modulos/adm/reunioes/rotas'
import { rotasAdmClasses } from './modulos/adm/classes/rotas'
import { rotasAdmConfiguracoes } from './modulos/adm/configuracoes/rotas'
import { rotasAdmDesbravadores } from './modulos/adm/desbravadores/rotas'
import { rotasAdmUnidades } from './modulos/adm/unidades/rotas'
import { rotasAdmUsuarios } from './modulos/adm/usuarios/rotas'
import { rotasAdmVisaoGeral } from './modulos/adm/visao-geral/rotas'
import { rotasAdmCronogramas, rotasCronogramaMontagem } from './modulos/cronograma-montagem/rotas'
import { TelaConectar } from './modulos/conectar/TelaConectar'
import { PaginaNaoEncontrada } from './modulos/erro/PaginaNaoEncontrada'
import { PaginaFila } from './modulos/fila/PaginaFila'
import { TelaRegistroAula } from './modulos/aulas/TelaRegistroAula'
import { TelaClasses } from './modulos/classes/TelaClasses'
import { TelaCronograma } from './modulos/cronograma/TelaCronograma'
import { TelaEspecialidades } from './modulos/especialidades/TelaEspecialidades'
import { rotasGaleria } from './modulos/galeria/rotas'
import { TelaMateriais } from './modulos/materiais/TelaMateriais'
import { TelaObservacoes } from './modulos/observacoes/TelaObservacoes'
import { TelaProgressoClasse } from './modulos/progresso/TelaProgressoClasse'
import { Inicio } from './modulos/inicio/Inicio'
import { TelaInicioInstrutor } from './modulos/inicio-instrutor/TelaInicioInstrutor'
import { rotasNotificacoes } from './modulos/notificacoes/rotas'
import { rotasPerfil } from './modulos/perfil/rotas'
import { rotasRanking } from './modulos/ranking/rotas'
import { rotasReunioes } from './modulos/reunioes/rotas'
import { rotasUnidade } from './modulos/unidade/rotas'
import { GuardaRota } from './sessao/GuardaRota'
import { RedirecionamentoRaiz } from './sessao/RedirecionamentoRaiz'
import { useSessao } from './sessao/useSessao'

/** Ranking e perfil servem aos três papéis, cada um com a barra (ou o menu) do papel ativo. */
function LayoutDoPapel() {
  const { papel } = useSessao()
  return papel === 'ADM' ? <LayoutAdm /> : <LayoutCelular />
}

/** O início muda com o papel ativo: o instrutor tem a sua tela; conselheiro e Adm seguem a da 1b. */
export function InicioDoPapel() {
  const { papel } = useSessao()
  return papel === 'INSTRUTOR' ? <TelaInicioInstrutor /> : <Inicio />
}

/** Telas do instrutor (SPEC Fase 2 §5); cada pacote troca o conteúdo da tela, não a rota. */
const rotasInstrutor: RouteObject[] = [
  { path: '/classes', element: <TelaClasses /> },
  { path: '/cronograma', element: <TelaCronograma /> },
  { path: '/aulas/nova', element: <TelaRegistroAula /> },
  { path: '/aulas/:id/editar', element: <TelaRegistroAula /> },
  { path: '/classes/:id/progresso', element: <TelaProgressoClasse /> },
  { path: '/especialidades', element: <TelaEspecialidades /> },
  { path: '/observacoes', element: <TelaObservacoes /> },
  { path: '/classes/:id/materiais', element: <TelaMateriais /> },
]

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
          { path: '/inicio', element: <InicioDoPapel /> },
          { path: '/fila', element: <PaginaFila /> },
          {
            element: <GuardaRota papeis={['CONSELHEIRO']} />,
            children: [...rotasUnidade, ...rotasReunioes, ...rotasGaleria],
          },
          { element: <GuardaRota papeis={['INSTRUTOR']} />, children: rotasInstrutor },
        ],
      },
    ],
  },
  {
    element: <GuardaRota papeis={['ADM']} />,
    children: [
      {
        element: <LayoutAdm />,
        children: [
          ...rotasAdmVisaoGeral,
          ...rotasAdmDesbravadores,
          ...rotasAdmUnidades,
          ...rotasAdmUsuarios,
          ...rotasAdmClasses,
          ...rotasAdmCalendario,
          ...rotasAdmReunioes,
          ...rotasAdmCronogramas,
          ...rotasAdmConfiguracoes,
        ],
      },
    ],
  },
  {
    element: <GuardaRota papeis={['CONSELHEIRO', 'INSTRUTOR', 'ADM']} />,
    children: [{ element: <LayoutDoPapel />, children: [...rotasRanking, ...rotasPerfil] }],
  },
  {
    element: <GuardaRota papeis={['INSTRUTOR', 'ADM']} />,
    children: [{ element: <LayoutDoPapel />, children: [...rotasNotificacoes, ...rotasCronogramaMontagem] }],
  },
  { path: '*', element: <PaginaNaoEncontrada /> },
]
