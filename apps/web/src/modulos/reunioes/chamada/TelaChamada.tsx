import { hojeNoFuso } from '@desbravadores/shared'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { ErroDaApi } from '../../../api/cliente'
import { useReuniao, useReunioes } from '../../../api/reunioes'
import { useConexao, usePacote } from '../../../offline'
import type { PacoteGuardado } from '../../../offline'
import { Campo } from '../../../ui/Campo'
import { Selecao } from '../../../ui/Selecao'
import { ChamadaErro, ChamadaMoldura, ChamadaVazia, EsqueletoChamada } from './EstadosChamada'
import { FormularioChamada, dataCurta } from './FormularioChamada'
import { baseDoDetalhe, baseDoPacote } from './estado'
import type { BaseReuniao } from './estado'

type Pacote = NonNullable<PacoteGuardado['pacote']>

const DIA_MS = 86_400_000

function somarDias(data: string, dias: number): string {
  return new Date(Date.parse(`${data}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10)
}

const porNome = <T extends { nome: string }>(a: T, b: T): number => a.nome.localeCompare(b.nome, 'pt-BR')

export function TelaChamada() {
  const { id } = useParams()
  const { modo } = useConexao()
  const guardado = usePacote()
  const { pacote } = guardado

  let conteudo
  if (guardado.carregando) conteudo = <EsqueletoChamada />
  else if (!pacote) {
    conteudo =
      modo === 'SEM_CONEXAO' ? (
        <ChamadaVazia titulo="Disponível quando houver internet" descricao="A lista de desbravadores ainda não foi baixada neste aparelho." />
      ) : (
        <ChamadaVazia titulo="A lista de desbravadores ainda não foi baixada" descricao="Aguarde um instante e abra a chamada de novo." />
      )
  } else if (id) conteudo = modo === 'SEM_CONEXAO' ? <EdicaoGuardada id={id} pacote={pacote} baixadoEm={guardado.baixadoEm} /> : <EdicaoDoServidor id={id} pacote={pacote} baixadoEm={guardado.baixadoEm} />
  else conteudo = <ChamadaNova pacote={pacote} baixadoEm={guardado.baixadoEm} />

  return <ChamadaMoldura>{conteudo}</ChamadaMoldura>
}

interface PropriedadesModo {
  pacote: Pacote
  baixadoEm: number | null
}

function ChamadaNova({ pacote, baixadoEm }: PropriedadesModo) {
  const unidades = [...pacote.unidades].sort(porNome)
  const hoje = hojeNoFuso(pacote.clube.fuso, new Date())
  const minimo = somarDias(hoje, -30)
  const [escolhida, setEscolhida] = useState<string | null>(null)
  const [data, setData] = useState(hoje)
  const unidade = unidades.find((u) => u.id === escolhida) ?? unidades[0]

  if (!unidade) return <ChamadaVazia titulo="Você ainda não tem unidade para registrar chamada" descricao="Avise o Adm para ligar você a uma unidade." />
  if (unidade.membros.length === 0) return <ChamadaVazia titulo="Nenhum desbravador nesta unidade" descricao="Avise o Adm para cadastrar os membros." />

  const dataValida = data >= minimo && data <= hoje
  return (
    <>
      {unidades.length > 1 && (
        <Selecao rotulo="Unidade" value={unidade.id} onChange={(e) => setEscolhida(e.target.value)}>
          {unidades.map((u) => (
            <option key={u.id} value={u.id}>
              {u.nome}
            </option>
          ))}
        </Selecao>
      )}
      <Campo
        rotulo="Data"
        type="date"
        value={data}
        min={minimo}
        max={hoje}
        onChange={(e) => setData(e.target.value)}
        erro={dataValida ? undefined : `Escolha uma data entre ${dataCurta(minimo)} e hoje.`}
      />
      {dataValida && (
        <ChamadaDaData key={`${unidade.id}:${data}`} pacote={pacote} baixadoEm={baixadoEm} unidade={unidade} data={data} />
      )}
    </>
  )
}

type Unidade = Pacote['unidades'][number]

interface PropriedadesDaData extends PropriedadesModo {
  unidade: Unidade
  data: string
}

/**
 * A base é o servidor (com internet) ou o pacote (sem conexão); o que está na fila entra por cima, dentro do formulário.
 * O modo é lido uma vez, ao abrir: se a conexão cair no meio, a base não troca e a tela não remonta.
 */
function ChamadaDaData(props: PropriedadesDaData) {
  const { modo } = useConexao()
  const [modoAoAbrir] = useState(modo)
  return modoAoAbrir === 'SEM_CONEXAO' ? <ChamadaComBaseDoPacote {...props} /> : <ChamadaComBaseDoServidor {...props} />
}

function ChamadaComBaseDoPacote({ pacote, baixadoEm, unidade, data }: PropriedadesDaData) {
  const existente = pacote.reunioesRecentes.find((r) => r.unidadeId === unidade.id && r.data === data)
  return <FormularioChamada pacote={pacote} baixadoEm={baixadoEm} unidade={unidade} data={data} base={existente ? baseDoPacote(existente) : null} />
}

function ChamadaComBaseDoServidor(props: PropriedadesDaData) {
  const { unidade, data } = props
  const lista = useReunioes(unidade.id, data.slice(0, 7))
  if (lista.isPending) return <EsqueletoChamada />
  // Sem resposta do servidor a lista não diz nada: cai para o que o aparelho guardou.
  if (!lista.data) return <ChamadaComBaseDoPacote {...props} />
  const existente = lista.data.find((r) => r.data === data)
  return existente ? <ChamadaComReuniaoDoServidor {...props} reuniaoId={existente.id} /> : <ChamadaComBaseDoPacote {...props} />
}

function ChamadaComReuniaoDoServidor({ reuniaoId, ...props }: PropriedadesDaData & { reuniaoId: string }) {
  const detalhe = useReuniao(reuniaoId)
  if (detalhe.isPending) return <EsqueletoChamada />
  // Uma releitura que falha depois não tira a reunião que já chegou.
  if (!detalhe.data) return <ChamadaComBaseDoPacote {...props} />
  return <FormularioChamada pacote={props.pacote} baixadoEm={props.baixadoEm} unidade={props.unidade} data={props.data} base={baseDoDetalhe(detalhe.data)} />
}

interface PropriedadesEdicao extends PropriedadesModo {
  id: string
}

function EdicaoGuardada({ id, pacote, baixadoEm }: PropriedadesEdicao) {
  const reuniao = pacote.reunioesRecentes.find((r) => r.id === id)
  return <EdicaoComBase pacote={pacote} baixadoEm={baixadoEm} unidadeId={reuniao?.unidadeId} data={reuniao?.data} base={reuniao ? baseDoPacote(reuniao) : null} />
}

function EdicaoDoServidor({ id, pacote, baixadoEm }: PropriedadesEdicao) {
  const consulta = useReuniao(id)
  const guardada = pacote.reunioesRecentes.find((r) => r.id === id)
  if (consulta.isPending) return <EsqueletoChamada />
  if (consulta.isError) {
    const semResposta = !(consulta.error instanceof ErroDaApi) || consulta.error.classe !== 'RECUSA'
    if (guardada && semResposta) return <EdicaoGuardada id={id} pacote={pacote} baixadoEm={baixadoEm} />
    return <ChamadaErro mensagem={consulta.error.message} aoTentar={() => void consulta.refetch()} />
  }
  return (
    <EdicaoComBase
      pacote={pacote}
      baixadoEm={baixadoEm}
      unidadeId={consulta.data.unidade.id}
      data={consulta.data.data}
      base={baseDoDetalhe(consulta.data)}
    />
  )
}

interface PropriedadesComBase extends PropriedadesModo {
  unidadeId: string | undefined
  data: string | undefined
  base: BaseReuniao | null
}

function EdicaoComBase({ pacote, baixadoEm, unidadeId, data, base }: PropriedadesComBase) {
  const unidade = pacote.unidades.find((u) => u.id === unidadeId)
  if (!base || !data || !unidade) {
    return <ChamadaVazia titulo="Esta chamada não está neste aparelho" descricao="Abra-a de novo quando houver internet." />
  }
  return <FormularioChamada key={base.reuniaoId} pacote={pacote} baixadoEm={baixadoEm} unidade={unidade} data={data} base={base} />
}
