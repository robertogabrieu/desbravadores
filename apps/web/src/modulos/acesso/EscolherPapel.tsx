import { useNavigate } from 'react-router-dom'
import { usePapelAtivo } from '../../api/auth'
import { SEM_ACESSO, useSessao } from '../../sessao/useSessao'
import type { Vinculo } from '../../sessao/useSessao'
import { Botao } from '../../ui/Botao'
import { Cartao } from '../../ui/Cartao'
import { escopoDoVinculo, rotuloDoPapel } from './papeis'
import { TelaAcesso } from './TelaAcesso'

export function EscolherPapel() {
  const { vinculos, sair } = useSessao()
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

  // Só com uma identidade sem papéis guardada no aparelho (aberta sem internet); online, a sessão já sai sozinha.
  const irParaOLogin = async (): Promise<void> => {
    await sair()
    void navegar('/login', { replace: true, state: { aviso: SEM_ACESSO } })
  }

  if (vinculos.length === 0) {
    return (
      <TelaAcesso titulo="Sem acesso" subtitulo={SEM_ACESSO}>
        <Botao largura="total" onClick={() => void irParaOLogin()}>
          Ir para o login
        </Botao>
      </TelaAcesso>
    )
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
