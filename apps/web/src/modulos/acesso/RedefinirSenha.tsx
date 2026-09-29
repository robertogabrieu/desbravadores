import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useRedefinirSenha } from '../../api/auth'
import { FormularioNovaSenha } from './FormularioNovaSenha'
import { MENSAGEM_LINK_VENCIDO, mensagemDeToken, tokenRecusado } from './mensagens'
import { TelaAcesso } from './TelaAcesso'

export function RedefinirSenha() {
  const { token = '' } = useParams()
  const navegar = useNavigate()
  const redefinir = useRedefinirSenha()
  const [linkRecusado, definirLinkRecusado] = useState(false)

  const salvar = async (senha: string): Promise<string | undefined> => {
    try {
      await redefinir.mutateAsync({ token, senha })
      void navegar('/login', { replace: true })
      return undefined
    } catch (erro) {
      definirLinkRecusado(tokenRecusado(erro))
      return mensagemDeToken(erro, MENSAGEM_LINK_VENCIDO)
    }
  }

  return (
    <TelaAcesso titulo="Redefinir senha" subtitulo="Escolha a nova senha.">
      <FormularioNovaSenha rotuloBotao="Salvar senha" aoEnviar={salvar} />
      {linkRecusado && (
        <Link to="/senha/esqueci" className="min-h-[var(--touch-min)] content-center text-base font-semibold text-marca">
          Pedir outro link
        </Link>
      )}
    </TelaAcesso>
  )
}
