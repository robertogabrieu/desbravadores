import { BookOpen, CalendarDays, ChevronDown, ClipboardList, Flag, GraduationCap, LayoutDashboard, Library, ListChecks, Settings, Trophy, UserRound, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { matchPath, useLocation } from 'react-router-dom'
import { cn } from '../ui/cn'
import { ItemNavegacao } from './ItemNavegacao'
import type { ItemDeNavegacao } from './ItemNavegacao'

interface GrupoDeNavegacao {
  grupo: string
  icone: LucideIcon
  itens: ItemDeNavegacao[]
}

type EntradaDoMenu = ItemDeNavegacao | GrupoDeNavegacao

const ENTRADAS_ADM: EntradaDoMenu[] = [
  { rotulo: 'Visão geral', icone: LayoutDashboard, para: '/adm', exato: true },
  {
    grupo: 'Membros',
    icone: Users,
    itens: [
      { rotulo: 'Desbravadores', icone: UserRound, para: '/adm/desbravadores' },
      { rotulo: 'Usuários', icone: Users, para: '/adm/usuarios' },
      { rotulo: 'Unidades', icone: Flag, para: '/adm/unidades' },
    ],
  },
  {
    grupo: 'Classes',
    icone: GraduationCap,
    itens: [
      { rotulo: 'Classes e especialidades', icone: GraduationCap, para: '/adm/classes' },
      { rotulo: 'Classe Bíblica', icone: BookOpen, para: '/adm/classe-biblica' },
      { rotulo: 'Cronogramas', icone: ClipboardList, para: '/adm/cronogramas' },
    ],
  },
  { rotulo: 'Calendário do clube', icone: CalendarDays, para: '/adm/calendario' },
  {
    grupo: 'Ranking',
    icone: Trophy,
    itens: [
      { rotulo: 'Ranking', icone: Trophy, para: '/ranking' },
      { rotulo: 'Regras de pontuação', icone: ListChecks, para: '/adm/ranking/regras' },
    ],
  },
  { rotulo: 'Biblioteca', icone: Library, para: '/adm/biblioteca' },
  { rotulo: 'Configurações do clube', icone: Settings, para: '/adm/configuracoes' },
]

const ehGrupo = (entrada: EntradaDoMenu): entrada is GrupoDeNavegacao => 'grupo' in entrada

const estaNaRota = (item: ItemDeNavegacao, caminho: string): boolean =>
  item.para !== undefined && matchPath({ path: item.para, end: item.exato ?? false }, caminho) !== null

/** Sem `rotulo` dentro da gaveta: ela já se chama "Menu do Adm", e o leitor de tela repetiria o nome. */
export function MenuDoAdm({ rotulo, aoEscolher }: { rotulo?: string; aoEscolher?: () => void }) {
  return (
    <nav aria-label={rotulo} className="flex flex-col gap-1 p-2">
      {ENTRADAS_ADM.map((entrada) =>
        ehGrupo(entrada) ? (
          <GrupoDoMenu key={entrada.grupo} grupo={entrada} aoEscolher={aoEscolher} />
        ) : (
          <ItemNavegacao key={entrada.rotulo} item={entrada} layout="lateral" aoEscolher={aoEscolher} />
        ),
      )}
    </nav>
  )
}

/** O grupo da tela aberta fica sempre aberto, para o item atual não sumir; os demais abrem e fecham pela escolha da pessoa. */
function GrupoDoMenu({ grupo, aoEscolher }: { grupo: GrupoDeNavegacao; aoEscolher?: () => void }) {
  const { pathname } = useLocation()
  const [escolhaAberto, definirEscolhaAberto] = useState(false)
  const idLista = useId()
  const Icone = grupo.icone
  const temItemAtivo = grupo.itens.some((item) => estaNaRota(item, pathname))
  const aberto = temItemAtivo || escolhaAberto

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={aberto ? idLista : undefined}
        onClick={() => definirEscolhaAberto(!escolhaAberto)}
        className="flex min-h-[var(--touch-min)] shrink-0 items-center gap-3 rounded-botao px-3 text-base font-semibold text-sobre-marca hover:bg-marca-escura"
      >
        <Icone aria-hidden className="size-5" />
        <span className="flex-1 text-left">{grupo.grupo}</span>
        <ChevronDown aria-hidden className={cn('size-4 transition-transform', aberto && 'rotate-180')} />
      </button>
      {aberto && (
        <div id={idLista} className="flex flex-col gap-1 pl-6">
          {grupo.itens.map((item) => (
            <ItemNavegacao key={item.rotulo} item={item} layout="lateral" aoEscolher={aoEscolher} />
          ))}
        </div>
      )}
    </div>
  )
}
