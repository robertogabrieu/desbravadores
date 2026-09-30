import { EstadoVazio } from '../../ui/EstadoVazio'

export function PaginaEmBreve() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] items-center justify-center">
      <EstadoVazio titulo="Em breve" descricao="Esta tela ainda está sendo preparada." />
    </main>
  )
}
