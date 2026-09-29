import { useNavigate } from 'react-router-dom'
import { usePapelAtivo } from '../../api/auth'
import { useSessao } from '../../sessao/useSessao'
import type { Vinculo } from '../../sessao/useSessao'
import { Cartao } from '../../ui/Cartao'
import { rotuloDoPapel } from './papeis'
import { TelaAcesso } from './TelaAcesso'

function escopoDoVinculo(vinculo: Vinculo): string {
  const nomes = vinculo.papel === 'CONSELHEIRO' ? vinculo.unidades.map((u) => u.nome) : vinculo.classes.map((c) => c.nome)
  return nomes.join(', ')
}

export function EscolherPapel() {
  const { vinculos } = useSessao()
  const navegar = useNavigate()
  const papelAtivo = usePapelAtivo()

  const escolher = async (vinculo: Vinculo): Promise<void> => {
    try {
      await papelAtivo.mutateAsync(vinculo.id)
      void navegar('/', { replace: true })
    } catch {
      // O erro fica em papelAtivo.isError e aparece abaixo.
    }
  }

  return (
    <TelaAcesso titulo="Como você quer entrar?" subtitulo="Escolha o papel que vai usar agora. Dá para trocar depois.">
      <ul className="flex flex-col gap-3">
        {vinculos.map((vinculo) => {
          const escopo = escopoDoVinculo(vinculo)
          return (
            <li key={vinculo.id}>
              <button
                type="button"
                disabled={papelAtivo.isPending}
                onClick={() => void escolher(vinculo)}
                className="min-h-[var(--touch-min)] w-full text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
              >
                <Cartao className="flex flex-col gap-1 hover:bg-superficie-suave">
                  <span className="font-titulo text-lg font-bold text-texto">{rotuloDoPapel(vinculo.papel)}</span>
                  <span className="text-base text-texto-2">{vinculo.clube.nome}</span>
                  {escopo && <span className="text-sm text-texto-2">{escopo}</span>}
                </Cartao>
              </button>
            </li>
          )
        })}
      </ul>
      {papelAtivo.isError && (
        <p role="alert" className="text-sm font-medium text-perigo">
          Não foi possível trocar de papel. Tente de novo.
        </p>
      )}
    </TelaAcesso>
  )
}
