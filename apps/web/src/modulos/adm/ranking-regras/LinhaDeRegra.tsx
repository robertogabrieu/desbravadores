import type { DefinicaoDeRegra } from '@desbravadores/shared'
import { Check, Minus, Pencil } from 'lucide-react'
import type { ReactNode } from 'react'
import type { RegraDoClube } from '../../../api/ranking-regras'
import { Botao } from '../../../ui/Botao'
import { Selo } from '../../../ui/Selo'
import { cn } from '../../../ui/cn'

/** O que o botão da linha faz: editar, ficar parado por falta de internet, ou ceder o lugar ao motivo de não poder. */
export type AcaoDaLinha = 'editar' | 'sem-conexao' | 'sem-permissao'

export const ESTILO_DA_LINHA =
  'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-t border-divisor px-4 py-3 first:border-t-0 md:grid-cols-[9rem_minmax(0,1fr)_8rem_11rem] md:px-5'

interface PropriedadesDaLinha {
  definicao: DefinicaoDeRegra
  regra: RegraDoClube
  acao: AcaoDaLinha
  destacada: boolean
  aoEditar: () => void
}

function BotaoEditar({ nome, acao, aoClicar }: { nome: string; acao: 'editar' | 'sem-conexao'; aoClicar: () => void }) {
  const semConexao = acao === 'sem-conexao'
  return (
    <Botao variante="secundario" disabled={semConexao} aria-label={semConexao ? `Editar ${nome} (indisponível sem conexão)` : `Editar ${nome}`} onClick={aoClicar}>
      <Pencil aria-hidden className="size-[18px]" />
      Editar
    </Botao>
  )
}

export function SeloDaLinha({ ligado, ligada, desligada }: { ligado: boolean; ligada: string; desligada: string }): ReactNode {
  return ligado ? (
    <Selo tom="sucesso">
      <Check aria-hidden className="size-3.5" strokeWidth={3} />
      {ligada}
    </Selo>
  ) : (
    <Selo className="bg-divisor text-texto-3">
      <Minus aria-hidden className="size-3.5" strokeWidth={3} />
      {desligada}
    </Selo>
  )
}

/** Uma das 9 regras fixas: estado, o que é, quanto vale e o caminho para editar. */
export function LinhaDeRegra({ definicao, regra, acao, destacada, aoEditar }: PropriedadesDaLinha) {
  return (
    <li data-destacada={destacada} className={cn(ESTILO_DA_LINHA, destacada && 'bg-marca-tinta')}>
      <div className="md:col-start-1 md:row-start-1">
        <SeloDaLinha ligado={regra.ativo} ligada="Ligada" desligada="Desligada" />
      </div>
      <div className="col-span-2 row-start-2 min-w-0 md:col-span-1 md:col-start-2 md:row-start-1">
        <p className={cn('text-base font-bold', regra.ativo ? 'text-texto' : 'text-texto-2')}>{definicao.rotulo}</p>
        <p className="text-base text-texto-2">{definicao.descricao}</p>
      </div>
      <p className="justify-self-end font-titulo text-[22px] font-bold tabular-nums md:col-start-3 md:row-start-1">
        <span>+{regra.pontos}</span> <small className="font-body text-base font-semibold text-texto-2">pontos</small>
      </p>
      <div className="col-span-2 row-start-3 md:col-span-1 md:col-start-4 md:row-start-1">
        {acao === 'sem-permissao' ? (
          <p className="text-base text-texto-2">Só quem tem a permissão “Configurar o ranking” pode editar.</p>
        ) : (
          <BotaoEditar nome={definicao.rotulo} acao={acao} aoClicar={aoEditar} />
        )}
      </div>
    </li>
  )
}
