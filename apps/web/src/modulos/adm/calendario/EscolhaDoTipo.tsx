import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useConfiguracaoClube } from '../../../api/clube'
import { estiloDoBotao } from '../../../ui/Botao'
import { CabecalhoDaPagina } from '../../../ui/CabecalhoDaPagina'
import { LinhaQueNavega } from '../../../ui/LinhaQueNavega'
import { tipoDoEndereco } from './FormularioEvento'
import { ICONE_DA_ESCOLHA, ROTULOS_DO_TIPO, TEXTO_DO_TIPO } from './tipos'
import type { TipoDeEvento } from './tipos'

/** Na ordem de `ROTULOS_DO_TIPO` (a da legenda), só os tipos que o formulário aceita. */
const TIPOS_DA_ESCOLHA = Object.keys(ROTULOS_DO_TIPO).flatMap((chave) => {
  const tipo = tipoDoEndereco(chave)
  return tipo ? [tipo] : []
})

interface Propriedades {
  voltarPara: string
  /** Endereço de um cartão: o da própria rota, com a data e o resto que ela já recebe, mais o tipo. */
  enderecoDoTipo: (tipo: TipoDeEvento) => string
  /** Vai junto em cada cartão, para o Voltar do formulário saber de onde a pessoa veio. */
  estado?: unknown
}

/** Primeiro passo do "Novo evento": a pessoa vê o que vai cadastrar antes de ver os campos. */
export function EscolhaDoTipo({ voltarPara, enderecoDoTipo, estado }: Propriedades) {
  const raiz = useRef<HTMLDivElement>(null)
  const diaReuniao = useConfiguracaoClube().data?.diaReuniao

  useEffect(() => {
    const titulo = raiz.current?.querySelector('h1')
    titulo?.setAttribute('tabindex', '-1')
    titulo?.classList.add('outline-none')
    titulo?.focus()
  }, [])

  return (
    <div ref={raiz} className="flex flex-col gap-5">
      <CabecalhoDaPagina
        voltar={{ para: voltarPara, rotulo: 'Calendário do clube' }}
        titulo="Novo evento"
        apoio={<p>Que tipo de evento é? Escolha o tipo e o formulário certo abre em seguida.</p>}
      />
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {TIPOS_DA_ESCOLHA.map((tipo) => {
          const Icone = ICONE_DA_ESCOLHA[tipo]
          return (
            <li key={tipo} className="flex">
              <LinhaQueNavega to={enderecoDoTipo(tipo)} state={estado} forma="cartao" className="min-h-[var(--touch-min)] w-full">
                <span className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-botao bg-marca-suave text-marca">
                    <Icone aria-hidden className="size-5" />
                  </span>
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="text-base font-bold text-texto">{ROTULOS_DO_TIPO[tipo]}</span>
                    <span className="text-sm text-texto-2">{TEXTO_DO_TIPO[tipo]?.(diaReuniao)}</span>
                  </span>
                </span>
              </LinhaQueNavega>
            </li>
          )
        })}
      </ul>
      <div>
        <Link to={voltarPara} className={estiloDoBotao({ variante: 'secundario' })}>
          Cancelar
        </Link>
      </div>
    </div>
  )
}
