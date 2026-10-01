import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { z } from 'zod'
import type { ReuniaoDetalhe } from '@desbravadores/shared'
import { useReuniao } from '../../../api/reunioes'
import { useConexao, usePacote } from '../../../offline'
import { estiloDoBotao } from '../../../ui/Botao'
import { CabecalhoDaPagina } from '../../../ui/CabecalhoDaPagina'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { EstadoNaoEncontrado, ehNaoEncontrado } from '../../../ui/EstadoNaoEncontrado'
import { FUSO_PADRAO_DO_CLUBE, dataPorExtenso, horaCurta, instanteCurto } from '../formatos'
import { Indicadores, ListaDaChamada } from '../../reunioes/detalhe/PartesDaReuniao'

type Detalhe = z.infer<typeof ReuniaoDetalhe>

const LISTA_DE_UNIDADES = { para: '/adm/unidades', rotulo: 'Ver as unidades' }

export function FichaReuniao() {
  const { id = '' } = useParams()
  const consulta = useReuniao(id)
  const { modo } = useConexao()

  let corpo: ReactNode
  if (consulta.data) corpo = <FichaCarregada dados={consulta.data} />
  else if (consulta.isError && ehNaoEncontrado(consulta.error)) corpo = <EstadoNaoEncontrado registro="esta reunião" lista={LISTA_DE_UNIDADES} />
  else if (modo === 'SEM_CONEXAO') corpo = <DisponivelComInternet />
  else if (consulta.isError) corpo = <ErroDeCarga erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />
  else corpo = <Carregando rotulo="Carregando a reunião" />

  return <main className="flex flex-col gap-6 p-6">{corpo}</main>
}

function FichaCarregada({ dados }: { dados: Detalhe }) {
  const { pacote } = usePacote()
  const fuso = pacote?.clube.fuso ?? FUSO_PADRAO_DO_CLUBE
  const mostrarLicao = pacote?.criterios.some((criterio) => criterio.gatilho === 'LICAO' && criterio.ativo) ?? false
  const apoio = [horaCurta(dados.horario), dados.local, `chamada feita por ${dados.registradaPor.nome}`].filter(Boolean).join(' · ')

  return (
    <>
      <CabecalhoDaPagina
        voltar={{ para: `/adm/unidades/${dados.unidade.id}?mes=${dados.data.slice(0, 7)}`, rotulo: dados.unidade.nome }}
        sobretitulo={`Reunião · Unidade ${dados.unidade.nome}`}
        titulo={dataPorExtenso(dados.data)}
        apoio={apoio}
        acoes={
          dados.podeEditar && (
            <Link to={`/adm/reunioes/${dados.id}/chamada`} className={estiloDoBotao({ variante: 'primario' })}>
              Corrigir chamada
            </Link>
          )
        }
      />
      <Indicadores dados={dados} variante="adm" />
      <section aria-labelledby="chamada-titulo" className="flex flex-col gap-3">
        <h2 id="chamada-titulo" className="font-titulo text-lg font-bold">
          Chamada
        </h2>
        <ListaDaChamada dados={dados} mostrarLicao={mostrarLicao} />
      </section>
      {dados.observacoes && (
        <section className="flex flex-col gap-1">
          <h2 className="font-titulo text-lg font-bold">Observações</h2>
          <p className="text-base">{dados.observacoes}</p>
        </section>
      )}
      <section className="flex flex-col gap-2">
        <h2 className="font-titulo text-lg font-bold">Alterações</h2>
        <p className="text-base">{dados.alterada ? `Corrigida por ${dados.alterada.por} em ${instanteCurto(dados.alterada.em, fuso)}.` : 'Nenhuma correção desde o registro.'}</p>
        {dados.alterada?.conflito && <p className="text-base font-semibold text-alerta">Houve conflito entre aparelhos.</p>}
        <p className="text-sm text-texto-2">O conselheiro corrige até o prazo de correção do clube; o Adm corrige a qualquer momento — por exemplo, quem chegou depois da chamada.</p>
      </section>
    </>
  )
}
