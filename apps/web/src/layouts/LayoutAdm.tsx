import { BookOpen, CalendarDays, ClipboardList, FileText, Flag, GraduationCap, LayoutDashboard, Menu, Settings, Trophy, UserRound, Users, X } from 'lucide-react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { SinoNotificacoes } from '../modulos/notificacoes/SinoNotificacoes'
import { FaixaAviso } from '../ui/FaixaAviso'
import { LARGURA_DO_CELULAR } from '../ui/larguraDoCelular'
import { Marca } from '../ui/Marca'
import { FaixaSemConexao } from './FaixaSemConexao'
import { FaixaSessaoExpirada } from './FaixaSessaoExpirada'
import { ItemNavegacao } from './ItemNavegacao'
import type { ItemDeNavegacao } from './ItemNavegacao'
import { MenuUsuario } from './MenuUsuario'
import { SeloPapel } from './SeloPapel'
import { useLarguraMenorQue } from './useLarguraMenorQue'

const ITENS_ADM: ItemDeNavegacao[] = [
  { rotulo: 'Visão geral', icone: LayoutDashboard, para: '/adm', exato: true },
  { rotulo: 'Desbravadores', icone: UserRound, para: '/adm/desbravadores' },
  { rotulo: 'Usuários', icone: Users, para: '/adm/usuarios' },
  { rotulo: 'Unidades', icone: Flag, para: '/adm/unidades' },
  { rotulo: 'Classes e especialidades', icone: GraduationCap, para: '/adm/classes' },
  { rotulo: 'Calendário do clube', icone: CalendarDays, para: '/adm/calendario' },
  { rotulo: 'Cronogramas', icone: ClipboardList, para: '/adm/cronogramas' },
  { rotulo: 'Classe Bíblica', icone: BookOpen, para: '/adm/classe-biblica' },
  { rotulo: 'Configurações do clube', icone: Settings, para: '/adm/configuracoes' },
  { rotulo: 'Ranking', icone: Trophy, para: '/ranking' },
  { rotulo: 'Relatórios', icone: FileText },
]

const CHAVE_DA_FAIXA_FECHADA = 'adm:faixa-melhor-no-computador:fechada'

/** Aparelho sem armazenamento (modo privado, cota cheia) lê como "não fechada": a faixa aparece. */
function faixaFoiFechada(): boolean {
  try {
    return localStorage.getItem(CHAVE_DA_FAIXA_FECHADA) === '1'
  } catch {
    return false
  }
}

/** Sem armazenamento, a faixa fecha só nesta visita. */
function lembrarFaixaFechada(): void {
  try {
    localStorage.setItem(CHAVE_DA_FAIXA_FECHADA, '1')
  } catch {
    // Nada a fazer: o estado da tela já escondeu a faixa.
  }
}

/** Rota-layout do Adm: menu lateral fixo no computador; abaixo de 900 px, gaveta aberta pelo cabeçalho. */
export function LayoutAdm() {
  const telaPequena = useLarguraMenorQue(LARGURA_DO_CELULAR)
  const [faixaFechada, setFaixaFechada] = useState(faixaFoiFechada)
  const [gavetaAberta, setGavetaAberta] = useState(false)
  const botaoAbrir = useRef<HTMLButtonElement>(null)
  const idGaveta = useId()

  const fecharGaveta = useCallback(() => {
    setGavetaAberta(false)
    botaoAbrir.current?.focus()
  }, [])
  // Tela que passa de 900 px (tablet girado) fecha a gaveta: sem isto, ela reabriria sozinha na volta.
  const [larguraAnterior, setLarguraAnterior] = useState(telaPequena)
  if (larguraAnterior !== telaPequena) {
    setLarguraAnterior(telaPequena)
    if (!telaPequena) setGavetaAberta(false)
  }

  return (
    <div className="min-h-dvh bg-fundo min-[900px]:flex">
      {!telaPequena && (
        <aside className="min-h-dvh w-[var(--sidebar-w)] shrink-0 bg-marca text-white">
          <Marca className="px-5 py-5" />
          <MenuDoAdm rotulo="Menu do Adm" />
        </aside>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <FaixaSessaoExpirada />
        <FaixaSemConexao />
        <header className="flex items-center gap-1 border-b border-borda bg-superficie px-4 py-2 min-[900px]:px-8">
          {telaPequena && (
            <>
              <button
                ref={botaoAbrir}
                type="button"
                aria-label="Abrir o menu"
                aria-expanded={gavetaAberta}
                aria-haspopup="dialog"
                aria-controls={gavetaAberta ? idGaveta : undefined}
                onClick={() => setGavetaAberta(true)}
                className="flex size-[var(--touch-min)] shrink-0 items-center justify-center rounded-full text-texto hover:bg-superficie-suave"
              >
                <Menu aria-hidden className="size-6" />
              </button>
              <Marca className="text-texto" classeDoNome="max-sm:sr-only" />
            </>
          )}
          <div className="ml-auto flex min-w-0 items-center gap-1">
            <SeloPapel />
            <SinoNotificacoes />
            <MenuUsuario soPrimeiroNome={telaPequena} />
          </div>
        </header>
        {telaPequena && !faixaFechada && (
          <FaixaAviso
            className="mx-4 mt-3"
            aoFechar={() => {
              setFaixaFechada(true)
              lembrarFaixaFechada()
            }}
          >
            O painel do Adm é melhor no computador
          </FaixaAviso>
        )}
        {/* A margem lateral do conteúdo mora aqui, uma vez só; `data-layout` deixa a tela compartilhada com o celular saber que não precisa da dela. */}
        <main data-layout="adm" className="flex-1 px-4 py-4 min-[900px]:px-12 min-[900px]:py-8">
          <Outlet />
        </main>
      </div>
      {telaPequena && gavetaAberta && <GavetaDoMenu id={idGaveta} aoFechar={fecharGaveta} />}
    </div>
  )
}

/** Sem `rotulo` dentro da gaveta: ela já se chama "Menu do Adm", e o leitor de tela repetiria o nome. */
function MenuDoAdm({ rotulo, aoEscolher }: { rotulo?: string; aoEscolher?: () => void }) {
  return (
    <nav aria-label={rotulo} className="flex flex-col gap-1 p-2">
      {ITENS_ADM.map((item) => (
        <ItemNavegacao key={item.rotulo} item={item} layout="lateral" aoEscolher={aoEscolher} />
      ))}
    </nav>
  )
}

const FOCAVEIS = 'a[href], button:not(:disabled)'

interface PropriedadesGaveta {
  id: string
  aoFechar: () => void
}

/**
 * O mesmo menu lateral, entrando pela esquerda por cima do conteúdo; fecha ao escolher, com Esc ou
 * tocando fora. Enquanto aberta, o Tab circula só dentro dela e a página de trás não rola.
 */
function GavetaDoMenu({ id, aoFechar }: PropriedadesGaveta) {
  const painel = useRef<HTMLDivElement>(null)

  useEffect(() => {
    painel.current?.focus()
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        aoFechar()
        return
      }
      if (evento.key !== 'Tab' || !painel.current) return
      const focaveis = [...painel.current.querySelectorAll<HTMLElement>(FOCAVEIS)]
      const primeiro = focaveis[0]
      const ultimo = focaveis[focaveis.length - 1]
      if (!primeiro || !ultimo) return
      const atual = document.activeElement
      if (evento.shiftKey && (atual === primeiro || atual === painel.current)) {
        evento.preventDefault()
        ultimo.focus()
      } else if (!evento.shiftKey && atual === ultimo) {
        evento.preventDefault()
        primeiro.focus()
      }
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [aoFechar])

  useEffect(() => {
    const anterior = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = anterior
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-texto/40" onClick={aoFechar} />
      <div
        ref={painel}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label="Menu do Adm"
        tabIndex={-1}
        className="relative flex h-full w-[min(20rem,85vw)] flex-col overflow-y-auto overscroll-contain bg-marca text-white shadow-xl outline-none"
      >
        <div className="flex items-center justify-between py-2 pr-2 pl-5">
          <Marca />
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
