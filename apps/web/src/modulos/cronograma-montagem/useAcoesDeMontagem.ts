import { useState } from 'react'
import { ErroDaApi } from '../../api/cliente'
import type { Montagem } from '../../api/montagem'
import {
  useColocarRequisito,
  useCriarAula,
  useCriarCronograma,
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
  const colocarMutacao = useColocarRequisito(classeId, ano)
  const tirarMutacao = useTirarRequisito(classeId, ano)
  const completarParMutacao = useCriarCronograma(classeId, ano)
  const criarAulaMutacao = useCriarAula(classeId, ano, cronogramaId)
  const editarMutacao = useEditarAula(classeId, ano)
  const removerAulaMutacao = useRemoverAula(classeId, ano)
  const enviarMutacao = useEnviarOuPublicar(classeId, ano, cronogramaId, 'enviar')
  const publicarMutacao = useEnviarOuPublicar(classeId, ano, cronogramaId, 'publicar')

  const ocupada = [colocarMutacao, tirarMutacao, completarParMutacao, criarAulaMutacao, editarMutacao, removerAulaMutacao, enviarMutacao, publicarMutacao].some(
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

  const requisitosDaAvancada = new Set((montagem.avancada?.requisitos ?? []).map((requisito) => requisito.id))

  /**
   * O cronograma onde o requisito é gravado: o da regular, ou o da avançada. Regular com cronograma e avançada
   * sem: o POST de criação completa o par (a API cria só o que falta) e devolve o id novo, sem aviso ao usuário.
   */
  async function cronogramaDoRequisito(requisitoId: string): Promise<string> {
    if (!requisitosDaAvancada.has(requisitoId)) return cronogramaId
    const existente = montagem.avancada?.cronograma?.id
    if (existente) return existente
    const regular = montagem.cronograma
    if (!regular) throw new Error('A regular precisa de cronograma antes da avançada')
    const saida = await completarParMutacao.mutateAsync({
      classeId,
      anoClube: ano ?? Number(regular.inicio.slice(0, 4)),
      inicio: regular.inicio,
      fim: regular.fim,
    })
    const criado = saida.avancada?.cronograma?.id
    if (!criado) throw new Error('A API não devolveu o cronograma da avançada')
    return criado
  }

  const atualizadoEmVisto = montagem.cronograma?.atualizadoEm ?? ''

  return {
    erro,
    ocupada,
    limparErro: () => setErro(null),
    colocar: (requisitoId: string, data: string) =>
      tentar(async () => colocarMutacao.mutateAsync({ cronogramaId: await cronogramaDoRequisito(requisitoId), requisitoId, data })),
    tirar: (requisitoId: string) =>
      tentar(async () => tirarMutacao.mutateAsync({ cronogramaId: await cronogramaDoRequisito(requisitoId), requisitoId })),
    criarAula: (data: string, dados: DadosDaAula) => tentar(() => criarAulaMutacao.mutateAsync({ data, ...dados })),
    editarAula: (aulaId: string, dados: DadosDaAula) => tentar(() => editarMutacao.mutateAsync({ aulaId, ...dados })),
    removerAula: (aulaId: string) => tentar(() => removerAulaMutacao.mutateAsync(aulaId)),
    enviar: () => tentar(() => enviarMutacao.mutateAsync(atualizadoEmVisto)),
    publicar: () => tentar(() => publicarMutacao.mutateAsync(atualizadoEmVisto)),
  }
}
