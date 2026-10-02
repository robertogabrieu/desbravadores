import { Plus } from 'lucide-react'
import { useState } from 'react'
import type { CronogramaDaMontagem, DataDaMontagem, Montagem, RequisitoDaMontagem } from '../../api/montagem'
import { Abas } from '../../ui/Abas'
import { BarraProgresso } from '../../ui/BarraProgresso'
import { Botao } from '../../ui/Botao'
import { Confirmacao } from '../../ui/Confirmacao'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { EtiquetaCampo } from './EtiquetaCampo'
import { FaixaDeMontagem } from './FaixaDeMontagem'
import { FolhaAdicionar, FolhaMover } from './FolhasDoInstrutor'
import { FormularioAula } from './FormularioAula'
import type { AulaEmEdicao } from './FormularioAula'
import { LinhaData } from './LinhaData'
import { aceitaRequisitoNovo } from './datas'
import { useAcoesDeMontagem } from './useAcoesDeMontagem'

interface Propriedades {
  montagem: Montagem
  cronograma: CronogramaDaMontagem
  ano: number | undefined
  aoAtualizar: () => void
}

const AULA_VAZIA: AulaEmEdicao = { data: null, aulaId: null, dados: { horario: null, local: null, titulo: null } }

/** I3b com cronograma: abas Por data / Sem data; "Adicionar requisito" numa data ou o toque num requisito sem data agendam, cada ação grava. */
export function PainelInstrutor({ montagem, cronograma, ano, aoAtualizar }: Propriedades) {
  const acoes = useAcoesDeMontagem(montagem.classe.id, ano, cronograma.id, montagem)
  const [aba, setAba] = useState('data')
  const [dataAberta, setDataAberta] = useState<DataDaMontagem | null>(null)
  const [emMovimento, setEmMovimento] = useState<RequisitoDaMontagem | null>(null)
  const [aAgendar, setAAgendar] = useState<RequisitoDaMontagem | null>(null)
  const [aulaEmEdicao, setAulaEmEdicao] = useState<AulaEmEdicao | null>(null)
  const [confirmandoEnvio, setConfirmandoEnvio] = useState(false)

  const semData = montagem.requisitos.filter((requisito) => requisito.data === null)
  const total = montagem.requisitos.length
  const requisitoPorId = new Map(montagem.requisitos.map((requisito) => [requisito.id, requisito]))

  async function colocarVarios(ids: string[]): Promise<boolean> {
    const alvo = dataAberta
    if (!alvo) return false
    for (const id of ids) {
      if (!(await acoes.colocar(id, alvo.data))) return false
    }
    return true
  }

  async function enviar() {
    setConfirmandoEnvio(false)
    await acoes.enviar()
  }

  async function salvarAula(aula: AulaEmEdicao, data: string): Promise<boolean> {
    return aula.aulaId ? acoes.editarAula(aula.aulaId, aula.dados) : acoes.criarAula(data, aula.dados)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between text-sm font-semibold text-texto-2">
          <span>
            {total - semData.length} de {total} requisitos com data
          </span>
          <span>{semData.length} sem data</span>
        </div>
        <BarraProgresso valor={total === 0 ? 0 : ((total - semData.length) / total) * 100} rotulo="Requisitos com data" />
      </div>

      <Abas
        rotulo="Visão"
        abas={[
          { id: 'data', rotulo: 'Por data' },
          { id: 'sem', rotulo: `Sem data (${semData.length})` },
        ]}
        ativa={aba}
        aoMudar={setAba}
      />

      {acoes.erro && <FaixaDeMontagem erro={acoes.erro} aoAtualizar={() => { acoes.limparErro(); aoAtualizar() }} />}

      {aba === 'data' ? (
        <>
          <p className="text-sm text-texto-2">Toque em “Adicionar requisito” numa data para agendar.</p>
          {montagem.datasLivres && (
            <Botao variante="secundario" onClick={() => setAulaEmEdicao(AULA_VAZIA)}>
              + Nova aula
            </Botao>
          )}
          {montagem.datas.length === 0 ? (
            <EstadoVazio titulo={montagem.datasLivres ? 'Nenhuma aula ainda' : 'Nenhuma data de aula neste período'} />
          ) : (
            <ul className="flex flex-col gap-2">
              {montagem.datas.map((dado) => (
                <LinhaData
                  key={dado.data}
                  dado={dado}
                  requisitos={dado.requisitoIds.flatMap((id) => requisitoPorId.get(id) ?? [])}
                  destaqueCampo={dado.situacao.bomParaCampo}
                  desabilitada={acoes.ocupada}
                  aoTirar={(requisito) => void acoes.tirar(requisito.id)}
                  aoRemoverAula={(aula) => aula.aulaId && void acoes.removerAula(aula.aulaId)}
                  aoMover={setEmMovimento}
                  aoEditar={(aula) =>
                    setAulaEmEdicao({ data: aula.data, aulaId: aula.aulaId, dados: { horario: aula.horario, local: aula.local, titulo: aula.titulo } })
                  }
                  acaoDaData={
                    aceitaRequisitoNovo(montagem, dado) && (
                      <button
                        type="button"
                        aria-label="Adicionar requisito nesta data"
                        disabled={acoes.ocupada}
                        onClick={() => setDataAberta(dado)}
                        className="flex min-h-[var(--touch-min)] shrink-0 items-center gap-1 rounded-botao border border-marca bg-superficie px-3 text-sm font-semibold text-marca disabled:opacity-50"
                      >
                        <Plus aria-hidden className="size-5" />
                        Adicionar requisito
                      </button>
                    )
                  }
                />
              ))}
            </ul>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-texto-2">Toque num requisito para escolher a data.</p>
          {semData.length === 0 && <EstadoVazio titulo="Todos os requisitos já têm data" />}
          {semData.map((requisito) => (
            <button
              key={requisito.id}
              type="button"
              disabled={acoes.ocupada}
              onClick={() => setAAgendar(requisito)}
              className="flex min-h-[var(--touch-min)] items-center gap-3 rounded-controle border border-divisor bg-superficie p-3 text-left focus-visible:outline-2 focus-visible:outline-marca disabled:opacity-50"
            >
              <span className="w-10 shrink-0 text-sm font-bold text-marca">{requisito.codigo}</span>
              <span className="min-w-0 flex-1 text-base text-texto">{requisito.texto}</span>
              {requisito.campo && <EtiquetaCampo />}
            </button>
          ))}
        </div>
      )}

      <Botao
        largura="total"
        carregando={acoes.ocupada}
        disabled={cronograma.status !== 'RASCUNHO'}
        onClick={() => setConfirmandoEnvio(true)}
      >
        Enviar para o Adm publicar
      </Botao>

      <Confirmacao
        aberta={confirmandoEnvio}
        titulo="Enviar para o Adm publicar?"
        rotuloConfirmar="Enviar"
        aoConfirmar={() => void enviar()}
        aoCancelar={() => setConfirmandoEnvio(false)}
      >
        O Adm vai revisar e publicar o cronograma. Se você mudar algo depois, ele volta a ser rascunho.
      </Confirmacao>

      {dataAberta && (
        <FolhaAdicionar
          dado={dataAberta}
          livres={semData}
          desabilitado={acoes.ocupada}
          aoConfirmar={colocarVarios}
          aoFechar={() => setDataAberta(null)}
        />
      )}
      {emMovimento && (
        <FolhaMover
          requisito={emMovimento}
          datas={montagem.datas}
          desabilitado={acoes.ocupada}
          aoEscolher={(data) => acoes.colocar(emMovimento.id, data)}
          aoFechar={() => setEmMovimento(null)}
        />
      )}
      {aAgendar && (
        <FolhaMover
          titulo={`Agendar ${aAgendar.codigo} para`}
          requisito={aAgendar}
          datas={montagem.datas.filter((dado) => aceitaRequisitoNovo(montagem, dado))}
          desabilitado={acoes.ocupada}
          aoEscolher={(data) => acoes.colocar(aAgendar.id, data)}
          aoFechar={() => setAAgendar(null)}
        />
      )}
      {aulaEmEdicao && (
        <FormularioAula aula={aulaEmEdicao} desabilitado={acoes.ocupada} aoSalvar={salvarAula} aoFechar={() => setAulaEmEdicao(null)} />
      )}
    </div>
  )
}
