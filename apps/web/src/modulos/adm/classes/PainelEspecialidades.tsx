import { ChevronRight, Plus, Search } from 'lucide-react'
import { useCallback, useId, useState } from 'react'
import { useEspecialidades } from '../../../api/classes-adm'
import type { AreaEspecialidades } from '../../../api/classes-adm'
import { useLarguraMenorQue } from '../../../layouts/useLarguraMenorQue'
import { Botao } from '../../../ui/Botao'
import { Campo } from '../../../ui/Campo'
import { Cartao } from '../../../ui/Cartao'
import { EstadoVazio } from '../../../ui/EstadoVazio'
import { FolhaLateral } from '../../../ui/FolhaLateral'
import { Selo } from '../../../ui/Selo'
import { cn } from '../../../ui/cn'
import { LARGURA_DO_CELULAR } from '../../../ui/larguraDoCelular'
import { CorpoDaConsulta } from './CorpoDaConsulta'
import { FormularioEspecialidade } from './FormularioEspecialidade'

const semAcento = (texto: string): string =>
  texto
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

function filtrar(areas: AreaEspecialidades[], busca: string): AreaEspecialidades[] {
  const termo = semAcento(busca.trim())
  if (termo === '') return areas
  return areas
    .map((area) => ({
      ...area,
      especialidades: area.especialidades.filter((e) => semAcento(e.nome).includes(termo)),
    }))
    .filter((area) => area.especialidades.length > 0)
}

const plural = (n: number, singular: string, muitos: string): string =>
  `${n} ${n === 1 ? singular : muitos}`
const QUANTOS_EXEMPLOS = 3

/** Área numa linha, com contagem e exemplos, como no desenho; aberta, as especialidades em colunas. Na busca, abre sozinha. */
function Area({ area, buscando }: { area: AreaEspecialidades; buscando: boolean }) {
  const [aberta, setAberta] = useState(false)
  const idLista = useId()
  const celular = useLarguraMenorQue(LARGURA_DO_CELULAR)
  const expandida = aberta || buscando
  const doClube = area.especialidades.filter((e) => e.origem === 'CLUBE').length
  const exemplos = area.especialidades
    .slice(0, QUANTOS_EXEMPLOS)
    .map((e) => e.nome)
    .join(', ')
  const contagem = `${plural(area.especialidades.length, 'especialidade', 'especialidades')}${doClube > 0 ? ` · ${doClube} do clube` : ''}`

  return (
    <section aria-label={area.nome} className="border-t border-divisor first:border-t-0">
      <button
        type="button"
        aria-expanded={expandida}
        aria-controls={expandida ? idLista : undefined}
        disabled={buscando}
        onClick={() => setAberta(!aberta)}
        className="flex min-h-[var(--touch-min)] w-full items-start gap-3 px-1 py-3 text-left hover:bg-superficie-suave disabled:cursor-default disabled:hover:bg-transparent"
      >
        <ChevronRight
          aria-hidden
          className={cn(
            'mt-0.5 size-5 shrink-0 text-texto-2 transition-transform',
            expandida && 'rotate-90',
          )}
        />
        {/* No celular a contagem desce para baixo do nome, para não espremê-lo, e a prévia ganha 2 linhas. */}
        {celular ? (
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="font-titulo text-lg font-bold text-texto">{area.nome}</span>
            <span className="text-sm text-texto-2">{contagem}</span>
            {!expandida && <span className="line-clamp-2 text-sm text-texto-2">{exemplos}</span>}
          </span>
        ) : (
          <>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-titulo text-lg font-bold text-texto">{area.nome}</span>
              {!expandida && <span className="truncate text-sm text-texto-2">{exemplos}</span>}
            </span>
            <span className="shrink-0 text-sm text-texto-2">{contagem}</span>
          </>
        )}
      </button>
      {expandida && (
        <ul id={idLista} className="columns-1 gap-x-8 pb-4 pl-9 sm:columns-2 xl:columns-3">
          {area.especialidades.map((especialidade) => (
            <li
              key={especialidade.id}
              className="flex break-inside-avoid items-center gap-2 py-1 text-base text-texto"
            >
              {especialidade.nome}
              {especialidade.origem === 'CLUBE' && <Selo>Do clube</Selo>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export function PainelEspecialidades() {
  const consulta = useEspecialidades()
  const [busca, setBusca] = useState('')
  const [formularioAberto, setFormularioAberto] = useState(false)
  const fechar = useCallback(() => setFormularioAberto(false), [])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative min-w-60 flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute bottom-3.5 left-3 size-5 text-texto-3"
          />
          <Campo
            rotulo="Buscar especialidade"
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-10"
          />
        </div>
        <Botao onClick={() => setFormularioAberto(true)}>
          <Plus aria-hidden className="size-5" />
          Nova especialidade do clube
        </Botao>
      </div>

      <CorpoDaConsulta consulta={consulta} rotuloDeCarga="Carregando as especialidades">
        {(areas) => {
          if (areas.length === 0)
            return (
              <EstadoVazio
                titulo="Nenhuma especialidade no catálogo"
                descricao="As especialidades oficiais entram com a carga do catálogo."
              />
            )
          const visiveis = filtrar(areas, busca)
          return (
            <>
              {visiveis.length === 0 && (
                <EstadoVazio
                  titulo="Nenhuma especialidade encontrada"
                  descricao="Confira a escrita ou busque por outra palavra."
                />
              )}
              {visiveis.length > 0 && (
                <Cartao className="flex flex-col">
                  {visiveis.map((area) => (
                    <Area key={area.id} area={area} buscando={busca.trim() !== ''} />
                  ))}
                </Cartao>
              )}
              <FolhaLateral
                aberta={formularioAberto}
                titulo="Nova especialidade do clube"
                aoFechar={fechar}
              >
                {formularioAberto && (
                  <FormularioEspecialidade areas={areas} aoConcluir={fechar} aoCancelar={fechar} />
                )}
              </FolhaLateral>
            </>
          )
        }}
      </CorpoDaConsulta>
    </div>
  )
}
