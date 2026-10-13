import { CalendarDays, CalendarRange, GraduationCap, House, Trophy, Users } from 'lucide-react'
import { Outlet } from 'react-router-dom'
import { SinoNotificacoes } from '../modulos/notificacoes/SinoNotificacoes'
import { Marca } from '../ui/Marca'
import { useSessao } from '../sessao/useSessao'
import { BotaoMinhaConta } from './BotaoMinhaConta'
import { FaixaSemConexao } from './FaixaSemConexao'
import { FaixaSessaoExpirada } from './FaixaSessaoExpirada'
import { ItemNavegacao } from './ItemNavegacao'
import type { ItemDeNavegacao } from './ItemNavegacao'
import { SeloAguardandoEnvio } from './SeloAguardandoEnvio'
import { AvisoDeTroca } from './SeloPapel'

const INICIO: ItemDeNavegacao = { rotulo: 'Início', icone: House, para: '/inicio' }
const RANKING: ItemDeNavegacao = { rotulo: 'Ranking', icone: Trophy, para: '/ranking' }
const CALENDARIO: ItemDeNavegacao = { rotulo: 'Calendário', icone: CalendarRange, para: '/calendario' }

const ITENS_POR_PAPEL = {
  CONSELHEIRO: [INICIO, { rotulo: 'Unidade', icone: Users, para: '/unidade' }, { rotulo: 'Reuniões', icone: CalendarDays, para: '/reunioes' }, CALENDARIO, RANKING],
  INSTRUTOR: [INICIO, { rotulo: 'Classes', icone: GraduationCap, para: '/classes' }, { rotulo: 'Cronograma', icone: CalendarDays, para: '/cronograma' }, CALENDARIO, RANKING],
  ADM: [INICIO],
} satisfies Record<string, ItemDeNavegacao[]>

/** Rota-layout do celular: cabeçalho com atalho para Minha conta, conteúdo e barra inferior do papel ativo. */
export function LayoutCelular() {
  const { papel } = useSessao()
  const itens = ITENS_POR_PAPEL[papel ?? 'ADM']

  return (
    <div className="flex min-h-dvh flex-col bg-fundo">
      <FaixaSessaoExpirada />
      <FaixaSemConexao />
      <header className="flex items-center justify-between gap-2 bg-marca px-4 py-2 text-white">
        <Marca />
        <div className="flex min-w-0 items-center gap-1">
          <SeloAguardandoEnvio />
          {papel === 'INSTRUTOR' && <SinoNotificacoes />}
          <BotaoMinhaConta sobreMarca />
          <AvisoDeTroca />
        </div>
      </header>
      {/* Pensado para o celular, mas há instrutor no tablet: a tela usa a largura dele até onde a leitura aguenta. */}
      <main className="mx-auto w-full max-w-5xl flex-1 pb-[var(--bottom-nav-h)]">
        <Outlet />
      </main>
      <nav
        aria-label="Navegação principal"
        className="fixed inset-x-0 bottom-0 h-[var(--bottom-nav-h)] border-t border-borda bg-superficie"
      >
        <div className="mx-auto flex h-full max-w-xl items-stretch">
          {itens.map((item) => (
            <ItemNavegacao key={item.rotulo} item={item} layout="barra" />
          ))}
        </div>
      </nav>
    </div>
  )
}
