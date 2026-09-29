import { CalendarDays, ClipboardList, FileText, Flag, GraduationCap, LayoutDashboard, Trophy, UserRound, Users } from 'lucide-react'
import { Outlet } from 'react-router-dom'
import { FaixaAviso } from '../ui/FaixaAviso'
import { ItemNavegacao } from './ItemNavegacao'
import type { ItemDeNavegacao } from './ItemNavegacao'
import { MenuUsuario } from './MenuUsuario'
import { useLarguraMenorQue } from './useLarguraMenorQue'

const ITENS_ADM: ItemDeNavegacao[] = [
  { rotulo: 'Visão geral', icone: LayoutDashboard },
  { rotulo: 'Desbravadores', icone: UserRound, para: '/adm/desbravadores' },
  { rotulo: 'Usuários', icone: Users, para: '/adm/usuarios' },
  { rotulo: 'Unidades', icone: Flag, para: '/adm/unidades' },
  { rotulo: 'Classes e especialidades', icone: GraduationCap },
  { rotulo: 'Calendário do clube', icone: CalendarDays },
  { rotulo: 'Cronogramas', icone: ClipboardList },
  { rotulo: 'Ranking', icone: Trophy },
  { rotulo: 'Relatórios', icone: FileText },
]

const LARGURA_MINIMA_DO_PAINEL = 900

/** Rota-layout do Adm: menu lateral (faixa horizontal abaixo de 900 px), cabeçalho e o aviso de tela pequena. */
export function LayoutAdm() {
  const telaPequena = useLarguraMenorQue(LARGURA_MINIMA_DO_PAINEL)

  return (
    <div className="min-h-dvh bg-fundo min-[900px]:flex">
      <aside className="bg-marca text-white min-[900px]:min-h-dvh min-[900px]:w-[var(--sidebar-w)] min-[900px]:shrink-0">
        <p className="hidden px-5 py-5 font-titulo text-xl font-bold min-[900px]:block">Desbravadores</p>
        <nav aria-label="Menu do Adm" className="flex gap-1 overflow-x-auto p-2 min-[900px]:flex-col min-[900px]:overflow-visible">
          {ITENS_ADM.map((item) => (
            <ItemNavegacao key={item.rotulo} item={item} layout="lateral" />
          ))}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex justify-end border-b border-borda bg-superficie px-4">
          <MenuUsuario />
        </header>
        {telaPequena && <FaixaAviso className="m-3">O painel do Adm é melhor no computador</FaixaAviso>}
        <main className="flex-1 p-4 min-[900px]:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
