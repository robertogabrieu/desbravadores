import { Link } from 'react-router-dom'
import { ErroDaApi } from '../api/cliente'
import { estiloDoBotao } from './Botao'
import { EstadoVazio } from './EstadoVazio'

export const ehNaoEncontrado = (erro: unknown): boolean => erro instanceof ErroDaApi && (erro.status === 404 || erro.status === 400)

interface Propriedades {
  registro: string
  lista: { para: string; rotulo: string }
}

export function EstadoNaoEncontrado({ registro, lista }: Propriedades) {
  return (
    <EstadoVazio
      titulo={`Não encontramos ${registro}`}
      descricao="Ele pode ter sido removido, ser de outro clube ou o endereço estar incompleto."
      acao={
        <Link to={lista.para} className={estiloDoBotao({ variante: 'secundario' })}>
          {lista.rotulo}
        </Link>
      }
    />
  )
}
