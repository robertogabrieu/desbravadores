import { useNavigate, useParams } from 'react-router-dom'
import { useAceitarConvite } from '../../api/auth'
import { useSessao } from '../../sessao/useSessao'
import { FormularioNovaSenha } from './FormularioNovaSenha'
import { MENSAGEM_CONVITE_VENCIDO, mensagemDeToken } from './mensagens'
import { TelaAcesso } from './TelaAcesso'

export function DefinirSenha() {
  const { token = '' } = useParams()
  const { entrar } = useSessao()
  const navegar = useNavigate()
  const aceitar = useAceitarConvite()

  const definir = async (senha: string): Promise<string | undefined> => {
    try {
      await entrar(await aceitar.mutateAsync({ token, senha }))
      void navegar('/', { replace: true })
      return undefined
    } catch (erro) {
      return mensagemDeToken(erro, MENSAGEM_CONVITE_VENCIDO)
    }
  }

  return (
    <TelaAcesso titulo="Definir senha" subtitulo="Escolha a senha que você vai usar para entrar.">
      <FormularioNovaSenha rotuloBotao="Definir senha" aoEnviar={definir} />
    </TelaAcesso>
  )
}
