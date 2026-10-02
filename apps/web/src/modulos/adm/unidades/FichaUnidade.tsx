import { ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMembrosUnidade, useSemMembros } from '../../../api/leitura'
import type { Membro, Unidade } from '../../../api/leitura'
import { useUnidade } from '../../../api/unidades'
import { useConexao } from '../../../offline'
import { estiloDoBotao } from '../../../ui/Botao'
import { Botao } from '../../../ui/Botao'
import { CabecalhoDaPagina } from '../../../ui/CabecalhoDaPagina'
import { Cartao } from '../../../ui/Cartao'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { EstadoNaoEncontrado, ehNaoEncontrado } from '../../../ui/EstadoNaoEncontrado'
import { EstadoVazio } from '../../../ui/EstadoVazio'
import { ListaDePares } from '../../../ui/ListaDePares'
import { juntarNomes } from '../formatos'
import { useEstadoDeVolta, useVoltar } from '../navegacao'
import { AdicionarSemUnidade } from './AdicionarSemUnidade'
import { ReunioesDoMes } from './ReunioesDoMes'
import { rotuloDoTipo } from './tipos'
import { useState } from 'react'

const LISTA_DE_UNIDADES = { para: '/adm/unidades', rotulo: 'Ver as unidades' }

/** Carrega a unidade da rota e cuida dos estados de carga, erro, não encontrado e sem conexão. */
export function ComUnidade({ aoCarregar }: { aoCarregar: (unidade: Unidade) => ReactNode }) {
  const { id = '' } = useParams()
  const consulta = useUnidade(id)
  const { modo } = useConexao()

  let corpo: ReactNode
  if (consulta.data) corpo = aoCarregar(consulta.data)
  else if (consulta.isError && ehNaoEncontrado(consulta.error)) corpo = <EstadoNaoEncontrado registro="esta unidade" lista={LISTA_DE_UNIDADES} />
  else if (modo === 'SEM_CONEXAO') corpo = <DisponivelComInternet />
  else if (consulta.isError) corpo = <ErroDeCarga erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />
  else corpo = <Carregando rotulo="Carregando a unidade" />

  return <div className="flex flex-col gap-5 p-4">{corpo}</div>
}

export const FichaUnidade = () => <ComUnidade aoCarregar={(unidade) => <FichaCarregada unidade={unidade} />} />

function totalPorExtenso(unidade: Unidade): string {
  const feminina = unidade.tipo === 'FEMININA'
  const [singular, plural] = feminina ? ['desbravadora', 'desbravadoras'] : ['desbravador', 'desbravadores']
  return `${unidade.totalMembros} ${unidade.totalMembros === 1 ? singular : plural}`
}

function LinhaDoMembro({ membro, unidadeNome }: { membro: Membro; unidadeNome: string }) {
  const estado = useEstadoDeVolta(unidadeNome)
  return (
    <li>
      <Link
        to={`/adm/desbravadores/${membro.dbvId}`}
        state={estado}
        className="flex min-h-[var(--touch-min)] items-center justify-between gap-3 rounded-botao px-2 py-2 hover:bg-superficie-suave focus-visible:outline-2 focus-visible:outline-marca"
      >
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-1.5 text-base font-semibold break-words text-texto">
            {membro.nome}
            <ExternalLink aria-hidden className="size-4 shrink-0 text-marca" />
          </span>
          <span className="text-sm text-texto-2">
            {membro.classeAtual?.nome ?? 'Sem classe'} · {membro.idade} anos
          </span>
        </span>
        <span className="text-base font-semibold text-texto">{membro.frequencia == null ? '—' : `${membro.frequencia}%`}</span>
      </Link>
    </li>
  )
}

function SecaoMembros({ unidade }: { unidade: Unidade }) {
  const membros = useMembrosUnidade(unidade.id)
  const semUnidade = useSemMembros()
  const [adicionando, setAdicionando] = useState(false)

  const estadoDeVolta = useEstadoDeVolta(unidade.nome)
  const vazia = membros.data?.length === 0

  let acao: ReactNode = null
  if (semUnidade.data && unidade.ativa) {
    if (semUnidade.data.length > 0) {
      acao = (
        <Botao variante="secundario" onClick={() => setAdicionando(true)}>
          Adicionar desbravador sem unidade
        </Botao>
      )
    } else if (vazia) {
      acao = (
        <Link to="/adm/desbravadores/novo" state={estadoDeVolta} className={estiloDoBotao({ variante: 'secundario' })}>
          Cadastrar desbravador
        </Link>
      )
    }
  }

  let corpo: ReactNode
  if (membros.isError) corpo = <ErroDeCarga erro={membros.error} aoTentarDeNovo={() => void membros.refetch()} />
  else if (!membros.data) corpo = <Carregando rotulo="Carregando os membros" />
  else if (membros.data.length === 0) corpo = <EstadoVazio titulo="Nenhum desbravador nesta unidade" acao={acao} />
  else
    corpo = (
      <>
        <ul className="flex flex-col">
          {membros.data.map((membro) => (
            <LinhaDoMembro key={membro.dbvId} membro={membro} unidadeNome={unidade.nome} />
          ))}
        </ul>
        {acao && <div>{acao}</div>}
      </>
    )

  return (
    <Cartao role="region" aria-labelledby="titulo-membros" className="flex flex-col gap-3">
      <h2 id="titulo-membros" className="font-titulo text-lg font-bold">
        Membros
      </h2>
      {corpo}
      {adicionando && <AdicionarSemUnidade unidade={unidade} aoFechar={() => setAdicionando(false)} />}
    </Cartao>
  )
}

function FichaCarregada({ unidade }: { unidade: Unidade }) {
  const voltar = useVoltar({ para: '/adm/unidades', rotulo: 'Unidades' })
  return (
    <>
      <CabecalhoDaPagina
        voltar={voltar}
        sobretitulo={`Unidade ${rotuloDoTipo(unidade.tipo).toLowerCase()} · ${unidade.ativa ? 'Ativa' : 'Inativa'}`}
        titulo={unidade.nome}
        apoio={unidade.gritoDeGuerra ? <span>“{unidade.gritoDeGuerra}”</span> : undefined}
        acoes={
          <Link to={`/adm/unidades/${unidade.id}/editar`} state={{ voltarPara: voltar.para, voltarRotulo: voltar.rotulo }} className={estiloDoBotao()}>
            Editar
          </Link>
        }
      />

      <Cartao>
        <ListaDePares
          colunas={3}
          pares={[
            {
              rotulo: 'Conselheiros',
              valor: unidade.conselheiros.length === 0 ? 'Sem conselheiro' : juntarNomes(unidade.conselheiros.map((c) => c.nome)),
            },
            { rotulo: 'Membros', valor: totalPorExtenso(unidade) },
            { rotulo: 'Situação', valor: unidade.ativa ? 'Ativa' : 'Inativa' },
          ]}
        />
      </Cartao>

      <SecaoMembros unidade={unidade} />
      <ReunioesDoMes unidadeId={unidade.id} />
    </>
  )
}
