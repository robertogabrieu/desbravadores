import { Link } from 'react-router-dom'
import { useFila } from '../offline'
import { Selo } from '../ui/Selo'

/** "N aguardando envio" (pendentes + erros); leva à fila. Some quando não há nada. */
export function SeloAguardandoEnvio() {
  const { pendentes, erros } = useFila().contagem
  const total = pendentes + erros
  if (total === 0) return null

  return (
    <Link to="/fila" className="flex min-h-[var(--touch-min)] items-center">
      <Selo tom={erros > 0 ? 'alerta' : 'neutro'}>{total} aguardando envio</Selo>
    </Link>
  )
}
