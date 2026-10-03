import { ChevronDown, ChevronUp } from 'lucide-react'
import { useId, useState } from 'react'
import type { CatalogoPermissao } from '../../../api/leitura'
import { Botao } from '../../../ui/Botao'
import { Cartao } from '../../../ui/Cartao'
import { cn } from '../../../ui/cn'
import { Interruptor } from '../../../ui/Interruptor'
import { Selo } from '../../../ui/Selo'
import { alternarPermissao, permissaoLigada, permissoesDoPapel, textoDasAlteracoes } from './vinculos'
import type { RascunhoVinculo } from './vinculos'

interface Propriedades {
  rascunho: RascunhoVinculo
  catalogo: CatalogoPermissao[]
  aoMudar: (rascunho: RascunhoVinculo) => void
}

/** "Ajustar o que pode fazer": recolhido de início; aberto, um interruptor por permissão do papel. */
export function AjustesDoPapel({ rascunho, catalogo, aoMudar }: Propriedades) {
  const [aberto, setAberto] = useState(false)
  const idLista = useId()
  const alteracoes = Object.keys(rascunho.ajustes).length
  const Seta = aberto ? ChevronUp : ChevronDown

  return (
    <Cartao className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={aberto}
        aria-controls={idLista}
        onClick={() => setAberto(!aberto)}
        className="flex min-h-[var(--touch-min)] w-full items-center justify-between gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
      >
        <span className="flex flex-wrap items-center gap-2.5">
          <span className="font-titulo text-lg font-bold text-texto">Ajustar o que pode fazer</span>
          {alteracoes > 0 && <Selo tom="alerta">{textoDasAlteracoes(alteracoes)}</Selo>}
        </span>
        <Seta aria-hidden className="size-5 shrink-0 text-texto-2" />
      </button>
      <div id={idLista} hidden={!aberto} className="flex flex-col">
        {permissoesDoPapel(catalogo, rascunho.papel).map((permissao) => {
          const alterada = permissao.chave in rascunho.ajustes
          const idRotulo = `${idLista}-${permissao.chave}`
          const idEstado = `${idRotulo}-estado`
          return (
            <div key={permissao.chave} className={cn('flex flex-wrap items-center justify-between gap-x-3 border-t border-divisor py-1.5', alterada && 'bg-alerta-fundo/40')}>
              <span id={idRotulo} className="text-base text-texto">
                {permissao.rotulo}
              </span>
              <span className="flex items-center gap-2">
                <Selo id={idEstado} tom={alterada ? 'alerta' : 'neutro'}>
                  {alterada ? 'alterado' : 'padrão'}
                </Selo>
                <Interruptor ligado={permissaoLigada(permissao, rascunho)} aoAlternar={() => aoMudar(alternarPermissao(rascunho, permissao))} idRotulo={idRotulo} idDescricao={idEstado} />
              </span>
            </div>
          )
        })}
        <div className="border-t border-divisor pt-2">
          <Botao variante="texto" onClick={() => aoMudar({ ...rascunho, ajustes: {} })}>
            Volta ao padrão do papel
          </Botao>
        </div>
      </div>
    </Cartao>
  )
}
