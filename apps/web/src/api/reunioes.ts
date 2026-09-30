import {
  CabecalhoReuniaoEnvio,
  GradeFrequenciaSaida,
  MarcacaoChamadaEnvio,
  ReuniaoDetalhe,
  ReuniaoResumo,
} from '@desbravadores/shared'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { apagarRascunho, enfileirar, useConexao } from '../offline'
import type { PayloadReuniaoFila } from '../offline/tipos/reuniao'
import { useSessao } from '../sessao/useSessao'
import { montarConsulta, requisitar } from './cliente'

// Dividido entre dois pacotes: B5 é dono das leituras, B4 da mutação. Cada um edita só o seu bloco.

/** Raízes que o `aoEnviar` do tipo REUNIAO invalida (com `inicio` e `ranking`). */
export const chavesReunioes = {
  lista: (unidadeId: string, mes: string) => ['reunioes', unidadeId, mes] as const,
  detalhe: (id: string) => ['reuniao', id] as const,
  grade: (unidadeId: string) => ['grade', unidadeId] as const,
}

// ── Leituras (B5) ────────────────────────────────────────────────────────────

/** Frequência (%) abaixo da qual a tela pinta de vermelho. O padrão de `ConfiguracaoClube.limiarFrequenciaAlerta`;
 *  nenhum contrato da API entrega o valor configurado do clube ainda. */
export const LIMIAR_FREQUENCIA_ALERTA = 70

/** `mes` no formato AAAA-MM. */
export function useReunioes(unidadeId: string, mes: string) {
  return useQuery({
    queryKey: chavesReunioes.lista(unidadeId, mes),
    queryFn: () => requisitar(`/api/reunioes${montarConsulta({ unidadeId, mes })}`, z.array(ReuniaoResumo)),
  })
}

/** Também lido pela chamada (B4) para editar. */
export function useReuniao(id: string) {
  return useQuery({
    queryKey: chavesReunioes.detalhe(id),
    queryFn: () => requisitar(`/api/reunioes/${id}`, ReuniaoDetalhe),
  })
}

export function useGradeFrequencia(unidadeId: string) {
  return useQuery({
    queryKey: chavesReunioes.grade(unidadeId),
    queryFn: () => requisitar(`/api/unidades/${unidadeId}/frequencia`, GradeFrequenciaSaida),
  })
}

// ── Mutação (B4) ─────────────────────────────────────────────────────────────

export interface EntradaSalvarChamada {
  unidadeId: string
  unidadeNome: string
  data: string
  /** Id da reunião existente, ou o UUID novo que a chamada carrega desde o primeiro toque. */
  reuniaoId: string
  correcao: boolean
  cabecalho: z.infer<typeof CabecalhoReuniaoEnvio> | null
  linhas: z.infer<typeof MarcacaoChamadaEnvio>[]
  pontosProvisorios: number
}

/** Não chama a API: guarda a chamada na fila (que a envia, com ou sem internet) e volta ao histórico. */
export function useSalvarChamada() {
  const navegar = useNavigate()
  const { eu } = useSessao()
  const { modo } = useConexao()
  return useMutation({
    // Sem isto o react-query pausa a mutação com o navegador offline e a chamada nunca chega à fila.
    networkMode: 'always',
    mutationFn: async (entrada: EntradaSalvarChamada) => {
      const payload: PayloadReuniaoFila = {
        reuniaoId: entrada.reuniaoId,
        correcao: entrada.correcao,
        unidadeNome: entrada.unidadeNome,
        pontosProvisorios: entrada.pontosProvisorios,
        corpo: {
          versaoPayload: 1,
          envioId: crypto.randomUUID(),
          unidadeId: entrada.unidadeId,
          data: entrada.data,
          feitaNoAparelhoEm: new Date().toISOString(),
          cabecalho: entrada.cabecalho,
          linhas: entrada.linhas,
        },
      }
      await enfileirar({ tipo: 'REUNIAO', chave: `${entrada.unidadeId}:${entrada.data}`, payload })
      if (eu) await apagarRascunho(eu.usuario.id, `${entrada.unidadeId}:${entrada.data}`)
    },
    onSuccess: () => {
      toast.success('Chamada salva', {
        description: modo === 'SEM_CONEXAO' ? 'Vai ser enviada quando houver internet.' : 'Enviando agora.',
      })
      void navegar('/reunioes')
    },
  })
}
