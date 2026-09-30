import { Bell } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useNotificacoes } from '../../api/notificacoes'
import { useConexao } from '../../offline'

/** Sino do cabeçalho: leva a /notificacoes e mostra quantas estão sem ler (escondido sem conexão). */
export function SinoNotificacoes() {
  const { modo } = useConexao()
  const semConexao = modo === 'SEM_CONEXAO'
  const { data } = useNotificacoes(!semConexao)
  const naoLidas = semConexao ? 0 : (data?.naoLidas ?? 0)

  return (
    <Link
      to="/notificacoes"
      aria-label={naoLidas > 0 ? `Notificações, ${naoLidas} não lidas` : 'Notificações'}
      className="relative flex min-h-[var(--touch-min)] min-w-[var(--touch-min)] items-center justify-center"
    >
      <Bell aria-hidden className="size-6" />
      {naoLidas > 0 && (
        <span className="absolute right-1 top-1 flex min-w-5 items-center justify-center rounded-full bg-perigo px-1 text-xs font-bold text-white">
          {naoLidas > 99 ? '99+' : naoLidas}
        </span>
      )}
    </Link>
  )
}
