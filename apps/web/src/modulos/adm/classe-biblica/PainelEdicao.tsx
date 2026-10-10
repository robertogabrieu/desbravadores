import { hojeNoFuso } from '@desbravadores/shared'
import { useId, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { usePainelDaEdicao } from '../../../api/classe-biblica'
import type { PainelDaEdicao } from '../../../api/classe-biblica'
import { useConexao, usePacote } from '../../../offline'
import { Abas } from '../../../ui/Abas'
import { estiloDoBotao } from '../../../ui/Botao'
import { CabecalhoDaPagina } from '../../../ui/CabecalhoDaPagina'
import { EstadoVazio } from '../../../ui/EstadoVazio'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { diaMes } from '../../classe-biblica/formatos'
import { FUSO_PADRAO_DO_CLUBE, horaCurta, juntarNomes } from '../formatos'
import { FrequenciaDoGrupo } from './FrequenciaDoGrupo'
import { MaterialDoGrupo } from './MaterialDoGrupo'
import { DIAS_DA_SEMANA, dataCurta, diasNoPlural, nomeCurtoDaEdicao } from './useRascunhoDaEdicao'

type Grupo = PainelDaEdicao['grupos'][number]
type Encontro = Grupo['encontros'][number]
type Mudanca = Grupo['mudancas'][number]

const DIAS_CURTOS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const diaDaSemanaDe = (data: string): number => new Date(`${data}T12:00:00Z`).getUTCDay()
const capitalizar = (texto: string): string => texto.charAt(0).toUpperCase() + texto.slice(1)

const caminhoDaChamada = (encontroId: string, grupoId: string) => `/adm/classe-biblica/encontros/${encontroId}/grupos/${grupoId}/chamada`
const caminhoDoRemarcar = (encontroId: string) => `/adm/classe-biblica/encontros/${encontroId}/remarcar`

/** A API só abre a chamada a partir do dia do encontro, no fuso do clube; atrasada continua valendo (regra 8). */
function useChamadaAberta(): (encontro: Encontro) => boolean {
  const { pacote } = usePacote()
  const hoje = hojeNoFuso(pacote?.clube.fuso ?? FUSO_PADRAO_DO_CLUBE, new Date())
  return (encontro) => encontro.data <= hoje
}

function resumoDaEdicao({ edicao }: PainelDaEdicao): string {
  const quando = `${capitalizar(diasNoPlural(edicao.diaSemana))}${edicao.horario ? ` às ${horaCurta(edicao.horario)}` : ''}`
  const periodo = edicao.inicio && edicao.fim ? `${diaMes(edicao.inicio)} a ${diaMes(edicao.fim)}` : null
  return [quando, edicao.local, periodo].filter(Boolean).join(' · ')
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  const id = useId()
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 border-t border-borda-controle pt-5">
      <h2 id={id} className="font-titulo text-lg font-bold text-texto">{titulo}</h2>
      {children}
    </section>
  )
}

function ProximoEncontro({ grupo, painel }: { grupo: Grupo; painel: PainelDaEdicao }) {
  const chamadaAberta = useChamadaAberta()
  const encontro = grupo.proximoEncontro
  if (!encontro) return <p className="text-base text-texto-2">Nenhum encontro por vir nesta edição.</p>
  const dbvs = grupo.unidades.reduce((soma, unidade) => soma + unidade.dbvs, 0)
  const onde = [encontro.local, `${juntarNomes(grupo.unidades.map((u) => u.nome))} (${dbvs} DBVs)`].filter(Boolean).join(' · ')
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="text-xl font-bold text-texto">
          {`${DIAS_DA_SEMANA[diaDaSemanaDe(encontro.data)]}, ${diaMes(encontro.data)} · ${horaCurta(encontro.horario)}`}
        </p>
        <p className="text-base text-texto-2">{onde}</p>
      </div>
      {(painel.podeFazerChamada || painel.podeGerenciar) && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {painel.podeFazerChamada && (chamadaAberta(encontro) ? (
            <Link to={caminhoDaChamada(encontro.id, grupo.id)} className={estiloDoBotao()}>
              {`Fazer a chamada do ${grupo.nome}`}
            </Link>
          ) : (
            <p className="text-base text-texto-2">A chamada abre no dia do encontro.</p>
          ))}
          {painel.podeGerenciar && (
            <Link to={caminhoDoRemarcar(encontro.id)} className={estiloDoBotao({ variante: 'secundario' })}>
              Remarcar ou cancelar este encontro
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

function Frequencia({ grupo }: { grupo: Grupo }) {
  const [aberta, setAberta] = useState(false)
  const idLista = useId()
  const porVir = grupo.encontrosPorVir === 1 ? '1 ainda por vir' : `${grupo.encontrosPorVir} ainda por vir`
  const feitos = grupo.encontrosFeitos === 1 ? '1 encontro feito' : `${grupo.encontrosFeitos} encontros feitos`
  return (
    <div className="flex flex-col gap-3">
      {grupo.frequenciaMedia === null ? (
        <p className="text-base text-texto-2">{`Ainda sem chamada registrada · ${porVir}`}</p>
      ) : (
        <p className="text-base text-texto">
          <strong className="text-2xl font-extrabold">{`${grupo.frequenciaMedia}%`}</strong>{' '}
          <span>{`de presença média em ${feitos} · ${porVir}`}</span>
        </p>
      )}
      {grupo.abaixoDaMetade > 0 && (
        <p className="text-base text-texto">
          {grupo.abaixoDaMetade === 1
            ? '1 desbravador veio a menos da metade dos encontros.'
            : `${grupo.abaixoDaMetade} desbravadores vieram a menos da metade dos encontros.`}
        </p>
      )}
      <button
        type="button"
        aria-expanded={aberta}
        aria-controls={idLista}
        onClick={() => setAberta((valor) => !valor)}
        className={estiloDoBotao({ variante: 'texto', className: 'w-fit px-2' })}
      >
        {aberta ? 'Esconder a frequência de cada um' : 'Ver a frequência de cada um'}
      </button>
      <div id={idLista}>{aberta && <FrequenciaDoGrupo grupoId={grupo.id} />}</div>
    </div>
  )
}

/** "19/09 (sáb)" quando o encontro não caiu no dia da edição. */
function rotuloDaData(data: string, diaSemana: number): string {
  const dia = diaDaSemanaDe(data)
  return dia === diaSemana ? diaMes(data) : `${diaMes(data)} (${DIAS_CURTOS[dia]})`
}

/** A data do encontro e, ao lado, as unidades que formavam o grupo naquele dia (D31). */
function DataEUnidades({ encontro, diaSemana }: { encontro: Encontro; diaSemana: number }) {
  return (
    <span className="text-base">
      <span className="font-semibold text-texto">{rotuloDaData(encontro.data, diaSemana)}</span>
      {encontro.unidades.length > 0 && <>{' '}<span className="text-texto-2">{juntarNomes(encontro.unidades)}</span></>}
    </span>
  )
}

function textoDaMudanca({ data, unidade, tipo, outroGrupo }: Mudanca): string {
  const outro = outroGrupo ? (tipo === 'SAIU' ? ` (foi para o ${outroGrupo})` : ` (veio do ${outroGrupo})`) : ''
  return `${diaMes(data)} · ${unidade} ${tipo === 'SAIU' ? 'saiu do grupo' : 'entrou no grupo'}${outro}`
}

function LinhaDaMudanca({ mudanca }: { mudanca: Mudanca }) {
  return (
    <li className="flex items-baseline gap-2 py-2 text-sm text-texto-2">
      <span aria-hidden="true">▸</span>
      <span>{textoDaMudanca(mudanca)}</span>
    </li>
  )
}

type ItemDaLinhaDoTempo = { tipo: 'encontro'; encontro: Encontro } | { tipo: 'mudanca'; mudanca: Mudanca }

/** Encontros e trocas numa linha do tempo só, data ↓. A troca vale a partir do dia dela: fica abaixo do encontro desse dia. */
function linhaDoTempo(encontros: Encontro[], mudancas: Mudanca[]): ItemDaLinhaDoTempo[] {
  const restantes = [...mudancas]
  const itens: ItemDaLinhaDoTempo[] = []
  for (const encontro of encontros) {
    while (restantes.length > 0 && restantes[0].data > encontro.data) itens.push({ tipo: 'mudanca', mudanca: restantes.shift()! })
    itens.push({ tipo: 'encontro', encontro })
  }
  return [...itens, ...restantes.map((mudanca): ItemDaLinhaDoTempo => ({ tipo: 'mudanca', mudanca }))]
}

function LinhaDoEncontro({ encontro, grupo, painel }: { encontro: Encontro; grupo: Grupo; painel: PainelDaEdicao }) {
  const chamadaAberta = useChamadaAberta()
  const remarcado = encontro.dataOriginal
    ? <p className="text-sm text-texto-2">{`${dataCurta(encontro.dataOriginal)} · remarcado para ${dataCurta(encontro.data)}`}</p>
    : null

  if (encontro.cancelado) {
    return (
      <li className="flex items-center justify-between gap-3 py-2">
        <span className="flex flex-col">
          <span className="text-base text-texto-2 line-through">{dataCurta(encontro.data)}</span>
          <span className="text-sm text-texto-2">{`Cancelado: ${encontro.motivo ?? 'sem motivo'}`}</span>
        </span>
        {painel.podeGerenciar && (
          <Link
            to={caminhoDoRemarcar(encontro.id)}
            aria-label={`Ver o encontro cancelado de ${diaMes(encontro.data)}`}
            className={estiloDoBotao({ variante: 'texto', className: 'px-3' })}
          >
            Ver
          </Link>
        )}
      </li>
    )
  }

  if (!encontro.chamada) {
    if (!chamadaAberta(encontro)) return <li className="py-2">{remarcado}</li>
    return (
      <li className="flex flex-col gap-1 py-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="flex flex-col">
            <DataEUnidades encontro={encontro} diaSemana={painel.edicao.diaSemana} />
            <span className="text-sm text-texto-2">Sem chamada</span>
          </span>
          {painel.podeFazerChamada && (
            <Link to={caminhoDaChamada(encontro.id, grupo.id)} className={estiloDoBotao({ variante: 'texto', className: 'px-3' })}>
              {`Fazer a chamada do ${grupo.nome}`}
            </Link>
          )}
        </div>
        {remarcado}
      </li>
    )
  }

  const { presentes, total, participaram } = encontro.chamada
  const ativos = participaram === 1 ? '1 participou ativamente' : `${participaram} participaram ativamente`
  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="flex flex-col">
          <DataEUnidades encontro={encontro} diaSemana={painel.edicao.diaSemana} />
          <span className="text-sm text-texto-2">{`${presentes} de ${total} presentes · ${ativos}`}</span>
        </span>
        <Link
          to={caminhoDaChamada(encontro.id, grupo.id)}
          aria-label={`Ver a chamada de ${diaMes(encontro.data)}`}
          className={estiloDoBotao({ variante: 'texto', className: 'px-3' })}
        >
          Ver
        </Link>
      </div>
      {remarcado}
    </li>
  )
}

function EncontrosFeitos({ grupo, painel }: { grupo: Grupo; painel: PainelDaEdicao }) {
  // O encontro de hoje remarcado já está em "Próximo encontro": não se repete aqui.
  const encontros = grupo.encontros.filter((encontro) => encontro.id !== grupo.proximoEncontro?.id)
  if (encontros.length === 0) {
    return <p className="text-base text-texto-2">Nenhum encontro feito ainda. Cada chamada registrada aparece aqui.</p>
  }
  return (
    <ul className="flex flex-col divide-y divide-borda-controle">
      {linhaDoTempo(encontros, grupo.mudancas).map((item) => item.tipo === 'encontro'
        ? <LinhaDoEncontro key={item.encontro.id} encontro={item.encontro} grupo={grupo} painel={painel} />
        : <LinhaDaMudanca key={`${item.mudanca.data}-${item.mudanca.unidade}-${item.mudanca.tipo}`} mudanca={item.mudanca} />)}
    </ul>
  )
}

function Conteudo({ painel }: { painel: PainelDaEdicao }) {
  const { edicao, grupos, podeGerenciar } = painel
  const [abaAtiva, setAbaAtiva] = useState(grupos[0]?.id ?? '')
  const idDoPainel = useId()
  const grupo = grupos.find((g) => g.id === abaAtiva) ?? grupos[0]

  const cabecalho = (
    <CabecalhoDaPagina
      voltar={{ para: '/adm/classe-biblica', rotulo: 'Classe Bíblica' }}
      sobretitulo="Classe Bíblica"
      titulo={edicao.nome ? nomeCurtoDaEdicao(edicao.nome) : 'Edição sem nome'}
      apoio={<span>{resumoDaEdicao(painel)}</span>}
      acoes={podeGerenciar && (
        <Link to={`/adm/classe-biblica/${edicao.id}/etapa/1`} className={estiloDoBotao({ variante: 'secundario' })}>
          Editar edição
        </Link>
      )}
    />
  )

  if (!grupo) {
    return (
      <div className="flex flex-col gap-5">
        {cabecalho}
        {podeGerenciar ? (
          <EstadoVazio
            titulo="Esta edição ainda não tem grupos"
            descricao="Cada grupo junta unidades que estudam juntas. A chamada é feita por grupo."
            acao={<Link to={`/adm/classe-biblica/${edicao.id}/etapa/2`} className={estiloDoBotao()}>Montar os grupos</Link>}
          />
        ) : (
          <EstadoVazio
            titulo="Nenhum grupo seu nesta edição"
            descricao="Os grupos desta edição não têm desbravadores sob a sua responsabilidade. Se isso estiver errado, fale com a direção do clube."
          />
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {cabecalho}
      {grupos.length > 1 && (
        <Abas
          rotulo="Grupos da edição"
          abas={grupos.map((g) => ({ id: g.id, rotulo: g.nome }))}
          ativa={grupo.id}
          aoMudar={(id) => setAbaAtiva(id)}
          idDoPainel={idDoPainel}
        />
      )}
      <div id={idDoPainel} role={grupos.length > 1 ? 'tabpanel' : undefined} aria-label={grupo.nome} className="flex flex-col gap-5">
        <Secao titulo="Próximo encontro">
          <ProximoEncontro grupo={grupo} painel={painel} />
        </Secao>
        <Secao titulo="Frequência do grupo">
          <Frequencia key={grupo.id} grupo={grupo} />
        </Secao>
        <Secao titulo="Material do grupo">
          <MaterialDoGrupo key={grupo.id} grupoId={grupo.id} material={grupo.material} podeGerenciar={podeGerenciar} />
        </Secao>
        <Secao titulo="Encontros feitos">
          <EncontrosFeitos grupo={grupo} painel={painel} />
        </Secao>
      </div>
    </div>
  )
}

/** Painel da edição: um grupo por aba, com o próximo encontro, a frequência, o material e os encontros feitos. */
export function PainelEdicao() {
  const { id = '' } = useParams()
  const painel = usePainelDaEdicao(id)
  const { modo } = useConexao()
  return (
    <div className="flex flex-col gap-5 py-4">
      {painel.isError && <ErroDeCarga erro={painel.error} aoTentarDeNovo={() => void painel.refetch()} />}
      {painel.isPending && (modo === 'SEM_CONEXAO' ? <DisponivelComInternet /> : <Carregando rotulo="Carregando a edição" />)}
      {painel.data && <Conteudo painel={painel.data} />}
    </div>
  )
}
