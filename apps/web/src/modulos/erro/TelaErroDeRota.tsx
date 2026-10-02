import { captureException } from '@sentry/react'
import { useEffect } from 'react'
import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom'
import { EstadoVazio } from '../../ui/EstadoVazio'

/**
 * Pega o erro que quebrou uma página. Sem ela, a tela padrão do React Router seguraria o erro e o
 * Sentry nunca o veria. Endereço que não existe não é defeito: vira a página de não encontrada, sem aviso.
 */
export function TelaErroDeRota() {
  const erro = useRouteError()
  const naoEncontrada = isRouteErrorResponse(erro) && erro.status === 404

  useEffect(() => {
    if (!naoEncontrada) captureException(erro)
  }, [erro, naoEncontrada])

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] items-center justify-center">
      <EstadoVazio
        titulo={naoEncontrada ? 'Página não encontrada' : 'Algo deu errado'}
        descricao={
          naoEncontrada
            ? 'O endereço não existe ou foi trocado.'
            : 'Não foi possível abrir esta página. Volte ao início e tente de novo.'
        }
        acao={
          <Link to="/" className="inline-flex min-h-[var(--touch-min)] items-center font-semibold text-marca underline">
            Voltar ao início
          </Link>
        }
      />
    </main>
  )
}
