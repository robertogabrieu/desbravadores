import type { PacoteSaida } from '@desbravadores/shared'
import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { baseDoPacote } from './fontes'

type ClasseDoPacote = NonNullable<z.infer<typeof PacoteSaida>['instrutor']>['classes'][number]
type Registro = ClasseDoPacote['registrosRecentes'][number]

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

describe('baseDoPacote', () => {
  it('membro guardado sem `conclusoes` conta como sem conclusões', () => {
    const registro = { id: uuid(1), aulaPlanejadaId: null, presencas: [] } as unknown as Registro
    const membroAntigo = { dbvId: uuid(2), nome: 'Ana', tipo: 'DBV', concluidos: [] }
    const classe = { requisitos: [], membros: [membroAntigo] } as unknown as ClasseDoPacote
    const base = baseDoPacote(registro, classe)
    expect(base.concluidosNaAula).toEqual([])
    expect(base.requisitos).toEqual([])
  })
})
