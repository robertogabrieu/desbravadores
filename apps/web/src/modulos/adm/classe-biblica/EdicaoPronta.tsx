import { Link, useParams } from 'react-router-dom'
import { usePainelDaEdicao } from '../../../api/classe-biblica'
import type { PainelDaEdicao } from '../../../api/classe-biblica'
import { useConexao } from '../../../offline'
import { estiloDoBotao } from '../../../ui/Botao'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { horaCurta, juntarNomes } from '../formatos'
import { diaDaSemanaDaData, diaMes, diasNoPlural } from './useRascunhoDaEdicao'

function oQueFoiFeito({ edicao, grupos }: PainelDaEdicao): string {
  const encontros = Math.max(0, ...grupos.map((g) => g.encontrosFeitos + g.encontrosPorVir))
  const noCalendario = encontros === 1 ? '1 encontro está no calendário do clube' : `${encontros} encontros estão no calendário do clube`
  const quando = `aos ${diasNoPlural(edicao.diaSemana)}${edicao.horario ? ` às ${horaCurta(edicao.horario)}` : ''}`
  const onde = edicao.local ? ` Local: ${edicao.local}.` : ''
  return `${noCalendario}, ${quando}.${onde}`
}

function primeiroEncontro(painel: PainelDaEdicao): string | null {
  const datas = painel.grupos.flatMap((g) => (g.proximoEncontro ? [g.proximoEncontro.data] : [])).sort()
  return datas[0] ?? null
}

function Conteudo({ painel }: { painel: PainelDaEdicao }) {
  const { edicao, grupos } = painel
  const semMaterial = grupos.filter((g) => g.material === null)
  const primeiro = primeiroEncontro(painel)
  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-titulo text-2xl font-bold text-texto">{`${edicao.nome ?? 'Edição'} criada`}</h1>
      <p className="text-base text-texto">{oQueFoiFeito(painel)}</p>
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
  const { modo } = useConexao()
  return (
    <div className="flex flex-col gap-5 py-4">
      {painel.isError && <ErroDeCarga erro={painel.error} aoTentarDeNovo={() => void painel.refetch()} />}
      {painel.isPending && (modo === 'SEM_CONEXAO' ? <DisponivelComInternet /> : <Carregando rotulo="Carregando a edição" />)}
      {painel.data && <Conteudo painel={painel.data} />}
    </div>
  )
}
