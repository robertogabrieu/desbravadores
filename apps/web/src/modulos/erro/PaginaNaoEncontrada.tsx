import { Link } from 'react-router-dom'
import { EstadoVazio } from '../../ui/EstadoVazio'

export function PaginaNaoEncontrada() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] items-center justify-center">
      <EstadoVazio
        titulo="Página não encontrada"
        descricao="O endereço não existe ou foi trocado."
        acao={
          <Link to="/" className="inline-flex min-h-[var(--touch-min)] items-center font-semibold text-marca underline">
            Voltar ao início
          </Link>
        }
      />
    </main>
  )
}
