import { useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useDesbravador } from '../../../api/desbravadores'
import type { Aviso, Desbravador } from '../../../api/desbravadores'
import { useConexao } from '../../../offline'
import { CabecalhoDaPagina } from '../../../ui/CabecalhoDaPagina'
import { Esqueleto } from '../../../ui/Esqueleto'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { EstadoNaoEncontrado, ehNaoEncontrado } from '../../../ui/EstadoNaoEncontrado'
import { useVoltar } from '../navegacao'
import type { EstadoDaFicha } from '../navegacao'
import { FormularioDesbravador } from './FormularioDesbravador'

const LISTA = '/adm/desbravadores'

interface PropriedadesDaEdicao {
  dbv: Desbravador
  estado: EstadoDaFicha
  /** Endereço da ficha, com a parte que estava aberta. */
  ficha: string
  aoConcluir: (resultado: { id: string; avisos: Aviso[] }) => void
}

function EdicaoCarregada({ dbv, estado, ficha, aoConcluir }: PropriedadesDaEdicao) {
  // O título guarda o nome de quando a tela abriu: gravar atualiza o registro, mas a tela já está de saída.
  const [nomeAoAbrir] = useState(dbv.nome)
  return (
    <>
      <CabecalhoDaPagina
        voltar={{ para: ficha, rotulo: nomeAoAbrir, estado }}
        sobretitulo="Editar desbravador"
        titulo={nomeAoAbrir}
      />
      <FormularioDesbravador key={dbv.id} desbravador={dbv} cancelar={{ para: ficha, estado }} aoConcluir={aoConcluir} />
    </>
  )
}

/** Atende `/novo` (sem `:id`) e `/:id/editar`; sair sem salvar não pergunta nada. */
export function EditarDesbravador() {
  const { id } = useParams()
  const editando = id !== undefined
  const navegar = useNavigate()
  const [parametros] = useSearchParams()
  const voltar = useVoltar({ para: LISTA, rotulo: 'Desbravadores' })
  const estado: EstadoDaFicha = { voltarPara: voltar.para, voltarRotulo: voltar.rotulo }
  const consulta = useDesbravador(id ?? '', editando)
  const { modo } = useConexao()

  // A ficha mandou a parte que estava aberta: salvar ou cancelar volta nela.
  const parte = parametros.get('parte')
  const fichaDe = (dbvId: string) => `${LISTA}/${dbvId}${parte ? `?parte=${encodeURIComponent(parte)}` : ''}`
  const aoConcluir = ({ id: criadoId, avisos }: { id: string; avisos: Aviso[] }) =>
    void navegar(fichaDe(criadoId), { replace: true, state: { ...estado, avisos: avisos.map((aviso) => aviso.mensagem) } })

  let corpo: ReactNode
  if (!editando) {
    corpo = (
      <>
        <CabecalhoDaPagina voltar={voltar} titulo="Novo desbravador" />
        <FormularioDesbravador cancelar={{ para: voltar.para }} aoConcluir={aoConcluir} />
      </>
    )
  } else if (consulta.data) {
    corpo = <EdicaoCarregada dbv={consulta.data} estado={estado} ficha={fichaDe(consulta.data.id)} aoConcluir={aoConcluir} />
  } else if (consulta.isError && ehNaoEncontrado(consulta.error)) {
    corpo = <EstadoNaoEncontrado registro="este desbravador" lista={{ para: LISTA, rotulo: 'Ver a lista de desbravadores' }} />
  } else if (modo === 'SEM_CONEXAO') {
    corpo = <DisponivelComInternet />
  } else if (consulta.isError) {
    corpo = <ErroDeCarga erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />
  } else {
    corpo = (
      <Carregando rotulo="Carregando o cadastro">
        <Esqueleto className="h-20" />
        <Esqueleto className="h-32" />
      </Carregando>
    )
  }

  return <div className="flex flex-col gap-5 py-4">{corpo}</div>
}
