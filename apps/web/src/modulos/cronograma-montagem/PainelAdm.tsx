import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Classe } from '../../api/leitura'
import type { CronogramaDaMontagem, Montagem } from '../../api/montagem'
import { Botao } from '../../ui/Botao'
import { BarraProgresso } from '../../ui/BarraProgresso'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { cn } from '../../ui/cn'
import { EtiquetaCampo } from './EtiquetaCampo'
import { FaixaDeMontagem } from './FaixaDeMontagem'
import { FormularioAula } from './FormularioAula'
import type { AulaEmEdicao } from './FormularioAula'
import { LinhaData } from './LinhaData'
import { SeloDoCronograma } from './SeloDoCronograma'
import { aceitaRequisitoNovo, diaMes } from './datas'
import { useAcoesDeMontagem } from './useAcoesDeMontagem'

interface Propriedades {
  montagem: Montagem
  cronograma: CronogramaDaMontagem
  classe: Classe | undefined
  ano: number
  aoAtualizar: () => void
}

const QUEM_MONTA = { ADM: 'Adm', INSTRUTOR: 'Instrutores da classe' } as const

/** A7 com cronograma: requisitos à esquerda, datas à direita; escolhe um requisito e "Colocar aqui" numa data. */
export function PainelAdm({ montagem, cronograma, classe, ano, aoAtualizar }: Propriedades) {
  const acoes = useAcoesDeMontagem(montagem.classe.id, ano, cronograma.id, montagem)
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)
  const [aulaEmEdicao, setAulaEmEdicao] = useState<AulaEmEdicao | null>(null)

  const selecionado = montagem.requisitos.find((requisito) => requisito.id === selecionadoId) ?? null
  const agendados = montagem.requisitos.filter((requisito) => requisito.data !== null).length
  const total = montagem.requisitos.length
  const requisitoPorId = new Map(montagem.requisitos.map((requisito) => [requisito.id, requisito]))

  async function colocarAqui(data: string) {
    if (!selecionado) return
    if (await acoes.colocar(selecionado.id, data)) setSelecionadoId(null)
  }

  async function salvarAula(aula: AulaEmEdicao, data: string): Promise<boolean> {
    return aula.aulaId ? acoes.editarAula(aula.aulaId, aula.dados) : acoes.criarAula(data, aula.dados)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <SeloDoCronograma status={cronograma.status} />
        <span className="text-sm text-texto-2">
          Quem monta: <strong className="text-texto">{classe ? QUEM_MONTA[classe.quemMontaCronograma] : '—'}</strong>
          {' · '}
          <Link className="font-semibold text-marca underline" to={`/adm/classes?classe=${montagem.classe.id}`}>
            Alterar em Classes
          </Link>
        </span>
        <Botao
          className="ml-auto"
          carregando={acoes.ocupada}
          disabled={cronograma.status === 'PUBLICADO'}
          onClick={() => void acoes.publicar()}
        >
          Publicar
        </Botao>
      </div>

      {acoes.erro && <FaixaDeMontagem erro={acoes.erro} aoAtualizar={() => { acoes.limparErro(); aoAtualizar() }} />}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 min-[900px]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section aria-label="Requisitos" className="flex flex-col gap-3 rounded-cartao border border-borda bg-superficie p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-titulo text-lg font-bold text-texto">Requisitos da classe</h2>
            <span className="text-sm font-semibold text-texto-2">
              {agendados}/{total} agendados
            </span>
          </div>
          <BarraProgresso valor={total === 0 ? 0 : (agendados / total) * 100} rotulo="Requisitos agendados" />
          <p className="text-sm text-texto-2">1. Escolha um requisito · 2. Clique em “Colocar aqui” na data</p>
          <div className="flex flex-col gap-2">
            {montagem.requisitos.map((requisito) => (
              <button
                key={requisito.id}
                type="button"
                aria-pressed={requisito.id === selecionadoId}
                onClick={() => setSelecionadoId(requisito.id === selecionadoId ? null : requisito.id)}
                className={cn(
                  'flex min-h-[var(--touch-min)] items-start gap-3 rounded-controle border p-3 text-left focus-visible:outline-2 focus-visible:outline-marca',
                  requisito.id === selecionadoId ? 'border-2 border-marca bg-marca-tinta' : 'border-divisor bg-superficie',
                )}
              >
                <span className="w-10 shrink-0 text-sm font-bold text-marca">{requisito.codigo}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-base text-texto">{requisito.texto}</span>
                  <span className="flex flex-wrap items-center gap-2 text-sm text-texto-2">
                    {requisito.campo && <EtiquetaCampo />}
                    {requisito.data ? `agendado · ${diaMes(requisito.data)}` : 'sem data'}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section aria-label="Datas" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-titulo text-lg font-bold text-texto">Datas</h2>
            {montagem.datasLivres && (
              <Botao variante="secundario" onClick={() => setAulaEmEdicao({ data: null, aulaId: null, dados: { horario: null, local: null, titulo: null } })}>
                + Novo dia de classe
              </Botao>
            )}
          </div>
          {montagem.datas.length === 0 ? (
            <EstadoVazio
              titulo={montagem.datasLivres ? 'Nenhum dia de classe ainda' : 'Nenhuma data de classe neste período'}
              descricao={montagem.datasLivres ? 'Crie um dia de classe para poder colocar requisitos nele.' : undefined}
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {montagem.datas.map((dado) => (
                <LinhaData
                  key={dado.data}
                  dado={dado}
                  requisitos={dado.requisitoIds.flatMap((id) => requisitoPorId.get(id) ?? [])}
                  destaqueCampo={Boolean(selecionado?.campo) && dado.situacao.bomParaCampo}
                  desabilitada={acoes.ocupada}
                  aoTirar={(requisito) => void acoes.tirar(requisito.id)}
                  aoRemoverAula={(aula) => aula.aulaId && void acoes.removerAula(aula.aulaId)}
                  aoEditar={(aula) =>
                    setAulaEmEdicao({ data: aula.data, aulaId: aula.aulaId, dados: { horario: aula.horario, local: aula.local, titulo: aula.titulo } })
                  }
                  acaoDaData={
                    aceitaRequisitoNovo(montagem, dado) && selecionado?.data !== dado.data && (
                      <Botao
                        variante="secundario"
                        aria-label={`Colocar aqui em ${diaMes(dado.data)}`}
                        disabled={selecionado === null || acoes.ocupada}
                        onClick={() => void colocarAqui(dado.data)}
                      >
                        Colocar aqui
                      </Botao>
                    )
                  }
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      {aulaEmEdicao && (
        <FormularioAula aula={aulaEmEdicao} desabilitado={acoes.ocupada} aoSalvar={salvarAula} aoFechar={() => setAulaEmEdicao(null)} />
      )}
    </div>
  )
}
