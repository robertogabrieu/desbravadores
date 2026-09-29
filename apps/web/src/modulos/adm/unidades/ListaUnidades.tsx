import { Plus } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useUnidades } from '../../../api/leitura'
import type { Unidade } from '../../../api/leitura'
import { Botao } from '../../../ui/Botao'
import { Cartao } from '../../../ui/Cartao'
import { EstadoVazio } from '../../../ui/EstadoVazio'
import { FolhaLateral } from '../../../ui/FolhaLateral'
import { FormularioUnidade } from './FormularioUnidade'
import { PainelMembros } from './PainelMembros'
import { rotuloDoTipo } from './tipos'

type Painel = { tipo: 'nova' } | { tipo: 'editar'; unidade: Unidade } | null

const plural = (n: number, singular: string, muitos: string): string => `${n} ${n === 1 ? singular : muitos}`

function frasesDosConselheiros(unidade: Unidade): string {
  const nomes = unidade.conselheiros.map((c) => c.nome).join(', ')
  if (unidade.conselheiros.length === 0) return 'Sem conselheiro'
  return `${unidade.conselheiros.length === 1 ? 'Conselheiro' : 'Conselheiros'}: ${nomes}`
}

export function ListaUnidades() {
  const unidades = useUnidades({ todas: true })
  const [painel, setPainel] = useState<Painel>(null)
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null)
  const fecharPainel = useCallback(() => setPainel(null), [])

  const lista = unidades.data ?? []
  const selecionada = lista.find((u) => u.id === selecionadaId)
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
        <Botao onClick={() => setPainel({ tipo: 'nova' })}>
          <Plus aria-hidden className="size-5" />
          Nova unidade
        </Botao>
      </header>

      {unidades.isPending && <p className="text-base text-texto-2">Carregando…</p>}
      {unidades.isError && (
        <p role="alert" className="text-base font-medium text-perigo">
          Não foi possível carregar as unidades. Tente de novo.
        </p>
      )}
      {unidades.data && lista.length === 0 && (
        <EstadoVazio titulo="Nenhuma unidade ainda" descricao="Crie a primeira unidade para organizar os desbravadores." />
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {lista.map((unidade) => (
          <Cartao key={unidade.id} role="article" aria-label={unidade.nome} className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-titulo text-lg font-bold text-texto">{unidade.nome}</h2>
              {!unidade.ativa && <span className="rounded-full bg-superficie-suave px-2.5 py-0.5 text-sm font-semibold text-texto-2">Inativa</span>}
            </div>
            <p className="text-sm font-semibold text-texto-2">{rotuloDoTipo(unidade.tipo)}</p>
            <p className="text-base text-texto">{frasesDosConselheiros(unidade)}</p>
            {unidade.gritoDeGuerra && <p className="text-sm italic text-texto-2">“{unidade.gritoDeGuerra}”</p>}
            <p className="text-base font-semibold text-texto">{plural(unidade.totalMembros, 'DBV', 'DBVs')}</p>
            <div className="mt-1 flex gap-1">
              <Botao variante="secundario" aria-label={`Membros de ${unidade.nome}`} aria-pressed={unidade.id === selecionadaId} onClick={() => setSelecionadaId(unidade.id)}>
                Membros
              </Botao>
              <Botao variante="texto" aria-label={`Editar ${unidade.nome}`} onClick={() => setPainel({ tipo: 'editar', unidade })}>
                Editar
              </Botao>
            </div>
          </Cartao>
        ))}
      </div>

      {selecionada && <PainelMembros key={selecionada.id} unidade={selecionada} />}

      <FolhaLateral aberta={painel !== null} titulo={painel?.tipo === 'editar' ? `Editar ${painel.unidade.nome}` : 'Nova unidade'} aoFechar={fecharPainel}>
        {painel && (
          <FormularioUnidade
            key={painel.tipo === 'editar' ? painel.unidade.id : 'nova'}
            unidade={painel.tipo === 'editar' ? painel.unidade : undefined}
            aoConcluir={fecharPainel}
            aoCancelar={fecharPainel}
          />
        )}
      </FolhaLateral>
    </div>
  )
}
