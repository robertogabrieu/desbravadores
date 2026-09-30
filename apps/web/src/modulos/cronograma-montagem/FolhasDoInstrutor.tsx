import { useState } from 'react'
import type { DataDaMontagem, RequisitoDaMontagem } from '../../api/montagem'
import { Botao } from '../../ui/Botao'
import { FolhaLateral } from '../../ui/FolhaLateral'
import { cn } from '../../ui/cn'
import { EtiquetaCampo } from './EtiquetaCampo'
import { diaMes, textoDaData } from './datas'

interface PropriedadesAdicionar {
  dado: DataDaMontagem
  /** Requisitos sem data. */
  livres: RequisitoDaMontagem[]
  desabilitado: boolean
  /** Coloca um por um (cada um grava); devolve `false` na primeira recusa. */
  aoConfirmar: (requisitoIds: string[]) => Promise<boolean>
  aoFechar: () => void
}

/** Folha do "+": marca requisitos sem data para pôr na data. Em data de campo, os de campo vêm primeiro e sugeridos. */
export function FolhaAdicionar({ dado, livres, desabilitado, aoConfirmar, aoFechar }: PropriedadesAdicionar) {
  const [marcados, setMarcados] = useState<string[]>([])
  const dataDeCampo = dado.situacao.bomParaCampo
  const ordenados = dataDeCampo ? [...livres].sort((a, b) => Number(b.campo) - Number(a.campo)) : livres

  const alternar = (id: string) => setMarcados((atuais) => (atuais.includes(id) ? atuais.filter((atual) => atual !== id) : [...atuais, id]))

  async function confirmar() {
    await aoConfirmar(marcados)
    aoFechar()
  }

  return (
    <FolhaLateral aberta titulo={`Adicionar em ${diaMes(dado.data)}`} aoFechar={aoFechar}>
      <div className="flex flex-col gap-3">
        {textoDaData(dado) && <p className="text-sm font-semibold text-texto-2">{textoDaData(dado)}</p>}
        {ordenados.length === 0 ? (
          <p className="py-6 text-center text-base text-texto-2">Todos os requisitos já têm data</p>
        ) : (
          <>
            {ordenados.map((requisito) => {
              const marcado = marcados.includes(requisito.id)
              return (
                <button
                  key={requisito.id}
                  type="button"
                  aria-pressed={marcado}
                  onClick={() => alternar(requisito.id)}
                  className={cn(
                    'flex min-h-[var(--touch-min)] flex-col items-start gap-1 rounded-controle border p-3 text-left focus-visible:outline-2 focus-visible:outline-marca',
                    marcado ? 'border-2 border-marca bg-marca-tinta' : 'border-divisor bg-superficie',
                  )}
                >
                  <span className="text-base text-texto">
                    {requisito.codigo} · {requisito.texto}
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    {requisito.campo && <EtiquetaCampo />}
                    {dataDeCampo && requisito.campo && <span className="text-xs font-bold text-acampamento">Sugerido para este dia</span>}
                  </span>
                </button>
              )
            })}
            <Botao disabled={marcados.length === 0 || desabilitado} onClick={() => void confirmar()}>
              {marcados.length === 1 ? 'Adicionar 1 requisito' : `Adicionar ${marcados.length} requisitos`}
            </Botao>
          </>
        )}
      </div>
    </FolhaLateral>
  )
}

interface PropriedadesMover {
  requisito: RequisitoDaMontagem
  datas: DataDaMontagem[]
  desabilitado: boolean
  aoEscolher: (data: string) => Promise<boolean>
  aoFechar: () => void
}

/** Folha do "Mover": as datas que aceitam aula (não bloqueadas, sem aula dada). */
export function FolhaMover({ requisito, datas, desabilitado, aoEscolher, aoFechar }: PropriedadesMover) {
  const destinos = datas.filter((dado) => !dado.situacao.bloqueiaAula && !dado.aulaDada && dado.data !== requisito.data)

  async function escolher(data: string) {
    await aoEscolher(data)
    aoFechar()
  }

  return (
    <FolhaLateral aberta titulo={`Mover ${requisito.codigo} para`} aoFechar={aoFechar}>
      <div className="flex flex-col gap-2">
        {destinos.length === 0 && <p className="py-6 text-center text-base text-texto-2">Nenhuma outra data aceita aula.</p>}
        {destinos.map((dado) => (
          <OpcaoDeData key={dado.data} dado={dado} desabilitado={desabilitado} aoEscolher={escolher} />
        ))}
      </div>
    </FolhaLateral>
  )
}

function OpcaoDeData({ dado, desabilitado, aoEscolher }: { dado: DataDaMontagem; desabilitado: boolean; aoEscolher: (data: string) => Promise<void> }) {
  return (
    <Botao variante="secundario" className="justify-start" disabled={desabilitado} onClick={() => void aoEscolher(dado.data)}>
      {diaMes(dado.data)}
      {textoDaData(dado) && <span className="text-sm font-normal text-texto-2">{textoDaData(dado)}</span>}
    </Botao>
  )
}
