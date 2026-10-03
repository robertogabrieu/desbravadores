import { WifiOff } from 'lucide-react'
import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useSessao } from '../../sessao/useSessao'
import { Botao } from '../../ui/Botao'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { IrAoLogin } from '../../sessao/IrAoLogin'

/** Rota /conectar: o app abriu sem internet e não há identidade guardada válida (SPEC Fase 1 §4.1). */
export function TelaConectar() {
  const { situacao, reabrir } = useSessao()
  const [tentando, definirTentando] = useState(false)

  if (situacao === 'autenticada') return <Navigate to="/" replace />
  if (situacao === 'anonima') return <IrAoLogin />

  const tentarDeNovo = async () => {
    definirTentando(true)
    try {
      await reabrir()
    } finally {
      definirTentando(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[480px] items-center justify-center">
      <EstadoVazio
        titulo="Conecte-se à internet para usar o app."
        descricao="Assim que a conexão voltar, o app abre com os seus dados."
        acao={
          <Botao carregando={tentando} onClick={() => void tentarDeNovo()}>
            <WifiOff aria-hidden className="size-4" />
            Tentar de novo
          </Botao>
        }
      />
    </main>
  )
}
