import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Classe } from '../../api/leitura'
import type { CronogramaDaMontagem, DataDaMontagem, Montagem } from '../../api/montagem'
import { useLarguraMenorQue } from '../../layouts/useLarguraMenorQue'
import { Botao } from '../../ui/Botao'
import { Abas } from '../../ui/Abas'
import { BarraProgresso } from '../../ui/BarraProgresso'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { cn } from '../../ui/cn'
import { LARGURA_DO_CELULAR } from '../../ui/larguraDoCelular'
import { BarrasDeProgresso } from './BarrasDeProgresso'
import { EtiquetaCampo } from './EtiquetaCampo'
import { EtiquetaDoLado } from './EtiquetaDoLado'
import { FaixaDeMontagem } from './FaixaDeMontagem'
import { ConfirmarPublicacao } from './ConfirmarPublicacao'
import { AULA_NOVA, FormularioAula, aulaEmEdicaoDaData, type AulaEmEdicao } from './FormularioAula'
import { LinhaData } from './LinhaData'
import { OrdemDasDatas } from './OrdemDasDatas'
import { PainelAdmCelular } from './PainelAdmCelular'
import { SeloDoCronograma } from './SeloDoCronograma'
import { aceitaRequisitoNovo, diaMes } from './datas'
import { ROTULO_DO_LADO, montarVista, ordenarPorVazias } from './vista'
import type { Lado, RequisitoComLado } from './vista'
import { useAcoesDeMontagem } from './useAcoesDeMontagem'

interface Propriedades {
  montagem: Montagem
  cronograma: CronogramaDaMontagem
  classe: Classe | undefined
  ano: number
  aoAtualizar: () => void
}

type Filtro = 'sem-data' | Lado

const QUEM_MONTA = { ADM: 'Adm', INSTRUTOR: 'Instrutores da classe' } as const

/** A7 com cronograma; no celular a montagem é outra tela, guiada pelos requisitos sem data. */
export function PainelAdm(propriedades: Propriedades) {
  const celular = useLarguraMenorQue(LARGURA_DO_CELULAR)
  return celular ? <PainelAdmCelular {...propriedades} /> : <PainelAdmComputador {...propriedades} />
}

/** Computador: requisitos à esquerda, datas à direita; escolhe um requisito e "Colocar aqui" numa data. */
function PainelAdmComputador({ montagem, cronograma, classe, ano, aoAtualizar }: Propriedades) {
  const acoes = useAcoesDeMontagem(montagem.classe.id, ano, cronograma.id, montagem)
  const vista = montarVista(montagem)
  const par = vista.temAvancada
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('sem-data')
  const [maisVazias, setMaisVazias] = useState(false)
  const [aulaEmEdicao, setAulaEmEdicao] = useState<AulaEmEdicao | null>(null)
  const [confirmandoPublicacao, setConfirmandoPublicacao] = useState(false)

  const selecionado = vista.requisitos.find((requisito) => requisito.id === selecionadoId) ?? null
  const agendados = montagem.requisitos.filter((requisito) => requisito.data !== null).length
  const total = montagem.requisitos.length
  const semData = vista.requisitos.filter((requisito) => requisito.data === null)
  const requisitoPorId = new Map(vista.requisitos.map((requisito) => [requisito.id, requisito]))
  const visiveis = !par ? vista.requisitos : filtro === 'sem-data' ? semData : vista.requisitos.filter((requisito) => requisito.lado === filtro)
  const datas = par && maisVazias ? ordenarPorVazias(vista.datas) : vista.datas

  async function colocarAqui(data: string) {
    if (!selecionado) return
    if (await acoes.colocar(selecionado.id, data)) setSelecionadoId(null)
  }

  function escolherRequisito(id: string) {
    setSelecionadoId(id === selecionadoId ? null : id)
  }

  async function publicar() {
    if (await acoes.publicar()) setConfirmandoPublicacao(false)
  }

  const faixaDeErro = acoes.erro && <FaixaDeMontagem erro={acoes.erro} aoAtualizar={() => { acoes.limparErro(); aoAtualizar() }} />

  async function removerAula(dado: DataDaMontagem) {
    if (dado.aulaId !== null) await acoes.removerAula(dado.aulaId)
  }

  async function salvarAula(aula: AulaEmEdicao, data: string): Promise<boolean> {
    return aula.aulaId !== null ? acoes.editarAula(aula.aulaId, aula.dados) : acoes.criarAula(data, aula.dados)
  }

  function cartaoDoRequisito(requisito: RequisitoComLado) {
    return (
      <button
        key={requisito.id}
        type="button"
        aria-pressed={requisito.id === selecionadoId}
        onClick={() => escolherRequisito(requisito.id)}
        className={cn(
          'flex min-h-[var(--touch-min)] items-start gap-3 rounded-controle border p-3 text-left focus-visible:outline-2 focus-visible:outline-marca',
          requisito.id === selecionadoId ? 'border-2 border-marca bg-marca-tinta' : 'border-divisor bg-superficie',
        )}
      >
        <span className="w-10 shrink-0 text-sm font-bold text-marca">{requisito.codigo}</span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-base text-texto">{requisito.texto}</span>
          <span className="flex flex-wrap items-center gap-2 text-sm text-texto-2">
            {par && <EtiquetaDoLado lado={requisito.lado} />}
            {requisito.campo && <EtiquetaCampo />}
            {requisito.data ? `agendado · ${diaMes(requisito.data)}` : 'sem data'}
          </span>
        </span>
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <SeloDoCronograma status={cronograma.status} />
        <span className="text-sm text-texto-2">
          Quem monta: <strong className="text-texto">{classe ? QUEM_MONTA[classe.quemMontaCronograma] : '—'}</strong>
          {' · '}
          <Link className="inline-flex min-h-[var(--touch-min)] items-center font-semibold text-marca underline" to={`/adm/classes?classe=${montagem.classe.id}`}>
            Alterar em Classes
          </Link>
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {par && <span className="text-sm text-texto-2">Publica a regular e a avançada juntas</span>}
          <Botao carregando={acoes.ocupada} disabled={cronograma.status === 'PUBLICADO'} onClick={() => setConfirmandoPublicacao(true)}>
            {par ? 'Publicar cronograma' : 'Publicar'}
          </Botao>
        </div>
      </div>

      {faixaDeErro}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 min-[900px]:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section aria-label="Requisitos" className="flex flex-col gap-3 rounded-cartao border border-borda-controle bg-superficie p-4">
          {par ? (
            <>
              <h2 className="font-titulo text-lg font-bold text-texto">Requisitos</h2>
              <BarrasDeProgresso vista={vista} />
              <Abas
                rotulo="Filtrar requisitos"
                ativa={filtro}
                aoMudar={(id) => setFiltro(id === 'REGULAR' || id === 'AVANCADA' ? id : 'sem-data')}
                abas={[
                  { id: 'sem-data', rotulo: `Sem data (${semData.length})` },
                  { id: 'REGULAR', rotulo: ROTULO_DO_LADO.REGULAR },
                  { id: 'AVANCADA', rotulo: ROTULO_DO_LADO.AVANCADA },
                ]}
              />
            </>
          ) : (
            <>
              <div className="flex items-baseline justify-between">
                <h2 className="font-titulo text-lg font-bold text-texto">Requisitos da classe</h2>
                <span className="text-sm font-semibold text-texto-2">
                  {agendados}/{total} agendados
                </span>
              </div>
              <BarraProgresso valor={total === 0 ? 0 : (agendados / total) * 100} rotulo="Requisitos agendados" />
            </>
          )}
          <p className="text-sm text-texto-2">1. Escolha um requisito · 2. Clique em “Colocar aqui” na data</p>
          <div className="flex flex-col gap-2">{visiveis.map(cartaoDoRequisito)}</div>
        </section>

        <section aria-label="Datas" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-titulo text-lg font-bold text-texto">Datas</h2>
            {montagem.datasLivres && (
              <Botao variante="secundario" onClick={() => setAulaEmEdicao(AULA_NOVA)}>
                + Novo dia de classe
              </Botao>
            )}
          </div>
          {par && (
            <>
              <p className="text-sm text-texto-2">Cada data mostra o que já está nela das duas classes.</p>
              {selecionado && (
                <p className="text-sm text-texto-2">
                  Escolhido: <strong className="text-texto">{ROTULO_DO_LADO[selecionado.lado]} · {selecionado.codigo}</strong>
                </p>
              )}
              <OrdemDasDatas maisVazias={maisVazias} aoMudar={setMaisVazias} />
            </>
          )}
          {datas.length === 0 ? (
            <EstadoVazio
              titulo={montagem.datasLivres ? 'Nenhum dia de classe ainda' : 'Nenhuma data de classe neste período'}
              descricao={montagem.datasLivres ? 'Crie um dia de classe para poder colocar requisitos nele.' : undefined}
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {datas.map((dado) => (
                <LinhaData
                  key={dado.data}
                  dado={dado}
                  comAvancada={par}
                  requisitos={dado.requisitoIds.flatMap((id) => requisitoPorId.get(id) ?? [])}
                  destaqueCampo={Boolean(selecionado?.campo) && dado.situacao.bomParaCampo}
                  desabilitada={acoes.ocupada}
                  aoTirar={(requisito) => void acoes.tirar(requisito.id)}
                  aoRemoverAula={(aula) => void removerAula(aula)}
                  aoEditar={(aula) => setAulaEmEdicao(aulaEmEdicaoDaData(aula))}
                  acaoDaData={
                    aceitaRequisitoNovo(montagem, dado, selecionado ? [selecionado.classeId] : vista.classeIds) && selecionado?.data !== dado.data && (
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

      {confirmandoPublicacao && (
        <ConfirmarPublicacao
          nomeDaClasse={vista.nomeDoPar}
          semData={semData.length}
          ocupada={acoes.ocupada}
          aviso={faixaDeErro}
          aoPublicar={() => void publicar()}
          aoContinuar={() => setConfirmandoPublicacao(false)}
        />
      )}

      {aulaEmEdicao && (
        <FormularioAula aula={aulaEmEdicao} desabilitado={acoes.ocupada} aoSalvar={salvarAula} aoFechar={() => setAulaEmEdicao(null)} />
      )}
    </div>
  )
}
