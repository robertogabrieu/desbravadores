import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'

/** O que a navegação leva para uma ficha do Adm: para onde o Voltar leva e os avisos da última gravação. */
export interface EstadoDaFicha {
  voltarPara?: string
  avisos?: string[]
}

function lerEstado(estado: unknown): EstadoDaFicha {
  if (typeof estado !== 'object' || estado === null) return {}
  const voltarPara =
    'voltarPara' in estado && typeof estado.voltarPara === 'string' && estado.voltarPara.startsWith('/adm') ? estado.voltarPara : undefined
  const avisos =
    'avisos' in estado && Array.isArray(estado.avisos) ? estado.avisos.filter((a): a is string => typeof a === 'string') : undefined
  return { voltarPara, avisos }
}

export function useEstadoDeVolta(): EstadoDaFicha {
  const local = useLocation()
  return { voltarPara: `${local.pathname}${local.search}` }
}

export function useVoltarPara(padrao: string): string {
  return lerEstado(useLocation().state).voltarPara ?? padrao
}

export function useAvisosDaFicha(): { avisos: string[]; dispensar: () => void } {
  const local = useLocation()
  const navegar = useNavigate()
  const { voltarPara, avisos = [] } = lerEstado(local.state)
  const dispensar = () => void navegar({ pathname: local.pathname, search: local.search }, { replace: true, state: { voltarPara } })
  return { avisos, dispensar }
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
