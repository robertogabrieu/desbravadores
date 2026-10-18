import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { ErroDaApi } from '../../api/cliente'
import { Botao } from '../../ui/Botao'
import { Campo } from '../../ui/Campo'
import { TelaAcesso } from '../acesso/TelaAcesso'
import { apagarSenhaDoConvite, lerSenhaDoConvite, registrarRecusaDoConvite } from './aparelho'
import { deveOferecerPasskey } from './convite'
import { nomeSugeridoDoAparelho } from './navegador'
import { useAtivarPasskey } from './useAtivarPasskey'

/** Depois do primeiro login por senha: oferece a digital ou o rosto para a próxima vez. Qualquer falha segue para o app, calada. */
export function ConviteDePasskey() {
  const navegar = useNavigate()
  const ativar = useAtivarPasskey()
  const [pedirSenha, definirPedirSenha] = useState(false)
  const [senhaDigitada, definirSenhaDigitada] = useState('')
  const [senhaIncorreta, definirSenhaIncorreta] = useState<string | null>(null)
  // A tela fecha e reabre sozinha no modo estrito do React: só apaga a senha se ela realmente saiu.
  const montada = useRef(true)

  useEffect(() => {
    montada.current = true
    return () => {
      montada.current = false
      setTimeout(() => {
        if (!montada.current) apagarSenhaDoConvite()
      })
    }
  }, [])

  // Entrar à mão na rota, ou voltar a ela depois de decidir, não repete o convite.
  if (!deveOferecerPasskey()) return <Navigate to="/" replace />

  const seguir = () => {
    apagarSenhaDoConvite()
    void navegar('/', { replace: true })
  }

  const agoraNao = () => {
    registrarRecusaDoConvite()
    seguir()
  }

  const tentar = async (senha: string) => {
    definirSenhaIncorreta(null)
    try {
      await ativar.mutateAsync({ senha, nome: nomeSugeridoDoAparelho() })
    } catch (erro) {
      // Senha digitada à mão e errada: a pessoa corrige aqui. Qualquer outra falha segue sem barulho.
      if (pedirSenha && erro instanceof ErroDaApi && erro.erro.codigo === 'REGRA') {
        definirSenhaIncorreta(erro.erro.mensagem)
        return
      }
    }
    seguir()
  }

  const aoAtivar = () => {
    const senha = lerSenhaDoConvite()
    if (senha === null) definirPedirSenha(true)
    else void tentar(senha)
  }

  return (
    <TelaAcesso titulo="Quer entrar com digital ou rosto da próxima vez?" subtitulo="Você entra mais rápido, sem digitar a senha. A senha continua valendo.">
      {pedirSenha ? (
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(evento) => {
            evento.preventDefault()
            if (senhaDigitada !== '') void tentar(senhaDigitada)
          }}
        >
          <Campo
            rotulo="Digite sua senha para ativar"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={senhaDigitada}
            onChange={(evento) => definirSenhaDigitada(evento.target.value)}
            erro={senhaIncorreta ?? undefined}
          />
          <Botao type="submit" largura="total" carregando={ativar.isPending} disabled={senhaDigitada === ''}>
            Ativar
          </Botao>
          <Botao variante="texto" largura="total" onClick={agoraNao} disabled={ativar.isPending}>
            Agora não
          </Botao>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <Botao largura="total" carregando={ativar.isPending} onClick={aoAtivar}>
            Ativar
          </Botao>
          <Botao variante="texto" largura="total" onClick={agoraNao} disabled={ativar.isPending}>
            Agora não
          </Botao>
        </div>
      )}
    </TelaAcesso>
  )
}
