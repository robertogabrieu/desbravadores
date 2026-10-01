import { useNavigate } from 'react-router-dom'
import type { Unidade } from '../../../api/leitura'
import { CabecalhoDaPagina } from '../../../ui/CabecalhoDaPagina'
import { useVoltar } from '../navegacao'
import { FormularioUnidade } from './FormularioUnidade'
import { ComUnidade } from './FichaUnidade'

const LISTA = '/adm/unidades'

export function NovaUnidade() {
  const navegar = useNavigate()
  return (
    <div className="flex flex-col gap-5 p-4">
      <CabecalhoDaPagina voltar={{ para: LISTA, rotulo: 'Unidades' }} titulo="Nova unidade" />
      <FormularioUnidade cancelar={{ para: LISTA }} aoConcluir={(criada) => void navegar(`${LISTA}/${criada.id}`, { state: { voltarPara: LISTA } })} />
    </div>
  )
}

export const EditarUnidade = () => <ComUnidade aoCarregar={(unidade) => <EdicaoCarregada unidade={unidade} />} />

function EdicaoCarregada({ unidade }: { unidade: Unidade }) {
  const navegar = useNavigate()
  const voltar = useVoltar({ para: LISTA, rotulo: 'Unidades' })
  const estado = { voltarPara: voltar.para, voltarRotulo: voltar.rotulo }
  const ficha = `${LISTA}/${unidade.id}`
  return (
    <>
      <CabecalhoDaPagina voltar={{ para: ficha, rotulo: unidade.nome, estado }} titulo={`Editar ${unidade.nome}`} />
      <FormularioUnidade unidade={unidade} cancelar={{ para: ficha, estado }} aoConcluir={() => void navegar(ficha, { replace: true, state: estado })} />
    </>
  )
}
