import { AulaDetalhe, AulaResumo } from '@desbravadores/shared'
import { useMutation, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { enfileirar, useConexao } from '../offline'
import type { PayloadAulaFila } from '../offline/tipos/aula'
import { montarConsulta, requisitar } from './cliente'
import { toast } from 'sonner'

/** Raízes que o `aoEnviar` do tipo AULA invalida (com `progresso`). */
export const chavesAulas = {
  lista: (classeId: string) => ['aulas', classeId] as const,
  detalhe: (id: string) => ['aula', id] as const,
}

export function useAulas(classeId: string, anoClube?: number) {
  return useQuery({
    queryKey: [...chavesAulas.lista(classeId), anoClube ?? null],
    queryFn: () => requisitar(`/api/classes/${classeId}/aulas${montarConsulta({ anoClube })}`, z.array(AulaResumo)),
  })
}

export function useAula(id: string) {
  return useQuery({
    queryKey: chavesAulas.detalhe(id),
    queryFn: () => requisitar(`/api/aulas/${id}`, AulaDetalhe),
  })
}

export interface EntradaSalvarAula {
  classeId: string
  classeNome: string
  data: string
  /** Id do registro existente, ou o UUID novo que o registro carrega desde o primeiro toque. */
  registroAulaId: string
  correcao: boolean
  aulaPlanejadaId: string | null
  presencas: PayloadAulaFila['corpo']['presencas']
  requisitosMarcados: PayloadAulaFila['corpo']['requisitosMarcados']
  requisitosDesmarcados: PayloadAulaFila['corpo']['requisitosDesmarcados']
}

/** Não chama a API: guarda a aula na fila (que a envia, com ou sem internet). Quem chama decide para onde voltar. */
export function useSalvarAula() {
  const { modo } = useConexao()
  return useMutation({
    // Sem isto o react-query pausa a mutação com o navegador offline e a aula nunca chega à fila.
    networkMode: 'always',
    mutationFn: async (entrada: EntradaSalvarAula) => {
      const payload: PayloadAulaFila = {
        registroAulaId: entrada.registroAulaId,
        correcao: entrada.correcao,
        classeNome: entrada.classeNome,
        corpo: {
          versaoPayload: 1,
          envioId: crypto.randomUUID(),
          classeId: entrada.classeId,
          data: entrada.data,
          feitaNoAparelhoEm: new Date().toISOString(),
          aulaPlanejadaId: entrada.aulaPlanejadaId,
          presencas: entrada.presencas,
          requisitosMarcados: entrada.requisitosMarcados,
          requisitosDesmarcados: entrada.requisitosDesmarcados,
        },
      }
      await enfileirar({ tipo: 'AULA', chave: `aula:${entrada.classeId}:${entrada.data}`, payload })
    },
    onSuccess: () => {
      toast.success('Aula salva', {
        description: modo === 'SEM_CONEXAO' ? 'Vai ser enviada quando houver internet.' : 'Enviando agora.',
      })
    },
  })
}
