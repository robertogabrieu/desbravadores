import { hojeNoFuso } from '@desbravadores/shared'
import type { PacoteSaida } from '@desbravadores/shared'
import { useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import type { z } from 'zod'
import { useAula, useAulas } from '../../api/aulas'
import { ErroDaApi } from '../../api/cliente'
import { useConexao, usePacote } from '../../offline'
import type { PacoteGuardado } from '../../offline'
import { Campo } from '../../ui/Campo'
import { Selecao } from '../../ui/Selecao'
import { dataCurta, somarDias } from './datas'
import { AulaErro, AulaMoldura, AulaVazia, EsqueletoAula } from './EstadosAula'
import { FormularioAula } from './FormularioAula'
import type { ClasseDoPacote } from './FormularioAula'
import { baseDoDetalhe, baseDoPacote } from './fontes'

type Pacote = z.infer<typeof PacoteSaida>

interface PropriedadesModo {
  pacote: Pacote
  classes: ClasseDoPacote[]
  baixadoEm: number | null
}

export function TelaRegistroAula() {
  const { id } = useParams()
  const { modo } = useConexao()
  const guardado: PacoteGuardado = usePacote()
  const { pacote } = guardado
  const classes = pacote?.instrutor?.classes ?? []

  let conteudo
  if (guardado.carregando) conteudo = <EsqueletoAula />
  else if (!pacote) {
    conteudo =
      modo === 'SEM_CONEXAO' ? (
        <AulaVazia titulo="Disponível quando houver internet" descricao="A lista de desbravadores ainda não foi baixada neste aparelho." />
      ) : (
        <AulaVazia titulo="A lista de desbravadores ainda não foi baixada" descricao="Aguarde um instante e abra o registro de aula de novo." />
      )
  } else if (classes.length === 0) {
    conteudo = <AulaVazia titulo="Você ainda não tem classes" descricao="O Adm do clube as atribui." />
  } else if (id) {
    conteudo =
      modo === 'SEM_CONEXAO' ? (
        <EdicaoGuardada id={id} pacote={pacote} classes={classes} baixadoEm={guardado.baixadoEm} />
      ) : (
        <EdicaoDoServidor id={id} pacote={pacote} classes={classes} baixadoEm={guardado.baixadoEm} />
      )
  } else conteudo = <AulaNova pacote={pacote} classes={classes} baixadoEm={guardado.baixadoEm} />

  return <AulaMoldura>{conteudo}</AulaMoldura>
}

function AulaNova({ pacote, classes, baixadoEm }: PropriedadesModo) {
  const [busca] = useSearchParams()
  const hoje = hojeNoFuso(pacote.clube.fuso, new Date())
  const minimo = somarDias(hoje, -30)
  const pedida = busca.get('classe')
  const [escolhida, setEscolhida] = useState(pedida)
  const [data, setData] = useState(busca.get('data') ?? hoje)
  const classe = classes.find((c) => c.classe.id === (escolhida ?? classes[0]?.classe.id))

  if (!classe) return <AulaVazia titulo="Esta classe não é sua" descricao="Escolha uma das suas classes no Início." />
  if (classe.membros.length === 0) return <AulaVazia titulo="Nenhum desbravador cursando esta classe" descricao="Avise o Adm para matricular os desbravadores." />

  const dataValida = data >= minimo && data <= hoje
  return (
    <>
      {classes.length > 1 && (
        <Selecao rotulo="Classe" value={classe.classe.id} onChange={(e) => setEscolhida(e.target.value)}>
          {classes.map((c) => (
            <option key={c.classe.id} value={c.classe.id}>
              {c.classe.nome}
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
      {dataValida && <AulaDaData key={`${classe.classe.id}:${data}`} pacote={pacote} classes={classes} baixadoEm={baixadoEm} classe={classe} data={data} />}
    </>
  )
}

interface PropriedadesDaData extends PropriedadesModo {
  classe: ClasseDoPacote
  data: string
}

/**
 * A base é o servidor (com internet) ou o pacote (sem conexão); o que está na fila entra por cima, dentro do formulário.
 * O modo é lido uma vez, ao abrir: se a conexão cair no meio, a base não troca e a tela não remonta.
 */
function AulaDaData(props: PropriedadesDaData) {
  const { modo } = useConexao()
  const [modoAoAbrir] = useState(modo)
  return modoAoAbrir === 'SEM_CONEXAO' ? <AulaComBaseDoPacote {...props} /> : <AulaComBaseDoServidor {...props} />
}

function AulaComBaseDoPacote({ pacote, baixadoEm, classe, data }: PropriedadesDaData) {
  const existente = classe.registrosRecentes.find((r) => r.data === data)
  return <FormularioAula pacote={pacote} baixadoEm={baixadoEm} classe={classe} data={data} base={existente ? baseDoPacote(existente, classe) : null} />
}

function AulaComBaseDoServidor(props: PropriedadesDaData) {
  const { classe, data } = props
  const lista = useAulas(classe.classe.id)
  if (lista.isPending) return <EsqueletoAula />
  // Sem resposta do servidor a lista não diz nada: cai para o que o aparelho guardou.
  if (!lista.data) return <AulaComBaseDoPacote {...props} />
  const existente = lista.data.find((a) => a.data === data)
  return existente ? <AulaComDetalhe {...props} aulaId={existente.id} /> : <AulaComBaseDoPacote {...props} />
}

function AulaComDetalhe({ aulaId, ...props }: PropriedadesDaData & { aulaId: string }) {
  const detalhe = useAula(aulaId)
  if (detalhe.isPending) return <EsqueletoAula />
  // Uma releitura que falha depois não tira a aula que já chegou.
  if (!detalhe.data) return <AulaComBaseDoPacote {...props} />
  return <FormularioAula pacote={props.pacote} baixadoEm={props.baixadoEm} classe={props.classe} data={props.data} base={baseDoDetalhe(detalhe.data)} />
}

interface PropriedadesEdicao extends PropriedadesModo {
  id: string
}

function EdicaoGuardada({ id, pacote, classes, baixadoEm }: PropriedadesEdicao) {
  const classe = classes.find((c) => c.registrosRecentes.some((r) => r.id === id))
  const registro = classe?.registrosRecentes.find((r) => r.id === id)
  if (!classe || !registro) return <AulaVazia titulo="Esta aula não está neste aparelho" descricao="Abra-a de novo quando houver internet." />
  return <FormularioAula key={registro.id} pacote={pacote} baixadoEm={baixadoEm} classe={classe} data={registro.data} base={baseDoPacote(registro, classe)} />
}

function EdicaoDoServidor({ id, pacote, classes, baixadoEm }: PropriedadesEdicao) {
  const consulta = useAula(id)
  if (consulta.isPending) return <EsqueletoAula />
  if (consulta.isError) {
    const semResposta = !(consulta.error instanceof ErroDaApi) || consulta.error.classe !== 'RECUSA'
    const guardada = classes.some((c) => c.registrosRecentes.some((r) => r.id === id))
    if (guardada && semResposta) return <EdicaoGuardada id={id} pacote={pacote} classes={classes} baixadoEm={baixadoEm} />
    return <AulaErro mensagem={consulta.error.message} aoTentar={() => void consulta.refetch()} />
  }
  const classe = classes.find((c) => c.classe.id === consulta.data.classe.id)
  if (!classe) return <AulaVazia titulo="Esta aula não está neste aparelho" descricao="Abra-a de novo quando houver internet." />
  return <FormularioAula key={consulta.data.id} pacote={pacote} baixadoEm={baixadoEm} classe={classe} data={consulta.data.data} base={baseDoDetalhe(consulta.data)} />
}
