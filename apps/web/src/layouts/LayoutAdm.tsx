import { CalendarDays, ClipboardList, FileText, Flag, GraduationCap, LayoutDashboard, Menu, Settings, Trophy, UserRound, Users, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { SinoNotificacoes } from '../modulos/notificacoes/SinoNotificacoes'
import { FaixaAviso } from '../ui/FaixaAviso'
import { FaixaSemConexao } from './FaixaSemConexao'
import { FaixaSessaoExpirada } from './FaixaSessaoExpirada'
import { ItemNavegacao } from './ItemNavegacao'
import type { ItemDeNavegacao } from './ItemNavegacao'
import { MenuUsuario } from './MenuUsuario'
import { useLarguraMenorQue } from './useLarguraMenorQue'

const ITENS_ADM: ItemDeNavegacao[] = [
  { rotulo: 'Visão geral', icone: LayoutDashboard, para: '/adm', exato: true },
  { rotulo: 'Desbravadores', icone: UserRound, para: '/adm/desbravadores' },
  { rotulo: 'Usuários', icone: Users, para: '/adm/usuarios' },
  { rotulo: 'Unidades', icone: Flag, para: '/adm/unidades' },
  { rotulo: 'Classes e especialidades', icone: GraduationCap, para: '/adm/classes' },
  { rotulo: 'Calendário do clube', icone: CalendarDays, para: '/adm/calendario' },
  { rotulo: 'Cronogramas', icone: ClipboardList, para: '/adm/cronogramas' },
  { rotulo: 'Configurações do clube', icone: Settings, para: '/adm/configuracoes' },
  { rotulo: 'Ranking', icone: Trophy, para: '/ranking' },
  { rotulo: 'Relatórios', icone: FileText },
]

const LARGURA_MINIMA_DO_PAINEL = 900

/** Rota-layout do Adm: menu lateral fixo no computador; abaixo de 900 px, gaveta aberta pelo cabeçalho. */
export function LayoutAdm() {
  const telaPequena = useLarguraMenorQue(LARGURA_MINIMA_DO_PAINEL)
  const [gavetaAberta, setGavetaAberta] = useState(false)
  const botaoAbrir = useRef<HTMLButtonElement>(null)

  const fecharGaveta = useCallback(() => {
    setGavetaAberta(false)
    botaoAbrir.current?.focus()
  }, [])

  return (
    <div className="min-h-dvh bg-fundo min-[900px]:flex">
      {!telaPequena && (
        <aside className="min-h-dvh w-[var(--sidebar-w)] shrink-0 bg-marca text-white">
          <p className="px-5 py-5 font-titulo text-xl font-bold">Desbravadores</p>
          <MenuDoAdm />
        </aside>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <FaixaSessaoExpirada />
        <FaixaSemConexao />
        <header className="flex items-center gap-1 border-b border-borda bg-superficie px-2 min-[900px]:px-4">
          {telaPequena && (
            <>
              <button
                ref={botaoAbrir}
                type="button"
                aria-label="Abrir o menu"
                aria-expanded={gavetaAberta}
                onClick={() => setGavetaAberta(true)}
                className="flex size-[var(--touch-min)] shrink-0 items-center justify-center rounded-full text-texto hover:bg-superficie-suave"
              >
                <Menu aria-hidden className="size-6" />
              </button>
              <span className="min-w-0 truncate font-titulo text-lg font-bold text-texto max-[359px]:hidden">Desbravadores</span>
            </>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <SinoNotificacoes />
            <MenuUsuario />
          </div>
        </header>
        {telaPequena && <FaixaAviso className="m-3">O painel do Adm é melhor no computador</FaixaAviso>}
        <main className="flex-1 p-4 min-[900px]:p-8">
          <Outlet />
        </main>
      </div>
      {telaPequena && gavetaAberta && <GavetaDoMenu aoFechar={fecharGaveta} />}
    </div>
  )
}

function MenuDoAdm({ aoEscolher }: { aoEscolher?: () => void }) {
  return (
    <nav aria-label="Menu do Adm" className="flex flex-col gap-1 p-2">
      {ITENS_ADM.map((item) => (
        <ItemNavegacao key={item.rotulo} item={item} layout="lateral" aoEscolher={aoEscolher} />
      ))}
    </nav>
  )
}

/** O mesmo menu lateral, entrando pela esquerda por cima do conteúdo; fecha ao escolher, com Esc ou tocando fora. */
function GavetaDoMenu({ aoFechar }: { aoFechar: () => void }) {
  const painel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    painel.current?.focus()
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') aoFechar()
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [aoFechar])

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-texto/40" onClick={aoFechar} />
      <div
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-label="Menu do Adm"
        tabIndex={-1}
        className="relative flex h-full w-[min(20rem,85vw)] flex-col overflow-y-auto bg-marca text-white shadow-xl outline-none"
      >
        <div className="flex items-center justify-between py-2 pr-2 pl-5">
          <p className="font-titulo text-xl font-bold">Desbravadores</p>
          <button
            type="button"
            aria-label="Fechar o menu"
            onClick={aoFechar}
            className="flex size-[var(--touch-min)] items-center justify-center rounded-full text-sobre-marca hover:bg-marca-escura"
          >
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <MenuDoAdm aoEscolher={aoFechar} />
      </div>
    </div>
  )
}
