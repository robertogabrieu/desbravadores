import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Botao, estiloDoBotao } from '../../ui/Botao'
import { CaixaMarcacao } from '../../ui/CaixaMarcacao'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { FolhaLateral } from '../../ui/FolhaLateral'
import { Selo } from '../../ui/Selo'
import { EtiquetaDoLado } from './EtiquetaDoLado'
import { MedidorDeOcupacao } from './MedidorDeOcupacao'
import type { DataDaMontagem } from '../../api/montagem'
import { classeDada, contagemDaData } from './vista'
import type { RequisitoComLado, VistaDoPar } from './vista'
import {
  aceitaRequisitoNovo,
  chaveDoMes,
  dataBloqueada,
  diaComDadosSomeAoTirar,
  diaDaSemanaEData,
  diaMes,
  mesAbreviado,
  mesPorExtenso,
  textoDaData,
} from './datas'

interface Propriedades {
  requisito: RequisitoComLado
  /** Regular com avançada: a folha mostra a etiqueta do requisito e o que cada data já tem das duas classes. */
  vista?: VistaDoPar
  datas: DataDaMontagem[]
  datasLivres: boolean
  desabilitado: boolean
  /** Faixa de erro da gravação, mostrada dentro da folha para não ficar escondida atrás dela. */
  aviso?: ReactNode
  aoEscolher: (data: string) => void
  /** Agrupadas sem nenhum dia de classe: abre a folha do dia novo. */
  aoNovoDia: () => void
  aoFechar: () => void
}

/** Sem nenhuma data para escolher: nas agrupadas falta criar o dia; nas individuais as datas vêm do calendário. */
function SemDatas({ datasLivres, aoNovoDia }: { datasLivres: boolean; aoNovoDia: () => void }) {
  return datasLivres ? (
    <EstadoVazio
      titulo="Ainda não há dias de classe."
      descricao="Crie um dia de classe para poder colocar requisitos nele."
      acao={<Botao onClick={aoNovoDia}>Novo dia de classe</Botao>}
    />
  ) : (
    <EstadoVazio
      titulo="Nenhuma data de classe neste período."
      descricao="As datas vêm do calendário do clube."
      acao={
        <Link to="/adm/calendario" className={estiloDoBotao({ variante: 'secundario' })}>
          Abrir o calendário
        </Link>
      }
    />
  )
}

const NAO_DA = 'Não dá para colocar aqui.'

interface Recusa {
  /** Na linha do mês, quando a data está escondida: "sem classe (Feriado)". */
  curta: string
  /** No botão desligado, quando a data aparece. */
  longa: string
}

/** Por que o requisito não pode ir para esta data; `null` quando pode. Mesma regra do "Colocar aqui". */
function recusa(requisito: RequisitoComLado, dado: DataDaMontagem, datasLivres: boolean): Recusa | null {
  if (requisito.data === dado.data) return { curta: 'o requisito já está nesta data', longa: 'O requisito já está nesta data.' }
  if (aceitaRequisitoNovo({ datasLivres }, dado, [requisito.classeId])) return null
  if (dataBloqueada(dado)) {
    const eventos = dado.situacao.eventos.join(', ')
    return eventos
      ? { curta: `sem classe (${eventos})`, longa: `Sem classe: ${eventos}. ${NAO_DA}` }
      : { curta: 'sem classe', longa: `Sem classe nesta data. ${NAO_DA}` }
  }
  if (classeDada(dado, requisito.classeId)) return { curta: 'classe já dada', longa: `Classe já dada. ${NAO_DA}` }
  return { curta: 'conflito, não há classe nesta data', longa: `Conflito: não há classe nesta data. ${NAO_DA}` }
}

function quantosRequisitos(quantidade: number): string {
  if (quantidade === 0) return 'nenhum requisito ainda'
  return quantidade === 1 ? 'já tem 1 requisito' : `já tem ${quantidade} requisitos`
}

/** Data que aceita o requisito, com regular e avançada somadas: medidor, texto de ocupação e o que cada classe já pôs. */
function ResumoDaData({ dado, vista }: { dado: DataDaMontagem; vista: VistaDoPar }) {
  const { regular, avancada } = contagemDaData(vista, dado)
  return (
    <span className="flex flex-1 flex-col gap-1 text-sm text-texto-2">
      <span>{textoDaData(dado) || 'Dia de classe'}</span>
      <MedidorDeOcupacao quantidade={dado.requisitoIds.length} />
      <span>{dado.requisitoIds.length === 0 ? 'Nenhum requisito ainda' : `${regular} da regular · ${avancada} da avançada`}</span>
    </span>
  )
}

interface DataAvaliada {
  dado: DataDaMontagem
  recusa: Recusa | null
}

interface Mes {
  chave: string
  datas: DataAvaliada[]
}

function agruparPorMes(datas: DataAvaliada[]): Mes[] {
  const meses: Mes[] = []
  for (const avaliada of datas) {
    const chave = chaveDoMes(avaliada.dado.data)
    const ultimo = meses[meses.length - 1]
    if (ultimo?.chave === chave) ultimo.datas.push(avaliada)
    else meses.push({ chave, datas: [avaliada] })
  }
  return meses
}

/** Celular: o Adm tocou num requisito e escolhe aqui a data, sem rolar até a lista de datas. */
export function FolhaEmQualData({ requisito, vista, datas, datasLivres, desabilitado, aviso, aoEscolher, aoNovoDia, aoFechar }: Propriedades) {
  const [esconderRecusadas, setEsconderRecusadas] = useState(true)
  const prefixo = useId()
  const avaliadas = datas.map((dado) => ({ dado, recusa: recusa(requisito, dado, datasLivres) }))
  const meses = agruparPorMes(avaliadas)
  const proxima = avaliadas.find((avaliada) => avaliada.recusa === null && avaliada.dado.requisitoIds.length === 0)?.dado.data
  const nenhumaAceita = esconderRecusadas && avaliadas.length > 0 && avaliadas.every((avaliada) => avaliada.recusa !== null)
  const diaDeOrigem = datas.find((dado) => dado.data === requisito.data)
  const diaQueSome = diaDeOrigem && diaComDadosSomeAoTirar({ datasLivres }, diaDeOrigem) ? diaDeOrigem : undefined
  const idDoMes = (chave: string) => `${prefixo}-mes-${chave}`

  function irParaOMes(chave: string) {
    // jsdom não tem scrollIntoView.
    document.getElementById(idDoMes(chave))?.scrollIntoView?.({ block: 'start' })
  }

  return (
    <FolhaLateral aberta titulo="Em qual data?" aoFechar={aoFechar}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <p className="flex flex-wrap items-center gap-2 text-base text-texto">
            {vista?.temAvancada && <EtiquetaDoLado lado={requisito.lado} />}
            <span>
              <strong className="text-marca">{requisito.codigo}</strong> · {requisito.texto}
            </span>
          </p>
          <p className="text-sm font-semibold text-texto-2">{requisito.data ? `Hoje em ${diaMes(requisito.data)}` : 'Ainda sem data'}</p>
        </div>

        {aviso}

        {diaQueSome && <p className="text-base font-semibold text-texto">O dia de classe de {diaMes(diaQueSome.data)} fica vazio e será removido.</p>}

        {datas.length === 0 && <SemDatas datasLivres={datasLivres} aoNovoDia={aoNovoDia} />}

        {meses.length > 1 && (
          <nav aria-label="Ir para o mês" className="flex flex-wrap gap-2">
            {meses.map(({ chave }) => (
              <button
                key={chave}
                type="button"
                onClick={() => irParaOMes(chave)}
                className="min-h-[var(--touch-min)] min-w-[var(--touch-min)] rounded-botao border border-borda-controle bg-superficie px-3 text-sm font-semibold text-texto hover:bg-superficie-suave focus-visible:outline-2 focus-visible:outline-marca"
              >
                {mesAbreviado(`${chave}-01`)}
              </button>
            ))}
          </nav>
        )}

        {datas.length > 0 && (
          <CaixaMarcacao
            rotulo="Esconder datas que não aceitam"
            checked={esconderRecusadas}
            onChange={(evento) => setEsconderRecusadas(evento.target.checked)}
          />
        )}

        {nenhumaAceita && <p className="text-base font-semibold text-texto">Nenhuma data aceita este requisito agora.</p>}

        {meses.map(({ chave, datas: datasDoMes }) => {
          const visiveis = esconderRecusadas ? datasDoMes.filter((avaliada) => avaliada.recusa === null) : datasDoMes
          const escondidas = esconderRecusadas ? datasDoMes.filter((avaliada) => avaliada.recusa !== null) : []
          return (
            <section key={chave} className="flex flex-col gap-2">
              <h3 id={idDoMes(chave)} className="scroll-mt-4 font-titulo text-lg font-bold text-texto">
                {mesPorExtenso(`${chave}-01`)}
              </h3>
              {visiveis.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {visiveis.map(({ dado, recusa: motivo }) => (
                    <li key={dado.data}>
                      <button
                        type="button"
                        disabled={motivo !== null || desabilitado}
                        onClick={() => aoEscolher(dado.data)}
                        className="flex min-h-[60px] w-full items-center gap-3 rounded-controle border border-borda-controle bg-superficie px-4 py-2 text-left text-base text-texto hover:bg-superficie-suave focus-visible:outline-2 focus-visible:outline-marca disabled:cursor-not-allowed disabled:border-divisor disabled:bg-superficie-suave disabled:hover:bg-superficie-suave"
                      >
                        <span className="min-w-[84px] font-bold">{diaDaSemanaEData(dado.data)}</span>
                        {motivo === null && vista?.temAvancada ? (
                          <ResumoDaData dado={dado} vista={vista} />
                        ) : (
                          <span className="flex-1 text-sm text-texto-2">
                            {motivo?.longa ?? `${textoDaData(dado) || 'Dia de classe'} · ${quantosRequisitos(dado.requisitoIds.length)}`}
                          </span>
                        )}
                        {dado.data === proxima && <Selo>Próxima</Selo>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {escondidas.length > 0 && (
                <p className="text-sm text-texto-2">
                  {escondidas.map(({ dado, recusa: motivo }) => `${diaMes(dado.data)} não aceita: ${motivo?.curta ?? ''}.`).join(' ')}
                </p>
              )}
            </section>
          )
        })}
      </div>
    </FolhaLateral>
  )
}
