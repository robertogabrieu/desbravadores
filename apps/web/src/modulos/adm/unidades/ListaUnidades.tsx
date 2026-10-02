import { Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useUnidades } from '../../../api/leitura'
import type { Unidade } from '../../../api/leitura'
import { estiloDoBotao } from '../../../ui/Botao'
import { EstadoVazio } from '../../../ui/EstadoVazio'
import { ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { LinhaQueNavega } from '../../../ui/LinhaQueNavega'
import { useEstadoDeVolta } from '../navegacao'
import { rotuloDoTipo } from './tipos'

const plural = (n: number, singular: string, muitos: string): string => `${n} ${n === 1 ? singular : muitos}`

function frasesDosConselheiros(unidade: Unidade): string {
  const nomes = unidade.conselheiros.map((c) => c.nome).join(', ')
  if (unidade.conselheiros.length === 0) return 'Sem conselheiro'
  return `${unidade.conselheiros.length === 1 ? 'Conselheiro' : 'Conselheiros'}: ${nomes}`
}

export function ListaUnidades() {
  const unidades = useUnidades({ todas: true })
  const estadoDeVolta = useEstadoDeVolta()
  const lista = unidades.data ?? []
  const totalDeMembros = lista.reduce((soma, u) => soma + u.totalMembros, 0)

  return (
    <div className="flex flex-col gap-5 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-titulo text-2xl font-bold text-texto">Unidades</h1>
          {unidades.data && (
            <p className="text-base text-texto-2">
              {plural(lista.length, 'unidade', 'unidades')} · {plural(totalDeMembros, 'desbravador', 'desbravadores')}
            </p>
          )}
        </div>
        <Link to="/adm/unidades/nova" className={estiloDoBotao()}>
          <Plus aria-hidden className="size-5" />
          Nova unidade
        </Link>
      </header>

      {unidades.isPending && <p className="text-base text-texto-2">Carregando…</p>}
      {unidades.isError && <ErroDeCarga erro={unidades.error} aoTentarDeNovo={() => void unidades.refetch()} />}
      {unidades.data && lista.length === 0 && <EstadoVazio titulo="Nenhuma unidade ainda" descricao="Crie a primeira unidade para organizar os desbravadores." />}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {lista.map((unidade) => (
          <LinhaQueNavega key={unidade.id} to={`/adm/unidades/${unidade.id}`} state={estadoDeVolta} forma="cartao" className="h-full">
            <div className="flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-titulo text-lg font-bold text-texto">{unidade.nome}</h2>
                {!unidade.ativa && <span className="rounded-full bg-superficie-suave px-2.5 py-0.5 text-sm font-semibold text-texto-2">Inativa</span>}
              </div>
              <p className="text-sm font-semibold text-texto-2">{rotuloDoTipo(unidade.tipo)}</p>
              <p className="text-base text-texto">{frasesDosConselheiros(unidade)}</p>
              {unidade.gritoDeGuerra && <p className="text-sm italic text-texto-2">“{unidade.gritoDeGuerra}”</p>}
              <p className="text-base font-semibold text-texto">{plural(unidade.totalMembros, 'DBV', 'DBVs')}</p>
            </div>
          </LinhaQueNavega>
        ))}
      </div>
    </div>
  )
}
