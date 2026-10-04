import type { ReactNode } from 'react'
import type { DataDaMontagem, RequisitoDaMontagem } from '../../api/montagem'
import { FolhaLateral } from '../../ui/FolhaLateral'
import { aceitaRequisitoNovo, dataBloqueada, diaMes, partesDaData, textoDaData } from './datas'

interface Propriedades {
  requisito: RequisitoDaMontagem
  datas: DataDaMontagem[]
  datasLivres: boolean
  desabilitado: boolean
  /** Faixa de erro da gravação, mostrada dentro da folha para não ficar escondida atrás dela. */
  aviso?: ReactNode
  aoEscolher: (data: string) => void
  aoFechar: () => void
}

const NAO_DA = 'Não dá para colocar aqui.'

/** Por que o requisito não pode ir para esta data; `null` quando pode. Mesma regra do "Colocar aqui". */
function motivoDeRecusa(requisito: RequisitoDaMontagem, dado: DataDaMontagem, datasLivres: boolean): string | null {
  if (requisito.data === dado.data) return 'O requisito já está nesta data.'
  if (aceitaRequisitoNovo({ datasLivres }, dado)) return null
  if (dataBloqueada(dado)) {
    const eventos = dado.situacao.eventos.join(', ')
    return eventos ? `Sem classe: ${eventos}. ${NAO_DA}` : `Sem classe nesta data. ${NAO_DA}`
  }
  if (dado.aulaDada) return `Classe já dada. ${NAO_DA}`
  return `Conflito: não há classe nesta data. ${NAO_DA}`
}

function quantosRequisitos(quantidade: number): string {
  if (quantidade === 0) return 'nenhum requisito ainda'
  return quantidade === 1 ? 'já tem 1 requisito' : `já tem ${quantidade} requisitos`
}

/** "2026-10-04" → "Dom, 04/10". */
function diaDaSemanaEData(data: string): string {
  const { semana } = partesDaData(data)
  return `${semana.charAt(0)}${semana.slice(1).toLowerCase()}, ${diaMes(data)}`
}

/** Celular: o Adm tocou num requisito e escolhe aqui a data, sem rolar até a lista de datas. */
export function FolhaEmQualData({ requisito, datas, datasLivres, desabilitado, aviso, aoEscolher, aoFechar }: Propriedades) {
  return (
    <FolhaLateral aberta titulo="Em qual data?" aoFechar={aoFechar}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-base text-texto">
            <strong className="text-marca">{requisito.codigo}</strong> · {requisito.texto}
          </p>
          <p className="text-sm font-semibold text-texto-2">{requisito.data ? `Hoje em ${diaMes(requisito.data)}` : 'Ainda sem data'}</p>
        </div>

        {aviso}

        <ul className="flex flex-col gap-2">
          {datas.map((dado) => {
            const motivo = motivoDeRecusa(requisito, dado, datasLivres)
            const tipoDoDia = textoDaData(dado) || 'Dia de classe'
            return (
              <li key={dado.data}>
                <button
                  type="button"
                  disabled={motivo !== null || desabilitado}
                  onClick={() => aoEscolher(dado.data)}
                  className="flex min-h-[60px] w-full items-center gap-3 rounded-controle border border-borda-controle bg-superficie px-4 py-2 text-left text-base text-texto hover:bg-superficie-suave focus-visible:outline-2 focus-visible:outline-marca disabled:cursor-not-allowed disabled:border-divisor disabled:bg-superficie-suave disabled:hover:bg-superficie-suave"
                >
                  <span className="min-w-[84px] font-bold">{diaDaSemanaEData(dado.data)}</span>
                  <span className="flex-1 text-sm text-texto-2">
                    {motivo ?? `${tipoDoDia} · ${quantosRequisitos(dado.requisitoIds.length)}`}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </FolhaLateral>
  )
}
