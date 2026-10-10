import { Check, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useEdicoesCB } from '../../../api/classe-biblica'
import type { EdicaoResumoCB } from '../../../api/classe-biblica'
import { useConexao } from '../../../offline'
import { useSessao } from '../../../sessao/useSessao'
import { estiloDoBotao } from '../../../ui/Botao'
import { CabecalhoDaPagina } from '../../../ui/CabecalhoDaPagina'
import { Cartao } from '../../../ui/Cartao'
import { EstadoVazio } from '../../../ui/EstadoVazio'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { LinhaQueNavega } from '../../../ui/LinhaQueNavega'
import { Selo } from '../../../ui/Selo'
import { horaCurta } from '../formatos'
import { ETAPAS_DA_EDICAO, dataCurta } from './useRascunhoDaEdicao'

const NOME_PROVISORIO = 'Edição sem nome'

function linhaDoResumo(edicao: EdicaoResumoCB): string {
  if (edicao.situacao === 'ENCERRADA') {
    const presenca = edicao.presencaMedia === null ? '' : ` · ${edicao.presencaMedia}% de presença`
    return `${edicao.encontros} encontros${presenca}`
  }
  const proximo = edicao.proximoEncontro ? ` · próximo: ${dataCurta(edicao.proximoEncontro.data)}, ${horaCurta(edicao.proximoEncontro.horario)}` : ''
  return `${edicao.encontrosFeitos} de ${edicao.encontros} encontros feitos${proximo}`
}

function NaoTerminada({ edicao }: { edicao: EdicaoResumoCB }) {
  const nome = edicao.nome ?? NOME_PROVISORIO
  return (
    <Cartao>
      <section aria-label={nome} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Selo tom="alerta" className="w-fit">Não terminada</Selo>
          <h2 className="font-titulo text-lg font-bold text-texto">{nome}</h2>
          <p className="text-base text-texto-2">{`Parou na etapa ${edicao.etapa} de 3 — ${ETAPAS_DA_EDICAO[edicao.etapa - 1]}.`}</p>
        </div>
        <Link to={`/adm/classe-biblica/${edicao.id}/etapa/${edicao.etapa}`} className={estiloDoBotao({ className: 'w-fit' })}>
          Continuar de onde parou
        </Link>
      </section>
    </Cartao>
  )
}

function Terminada({ edicao }: { edicao: EdicaoResumoCB }) {
  return (
    <LinhaQueNavega to={`/adm/classe-biblica/${edicao.id}`} forma="cartao">
      <div className="flex flex-col gap-1">
        <Selo tom={edicao.situacao === 'EM_ANDAMENTO' ? 'sucesso' : 'neutro'} className="w-fit">
          {edicao.situacao === 'EM_ANDAMENTO' ? 'Em andamento' : 'Encerrada'}
        </Selo>
        <h2 className="font-titulo text-lg font-bold text-texto">{edicao.nome ?? NOME_PROVISORIO}</h2>
        <p className="text-base text-texto-2">{linhaDoResumo(edicao)}</p>
      </div>
    </LinhaQueNavega>
  )
}

function SemUnidades() {
  return (
    <section aria-labelledby="cb-sem-unidades" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <h2 id="cb-sem-unidades" className="font-titulo text-lg font-bold text-texto">Antes, cadastre as unidades</h2>
      <p className="max-w-sm text-base text-texto-2">Cada grupo da Classe Bíblica é formado por unidades, e o clube ainda não tem nenhuma.</p>
      <Link to="/adm/unidades" className={estiloDoBotao()}>Cadastrar unidade</Link>
      <p className="max-w-sm text-sm text-texto-2">Depois de cadastrar, volte aqui: a edição continua de onde você parou.</p>
    </section>
  )
}

function SemEdicao({ unidades }: { unidades: number }) {
  return (
    <EstadoVazio
      titulo="Nenhuma edição da Classe Bíblica ainda"
      descricao="Uma edição junta os encontros de um período — um semestre, por exemplo —, os grupos com as suas unidades e o material de estudo."
      acao={
        <div className="flex flex-col items-center gap-4">
          <ul className="flex flex-col gap-1 text-left text-base">
            <li className="flex items-center gap-2 text-texto-2">
              <Check aria-hidden className="size-5 text-sucesso" />
              {`${unidades} ${unidades === 1 ? 'unidade cadastrada' : 'unidades cadastradas'}`}
            </li>
            <li className="flex items-center gap-2 font-semibold text-texto">
              <span aria-hidden className="size-5 rounded-full border-2 border-marca" />
              Criar a edição: dados, grupos e datas
            </li>
          </ul>
          <Link to="/adm/classe-biblica/nova" className={estiloDoBotao()}>Criar a primeira edição</Link>
        </div>
      }
    />
  )
}

export function ListaEdicoes() {
  const consulta = useEdicoesCB()
  const { modo } = useConexao()
  const { pode } = useSessao()
  const dados = consulta.data
  const temEdicao = (dados?.edicoes.length ?? 0) > 0
  // O "Continuar de onde parou" é o próximo passo: a criação de outra edição não disputa a cor com ele.
  const temNaoTerminada = dados?.edicoes.some((edicao) => edicao.situacao === 'NAO_TERMINADA') ?? false
  const podeCriar = pode('classebiblica.gerenciar') && dados !== undefined && dados.unidades > 0 && temEdicao

  return (
    <div className="flex flex-col gap-5 py-4">
      <CabecalhoDaPagina
        voltar={{ para: '/inicio', rotulo: 'Início' }}
        titulo="Classe Bíblica"
        acoes={podeCriar && (
          <Link to="/adm/classe-biblica/nova" className={estiloDoBotao({ variante: temNaoTerminada ? 'secundario' : 'primario' })}>
            <Plus aria-hidden className="size-5" />
            Nova edição
          </Link>
        )}
      />

      {consulta.isPending && (modo === 'SEM_CONEXAO' ? <DisponivelComInternet /> : <Carregando rotulo="Carregando as edições" />)}
      {consulta.isError && <ErroDeCarga erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />}
      {dados && dados.unidades === 0 && <SemUnidades />}
      {dados && dados.unidades > 0 && !temEdicao && <SemEdicao unidades={dados.unidades} />}

      {temEdicao && (
        <ul className="flex flex-col gap-3">
          {dados?.edicoes.map((edicao) => (
            <li key={edicao.id}>{edicao.situacao === 'NAO_TERMINADA' ? <NaoTerminada edicao={edicao} /> : <Terminada edicao={edicao} />}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
