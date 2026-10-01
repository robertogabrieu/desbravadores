import { CalendarDays, GraduationCap, House, Trophy, Users } from 'lucide-react'
import { Outlet } from 'react-router-dom'
import { SinoNotificacoes } from '../modulos/notificacoes/SinoNotificacoes'
import { vinculosDoClube } from '../modulos/acesso/papeis'
import { Marca } from '../ui/Marca'
import { useSessao } from '../sessao/useSessao'
import { FaixaSemConexao } from './FaixaSemConexao'
import { FaixaSessaoExpirada } from './FaixaSessaoExpirada'
import { ItemNavegacao } from './ItemNavegacao'
import type { ItemDeNavegacao } from './ItemNavegacao'
import { MenuUsuario } from './MenuUsuario'
import { SeloAguardandoEnvio } from './SeloAguardandoEnvio'
import { SeloPapel } from './SeloPapel'

const INICIO: ItemDeNavegacao = { rotulo: 'Início', icone: House, para: '/inicio' }
const RANKING: ItemDeNavegacao = { rotulo: 'Ranking', icone: Trophy, para: '/ranking' }

const ITENS_POR_PAPEL = {
  CONSELHEIRO: [INICIO, { rotulo: 'Unidade', icone: Users, para: '/unidade' }, { rotulo: 'Reuniões', icone: CalendarDays, para: '/reunioes' }, RANKING],
  INSTRUTOR: [INICIO, { rotulo: 'Classes', icone: GraduationCap, para: '/classes' }, { rotulo: 'Cronograma', icone: CalendarDays, para: '/cronograma' }, RANKING],
  ADM: [INICIO],
} satisfies Record<string, ItemDeNavegacao[]>

/** Rota-layout do celular: cabeçalho com menu do usuário, conteúdo e barra inferior do papel ativo. */
export function LayoutCelular() {
  const { papel, vinculos, vinculoAtivo } = useSessao()
  const itens = ITENS_POR_PAPEL[papel ?? 'ADM']
  // Com o selo do papel, o nome do app não cabe ao lado dele em 320 px: fica só o emblema.
  const comSeloDoPapel = vinculosDoClube(vinculos, vinculoAtivo).length >= 2

  return (
    <div className="flex min-h-dvh flex-col bg-fundo">
      <FaixaSessaoExpirada />
      <FaixaSemConexao />
      <header className="flex items-center justify-between gap-2 bg-marca px-4 py-2 text-white">
        <Marca classeDoNome={comSeloDoPapel ? 'max-[419px]:sr-only' : undefined} />
        <div className="flex min-w-0 items-center gap-1">
          <SeloAguardandoEnvio />
          <SeloPapel sobreMarca />
          {papel === 'INSTRUTOR' && <SinoNotificacoes />}
          <MenuUsuario />
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
