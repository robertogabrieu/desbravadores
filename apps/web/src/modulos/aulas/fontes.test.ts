import type { PacoteSaida } from '@desbravadores/shared'
import { describe, expect, it } from 'vitest'
import type { z } from 'zod'
import { criarClasseInstrutor } from '../../testes/handlers/aulas'
import { criarPacote, criarPacoteInstrutor, criarPacoteInstrutorAntigo } from '../../testes/handlers/offline'
import { chaveItem } from './estado'
import type { Membro } from './estado'
import { baseDoPacote, catalogoDeEspecialidades, especialidadesConcluidasNoRegistro, tarefasDaClasse, tarefasParaCobrar } from './fontes'

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

describe('especialidadesConcluidasNoRegistro', () => {
  const membro = (n: number, especialidades: { especialidadeId: string; registroAulaId: string | null }[] | undefined) =>
    ({ dbvId: uuid(n), nome: 'Ana', tipo: 'DBV', concluidos: [], especialidades }) as unknown as ClasseDoPacote['membros'][number]

  it('só as conclusões com o registro pedido, por dbvId|especialidadeId', () => {
    const classe = criarClasseInstrutor({
      membros: [membro(1, [{ especialidadeId: uuid(21), registroAulaId: uuid(700) }, { especialidadeId: uuid(22), registroAulaId: null }]), membro(2, [{ especialidadeId: uuid(21), registroAulaId: uuid(701) }])],
    })
    expect([...especialidadesConcluidasNoRegistro(classe, uuid(700))]).toEqual([`${uuid(1)}|${uuid(21)}`])
  })

  it('membro guardado sem `especialidades` conta como sem conclusões', () => {
    expect(especialidadesConcluidasNoRegistro(criarClasseInstrutor({ membros: [membro(1, undefined)] }), uuid(700)).size).toBe(0)
  })
})

describe('tarefasParaCobrar', () => {
  const REGISTRO = uuid(799)
  const tarefa = (n: number, data: string, parcial: Partial<ClasseDoPacote['tarefas'][number]> = {}) => ({ id: uuid(600 + n), registroAulaId: uuid(700 + n), data, encerrada: false, itens: [{ requisitoId: uuid(10 + n) }], ...parcial })
  const membro = (concluidos: string[], voce = false) => ({ dbvId: uuid(900 + concluidos.length), nome: 'Ana', concluidos, voce, especialidades: [] }) as unknown as Membro
  const DEVEDOR = membro([])
  const cobrar = (tarefas: ClasseDoPacote['tarefas'], entregues: string[] = [], membros: Membro[] = [DEVEDOR]) =>
    tarefasParaCobrar({ tarefas, registroAulaId: REGISTRO, data: '2030-10-04', entregues: new Set(entregues), membros, comFila: new Set() }).map((t) => t.data)

  it('abertas com data anterior à do registro, da mais recente para a mais antiga', () => {
    expect(cobrar([tarefa(1, '2030-09-13'), tarefa(2, '2030-09-27'), tarefa(3, '2030-10-04'), tarefa(4, '2030-10-11')])).toEqual(['2030-09-27', '2030-09-13'])
  })

  it('encerrada só entra com entrega neste registro, e depois das abertas', () => {
    const encerrada = tarefa(5, '2030-09-30', { encerrada: true })
    expect(cobrar([encerrada, tarefa(1, '2030-09-13')])).toEqual(['2030-09-13'])
    expect(cobrar([encerrada, tarefa(1, '2030-09-13')], [chaveItem(encerrada.itens[0])])).toEqual(['2030-09-13', '2030-09-30'])
  })

  it('a tarefa passada neste mesmo registro nunca é cobrada nele', () => {
    const propria = tarefa(9, '2030-09-20', { registroAulaId: REGISTRO })
    expect(cobrar([propria], [chaveItem(propria.itens[0])])).toEqual([])
  })

  it('aberta que ninguém mais deve e sem entrega aqui fica fora; com entrega aqui entra', () => {
    const quitada = tarefa(1, '2030-09-27')
    const quemJaFez = membro([uuid(11)])
    expect(cobrar([quitada], [], [quemJaFez])).toEqual([])
    expect(cobrar([quitada], [chaveItem(quitada.itens[0])], [quemJaFez])).toEqual(['2030-09-27'])
  })

  it('quem é "você" não conta como devedor', () => {
    expect(cobrar([tarefa(1, '2030-09-27')], [], [membro([], true)])).toEqual([])
  })

  it('a mais recente quitada não empurra a que tem devedores', () => {
    const quitada = tarefa(1, '2030-09-27')
    const comDevedor = tarefa(2, '2030-09-13')
    expect(cobrar([quitada, comDevedor], [], [membro([uuid(11)])])).toEqual(['2030-09-13'])
  })
})
