import { Plus, Search } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useEspecialidades } from '../../../api/classes-adm'
import type { AreaEspecialidades } from '../../../api/classes-adm'
import { Botao } from '../../../ui/Botao'
import { Campo } from '../../../ui/Campo'
import { Cartao } from '../../../ui/Cartao'
import { EstadoVazio } from '../../../ui/EstadoVazio'
import { FolhaLateral } from '../../../ui/FolhaLateral'
import { Selo } from '../../../ui/Selo'
import { CorpoDaConsulta } from './CorpoDaConsulta'
import { FormularioEspecialidade } from './FormularioEspecialidade'

const semAcento = (texto: string): string => texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

function filtrar(areas: AreaEspecialidades[], busca: string): AreaEspecialidades[] {
  const termo = semAcento(busca.trim())
  if (termo === '') return areas
  return areas
    .map((area) => ({ ...area, especialidades: area.especialidades.filter((e) => semAcento(e.nome).includes(termo)) }))
    .filter((area) => area.especialidades.length > 0)
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
          <Search aria-hidden className="pointer-events-none absolute bottom-3.5 left-3 size-5 text-texto-3" />
          <Campo rotulo="Buscar especialidade" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-10" />
        </div>
        <Botao onClick={() => setFormularioAberto(true)}>
          <Plus aria-hidden className="size-5" />
          Nova especialidade do clube
        </Botao>
      </div>

      <CorpoDaConsulta consulta={consulta} rotuloDeCarga="Carregando as especialidades">
        {(areas) => {
          if (areas.length === 0) return <EstadoVazio titulo="Nenhuma especialidade no catálogo" descricao="As especialidades oficiais entram com a carga do catálogo." />
          const visiveis = filtrar(areas, busca)
          return (
            <>
              {visiveis.length === 0 && <EstadoVazio titulo="Nenhuma especialidade encontrada" descricao="Confira a escrita ou busque por outra palavra." />}
              <div className="grid gap-3 lg:grid-cols-2">
                {visiveis.map((area) => (
                  <Cartao key={area.id} role="region" aria-label={area.nome} className="flex flex-col gap-2">
                    <h2 className="font-titulo text-lg font-bold text-texto">
                      {area.nome} <span className="text-sm font-semibold text-texto-2">{area.especialidades.length} esp.</span>
                    </h2>
                    <ul className="flex flex-col gap-1">
                      {area.especialidades.map((especialidade) => (
                        <li key={especialidade.id} className="flex items-center gap-2 text-base text-texto">
                          {especialidade.nome}
                          {especialidade.origem === 'CLUBE' && <Selo>Do clube</Selo>}
                        </li>
                      ))}
                    </ul>
                  </Cartao>
                ))}
              </div>
              <FolhaLateral aberta={formularioAberto} titulo="Nova especialidade do clube" aoFechar={fechar}>
                {formularioAberto && <FormularioEspecialidade areas={areas} aoConcluir={fechar} aoCancelar={fechar} />}
              </FolhaLateral>
            </>
          )
        }}
      </CorpoDaConsulta>
    </div>
  )
}
