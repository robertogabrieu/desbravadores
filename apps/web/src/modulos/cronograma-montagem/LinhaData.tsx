import { Pencil, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { DataDaMontagem, RequisitoDaMontagem } from '../../api/montagem'
import { Botao } from '../../ui/Botao'
import { Confirmacao } from '../../ui/Confirmacao'
import { Selo } from '../../ui/Selo'
import { cn } from '../../ui/cn'
import { dataBloqueada, detalheDaAula, partesDaData, textoDaData } from './datas'

const HACHURA =
  'bg-[repeating-linear-gradient(135deg,var(--color-surface-muted),var(--color-surface-muted)_8px,var(--color-divider)_8px,var(--color-divider)_16px)]'

interface Propriedades {
  dado: DataDaMontagem
  /** Requisitos que estão nesta data, na ordem do caderno. */
  requisitos: RequisitoDaMontagem[]
  /** Requisito de campo selecionado e data boa para campo: a linha fica verde. */
  destaqueCampo?: boolean
  /** Sem conexão ou gravando: nenhum botão age. */
  desabilitada: boolean
  /** "Colocar aqui" (A7) ou "+" (I3b): a tela decide se a data admite. */
  acaoDaData?: ReactNode
  aoTirar: (requisito: RequisitoDaMontagem) => void
  /** Só no celular: "Mover" ao lado de cada requisito de uma data em conflito. */
  aoMover?: (requisito: RequisitoDaMontagem) => void
  aoEditar: (dado: DataDaMontagem) => void
  /** "Remover aula" (com confirmação) nas aulas ainda não dadas. */
  aoRemoverAula: (dado: DataDaMontagem) => void
}

export function LinhaData({ dado, requisitos, destaqueCampo = false, desabilitada, acaoDaData, aoTirar, aoMover, aoEditar, aoRemoverAula }: Propriedades) {
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false)
  const { semana, dia, mes } = partesDaData(dado.data)
  const texto = textoDaData(dado)
  const detalhe = detalheDaAula(dado)
  const bloqueada = dataBloqueada(dado)
  const podeEditar = dado.aulaId !== null && !dado.aulaDada

  return (
    <li
      data-data={dado.data}
      data-estado={dado.conflito ? 'conflito' : bloqueada ? 'bloqueada' : destaqueCampo ? 'campo' : 'livre'}
      className={cn(
        'flex items-start gap-3 rounded-cartao border p-3',
        dado.conflito && 'border-perigo bg-perigo/10',
        !dado.conflito && bloqueada && cn('border-divisor', HACHURA),
        !dado.conflito && !bloqueada && destaqueCampo && 'border-acampamento bg-acampamento-fundo',
        !dado.conflito && !bloqueada && !destaqueCampo && 'border-divisor bg-superficie',
      )}
    >
      <div className="flex w-12 shrink-0 flex-col items-center text-texto">
        <span className="text-xs font-bold text-texto-2">{semana}</span>
        <span className="font-titulo text-xl font-extrabold">{dia}</span>
        <span className="text-xs font-bold text-texto-2">{mes}</span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {texto && <span className="text-sm font-semibold text-texto-2">{texto}</span>}
        {dado.conflito && (
          <span className="text-sm font-bold text-perigo">Conflito: não há classe nesta data. Mova os requisitos.</span>
        )}
        {dado.aulaDada && <Selo className="self-start">Classe dada</Selo>}
        {detalhe && <span className="text-sm text-texto-2">{detalhe}</span>}

        {requisitos.map((requisito) => (
          <div key={requisito.id} className="flex items-center gap-2 rounded-controle bg-marca-suave px-3 py-1.5 text-sm font-semibold text-marca">
            <span className="min-w-0 flex-1">
              {requisito.codigo} · {requisito.texto}
            </span>
            {aoMover && dado.conflito && !dado.aulaDada && (
              <Botao variante="secundario" className="px-3 text-sm" disabled={desabilitada} onClick={() => aoMover(requisito)}>
                Mover
              </Botao>
            )}
            {!dado.aulaDada && (
              <button
                type="button"
                aria-label={`remover ${requisito.codigo} desta data`}
                disabled={desabilitada}
                onClick={() => aoTirar(requisito)}
                className="flex min-h-[var(--touch-min)] shrink-0 items-center justify-center gap-1 rounded-controle px-2 hover:bg-superficie disabled:opacity-50"
              >
                <X aria-hidden className="size-4" />
                <span className="text-xs font-bold">remover</span>
              </button>
            )}
          </div>
        ))}

        {podeEditar && (
          <Botao variante="texto" className="self-start px-2" disabled={desabilitada} onClick={() => aoEditar(dado)}>
            <Pencil aria-hidden className="size-4" />
            Editar horário, local e título
          </Botao>
        )}

        {podeEditar && (
          <Botao variante="texto" className="self-start px-2 text-perigo" disabled={desabilitada} onClick={() => setConfirmandoRemocao(true)}>
            <Trash2 aria-hidden className="size-4" />
            Remover dia de classe
          </Botao>
        )}
      </div>

      {acaoDaData}

      <Confirmacao
        aberta={confirmandoRemocao}
        titulo="Remover este dia de classe?"
        rotuloConfirmar="Remover"
        perigo
        aoConfirmar={() => {
          setConfirmandoRemocao(false)
          aoRemoverAula(dado)
        }}
        aoCancelar={() => setConfirmandoRemocao(false)}
      >
        Os requisitos deste dia de classe voltam a ficar sem data.
      </Confirmacao>
    </li>
  )
}
