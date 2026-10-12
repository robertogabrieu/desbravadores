import { Check, Search } from 'lucide-react'
import { forwardRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { Campo } from '../../../ui/Campo'
import { Chip } from '../../../ui/Chip'
import { estiloDoBotao } from '../../../ui/Botao'
import { EstadoVazio } from '../../../ui/EstadoVazio'
import { contarMarcadas, filtrarGrupos, idsDaOpcao, opcaoMarcada } from './escopo'
import type { GrupoDeEscopo, OpcaoDeEscopo } from './escopo'

interface Propriedades {
  papel: 'CONSELHEIRO' | 'INSTRUTOR'
  grupos: GrupoDeEscopo[]
  escolhidos: string[]
  aoMudar: (ids: string[]) => void
  /** Id da mensagem de erro da página; o grupo aponta para ela. */
  idErro?: string
}

const TEXTOS = {
  CONSELHEIRO: { grupo: 'Escolha das unidades', busca: 'Buscar unidade', placeholder: 'Nome da unidade', semBusca: 'Nenhuma unidade com esse nome', semOpcao: 'Nenhuma unidade ativa no clube', link: '/adm/unidades', rotuloLink: 'Ir para Unidades' },
  INSTRUTOR: { grupo: 'Escolha das classes', busca: 'Buscar classe', placeholder: 'Nome da classe', semBusca: 'Nenhuma classe com esse nome', semOpcao: 'Nenhuma classe ativa', link: '/adm/classes', rotuloLink: 'Ir para Classes e especialidades' },
} as const

/** Enter na busca só filtra: dentro do formulário da página ele gravaria no meio da escolha. */
const naoEnviarComEnter = (evento: KeyboardEvent<HTMLInputElement>) => {
  if (evento.key === 'Enter') evento.preventDefault()
}

const FRASE_DO_PAR = 'Cada classe já vem com a avançada dela: quem instrui Amigo instrui também Amigo da Natureza.'

const contagem = (n: number): string => (n === 0 ? 'Nenhuma escolhida' : `${n} ${n === 1 ? 'escolhida' : 'escolhidas'}`)

/** Busca, contagem e grupos de chips. Controlado: a página valida e foca o grupo (ref) quando faltar escolha. */
export const EscolhaDoEscopo = forwardRef<HTMLDivElement, Propriedades>(function EscolhaDoEscopo({ papel, grupos, escolhidos, aoMudar, idErro }, ref) {
  const [busca, setBusca] = useState('')
  const textos = TEXTOS[papel]
  const visiveis = filtrarGrupos(grupos, busca)
  const alternar = (opcao: OpcaoDeEscopo, marcado: boolean) => {
    const ids = idsDaOpcao(opcao)
    const semEstes = escolhidos.filter((id) => !ids.includes(id))
    aoMudar(marcado ? [...semEstes, ...ids] : semEstes)
  }

  if (grupos.length === 0) {
    return (
      <EstadoVazio
        titulo={textos.semOpcao}
        acao={
          <Link to={textos.link} className={estiloDoBotao({ variante: 'secundario' })}>
            {textos.rotuloLink}
          </Link>
        }
      />
    )
  }

  return (
    <div ref={ref} role="group" aria-label={textos.grupo} tabIndex={-1} aria-describedby={idErro} className="flex flex-col gap-5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-marca">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute bottom-3 left-3 size-5 text-texto-2" />
        <Campo type="search" rotulo={textos.busca} placeholder={textos.placeholder} value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={naoEnviarComEnter} className="pl-10" />
      </div>
      {papel === 'INSTRUTOR' && <p className="text-base text-texto-2">{FRASE_DO_PAR}</p>}
      <p aria-live="polite" className="flex items-center gap-1.5 text-base font-bold text-marca">
        <Check aria-hidden className="size-5" />
        {contagem(contarMarcadas(grupos, escolhidos))}
      </p>
      {visiveis.length === 0 && <p className="text-base text-texto-2">{textos.semBusca}</p>}
      {visiveis.map((grupo) => (
        <fieldset key={grupo.titulo} className="m-0 flex flex-col gap-2.5 border-0 p-0">
          <legend className="mb-2.5 p-0 text-sm font-bold text-texto">{grupo.titulo}</legend>
          <div className="flex flex-wrap items-start gap-x-2 gap-y-3">
            {grupo.opcoes.map((opcao) => (
              <div key={opcao.id} className="flex flex-col items-start gap-1">
                <Chip variante="cheia" selecionado={opcaoMarcada(opcao, escolhidos)} aoAlternar={(marcado) => alternar(opcao, marcado)}>
                  {opcao.inativa ? `${opcao.nome} (inativa)` : opcao.nome}
                </Chip>
                {opcao.avancada && <span className="px-4 text-sm text-texto-2">{`+ ${opcao.avancada.nome} (avançada)`}</span>}
              </div>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  )
})
