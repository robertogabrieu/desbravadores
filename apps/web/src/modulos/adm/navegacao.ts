import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

/** O que a navegação leva para uma ficha do Adm: para onde o Voltar leva (e como se chama) e os avisos da última gravação. */
export interface EstadoDaFicha {
  voltarPara?: string
  voltarRotulo?: string
  avisos?: string[]
}

function lerEstado(estado: unknown): EstadoDaFicha {
  if (typeof estado !== 'object' || estado === null) return {}
  const voltarPara =
    'voltarPara' in estado && typeof estado.voltarPara === 'string' && estado.voltarPara.startsWith('/adm') ? estado.voltarPara : undefined
  const voltarRotulo = 'voltarRotulo' in estado && typeof estado.voltarRotulo === 'string' ? estado.voltarRotulo : undefined
  const avisos =
    'avisos' in estado && Array.isArray(estado.avisos) ? estado.avisos.filter((a): a is string => typeof a === 'string') : undefined
  return { voltarPara, voltarRotulo, avisos }
}

/** O estado que uma lista ou ficha leva ao abrir outra: volta para o endereço atual, chamando-o de `rotulo`. */
export function useEstadoDeVolta(rotulo?: string): EstadoDaFicha {
  const local = useLocation()
  return { voltarPara: `${local.pathname}${local.search}`, voltarRotulo: rotulo }
}

export function useVoltarPara(padrao: string): string {
  return lerEstado(useLocation().state).voltarPara ?? padrao
}

/** Destino e rótulo do Voltar: os que vieram no estado, ou o padrão da ficha. Destino sem rótulo usa o rótulo padrão. */
export function useVoltar(padrao: { para: string; rotulo: string }): { para: string; rotulo: string } {
  const { voltarPara, voltarRotulo } = lerEstado(useLocation().state)
  return { para: voltarPara ?? padrao.para, rotulo: voltarPara ? (voltarRotulo ?? padrao.rotulo) : padrao.rotulo }
}

/** Os avisos chegam no estado do histórico; lidos uma vez, saem dele para não voltarem no F5. */
export function useAvisosDaFicha(): { avisos: string[]; dispensar: () => void } {
  const local = useLocation()
  const navegar = useNavigate()
  const [avisos, setAvisos] = useState<string[]>(() => lerEstado(local.state).avisos ?? [])
  const { voltarPara, voltarRotulo, avisos: avisosDoEstado } = lerEstado(local.state)

  useEffect(() => {
    if (avisosDoEstado === undefined) return
    void navegar({ pathname: local.pathname, search: local.search }, { replace: true, state: { voltarPara, voltarRotulo } })
  }, [avisosDoEstado, voltarPara, voltarRotulo, local.pathname, local.search, navegar])

  return { avisos, dispensar: () => setAvisos([]) }
}

export function useFiltrosNaUrl(): { ler: (chave: string) => string; mudar: (mudancas: Record<string, string>) => void } {
  const [parametros, definir] = useSearchParams()
  const ler = (chave: string): string => parametros.get(chave) ?? ''
  const mudar = (mudancas: Record<string, string>) =>
    definir(
      (atuais) => {
        const novos = new URLSearchParams(atuais)
        for (const [chave, valor] of Object.entries(mudancas)) {
          if (valor) novos.set(chave, valor)
          else novos.delete(chave)
        }
        return novos
      },
      { replace: true },
    )
  return { ler, mudar }
}
