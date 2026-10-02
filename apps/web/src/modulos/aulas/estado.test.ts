import { describe, expect, it } from 'vitest'
import { alternarEntrega, alternarPresenca, alternarRequisito, chaveItem, encerrarTarefa, encerradasNaFila, especialidadesComFila, efetivamenteEntregue, reabrirTarefa, chavePar, comporEstado, concluidosComFila, concluidoEm, concluidosDoServidor, itensDaTarefa, lerRascunhoValido, montarEntrada, passarItem, passarOQueFaltou, pontosProvisorios, quemFalta, rascunhoDe, requisitosVisiveis, tirarItem } from './estado'
import type { BaseAula, ItemPendente, Membro, Requisito } from './estado'

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ANA = uuid(1)
const BRUNO = uuid(2)
const LIDER = uuid(3)
const R1 = uuid(11)
const R2 = uuid(12)
const ESP = uuid(21)
const TAREFA = uuid(600)

const membros: Membro[] = [
  { dbvId: ANA, nome: 'Ana', tipo: 'DBV', concluidos: [], conclusoes: [] },
  { dbvId: BRUNO, nome: 'Bruno', tipo: 'DBV', concluidos: [R2], conclusoes: [{ requisitoId: R2, concluidoEm: '2030-02-20', registroAulaId: null }] },
  { dbvId: LIDER, nome: 'Lia', tipo: 'LIDER', concluidos: [], conclusoes: [] },
]
const requisito = (id: string, codigo: string): Requisito => ({ id, codigo, texto: `texto ${codigo}`, campo: false, secaoCodigo: 'DE' })
const requisitos = [requisito(R1, 'R1'), requisito(R2, 'R2')]
const classe = { id: uuid(400), nome: 'Companheiro' }
const base = (parcial: Partial<BaseAula> = {}): BaseAula => ({
  registroAulaId: uuid(700),
  aulaPlanejadaId: null,
  presencas: [
    { dbvId: ANA, presente: true, versao: '2030-03-10T12:00:00.000Z' },
    { dbvId: BRUNO, presente: false, versao: '2030-03-10T12:01:00.000Z' },
  ],
  requisitos: null,
  concluidosNaAula: [],
  ...parcial,
})
const contexto = { membros, requisitos, especialidades: [{ id: ESP, nome: 'Nós e amarras' }], registroAulaId: uuid(700), aulaPlanejadaId: null, classe, data: '2030-03-10' }
const corpoVazio: ItemPendente['corpo'] = {
  versaoPayload: 1, envioId: uuid(9), classeId: classe.id, data: '2030-03-10', feitaNoAparelhoEm: '2030-03-10T12:00:00.000Z', aulaPlanejadaId: null, presencas: [],
  requisitosMarcados: [], requisitosDesmarcados: [], tarefaId: null, tarefaItensAcrescentados: [], tarefaItensRetirados: [], especialidadesMarcadas: [], especialidadesDesmarcadas: [], tarefasEncerradas: [],
}
const sem = { membros, base: null, fila: [], rascunho: null }

describe('estado da aula', () => {
  it('aula nova começa com todos presentes; edição, só com o que o servidor tem', () => {
    expect(comporEstado(sem).presencas).toEqual({ [ANA]: true, [BRUNO]: true, [LIDER]: true })
    expect(comporEstado({ ...sem, base: base() }).presencas).toEqual({ [ANA]: true, [BRUNO]: false, [LIDER]: null })
  })

  it('a fila vem por cima do servidor e o rascunho por cima da fila', () => {
    const fila: ItemPendente[] = [
      {
        registroAulaId: uuid(700),
        corpo: { versaoPayload: 1, envioId: uuid(9), classeId: classe.id, data: '2030-03-10', feitaNoAparelhoEm: '2030-03-10T12:00:00.000Z', aulaPlanejadaId: null, presencas: [{ dbvId: ANA, presente: false, versaoVista: null }], requisitosMarcados: [{ dbvId: BRUNO, requisitoId: R1 }], requisitosDesmarcados: [], tarefaId: null, tarefaItensAcrescentados: [], tarefaItensRetirados: [], especialidadesMarcadas: [], especialidadesDesmarcadas: [], tarefasEncerradas: [] },
      },
    ]
    const estado = comporEstado({ membros, base: base(), fila, rascunho: { presencas: { [ANA]: true }, acoes: {}, extras: [], itensAcrescentados: [], itensRetirados: [], acoesEspecialidade: {}, tarefasEncerradas: [] } })
    expect(estado.presencas[ANA]).toBe(true)
    expect(estado.tocadas).toEqual([ANA])
    expect(estado.extras).toEqual([R1])
    expect(concluidosComFila(concluidosDoServidor(base()), fila).has(chavePar(BRUNO, R1))).toBe(true)
  })

  it('faltar desfaz as marcações da sessão e voltar ao que a base diz apaga a ação', () => {
    const vazio = new Set<string>()
    let estado = comporEstado(sem)
    estado = alternarRequisito(estado, vazio, ANA, R1)
    expect(estado.acoes[chavePar(ANA, R1)]).toBe('MARCAR')
    expect(alternarRequisito(estado, vazio, ANA, R1).acoes).toEqual({})
    estado = alternarPresenca(estado, ANA)
    expect(estado.acoes).toEqual({})
    expect(estado.presencas[ANA]).toBe(false)
  })

  it('desmarcar o que a base já tem vira DESMARCAR', () => {
    const servidor = new Set([chavePar(ANA, R1)])
    const estado = alternarRequisito(comporEstado({ ...sem, base: base() }), servidor, ANA, R1)
    expect(estado.acoes[chavePar(ANA, R1)]).toBe('DESMARCAR')
  })

  it('nova envia todos, sem versão; correção envia só os tocados, com a versão vista', () => {
    const nova = montarEntrada({ ...contexto, estado: comporEstado(sem), base: null })
    expect(nova?.correcao).toBe(false)
    expect(nova?.presencas).toEqual([ANA, BRUNO, LIDER].map((dbvId) => ({ dbvId, presente: true, versaoVista: null })))
    const b = base()
    const editada = montarEntrada({ ...contexto, estado: alternarPresenca(comporEstado({ ...sem, base: b }), BRUNO), base: b })
    expect(editada?.correcao).toBe(true)
    expect(editada?.presencas).toEqual([{ dbvId: BRUNO, presente: true, versaoVista: '2030-03-10T12:01:00.000Z' }])
  })

  it('edição sem toque não tem o que salvar; marcação de quem faltou não sai no envio', () => {
    const b = base()
    expect(montarEntrada({ ...contexto, estado: comporEstado({ ...sem, base: b }), base: b })).toBeNull()
    const ausente = { ...comporEstado({ ...sem, base: b }), acoes: { [chavePar(BRUNO, R1)]: 'MARCAR' as const }, tocadas: [BRUNO] }
    const entrada = montarEntrada({ ...contexto, estado: ausente, base: b })
    expect(entrada?.requisitosMarcados).toEqual([])
  })

  it('pontos: só requisito novo de presente do tipo DBV; LIDER e critério inativo não pontuam', () => {
    let estado = comporEstado(sem)
    for (const dbvId of [ANA, LIDER]) estado = alternarRequisito(estado, new Set(), dbvId, R1)
    const vazio = new Set<string>()
    const entrada = { membros, estado, servidor: vazio, comFila: vazio, requisitos }
    expect(pontosProvisorios({ ...entrada, pontosRequisito: { pontos: 5, ativo: true } })).toBe(5)
    expect(pontosProvisorios({ ...entrada, pontosRequisito: { pontos: 5, ativo: false } })).toBe(0)
  })

  it('a ficha do próprio instrutor ("você") não entra no envio, nos pontos nem no que falta', () => {
    const IVO = uuid(4)
    const comVoce: Membro[] = [...membros, { dbvId: IVO, nome: 'Ivo', tipo: 'DBV', concluidos: [], conclusoes: [], voce: true }]
    let estado = comporEstado({ ...sem, membros: comVoce })
    for (const dbvId of [ANA, IVO]) estado = alternarRequisito(estado, new Set(), dbvId, R1)
    const entrada = montarEntrada({ ...contexto, membros: comVoce, estado, base: null })
    expect(entrada?.requisitosMarcados).toEqual([{ dbvId: ANA, requisitoId: R1 }])
    expect(entrada?.presencas.map((p) => p.dbvId)).toContain(IVO)
    const vazio = new Set<string>()
    expect(pontosProvisorios({ membros: comVoce, estado, servidor: vazio, comFila: vazio, requisitos, pontosRequisito: { pontos: 5, ativo: true } })).toBe(5)
    const faltam = quemFalta(comVoce, comporEstado({ ...sem, membros: comVoce }), vazio, requisitos)
    expect(faltam.flatMap((linha) => linha.nomes)).not.toContain('Ivo')
  })

  it('requisitos visíveis: os planejados e os acrescentados, na ordem da classe', () => {
    const estado = { ...comporEstado(sem), extras: [R1] }
    expect(requisitosVisiveis({ daClasse: requisitos, base: null, planejados: [R2], estado }).map((r) => r.codigo)).toEqual(['R1', 'R2'])
    expect(requisitosVisiveis({ daClasse: requisitos, base: null, planejados: [], estado: comporEstado(sem) })).toEqual([])
  })

  it('membro de pacote antigo, sem `conclusoes`, não derruba a leitura da data', () => {
    const antigo: Membro = { dbvId: ANA, nome: 'Ana', tipo: 'DBV', concluidos: [R1] }
    expect(concluidoEm(antigo, R1)).toBeNull()
  })

  describe('tarefa para casa', () => {
    const requisitoR1 = { requisitoId: R1 }
    const especialidade = { especialidadeId: ESP }

    it('passar e tirar guardam só a última ação de cada item, sem repetir', () => {
      let estado = comporEstado(sem)
      estado = passarItem(passarItem(estado, requisitoR1), especialidade)
      expect(passarItem(estado, requisitoR1).itensAcrescentados).toEqual([requisitoR1, especialidade])
      expect(estado.itensRetirados).toEqual([])
      estado = tirarItem(estado, requisitoR1)
      expect(estado.itensAcrescentados).toEqual([especialidade])
      expect(estado.itensRetirados).toEqual([requisitoR1])
      estado = passarItem(estado, requisitoR1)
      expect(estado.itensAcrescentados).toEqual([especialidade, requisitoR1])
      expect(estado.itensRetirados).toEqual([])
      expect(chaveItem(requisitoR1)).not.toBe(chaveItem(especialidade))
    })

    it('tarefaId: o da tarefa do registro na edição, o da fila no registro novo, e um novo só quando não há nenhum', () => {
      expect(comporEstado({ ...sem, base: base(), tarefaDoRegistroId: TAREFA }).tarefaId).toBe(TAREFA)
      const fila: ItemPendente[] = [{ registroAulaId: uuid(700), corpo: { ...corpoVazio, tarefaId: uuid(601) } }]
      expect(comporEstado({ ...sem, fila }).tarefaId).toBe(uuid(601))
      expect(comporEstado(sem).tarefaId).toMatch(/^[0-9a-f-]{36}$/)
    })

    it('montarEntrada tem conteúdo quando só a tarefa mudou e leva o id da tarefa e o nome da especialidade', () => {
      const b = base()
      const parado = comporEstado({ ...sem, base: b, tarefaDoRegistroId: TAREFA })
      expect(montarEntrada({ ...contexto, estado: parado, base: b })).toBeNull()
      const estado = tirarItem(passarItem(parado, especialidade), requisitoR1)
      const entrada = montarEntrada({ ...contexto, estado, base: b })
      expect(entrada?.presencas).toEqual([])
      expect(entrada?.tarefaId).toBe(TAREFA)
      expect(entrada?.tarefaItensAcrescentados).toEqual([especialidade])
      expect(entrada?.tarefaItensRetirados).toEqual([requisitoR1])
      expect(entrada?.especialidades).toEqual({ [ESP]: 'Nós e amarras' })
    })

    it('sem item mexido o envio não leva tarefaId', () => {
      const entrada = montarEntrada({ ...contexto, estado: alternarPresenca(comporEstado(sem), ANA), base: null })
      expect(entrada?.tarefaId).toBeNull()
      expect(entrada?.tarefaItensAcrescentados).toEqual([])
    })

    it('o rascunho guarda e relê os itens; rascunho antigo, sem eles, lê vazio', () => {
      const estado = tirarItem(passarItem(comporEstado(sem), especialidade), requisitoR1)
      const lido = lerRascunhoValido(rascunhoDe(estado))
      expect(lido?.itensAcrescentados).toEqual([especialidade])
      expect(lido?.itensRetirados).toEqual([requisitoR1])
      expect(comporEstado({ ...sem, rascunho: lido }).itensRetirados).toEqual([requisitoR1])
      const antigo = lerRascunhoValido({ presencas: {}, acoes: {}, extras: [] })
      expect(antigo?.itensAcrescentados).toEqual([])
      expect(antigo?.itensRetirados).toEqual([])
    })

    it('itens da tarefa: o que já está nela, mais a fila, mais o que a pessoa mexeu agora', () => {
      const fila: ItemPendente[] = [{ registroAulaId: uuid(700), corpo: { ...corpoVazio, tarefaItensAcrescentados: [especialidade], tarefaItensRetirados: [requisitoR1] } }]
      const estado = passarItem(comporEstado(sem), { requisitoId: R2 })
      expect(itensDaTarefa({ daTarefa: [requisitoR1], fila, estado })).toEqual([especialidade, { requisitoId: R2 }])
    })

    it('fila antiga, sem os campos novos, não quebra a leitura', () => {
      const antigo = Object.fromEntries(Object.entries(corpoVazio).filter(([campo]) => !campo.startsWith('tarefa')))
      const fila = [{ registroAulaId: uuid(700), corpo: antigo as ItemPendente['corpo'] }]
      expect(comporEstado({ ...sem, fila }).tarefaId).toMatch(/^[0-9a-f-]{36}$/)
      expect(itensDaTarefa({ daTarefa: [requisitoR1], fila, estado: comporEstado(sem) })).toEqual([requisitoR1])
    })

    it('"Passar o que faltou": só requisito do dia que algum presente não cumpriu, ignorando os que já estão em tarefa aberta', () => {
      const vazio = new Set<string>()
      const estado = alternarPresenca(comporEstado(sem), ANA)
      const faltas = quemFalta(membros, estado, vazio, requisitos)
      expect(faltas.map((f) => [f.requisito.codigo, f.nomes])).toEqual([['R1', ['Bruno', 'Lia']], ['R2', ['Lia']]])
      expect(passarOQueFaltou(estado, faltas, vazio).itensAcrescentados).toEqual([{ requisitoId: R1 }, { requisitoId: R2 }])
      expect(passarOQueFaltou(estado, faltas, new Set([chaveItem({ requisitoId: R1 })])).itensAcrescentados).toEqual([{ requisitoId: R2 }])
      const todosConcluiram = quemFalta(membros, estado, new Set([chavePar(BRUNO, R1), chavePar(LIDER, R1), chavePar(LIDER, R2)]), requisitos)
      expect(passarOQueFaltou(estado, todosConcluiram, vazio).itensAcrescentados).toEqual([])
    })
  })

  describe('cobrança da tarefa', () => {
    const vazio = new Set<string>()
    const comSem = (parcial: Partial<ItemPendente['corpo']>): ItemPendente[] => [{ registroAulaId: uuid(700), corpo: { ...corpoVazio, ...parcial } }]

    it('entregar especialidade: a ação vale por dbvId|especialidadeId e voltar ao que a base diz apaga a ação', () => {
      let estado = alternarEntrega(comporEstado(sem), vazio, ANA, ESP)
      expect(estado.acoesEspecialidade).toEqual({ [chavePar(ANA, ESP)]: 'MARCAR' })
      expect(efetivamenteEntregue(estado, vazio, ANA, ESP)).toBe(true)
      expect(alternarEntrega(estado, vazio, ANA, ESP).acoesEspecialidade).toEqual({})
      const gravada = new Set([chavePar(ANA, ESP)])
      estado = alternarEntrega(comporEstado(sem), gravada, ANA, ESP)
      expect(estado.acoesEspecialidade).toEqual({ [chavePar(ANA, ESP)]: 'DESMARCAR' })
      expect(efetivamenteEntregue(estado, gravada, ANA, ESP)).toBe(false)
    })

    it('a fila entra por baixo da sessão: entrega e desfeita da fila, na ordem', () => {
      const fila = [
        ...comSem({ especialidadesMarcadas: [{ dbvId: ANA, especialidadeId: ESP }, { dbvId: BRUNO, especialidadeId: ESP }] }),
        ...comSem({ especialidadesDesmarcadas: [{ dbvId: BRUNO, especialidadeId: ESP }] }),
      ]
      expect([...especialidadesComFila(new Set([chavePar(LIDER, ESP)]), fila)]).toEqual([chavePar(LIDER, ESP), chavePar(ANA, ESP)])
    })

    it('encerrar e reabrir guardam o id sem repetir; a fila diz o que já está encerrado', () => {
      const encerrada = encerrarTarefa(encerrarTarefa(comporEstado(sem), TAREFA), TAREFA)
      expect(encerrada.tarefasEncerradas).toEqual([TAREFA])
      expect(reabrirTarefa(encerrada, TAREFA).tarefasEncerradas).toEqual([])
      expect([...encerradasNaFila(comSem({ tarefasEncerradas: [TAREFA] }))]).toEqual([TAREFA])
      expect(comporEstado(sem).tarefasEncerradas).toEqual([])
    })

    it('montarEntrada leva entregas de especialidade, desmarcações e tarefas encerradas, com o nome da especialidade', () => {
      const b = base()
      const parado = comporEstado({ ...sem, base: b })
      let estado = alternarEntrega(parado, vazio, ANA, ESP)
      estado = alternarEntrega(estado, new Set([chavePar(BRUNO, ESP)]), BRUNO, ESP)
      estado = encerrarTarefa({ ...estado, presencas: { ...estado.presencas, [BRUNO]: true }, tocadas: [...estado.tocadas, BRUNO] }, TAREFA)
      const entrada = montarEntrada({ ...contexto, estado, base: b })
      expect(entrada?.especialidadesMarcadas).toEqual([{ dbvId: ANA, especialidadeId: ESP }])
      expect(entrada?.especialidadesDesmarcadas).toEqual([{ dbvId: BRUNO, especialidadeId: ESP }])
      expect(entrada?.tarefasEncerradas).toEqual([TAREFA])
      expect(entrada?.especialidades).toEqual({ [ESP]: 'Nós e amarras' })
    })

    it('só encerrar a tarefa já dá o que salvar; sem ação nenhuma, nada', () => {
      const b = base()
      const entrada = montarEntrada({ ...contexto, estado: encerrarTarefa(comporEstado({ ...sem, base: b }), TAREFA), base: b })
      expect(entrada?.tarefasEncerradas).toEqual([TAREFA])
      expect(entrada?.presencas).toEqual([])
      expect(montarEntrada({ ...contexto, estado: comporEstado({ ...sem, base: b }), base: b })).toBeNull()
    })

    it('entrega de quem faltou não sai no envio, mas a desmarcação dele sai', () => {
      const b = base()
      const ausente = { ...comporEstado({ ...sem, base: b }), acoesEspecialidade: { [chavePar(BRUNO, ESP)]: 'MARCAR' as const }, acoes: { [chavePar(BRUNO, R1)]: 'DESMARCAR' as const }, tocadas: [BRUNO] }
      const entrada = montarEntrada({ ...contexto, estado: ausente, base: b })
      expect(entrada?.especialidadesMarcadas).toEqual([])
      expect(entrada?.requisitosDesmarcados).toEqual([{ dbvId: BRUNO, requisitoId: R1 }])
    })

    it('marcar ausente desfaz as entregas dele já gravadas neste registro, requisito e especialidade; voltar a presente restaura', () => {
      const gravadas = { requisitos: new Set([chavePar(ANA, R1), chavePar(BRUNO, R1)]), especialidades: new Set([chavePar(ANA, ESP)]) }
      const b = base()
      const presente = comporEstado({ ...sem, base: b })
      const ausente = alternarPresenca(presente, ANA, gravadas)
      expect(ausente.presencas[ANA]).toBe(false)
      expect(ausente.acoes).toEqual({ [chavePar(ANA, R1)]: 'DESMARCAR' })
      expect(ausente.acoesEspecialidade).toEqual({ [chavePar(ANA, ESP)]: 'DESMARCAR' })
      const entrada = montarEntrada({ ...contexto, estado: ausente, base: b })
      expect(entrada?.requisitosDesmarcados).toEqual([{ dbvId: ANA, requisitoId: R1 }])
      expect(entrada?.especialidadesDesmarcadas).toEqual([{ dbvId: ANA, especialidadeId: ESP }])
      const de_volta = alternarPresenca(ausente, ANA, gravadas)
      expect(de_volta.acoes).toEqual({})
      expect(de_volta.acoesEspecialidade).toEqual({})
    })

    it('marcar ausente também apaga a entrega que só existia na sessão', () => {
      const estado = alternarEntrega(comporEstado(sem), vazio, ANA, ESP)
      expect(alternarPresenca(estado, ANA).acoesEspecialidade).toEqual({})
    })

    it('o rascunho guarda e relê as ações de especialidade e as tarefas encerradas; rascunho antigo lê vazio', () => {
      const estado = encerrarTarefa(alternarEntrega(comporEstado(sem), vazio, ANA, ESP), TAREFA)
      const lido = lerRascunhoValido(rascunhoDe(estado))
      expect(comporEstado({ ...sem, rascunho: lido }).acoesEspecialidade).toEqual({ [chavePar(ANA, ESP)]: 'MARCAR' })
      expect(comporEstado({ ...sem, rascunho: lido }).tarefasEncerradas).toEqual([TAREFA])
      const antigo = lerRascunhoValido({ presencas: {}, acoes: {}, extras: [] })
      expect(antigo?.acoesEspecialidade).toEqual({})
      expect(antigo?.tarefasEncerradas).toEqual([])
    })

    it('prévia de pontos: soma os pontos de especialidade das entregas novas de DBV presente', () => {
      let estado = alternarRequisito(comporEstado(sem), vazio, ANA, R1)
      for (const dbvId of [ANA, BRUNO, LIDER]) estado = alternarEntrega(estado, vazio, dbvId, ESP)
      const entrada = { membros, estado, servidor: vazio, comFila: vazio, requisitos, pontosRequisito: { pontos: 4, ativo: true } }
      const especialidades = { servidor: vazio, comFila: vazio, pontos: { pontos: 10, ativo: true } }
      expect(pontosProvisorios({ ...entrada, especialidades })).toBe(4 + 2 * 10)
      expect(pontosProvisorios({ ...entrada, especialidades: { ...especialidades, pontos: { pontos: 10, ativo: false } } })).toBe(4)
      expect(pontosProvisorios({ ...entrada, pontosRequisito: { pontos: 4, ativo: false }, especialidades })).toBe(20)
      const jaGravada = { ...especialidades, servidor: new Set([chavePar(ANA, ESP)]), comFila: new Set([chavePar(ANA, ESP)]) }
      expect(pontosProvisorios({ ...entrada, especialidades: jaGravada })).toBe(4 + 10)
    })

    it('requisito da cobrança fica fora dos visíveis, salvo o planejado para a data', () => {
      const estado = { ...comporEstado(sem), extras: [R1, R2] }
      const daCobranca = new Set([R1, R2])
      expect(requisitosVisiveis({ daClasse: requisitos, base: null, planejados: [], estado, daCobranca })).toEqual([])
      expect(requisitosVisiveis({ daClasse: requisitos, base: null, planejados: [R2], estado, daCobranca }).map((r) => r.codigo)).toEqual(['R2'])
      expect(requisitosVisiveis({ daClasse: requisitos, base: base({ requisitos: [requisitos[0]] }), planejados: [], estado: comporEstado(sem), daCobranca }).map((r) => r.codigo)).toEqual([])
    })
  })
})
