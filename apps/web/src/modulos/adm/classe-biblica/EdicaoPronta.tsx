import { Link, useParams } from 'react-router-dom'
import { useEdicoesCB, usePainelDaEdicao } from '../../../api/classe-biblica'
import type { PainelDaEdicao } from '../../../api/classe-biblica'
import { useConexao } from '../../../offline'
import { estiloDoBotao } from '../../../ui/Botao'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { horaCurta, juntarNomes } from '../formatos'
import { diaDaSemanaDaData, diaMes, diasNoPlural } from './useRascunhoDaEdicao'

/** `encontros` é o total de não cancelados, da lista; nulo quando a edição não veio nela. */
function oQueFoiFeito({ edicao }: PainelDaEdicao, encontros: number | null): string {
  const noCalendario = encontros === null
    ? 'Os encontros estão no calendário do clube'
    : encontros === 1 ? '1 encontro está no calendário do clube' : `${encontros} encontros estão no calendário do clube`
  const quando = `aos ${diasNoPlural(edicao.diaSemana)}${edicao.horario ? ` às ${horaCurta(edicao.horario)}` : ''}`
  return edicao.local ? `${noCalendario}, ${quando}, na ${edicao.local}.` : `${noCalendario}, ${quando}.`
}

function primeiroEncontro(painel: PainelDaEdicao): string | null {
  const datas = painel.grupos.flatMap((g) => (g.proximoEncontro ? [g.proximoEncontro.data] : [])).sort()
  return datas[0] ?? null
}

function Conteudo({ painel, encontros }: { painel: PainelDaEdicao; encontros: number | null }) {
  const { edicao, grupos } = painel
  const semMaterial = grupos.filter((g) => g.material === null)
  const primeiro = primeiroEncontro(painel)
  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-titulo text-2xl font-bold text-texto">{`${edicao.nome ?? 'Edição'} criada`}</h1>
      <p className="text-base text-texto">{oQueFoiFeito(painel, encontros)}</p>
      <ul className="flex flex-col gap-2">
        {grupos.map((grupo) => (
          <li key={grupo.id} className="text-base text-texto">
            {`${grupo.nome}: ${juntarNomes(grupo.unidades.map((u) => u.nome))} · ${grupo.material ? 'material enviado' : 'ainda sem material'}`}
          </li>
        ))}
      </ul>
      {semMaterial.length > 0 && (
        <p className="text-base text-texto-2">
          {`O material ${semMaterial.length === 1 ? `do ${semMaterial[0].nome}` : `de ${juntarNomes(semMaterial.map((g) => g.nome))}`} pode ser anexado quando você tiver, na página da edição. A edição já está valendo sem ele.`}
        </p>
      )}
      <p className="text-base text-texto-2">
        {primeiro
          ? `O primeiro encontro é ${diaDaSemanaDaData(primeiro)}, ${diaMes(primeiro)}. A chamada de cada grupo fica na página da edição.`
          : 'A chamada de cada grupo fica na página da edição.'}
      </p>
      <Link to={`/adm/classe-biblica/${edicao.id}`} className={estiloDoBotao({ className: 'w-fit' })}>Ver a edição</Link>
    </div>
  )
}

/** Fechamento da criação: o que foi feito e um único próximo passo. */
export function EdicaoPronta() {
  const { id = '' } = useParams()
  const painel = usePainelDaEdicao(id)
  const lista = useEdicoesCB()
  const { modo } = useConexao()
  const pendente = painel.isPending || lista.isPending
  // A lista em cache pode ser de antes de terminar: enquanto ela diz "não terminada", o total ainda não vale.
  const daLista = lista.data?.edicoes.find((edicao) => edicao.id === id)
  const encontros = daLista && daLista.situacao !== 'NAO_TERMINADA' ? daLista.encontros : null
  return (
    <div className="flex flex-col gap-5 py-4">
      {painel.isError && <ErroDeCarga erro={painel.error} aoTentarDeNovo={() => void painel.refetch()} />}
      {pendente && !painel.isError && (modo === 'SEM_CONEXAO' ? <DisponivelComInternet /> : <Carregando rotulo="Carregando a edição" />)}
      {painel.data && !lista.isPending && <Conteudo painel={painel.data} encontros={encontros} />}
    </div>
  )
}
