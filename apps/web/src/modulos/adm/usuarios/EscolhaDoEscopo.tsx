import { Check, Search } from 'lucide-react'
import { forwardRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import { Campo } from '../../../ui/Campo'
import { Chip } from '../../../ui/Chip'
import { estiloDoBotao } from '../../../ui/Botao'
import { EstadoVazio } from '../../../ui/EstadoVazio'
import { filtrarGrupos } from './escopo'
import type { GrupoDeEscopo } from './escopo'

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

const contagem = (n: number): string => (n === 0 ? 'Nenhuma escolhida' : `${n} ${n === 1 ? 'escolhida' : 'escolhidas'}`)

/** Busca, contagem e grupos de chips. Controlado: a página valida e foca o grupo (ref) quando faltar escolha. */
export const EscolhaDoEscopo = forwardRef<HTMLDivElement, Propriedades>(function EscolhaDoEscopo({ papel, grupos, escolhidos, aoMudar, idErro }, ref) {
  const [busca, setBusca] = useState('')
  const textos = TEXTOS[papel]
  const visiveis = filtrarGrupos(grupos, busca)
  const alternar = (id: string, marcado: boolean) => aoMudar(marcado ? [...escolhidos, id] : escolhidos.filter((escolhido) => escolhido !== id))

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
      <p aria-live="polite" className="flex items-center gap-1.5 text-base font-bold text-marca">
        <Check aria-hidden className="size-5" />
        {contagem(escolhidos.length)}
      </p>
      {visiveis.length === 0 && <p className="text-base text-texto-2">{textos.semBusca}</p>}
      {visiveis.map((grupo) => (
        <fieldset key={grupo.titulo} className="m-0 flex flex-col gap-2.5 border-0 p-0">
          <legend className="mb-2.5 p-0 text-sm font-bold text-texto">{grupo.titulo}</legend>
          <div className="flex flex-wrap gap-2">
            {grupo.opcoes.map((opcao) => (
              <Chip key={opcao.id} variante="cheia" selecionado={escolhidos.includes(opcao.id)} aoAlternar={(marcado) => alternar(opcao.id, marcado)}>
                {opcao.inativa ? `${opcao.nome} (inativa)` : opcao.nome}
              </Chip>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  )
})
