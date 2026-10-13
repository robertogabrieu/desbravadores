import { Pencil, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Botao } from '../../ui/Botao'
import { Confirmacao } from '../../ui/Confirmacao'
import { Selo } from '../../ui/Selo'
import { cn } from '../../ui/cn'
import { EtiquetaDoLado } from './EtiquetaDoLado'
import { MedidorDeOcupacao } from './MedidorDeOcupacao'
import { dataBloqueada, detalheDaAula, partesDaData, textoDaData } from './datas'
import type { DataDaMontagem } from '../../api/montagem'
import { aulaDadaPorTodas, classeDada, diaPodeMudar, type RequisitoComLado } from './vista'

const HACHURA =
  'bg-[repeating-linear-gradient(135deg,var(--color-surface-muted),var(--color-surface-muted)_8px,var(--color-divider)_8px,var(--color-divider)_16px)]'

interface Propriedades {
  dado: DataDaMontagem
  /** Requisitos que estão nesta data (da regular e, no par, da avançada). */
  requisitos: RequisitoComLado[]
  /** Regular com avançada: cada requisito leva a etiqueta da classe e a data mostra o medidor de ocupação. */
  comAvancada?: boolean
  /** Requisito de campo selecionado e data boa para campo: a linha fica verde. */
  destaqueCampo?: boolean
  /** Sem conexão ou gravando: nenhum botão age. */
  desabilitada: boolean
  /** "Colocar aqui" (A7) ou "+" (I3b): a tela decide se a data admite. */
  acaoDaData?: ReactNode
  aoTirar: (requisito: RequisitoComLado) => void
  /** Só no celular: "Mover" ao lado de cada requisito de uma data em conflito. */
  aoMover?: (requisito: RequisitoComLado) => void
  aoEditar: (dado: DataDaMontagem) => void
  /** Só no computador: presente quando a data aceita o requisito que está sendo arrastado; ausente, a data não é alvo de soltar. */
  aoSoltar?: () => void
  /** "Remover aula" (com confirmação) nas aulas ainda não dadas. */
  aoRemoverAula: (dado: DataDaMontagem) => void
}

export function LinhaData({ dado, requisitos, comAvancada = false, destaqueCampo = false, desabilitada, acaoDaData, aoTirar, aoMover, aoEditar, aoSoltar, aoRemoverAula }: Propriedades) {
  const [sobre, setSobre] = useState(false)
  const [confirmandoRemocao, setConfirmandoRemocao] = useState(false)
  const { semana, dia, mes } = partesDaData(dado.data)
  const texto = textoDaData(dado)
  const detalhe = detalheDaAula(dado)
  const bloqueada = dataBloqueada(dado)
  const podeEditar = diaPodeMudar(dado)
  // Classe dada só em parte das classes da data: o selo vai nos requisitos delas; em todas, na data.
  const dadaNosDois = aulaDadaPorTodas(dado, requisitos)

  return (
    <li
      data-data={dado.data}
      data-estado={dado.conflito ? 'conflito' : bloqueada ? 'bloqueada' : destaqueCampo ? 'campo' : 'livre'}
      onDragOver={(evento) => {
        if (!aoSoltar) {
          evento.dataTransfer.dropEffect = 'none'
          return
        }
        evento.preventDefault()
        evento.dataTransfer.dropEffect = 'move'
        setSobre(true)
      }}
      onDragLeave={(evento) => {
        if (!evento.currentTarget.contains(evento.relatedTarget as Node | null)) setSobre(false)
      }}
      onDrop={(evento) => {
        setSobre(false)
        if (!aoSoltar) return
        evento.preventDefault()
        aoSoltar()
      }}
      data-soltar={aoSoltar ? (sobre ? 'sobre' : 'aceita') : undefined}
      className={cn(
        'flex items-start gap-3 rounded-cartao border p-3',
        dado.conflito && 'border-perigo bg-perigo/10',
        !dado.conflito && bloqueada && cn('border-divisor', HACHURA),
        !dado.conflito && !bloqueada && destaqueCampo && 'border-acampamento bg-acampamento-fundo',
        !dado.conflito && !bloqueada && !destaqueCampo && 'border-divisor bg-superficie',
        aoSoltar && sobre && 'border-2 border-marca bg-marca-tinta',
      )}
    >
      <div className="flex w-12 shrink-0 flex-col items-center text-texto">
        <span className="text-sm font-bold text-texto-2">{semana}</span>
        <span className="font-titulo text-xl font-extrabold">{dia}</span>
        <span className="text-sm font-bold text-texto-2">{mes}</span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {texto && <span className="text-sm font-semibold text-texto-2">{texto}</span>}
        {dado.conflito && (
          <span className="text-sm font-bold text-perigo">Conflito: não há classe nesta data. Mova os requisitos.</span>
        )}
        {dadaNosDois && <Selo className="self-start">Classe dada</Selo>}
        {comAvancada && !bloqueada && <MedidorDeOcupacao quantidade={requisitos.length} />}
        {detalhe && <span className="text-sm text-texto-2">{detalhe}</span>}

        {requisitos.map((requisito) => {
          const dada = classeDada(dado, requisito.classeId)
          return (
          <div key={requisito.id} className="flex items-center gap-2 rounded-controle bg-marca-suave px-3 py-1.5 text-sm font-semibold text-marca">
            {comAvancada && <EtiquetaDoLado requisito={requisito} />}
            <span className="min-w-0 flex-1">
              {requisito.codigo} · {requisito.texto}
            </span>
            {dada && !dadaNosDois && <Selo>Classe dada</Selo>}
            {aoMover && dado.conflito && !dada && !requisito.foraDoPar && (
              <Botao variante="secundario" className="px-3 text-sm" disabled={desabilitada} onClick={() => aoMover(requisito)}>
                Mover
              </Botao>
            )}
            {!dada && (
              <button
                type="button"
                aria-label={`remover ${requisito.codigo} desta data`}
                disabled={desabilitada}
                onClick={() => aoTirar(requisito)}
                className="flex min-h-[var(--touch-min)] shrink-0 items-center justify-center gap-1 rounded-controle px-2 hover:bg-superficie disabled:opacity-50"
              >
                <X aria-hidden className="size-4" />
                <span className="text-sm font-bold">remover</span>
              </button>
            )}
          </div>
          )
        })}

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
        {comAvancada ? 'Os requisitos das duas classes neste dia voltam a ficar sem data.' : 'Os requisitos deste dia de classe voltam a ficar sem data.'}
      </Confirmacao>
    </li>
  )
}
