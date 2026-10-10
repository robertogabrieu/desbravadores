import { describe, expect, it } from 'vitest'
import {
  AGUIAS_CB,
  ENCONTRO_CB_ID,
  GRUPO_DANIEL_ID,
  GRUPO_ESTER_ID,
  criarChamadaCB,
  criarPacoteClasseBiblica,
} from '../../../testes/handlers/classe-biblica'
import { uuid } from '../../../testes/handlers/sessao'
import {
  alternarParticipacao,
  alternarPresenca,
  aplicarFila,
  chamadaDoPacote,
  fraseDosTotais,
  marcasIniciais,
  montarEnvio,
  textoDosTotais,
  totais,
} from './estado'

const ANA = AGUIAS_CB[0]?.dbvId ?? ''
const ENZO = AGUIAS_CB[2]?.dbvId ?? ''

describe('chamada a partir do pacote', () => {
  it('lista cada um na unidade em que estava na data: quem saiu antes ou entrou depois fica fora', () => {
    const pacote = criarPacoteClasseBiblica()
    const daniel = pacote.grupos[0]
    const aguias = daniel?.unidades[0]
    if (!aguias) throw new Error('pacote sem Águias')
    aguias.membros.push(
      { dbvId: uuid(9001), nome: 'Saiu Antes', inicio: '2026-02-01', fim: '2026-10-05' },
      { dbvId: uuid(9002), nome: 'Saiu No Dia', inicio: '2026-02-01', fim: '2026-10-11' },
      { dbvId: uuid(9003), nome: 'Entra Depois', inicio: '2026-10-12', fim: null },
      { dbvId: uuid(9004), nome: 'Saiu Depois', inicio: '2026-02-01', fim: '2026-10-12' },
    )
    const chamada = chamadaDoPacote(pacote, ENCONTRO_CB_ID, GRUPO_DANIEL_ID)
    const nomes = chamada?.unidades[0]?.desbravadores.map((d) => d.nome) ?? []
    expect(nomes).toContain('Noah Campos')
    expect(nomes).toContain('Saiu Depois')
    expect(nomes).not.toContain('Saiu Antes')
    expect(nomes).not.toContain('Saiu No Dia')
    expect(nomes).not.toContain('Entra Depois')
    expect(chamada?.unidades.map((u) => u.desbravadores.length)).toEqual([11, 10, 11])
    expect(chamada?.registrada).toBe(false)
  })

  it('traz a presença gravada com a versão, e a chamada registrada do grupo', () => {
    const pacote = criarPacoteClasseBiblica({
      presencas: [{ encontroId: ENCONTRO_CB_ID, dbvId: ENZO, presente: false, participou: false, versao: '2026-10-11T14:00:00.000-03:00' }],
      chamadasRegistradas: [{ encontroId: ENCONTRO_CB_ID, grupoId: GRUPO_DANIEL_ID }],
    })
    const chamada = chamadaDoPacote(pacote, ENCONTRO_CB_ID, GRUPO_DANIEL_ID)
    const enzo = chamada?.unidades[0]?.desbravadores.find((d) => d.dbvId === ENZO)
    expect(enzo).toMatchObject({ presente: false, versao: '2026-10-11T14:00:00.000-03:00' })
    expect(chamada?.registrada).toBe(true)
    expect(chamadaDoPacote(pacote, ENCONTRO_CB_ID, GRUPO_ESTER_ID)?.registrada).toBe(false)
  })

  it('encontro ou grupo fora do pacote não tem chamada no aparelho', () => {
    const pacote = criarPacoteClasseBiblica()
    expect(chamadaDoPacote(pacote, uuid(1), GRUPO_DANIEL_ID)).toBeNull()
    expect(chamadaDoPacote(pacote, ENCONTRO_CB_ID, uuid(1))).toBeNull()
    expect(chamadaDoPacote(criarPacoteClasseBiblica({ grupos: [] }), ENCONTRO_CB_ID, GRUPO_DANIEL_ID)).toBeNull()
  })
})

describe('marcas', () => {
  it('todos começam presentes e sem participação', () => {
    const marcas = marcasIniciais(criarChamadaCB())
    expect(Object.keys(marcas)).toHaveLength(31)
    expect(totais(marcas)).toEqual({ presentes: 31, faltas: 0, participaram: 0 })
  })

  it('falta desmarca a participação e não deixa marcar; voltar a presente deixa desmarcado', () => {
    let marcas = alternarParticipacao(marcasIniciais(criarChamadaCB()), ENZO)
    expect(marcas[ENZO]).toEqual({ presente: true, participou: true })
    marcas = alternarPresenca(marcas, ENZO)
    expect(marcas[ENZO]).toEqual({ presente: false, participou: false })
    expect(alternarParticipacao(marcas, ENZO)).toBe(marcas)
    marcas = alternarPresenca(marcas, ENZO)
    expect(marcas[ENZO]).toEqual({ presente: true, participou: false })
  })

  it('linha gravada de ausente com participação chega desmarcada', () => {
    const base = criarChamadaCB()
    const aguias = base.unidades[0]
    if (!aguias) throw new Error('sem Águias')
    aguias.desbravadores = aguias.desbravadores.map((d) => (d.dbvId === ANA ? { ...d, presente: false, participou: true } : d))
    expect(marcasIniciais(base)[ANA]).toEqual({ presente: false, participou: false })
  })

  it('totais no texto do rodapé e da confirmação, com singular', () => {
    expect(textoDosTotais({ presentes: 29, faltas: 2, participaram: 4 })).toBe('29 presentes · 2 faltas · 4 participaram ativamente')
    expect(textoDosTotais({ presentes: 1, faltas: 1, participaram: 1 })).toBe('1 presente · 1 falta · 1 participou ativamente')
    expect(fraseDosTotais({ presentes: 29, faltas: 2, participaram: 4 })).toBe('29 presentes, 2 faltas e 4 participaram ativamente')
  })
})

describe('envio', () => {
  it('uma linha por desbravador com a versão vista; ausente nunca vai com participação', () => {
    const chamada = criarChamadaCB()
    const aguias = chamada.unidades[0]
    if (!aguias) throw new Error('sem Águias')
    aguias.desbravadores = aguias.desbravadores.map((d) => (d.dbvId === ANA ? { ...d, versao: '2026-10-11T14:00:00.000-03:00' } : d))
    const marcas = { ...marcasIniciais(chamada), [ENZO]: { presente: false, participou: true } }
    const envio = montarEnvio(chamada, marcas, uuid(77))
    expect(envio.envioId).toBe(uuid(77))
    expect(envio.linhas).toHaveLength(31)
    expect(envio.linhas.find((l) => l.dbvId === ENZO)).toEqual({ dbvId: ENZO, presente: false, participou: false, versaoVista: null })
    expect(envio.linhas.find((l) => l.dbvId === ANA)?.versaoVista).toBe('2026-10-11T14:00:00.000-03:00')
  })

  it('grupo sem ninguém envia sem linhas', () => {
    expect(montarEnvio(criarChamadaCB({ unidades: [] }), {}, uuid(78)).linhas).toEqual([])
  })
})

describe('fila por cima', () => {
  it('as linhas da fila, na ordem, vencem as da base; quem não está na lista é ignorado', () => {
    const base = marcasIniciais(criarChamadaCB())
    const marcas = aplicarFila(base, [
      [{ dbvId: ENZO, presente: false, participou: false, versaoVista: null }, { dbvId: ANA, presente: true, participou: true, versaoVista: null }],
      [{ dbvId: ANA, presente: false, participou: true, versaoVista: null }, { dbvId: uuid(9999), presente: false, participou: false, versaoVista: null }],
    ])
    expect(marcas[ENZO]).toEqual({ presente: false, participou: false })
    expect(marcas[ANA]).toEqual({ presente: false, participou: false })
    expect(marcas[uuid(9999)]).toBeUndefined()
    expect(Object.keys(marcas)).toHaveLength(31)
  })
})
