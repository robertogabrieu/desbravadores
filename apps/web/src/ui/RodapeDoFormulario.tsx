import { Link } from 'react-router-dom'
import { Botao, estiloDoBotao } from './Botao'
import { cn } from './cn'

interface Propriedades {
  cancelar: { para: string; estado?: object }
  rotuloSalvar?: string
  salvando: boolean
}

// DOM: Salvar antes de Cancelar (em cima no celular);
// no computador, row-reverse põe Salvar na ponta direita e Cancelar à esquerda dele.
export function RodapeDoFormulario({ cancelar, rotuloSalvar = 'Salvar', salvando }: Propriedades) {
  return (
    <div className="mt-2 flex flex-col gap-3 border-t border-divisor pt-5 sm:flex-row-reverse sm:items-center">
      <Botao type="submit" carregando={salvando} className="w-full sm:w-auto">
        {rotuloSalvar}
      </Botao>
      <Link to={cancelar.para} state={cancelar.estado} className={cn(estiloDoBotao({ variante: 'texto' }), 'w-full sm:w-auto')}>
        Cancelar
      </Link>
    </div>
  )
}
