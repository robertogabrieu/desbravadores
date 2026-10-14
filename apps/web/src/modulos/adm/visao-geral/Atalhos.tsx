import { BookOpen, CalendarDays, CalendarPlus } from 'lucide-react'
import { useId, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { VisaoGeral } from '../../../api/visao-geral'
import { useSessao } from '../../../sessao/useSessao'
import { Botao, estiloDoBotao } from '../../../ui/Botao'
import { cn } from '../../../ui/cn'
import { useEstadoDeVolta } from '../navegacao'
import { AtalhoDeSubstituto } from './AtalhoDeSubstituto'
import { decidirChamada } from './chamadaClasseBiblica'
import { FolhaDaChamada } from './FolhaDaChamada'

const ALTURA_DO_ATALHO = 'min-h-[56px]'

/** Os atalhos da semana: só o primeiro é verde; no celular cada um ocupa a linha inteira. */
export function Atalhos({ visao, celular }: { visao: VisaoGeral; celular: boolean }) {
  const idDoTitulo = useId()
  const navegar = useNavigate()
  const estadoDeVolta = useEstadoDeVolta()
  const [folhaAberta, setFolhaAberta] = useState(false)
  const decisao = decidirChamada(visao.chamadasClasseBiblica)
  const largura = celular ? 'total' : 'auto'
  const slug = useSessao().vinculoAtivo?.clube.slug

  const lancarChamada = () => {
    if (decisao.tipo === 'direto') void navegar(decisao.caminho, { state: estadoDeVolta })
    else setFolhaAberta(true)
  }

  return (
    <section aria-labelledby={idDoTitulo} className="flex flex-col gap-3">
      <h2 id={idDoTitulo} className="font-titulo text-lg font-bold text-texto">
        Atalhos
      </h2>
      <div className={cn('flex gap-3', celular ? 'flex-col' : 'flex-wrap')}>
        <AtalhoDeSubstituto visao={visao} className={celular ? 'w-full' : undefined} />
        <Link to="/adm/calendario/eventos/novo" state={estadoDeVolta} className={cn(estiloDoBotao({ variante: 'secundario', largura }), ALTURA_DO_ATALHO)}>
          <CalendarPlus aria-hidden className="size-5" />
          Novo evento no calendário
        </Link>
        <Botao variante="secundario" largura={largura} aria-haspopup={decisao.tipo === 'direto' ? undefined : 'dialog'} onClick={lancarChamada} className={ALTURA_DO_ATALHO}>
          <BookOpen aria-hidden className="size-5" />
          Lançar chamada da Classe Bíblica
        </Botao>
        {slug ? (
          <a href={`/agenda/${slug}`} target="_blank" rel="noopener noreferrer" className={cn(estiloDoBotao({ variante: 'secundario', largura }), ALTURA_DO_ATALHO)}>
            <CalendarDays aria-hidden className="size-5" />
            Agenda para os pais{' '}
            <span className="sr-only">(abre em nova aba)</span>
          </a>
        ) : null}
      </div>
      <FolhaDaChamada aberta={folhaAberta} pares={visao.chamadasClasseBiblica} aoFechar={() => setFolhaAberta(false)} />
    </section>
  )
}
