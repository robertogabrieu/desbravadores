import { Botao } from '../../ui/Botao'
import { FaixaAviso } from '../../ui/FaixaAviso'
import type { ErroDeAcao } from './useAcoesDeMontagem'

interface Propriedades {
  erro: ErroDeAcao
  aoAtualizar: () => void
}

/** Recusa de uma gravação; no conflito (409) o botão "Atualizar" refaz a busca e some com a faixa. */
export function FaixaDeMontagem({ erro, aoAtualizar }: Propriedades) {
  return (
    <FaixaAviso>
      <p>{erro.mensagem}</p>
      {erro.conflito && (
        <Botao variante="texto" className="-ml-5 mt-1" onClick={aoAtualizar}>
          Atualizar
        </Botao>
      )}
    </FaixaAviso>
  )
}
