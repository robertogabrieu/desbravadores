import { useId, useState } from 'react'
import { Botao } from '../../ui/Botao'
import { Campo } from '../../ui/Campo'
import { Selecao } from '../../ui/Selecao'
import { chaveItem } from './estado'
import type { ItemDaTarefa, Requisito } from './estado'
import type { EspecialidadeDoCatalogo } from './fontes'

const MAXIMO_DE_RESULTADOS = 20

const normalizar = (texto: string): string => texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

interface Propriedades {
  /** Itens que a tarefa deste registro terá, na ordem em que foram passados. */
  itens: ItemDaTarefa[]
  /** Requisitos da classe: dão o texto dos itens e as opções de "+ Requisito". */
  requisitos: Requisito[]
  /** `null` = pacote antigo, sem catálogo. */
  catalogo: EspecialidadeDoCatalogo[] | null
  /** Itens que não se oferecem: os já passados aqui e os que estão em tarefa aberta da classe. */
  indisponiveis: ReadonlySet<string>
  podeEspecialidade: boolean
  haOQueFaltou: boolean
  aoPassarRequisito: (requisitoId: string) => void
  aoPassarEspecialidade: (especialidadeId: string) => void
  aoTirar: (item: ItemDaTarefa) => void
  aoPassarOQueFaltou: () => void
}

interface ItemDescrito {
  tipo: 'Requisito' | 'Especialidade'
  texto: string
  /** Como o item se chama no botão "Tirar". */
  nomeCurto: string
}

function descreverItem(item: ItemDaTarefa, requisitos: Requisito[], catalogo: EspecialidadeDoCatalogo[] | null): ItemDescrito {
  if ('requisitoId' in item) {
    const requisito = requisitos.find((r) => r.id === item.requisitoId)
    if (!requisito) return { tipo: 'Requisito', texto: 'Requisito da classe', nomeCurto: 'requisito' }
    return { tipo: 'Requisito', texto: `${requisito.codigo} · ${requisito.texto}`, nomeCurto: requisito.codigo }
  }
  const nome = catalogo?.find((e) => e.id === item.especialidadeId)?.nome ?? 'Especialidade'
  return { tipo: 'Especialidade', texto: nome, nomeCurto: nome }
}

export function ParaCasa({ itens, requisitos, catalogo, indisponiveis, podeEspecialidade, haOQueFaltou, aoPassarRequisito, aoPassarEspecialidade, aoTirar, aoPassarOQueFaltou }: Propriedades) {
  const [buscando, setBuscando] = useState(false)
  const requisitosDisponiveis = requisitos.filter((r) => !indisponiveis.has(chaveItem({ requisitoId: r.id })))
  const especialidadesDisponiveis = (catalogo ?? []).filter((e) => !indisponiveis.has(chaveItem({ especialidadeId: e.id })))

  return (
    <section aria-labelledby="titulo-para-casa" className="flex flex-col gap-3 rounded-cartao bg-superficie p-3">
      <h2 id="titulo-para-casa" className="font-titulo text-lg font-bold">
        Para casa
      </h2>
      {itens.length === 0 ? (
        <p className="text-sm text-texto-2">Nada para casa.</p>
      ) : (
        <ul aria-label="Itens para casa" className="flex flex-col">
          {itens.map((item) => {
            const { tipo, texto, nomeCurto } = descreverItem(item, requisitos, catalogo)
            const podeTirar = 'requisitoId' in item || podeEspecialidade
            return (
              <li key={chaveItem(item)} className="flex items-center justify-between gap-3 border-t border-borda py-2">
                <span className="flex flex-col">
                  <span className="text-xs font-semibold text-texto-2">{tipo}</span>
                  <span className="text-sm">{texto}</span>
                </span>
                {podeTirar && (
                  <Botao variante="texto" aria-label={`Tirar ${nomeCurto}`} onClick={() => aoTirar(item)}>
                    Tirar
                  </Botao>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <Botao variante="secundario" disabled={!haOQueFaltou} onClick={aoPassarOQueFaltou}>
        Passar o que faltou
      </Botao>
      {requisitosDisponiveis.length > 0 && (
        <Selecao
          rotulo="+ Requisito"
          value=""
          onChange={(e) => {
            if (e.target.value) aoPassarRequisito(e.target.value)
          }}
        >
          <option value="">Escolha um requisito</option>
          {requisitosDisponiveis.map((requisito) => (
            <option key={requisito.id} value={requisito.id}>{`${requisito.codigo} · ${requisito.texto}`}</option>
          ))}
        </Selecao>
      )}
      {podeEspecialidade && catalogo === null && <p className="text-sm text-texto-2">Para passar especialidade, abra o app com internet uma vez</p>}
      {podeEspecialidade && catalogo !== null && !buscando && (
        <Botao variante="secundario" onClick={() => setBuscando(true)}>
          + Especialidade
        </Botao>
      )}
      {podeEspecialidade && catalogo !== null && buscando && (
        <BuscaEspecialidade
          especialidades={especialidadesDisponiveis}
          aoEscolher={(especialidadeId) => {
            aoPassarEspecialidade(especialidadeId)
            setBuscando(false)
          }}
          aoFechar={() => setBuscando(false)}
        />
      )}
    </section>
  )
}

interface PropriedadesBusca {
  especialidades: EspecialidadeDoCatalogo[]
  aoEscolher: (especialidadeId: string) => void
  aoFechar: () => void
}

function BuscaEspecialidade({ especialidades, aoEscolher, aoFechar }: PropriedadesBusca) {
  const idResultado = useId()
  const [termo, setTermo] = useState('')
  const procurado = normalizar(termo.trim())
  const encontradas = procurado === '' ? [] : especialidades.filter((e) => normalizar(e.nome).includes(procurado)).slice(0, MAXIMO_DE_RESULTADOS)

  return (
    <div className="flex flex-col gap-2">
      <Campo autoFocus rotulo="Buscar especialidade" type="search" value={termo} onChange={(e) => setTermo(e.target.value)} aria-describedby={idResultado} />
      <div id={idResultado} aria-live="polite">
        {procurado === '' && <p className="text-sm text-texto-2">Digite parte do nome da especialidade</p>}
        {procurado !== '' && encontradas.length === 0 && <p className="text-sm text-texto-2">Nenhuma especialidade com esse nome</p>}
        {encontradas.length > 0 && (
          <ul aria-label="Especialidades encontradas" className="flex flex-col">
            {encontradas.map((especialidade) => (
              <li key={especialidade.id} className="border-t border-borda">
                <button
                  type="button"
                  onClick={() => aoEscolher(especialidade.id)}
                  className="flex min-h-[var(--touch-min)] w-full items-center justify-between gap-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
                >
                  <span className="flex flex-col">
                    <span className="text-sm font-bold">{especialidade.nome}</span>
                    <span className="text-xs text-texto-2">{especialidade.area}</span>
                  </span>
                  <span className="text-sm font-semibold text-marca">Passar</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Botao variante="texto" onClick={aoFechar}>
        Fechar busca
      </Botao>
    </div>
  )
}
