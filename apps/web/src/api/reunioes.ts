import { GradeFrequenciaSaida, ReuniaoDetalhe, ReuniaoResumo } from '@desbravadores/shared'
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { montarConsulta, requisitar } from './cliente'

// Dividido entre dois pacotes: B5 é dono das leituras, B4 da mutação. Cada um edita só o seu bloco.

/** Raízes que o `aoEnviar` do tipo REUNIAO invalida (com `inicio` e `ranking`). */
export const chavesReunioes = {
  lista: (unidadeId: string, mes: string) => ['reunioes', unidadeId, mes] as const,
  detalhe: (id: string) => ['reuniao', id] as const,
  grade: (unidadeId: string) => ['grade', unidadeId] as const,
}

// ── Leituras (B5) ────────────────────────────────────────────────────────────

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
// `useSalvarChamada()` enfileira um item REUNIAO (chave `<unidadeId>:<data>`); não chama a API direto.
