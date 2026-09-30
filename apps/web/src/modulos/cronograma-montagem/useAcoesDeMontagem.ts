import { useState } from 'react'
import { ErroDaApi } from '../../api/cliente'
import type { Montagem } from '../../api/montagem'
import {
  useColocarRequisito,
  useCriarAula,
  useEditarAula,
  useEnviarOuPublicar,
  useRemoverAula,
  useTirarRequisito,
} from '../../api/montagem'

export interface ErroDeAcao {
  mensagem: string
  /** 409: outra pessoa mexeu; a saída é atualizar a tela. */
  conflito: boolean
}

export interface DadosDaAula {
  horario: string | null
  local: string | null
  titulo: string | null
}

/**
 * Todas as gravações de uma montagem já com cronograma. Cada ação devolve `true` quando gravou; quando
 * falha, guarda o erro em `erro` (a tela mostra a faixa) e devolve `false`.
 */
export function useAcoesDeMontagem(classeId: string, ano: number | undefined, cronogramaId: string, montagem: Montagem) {
  const [erro, setErro] = useState<ErroDeAcao | null>(null)
  const colocarMutacao = useColocarRequisito(classeId, ano, cronogramaId)
  const tirarMutacao = useTirarRequisito(classeId, ano, cronogramaId)
  const criarAulaMutacao = useCriarAula(classeId, ano, cronogramaId)
  const editarMutacao = useEditarAula(classeId, ano)
  const removerAulaMutacao = useRemoverAula(classeId, ano)
  const enviarMutacao = useEnviarOuPublicar(classeId, ano, cronogramaId, 'enviar')
  const publicarMutacao = useEnviarOuPublicar(classeId, ano, cronogramaId, 'publicar')

  const ocupada = [colocarMutacao, tirarMutacao, criarAulaMutacao, editarMutacao, removerAulaMutacao, enviarMutacao, publicarMutacao].some(
    (mutacao) => mutacao.isPending,
  )

  async function tentar(gravacao: () => Promise<unknown>): Promise<boolean> {
    setErro(null)
    try {
      await gravacao()
      return true
    } catch (falha) {
      if (falha instanceof ErroDaApi) setErro({ mensagem: falha.erro.mensagem, conflito: falha.status === 409 })
      else setErro({ mensagem: 'Não foi possível gravar agora. Tente de novo.', conflito: false })
      return false
    }
  }

  const atualizadoEmVisto = montagem.cronograma?.atualizadoEm ?? ''

  return {
    erro,
    ocupada,
    limparErro: () => setErro(null),
    colocar: (requisitoId: string, data: string) => tentar(() => colocarMutacao.mutateAsync({ requisitoId, data })),
    tirar: (requisitoId: string) => tentar(() => tirarMutacao.mutateAsync(requisitoId)),
    criarAula: (data: string, dados: DadosDaAula) => tentar(() => criarAulaMutacao.mutateAsync({ data, ...dados })),
    editarAula: (aulaId: string, dados: DadosDaAula) => tentar(() => editarMutacao.mutateAsync({ aulaId, ...dados })),
    removerAula: (aulaId: string) => tentar(() => removerAulaMutacao.mutateAsync(aulaId)),
    enviar: () => tentar(() => enviarMutacao.mutateAsync(atualizadoEmVisto)),
    publicar: () => tentar(() => publicarMutacao.mutateAsync(atualizadoEmVisto)),
  }
}
