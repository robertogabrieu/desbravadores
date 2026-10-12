import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

/** O que a navegação leva para uma ficha do Adm: para onde o Voltar leva (e como se chama), os avisos da última gravação e se acabou de salvar. */
export interface EstadoDaFicha {
  voltarPara?: string
  voltarRotulo?: string
  avisos?: string[]
  salvo?: boolean
}

function lerEstado(estado: unknown): EstadoDaFicha {
  if (typeof estado !== 'object' || estado === null) return {}
  const voltarPara =
    'voltarPara' in estado && typeof estado.voltarPara === 'string' && estado.voltarPara.startsWith('/adm') ? estado.voltarPara : undefined
  const voltarRotulo = 'voltarRotulo' in estado && typeof estado.voltarRotulo === 'string' ? estado.voltarRotulo : undefined
  const avisos =
    'avisos' in estado && Array.isArray(estado.avisos) ? estado.avisos.filter((a): a is string => typeof a === 'string') : undefined
  const salvo = 'salvo' in estado && estado.salvo === true ? true : undefined
  return { voltarPara, voltarRotulo, avisos, salvo }
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

/** Os avisos e o "acabou de salvar" chegam no estado do histórico; lidos uma vez, saem dele para não voltarem no F5. */
export function useAvisosDaFicha(): { avisos: string[]; salvo: boolean; dispensar: () => void } {
  const local = useLocation()
  const navegar = useNavigate()
  const [avisos, setAvisos] = useState<string[]>(() => lerEstado(local.state).avisos ?? [])
  const [salvo] = useState<boolean>(() => lerEstado(local.state).salvo === true)
  const { voltarPara, voltarRotulo, avisos: avisosDoEstado, salvo: salvoNoEstado } = lerEstado(local.state)

  useEffect(() => {
    if (avisosDoEstado === undefined && salvoNoEstado === undefined) return
    void navegar({ pathname: local.pathname, search: local.search }, { replace: true, state: { voltarPara, voltarRotulo } })
  }, [avisosDoEstado, salvoNoEstado, voltarPara, voltarRotulo, local.pathname, local.search, navegar])

  return { avisos, salvo, dispensar: () => setAvisos([]) }
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
