import type { PacoteSaida } from '@desbravadores/shared'
import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { criarClasseInstrutor } from '../../testes/handlers/aulas'
import { criarPacote, criarPacoteInstrutor, criarPacoteInstrutorAntigo } from '../../testes/handlers/offline'
import { baseDoPacote, catalogoDeEspecialidades, tarefasDaClasse } from './fontes'

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

describe('tarefasDaClasse', () => {
  it('devolve as tarefas que o pacote guardou para a classe', () => {
    const tarefa = { id: uuid(1), registroAulaId: uuid(2), data: '2030-03-10', encerrada: false, itens: [{ requisitoId: uuid(3) }] }
    expect(tarefasDaClasse(criarClasseInstrutor({ tarefas: [tarefa] }))).toEqual([tarefa])
  })

  it('classe guardada antes das tarefas, sem o campo, vale lista vazia', () => {
    const antiga = { ...criarClasseInstrutor(), tarefas: undefined } as unknown as ClasseDoPacote
    expect(tarefasDaClasse(antiga)).toEqual([])
  })
})

describe('catalogoDeEspecialidades', () => {
  it('devolve o catálogo do pacote, mesmo vazio', () => {
    const catalogo = [{ id: uuid(1), nome: 'Nós e Amarras', area: 'Artes e habilidades manuais' }]
    expect(catalogoDeEspecialidades(criarPacote({ instrutor: criarPacoteInstrutor({ especialidades: catalogo }) }))).toEqual(catalogo)
    expect(catalogoDeEspecialidades(criarPacote({ instrutor: criarPacoteInstrutor() }))).toEqual([])
  })

  it('pacote antigo, sem catálogo, ou sem parte de instrutor: nulo', () => {
    expect(catalogoDeEspecialidades(criarPacote({ instrutor: criarPacoteInstrutorAntigo() }))).toBeNull()
    expect(catalogoDeEspecialidades(criarPacote())).toBeNull()
  })
})
