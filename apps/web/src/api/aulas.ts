import { AulaDetalhe, AulaResumo } from '@desbravadores/shared'
import { useMutation, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { useNavigate } from 'react-router-dom'
import { apagarRascunho, enfileirar, useConexao } from '../offline'
import type { PayloadAulaFila } from '../offline/tipos/aula'
import { toast } from 'sonner'
import { useSessao } from '../sessao/useSessao'
import { montarConsulta, requisitar } from './cliente'

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
  nomes: PayloadAulaFila['nomes']
  codigos: PayloadAulaFila['codigos']
}

/** Não chama a API: guarda a aula na fila (que a envia, com ou sem internet) e volta ao Início. */
export function useSalvarAula() {
  const navegar = useNavigate()
  const { eu } = useSessao()
  const { modo } = useConexao()
  return useMutation({
    // Sem isto o react-query pausa a mutação com o navegador offline e a aula nunca chega à fila.
    networkMode: 'always',
    mutationFn: async (entrada: EntradaSalvarAula) => {
      const payload: PayloadAulaFila = {
        registroAulaId: entrada.registroAulaId,
        correcao: entrada.correcao,
        classeNome: entrada.classeNome,
        nomes: entrada.nomes,
        codigos: entrada.codigos,
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
      const chave = `aula:${entrada.classeId}:${entrada.data}`
      await enfileirar({ tipo: 'AULA', chave, payload })
      if (eu) await apagarRascunho(eu.usuario.id, chave)
    },
    onSuccess: () => {
      toast.success('Classe salva', {
        description: modo === 'SEM_CONEXAO' ? 'Vai ser enviada quando houver internet.' : 'Enviando agora.',
      })
      void navegar('/inicio')
    },
  })
}
