import { useMutation } from '@tanstack/react-query'
import { useCadastrarPasskey, useOpcoesCadastroPasskey } from '../../api/passkeys'
import { useSessao } from '../../sessao/useSessao'
import { marcarPasskeyAtivada } from './aparelho'
import { criarCredencial } from './navegador'

interface Ativacao {
  senha: string
  nome: string
}

/**
 * Ativar neste aparelho: a senha confirma quem pede, o celular pede a digital ou o rosto e o servidor
 * guarda a chave. No fim o aparelho passa a lembrar o e-mail e a marca. Quem chama trata o erro: da API
 * (`ErroDaApi`, com a mensagem pronta) ou do navegador (cancelou, não suporta).
 */
export function useAtivarPasskey() {
  const { eu } = useSessao()
  const opcoesDeCadastro = useOpcoesCadastroPasskey()
  const cadastrar = useCadastrarPasskey()
  const email = eu?.usuario.email

  return useMutation({
    mutationFn: async ({ senha, nome }: Ativacao) => {
      const { desafioId, opcoes } = await opcoesDeCadastro.mutateAsync({ senha })
      const resposta = await criarCredencial(opcoes)
      const passkey = await cadastrar.mutateAsync({ desafioId, nome, resposta })
      if (email) marcarPasskeyAtivada(email)
      return passkey
    },
  })
}
