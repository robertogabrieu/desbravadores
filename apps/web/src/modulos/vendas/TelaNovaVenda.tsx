import { useNavigate } from 'react-router-dom'
import { CabecalhoDaPagina } from '../../ui/CabecalhoDaPagina'
import { FormularioVenda } from './FormularioVenda'

export function TelaNovaVenda() {
  const navegar = useNavigate()
  return (
    <div className="flex flex-col gap-6">
      <CabecalhoDaPagina voltar={{ para: '/adm/vendas', rotulo: 'Vendas' }} titulo="Nova venda" apoio="Você muda tudo isto depois, em Editar venda." />
      <FormularioVenda voltar="/adm/vendas" aoConcluir={(venda) => void navegar(`/adm/vendas/${venda.id}`)} />
    </div>
  )
}
