import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Classe } from '../../api/leitura'
import type { CronogramaDaMontagem, DataDaMontagem, Montagem, RequisitoDaMontagem } from '../../api/montagem'
import { Abas } from '../../ui/Abas'
import { BarraProgresso } from '../../ui/BarraProgresso'
import { Botao } from '../../ui/Botao'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { CartaoDaDataCelular } from './CartaoDaDataCelular'
import { ConfirmarPublicacao } from './ConfirmarPublicacao'
import { EtiquetaCampo } from './EtiquetaCampo'
import { FaixaDeMontagem } from './FaixaDeMontagem'
import { FolhaEmQualData } from './FolhaEmQualData'
import { FormularioAula } from './FormularioAula'
import type { AulaEmEdicao } from './FormularioAula'
import { SeloDoCronograma } from './SeloDoCronograma'
import { chaveDoMes, diaMes, mesPorExtenso } from './datas'
import { useAcoesDeMontagem } from './useAcoesDeMontagem'

interface Propriedades {
  montagem: Montagem
  cronograma: CronogramaDaMontagem
  classe: Classe | undefined
  ano: number
  aoAtualizar: () => void
}

type Vista = 'sem-data' | 'com-data' | 'por-data'

/** A última colocação feita pela folha: o que o "Desfazer" precisa para voltar atrás. */
interface Colocacao {
  requisitoId: string
  codigo: string
  data: string
  /** Data que o requisito tinha antes; `null` quando estava sem data. */
  anterior: string | null
}

const QUEM_MONTA = { ADM: 'Adm', INSTRUTOR: 'Instrutores da classe' } as const

const plural = (quantidade: number, um: string, varios: string) => (quantidade === 1 ? `1 ${um}` : `${quantidade} ${varios}`)

function agruparPorMes(datas: DataDaMontagem[]): { chave: string; datas: DataDaMontagem[] }[] {
  const meses: { chave: string; datas: DataDaMontagem[] }[] = []
  for (const dado of datas) {
    const chave = chaveDoMes(dado.data)
    const ultimo = meses[meses.length - 1]
    if (ultimo?.chave === chave) ultimo.datas.push(dado)
    else meses.push({ chave, datas: [dado] })
  }
  return meses
}

/**
 * A7 no celular: a lista de requisitos sem data é o começo; tocar num requisito abre "Em qual data?", e depois
 * de colocar a tela já oferece o próximo sem data. "Por data" reúne as datas e o rodapé publica.
 */
export function PainelAdmCelular({ montagem, cronograma, classe, ano, aoAtualizar }: Propriedades) {
  const acoes = useAcoesDeMontagem(montagem.classe.id, ano, cronograma.id, montagem)
  const [vista, setVista] = useState<Vista>('sem-data')
  const [folhaParaId, setFolhaParaId] = useState<string | null>(null)
  const [colocacao, setColocacao] = useState<Colocacao | null>(null)
  const [desfeito, setDesfeito] = useState<string | null>(null)
  const [aulaEmEdicao, setAulaEmEdicao] = useState<AulaEmEdicao | null>(null)
  const [confirmandoPublicacao, setConfirmandoPublicacao] = useState(false)

  const requisitoPorId = new Map(montagem.requisitos.map((requisito) => [requisito.id, requisito]))
  const folhaPara = (folhaParaId && requisitoPorId.get(folhaParaId)) || null
  const semData = montagem.requisitos.filter((requisito) => requisito.data === null)
  const comData = montagem.requisitos.filter((requisito) => requisito.data !== null)
  const total = montagem.requisitos.length
  const conflitos = montagem.datas.filter((dado) => dado.conflito).length
  const proximo = semData.find((requisito) => requisito.id !== colocacao?.requisitoId) ?? null
  const publicado = cronograma.status === 'PUBLICADO'

  function abrirFolha(requisito: RequisitoDaMontagem) {
    setDesfeito(null)
    setFolhaParaId(requisito.id)
  }

  async function colocarPelaFolha(data: string) {
    if (!folhaPara) return
    const anterior = folhaPara.data
    if (!(await acoes.colocar(folhaPara.id, data))) return
    setFolhaParaId(null)
    setColocacao({ requisitoId: folhaPara.id, codigo: folhaPara.codigo, data, anterior })
  }

  async function desfazer() {
    if (!colocacao) return
    const { requisitoId, codigo, anterior } = colocacao
    const desfez = anterior ? await acoes.colocar(requisitoId, anterior) : await acoes.tirar(requisitoId)
    if (!desfez) return
    setColocacao(null)
    setDesfeito(anterior ? `${codigo} voltou para ${diaMes(anterior)}` : `${codigo} voltou a ficar sem data`)
  }

  async function tirar(requisito: RequisitoDaMontagem) {
    setDesfeito(null)
    if (await acoes.tirar(requisito.id)) setColocacao(null)
  }

  async function removerAula(dado: DataDaMontagem) {
    if (dado.aulaId && (await acoes.removerAula(dado.aulaId))) setColocacao(null)
  }

  async function publicar() {
    if (await acoes.publicar()) setConfirmandoPublicacao(false)
  }

  async function salvarAula(aula: AulaEmEdicao, data: string): Promise<boolean> {
    return aula.aulaId ? acoes.editarAula(aula.aulaId, aula.dados) : acoes.criarAula(data, aula.dados)
  }

  const faixaDeErro = acoes.erro && <FaixaDeMontagem erro={acoes.erro} aoAtualizar={() => { acoes.limparErro(); aoAtualizar() }} />

  function listaDeRequisitos(requisitos: RequisitoDaMontagem[]) {
    if (requisitos.length === 0) {
      return vista === 'sem-data' ? (
        <EstadoVazio titulo="Todos os requisitos têm data" descricao="Confira as datas em “Por data” e publique quando quiser." />
      ) : (
        <EstadoVazio titulo="Nenhum requisito com data ainda" descricao="Toque num requisito em “Sem data” para escolher a data." />
      )
    }
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-texto-2">Toque num requisito para escolher a data.</p>
        {requisitos.map((requisito) => (
          <button
            key={requisito.id}
            type="button"
            disabled={acoes.ocupada}
            onClick={() => abrirFolha(requisito)}
            className="flex min-h-[var(--touch-min)] items-start gap-3 rounded-controle border border-divisor bg-superficie p-3 text-left hover:bg-superficie-suave focus-visible:outline-2 focus-visible:outline-marca disabled:opacity-50"
          >
            <span className="w-10 shrink-0 text-sm font-bold text-marca">{requisito.codigo}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-base text-texto">{requisito.texto}</span>
              {requisito.campo && <EtiquetaCampo />}
            </span>
            <span className="shrink-0 self-center text-sm font-semibold text-marca underline">
              {requisito.data ? diaMes(requisito.data) : 'Data'}
            </span>
          </button>
        ))}
      </div>
    )
  }

  function porData() {
    return (
      <div className="flex flex-col gap-4">
        {montagem.datasLivres && (
          <Botao
            variante="secundario"
            className="self-start"
            onClick={() => setAulaEmEdicao({ data: null, aulaId: null, dados: { horario: null, local: null, titulo: null } })}
          >
            + Novo dia de classe
          </Botao>
        )}
        {montagem.datas.length === 0 ? (
          <EstadoVazio
            titulo={montagem.datasLivres ? 'Nenhum dia de classe ainda' : 'Nenhuma data de classe neste período'}
            descricao={montagem.datasLivres ? 'Crie um dia de classe para poder colocar requisitos nele.' : undefined}
          />
        ) : (
          agruparPorMes(montagem.datas).map(({ chave, datas }) => (
            <section key={chave} className="flex flex-col gap-2">
              <h3 className="font-titulo text-lg font-bold text-texto">{mesPorExtenso(`${chave}-01`)}</h3>
              <ul className="flex flex-col gap-3">
                {datas.map((dado) => (
                  <CartaoDaDataCelular
                    key={dado.data}
                    dado={dado}
                    requisitos={dado.requisitoIds.flatMap((id) => requisitoPorId.get(id) ?? [])}
                    desabilitada={acoes.ocupada}
                    aoEscolherData={abrirFolha}
                    aoTirar={(requisito) => void tirar(requisito)}
                    aoEditar={(aula) =>
                      setAulaEmEdicao({ data: aula.data, aulaId: aula.aulaId, dados: { horario: aula.horario, local: aula.local, titulo: aula.titulo } })
                    }
                    aoRemoverAula={(aula) => void removerAula(aula)}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    )
  }

  function resumoDoRodape() {
    if (conflitos > 0) {
      return (
        <>
          <strong className="text-perigo">{plural(conflitos, 'data com conflito', 'datas com conflito')}</strong>
          {semData.length > 0 && <span>{plural(semData.length, 'requisito sem data', 'requisitos sem data')}</span>}
        </>
      )
    }
    if (semData.length > 0) {
      return (
        <>
          <strong className="text-texto">{semData.length} sem data</strong>
          <span>Dá para publicar assim mesmo.</span>
        </>
      )
    }
    return <strong className="text-texto">Todos os requisitos têm data</strong>
  }

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Situação do cronograma" className="flex flex-col gap-2 rounded-cartao border border-divisor bg-superficie p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <SeloDoCronograma status={cronograma.status} />
          <span className="text-sm text-texto-2">
            Quem monta: <strong className="text-texto">{classe ? QUEM_MONTA[classe.quemMontaCronograma] : '—'}</strong>
            {' · '}
            <Link className="inline-flex min-h-[var(--touch-min)] items-center font-semibold text-marca underline" to={`/adm/classes?classe=${montagem.classe.id}`}>
              Alterar em Classes
            </Link>
          </span>
        </div>
        <p className="text-base font-semibold text-texto">
          {comData.length} de {total} requisitos com data
        </p>
        <BarraProgresso valor={total === 0 ? 0 : (comData.length / total) * 100} rotulo="Requisitos com data" />
      </section>

      {!folhaPara && faixaDeErro}

      {colocacao && (
        <div className="flex items-center gap-3 rounded-cartao border border-divisor bg-superficie px-4 py-2">
          <p role="status" className="flex-1 text-base font-semibold text-marca">
            {colocacao.codigo} ficou em {diaMes(colocacao.data)}
          </p>
          <Botao variante="texto" disabled={acoes.ocupada} onClick={() => void desfazer()}>
            Desfazer
          </Botao>
        </div>
      )}
      {desfeito && (
        <p role="status" className="text-base font-semibold text-texto">
          {desfeito}
        </p>
      )}

      {colocacao && (
        <section aria-label="Próximo sem data" className="flex flex-col gap-3 rounded-cartao border-2 border-marca bg-marca-tinta p-4">
          <h2 className="font-titulo text-lg font-bold text-texto">Próximo sem data</h2>
          {proximo ? (
            <>
              <p className="text-base text-texto">
                <strong className="text-marca">{proximo.codigo}</strong> · {proximo.texto}
              </p>
              <Botao largura="total" disabled={acoes.ocupada} onClick={() => abrirFolha(proximo)}>
                Escolher data do {proximo.codigo}
              </Botao>
            </>
          ) : (
            <p className="text-base text-texto">Todos os requisitos têm data.</p>
          )}
        </section>
      )}

      <Abas
        rotulo="Ver requisitos"
        ativa={vista}
        aoMudar={(id) => setVista(id === 'com-data' || id === 'por-data' ? id : 'sem-data')}
        abas={[
          { id: 'sem-data', rotulo: `Sem data · ${semData.length}` },
          { id: 'com-data', rotulo: `Com data · ${comData.length}` },
          { id: 'por-data', rotulo: 'Por data' },
        ]}
      />

      {vista === 'sem-data' && listaDeRequisitos(semData)}
      {vista === 'com-data' && listaDeRequisitos(comData)}
      {vista === 'por-data' && porData()}

      <div role="region" aria-label="Publicação" className="sticky bottom-0 z-10 flex items-center gap-3 border-t border-divisor bg-superficie py-3">
        {publicado ? (
          <p className="flex flex-col text-sm text-texto-2">
            <strong className="text-texto">Publicado</strong>
            <span>Os instrutores já veem as datas.</span>
          </p>
        ) : (
          <>
            <p className="flex flex-1 flex-col text-sm text-texto-2">{resumoDoRodape()}</p>
            <Botao
              variante={semData.length > 0 ? 'secundario' : 'primario'}
              carregando={acoes.ocupada}
              onClick={() => setConfirmandoPublicacao(true)}
            >
              Publicar…
            </Botao>
          </>
        )}
      </div>

      {folhaPara && (
        <FolhaEmQualData
          requisito={folhaPara}
          datas={montagem.datas}
          datasLivres={montagem.datasLivres}
          desabilitado={acoes.ocupada}
          aviso={faixaDeErro}
          aoEscolher={(data) => void colocarPelaFolha(data)}
          aoFechar={() => setFolhaParaId(null)}
        />
      )}

      {aulaEmEdicao && (
        <FormularioAula aula={aulaEmEdicao} desabilitado={acoes.ocupada} aoSalvar={salvarAula} aoFechar={() => setAulaEmEdicao(null)} />
      )}

      {confirmandoPublicacao && (
        <ConfirmarPublicacao
          nomeDaClasse={montagem.classe.nome}
          semData={semData.length}
          ocupada={acoes.ocupada}
          aviso={faixaDeErro}
          aoPublicar={() => void publicar()}
          aoContinuar={() => setConfirmandoPublicacao(false)}
        />
      )}
    </div>
  )
}
