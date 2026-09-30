import { CalendarDays, GraduationCap, House, Trophy, Users } from 'lucide-react'
import { Outlet } from 'react-router-dom'
import { SinoNotificacoes } from '../modulos/notificacoes/SinoNotificacoes'
import { useSessao } from '../sessao/useSessao'
import { FaixaSemConexao } from './FaixaSemConexao'
import { FaixaSessaoExpirada } from './FaixaSessaoExpirada'
import { ItemNavegacao } from './ItemNavegacao'
import type { ItemDeNavegacao } from './ItemNavegacao'
import { MenuUsuario } from './MenuUsuario'
import { SeloAguardandoEnvio } from './SeloAguardandoEnvio'

const INICIO: ItemDeNavegacao = { rotulo: 'Início', icone: House, para: '/inicio' }
const RANKING: ItemDeNavegacao = { rotulo: 'Ranking', icone: Trophy, para: '/ranking' }

const ITENS_POR_PAPEL = {
  CONSELHEIRO: [INICIO, { rotulo: 'Unidade', icone: Users, para: '/unidade' }, { rotulo: 'Reuniões', icone: CalendarDays, para: '/reunioes' }, RANKING],
  INSTRUTOR: [INICIO, { rotulo: 'Classes', icone: GraduationCap }, { rotulo: 'Cronograma', icone: CalendarDays }, RANKING],
  ADM: [INICIO],
} satisfies Record<string, ItemDeNavegacao[]>

/** Rota-layout do celular: cabeçalho com menu do usuário, conteúdo e barra inferior do papel ativo. */
export function LayoutCelular() {
  const { papel } = useSessao()
  const itens = ITENS_POR_PAPEL[papel ?? 'ADM']

  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col bg-fundo">
      <FaixaSessaoExpirada />
      <FaixaSemConexao />
      <header className="flex items-center justify-between gap-2 bg-marca px-4 text-white">
        <span className="font-titulo text-lg font-bold">Desbravadores</span>
        <div className="flex items-center gap-1">
          <SeloAguardandoEnvio />
          {papel === 'INSTRUTOR' && <SinoNotificacoes />}
          <MenuUsuario />
        </div>
      </header>
      <main className="flex-1 pb-[var(--bottom-nav-h)]">
        <Outlet />
      </main>
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 mx-auto flex h-[var(--bottom-nav-h)] max-w-[480px] items-stretch border-t border-borda bg-superficie"
      >
        {itens.map((item) => (
          <ItemNavegacao key={item.rotulo} item={item} layout="barra" />
        ))}
      </nav>
    </div>
  )
}
