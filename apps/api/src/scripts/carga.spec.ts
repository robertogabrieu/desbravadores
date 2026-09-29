import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { criarBancoIsolado, type BancoIsolado } from '../../test/banco-isolado'
import { executarCarga, temHistorico, type ResumoDaCarga } from './carga'

const DADOS = resolve(__dirname, '../../../../docs/planejamento/dados')

const REQUISITOS_POR_CLASSE: [string, string, number][] = [
  ['Amigo', 'INDIVIDUAL', 24],
  ['Amigo da Natureza', 'INDIVIDUAL', 9],
  ['Companheiro', 'INDIVIDUAL', 26],
  ['Companheiro de Excursionismo', 'INDIVIDUAL', 12],
  ['Pesquisador', 'INDIVIDUAL', 23],
  ['Pesquisador de Campo e Bosque', 'INDIVIDUAL', 11],
  ['Pioneiro', 'INDIVIDUAL', 24],
  ['Pioneiro de Novas Fronteiras', 'INDIVIDUAL', 13],
  ['Excursionista', 'INDIVIDUAL', 26],
  ['Excursionista na Mata', 'INDIVIDUAL', 8],
  ['Guia', 'INDIVIDUAL', 29],
  ['Guia de Exploração', 'INDIVIDUAL', 8],
  ['Agrupadas 11 anos (Amigo e Companheiro)', 'AGRUPADAS', 46],
  ['Agrupadas 12 anos (Amigo a Pesquisador)', 'AGRUPADAS', 63],
  ['Agrupadas 13 anos (Amigo a Pioneiro)', 'AGRUPADAS', 80],
  ['Agrupadas 14 anos (Amigo a Excursionista)', 'AGRUPADAS', 98],
  ['Agrupadas 15 anos ou mais (Amigo a Guia)', 'AGRUPADAS', 123],
  ['Agrupadas 11 anos — avançada', 'AGRUPADAS', 21],
  ['Agrupadas 12 anos — avançada', 'AGRUPADAS', 32],
  ['Agrupadas 13 anos — avançada', 'AGRUPADAS', 42],
  ['Agrupadas 14 anos — avançada', 'AGRUPADAS', 53],
  ['Agrupadas 15 anos ou mais — avançada', 'AGRUPADAS', 63],
]

interface Caderno {
  classes: { secoes: { requisitos: { texto: string }[] }[] }[]
}
interface Especialidades {
  areas: { especialidades: unknown[] }[]
}

const ZERADO = { criados: 0, atualizados: 0, desativados: 0 }

describe('carga oficial (SPEC 5.3)', () => {
  let banco: BancoIsolado
  let dir: string

  beforeAll(async () => {
    banco = await criarBancoIsolado()
    dir = mkdtempSync(join(tmpdir(), 'carga-'))
    cpSync(DADOS, dir, { recursive: true })
  })

  afterAll(async () => {
    await banco.encerrar()
    rmSync(dir, { recursive: true, force: true })
  })

  async function contagens(): Promise<Record<string, number>> {
    const p = banco.prisma
    return {
      classes: await p.classe.count(),
      requisitos: await p.requisito.count(),
      areas: await p.areaEspecialidade.count(),
      especialidades: await p.especialidade.count(),
      mestrados: await p.mestrado.count(),
    }
  }

  function editarJson<T>(arquivo: string, alterar: (json: T) => void): void {
    const caminho = join(dir, arquivo)
    const json = JSON.parse(readFileSync(caminho, 'utf8')) as T
    alterar(json)
    writeFileSync(caminho, JSON.stringify(json))
  }

  it('arquivo ausente falha e nada e gravado', async () => {
    const vazio = mkdtempSync(join(tmpdir(), 'carga-vazia-'))
    cpSync(DADOS, vazio, { recursive: true })
    rmSync(join(vazio, 'cadernos', 'guia.json'))
    const antes = await contagens()
    await expect(executarCarga(banco.prisma, { dir: vazio })).rejects.toThrow(/guia\.json/)
    expect(await contagens()).toEqual(antes)
    rmSync(vazio, { recursive: true, force: true })
  })

  let primeira: ResumoDaCarga

  it('primeira carga cria 22 classes, 834 requisitos, 9 areas, 514 especialidades e 16 mestrados', async () => {
    primeira = await executarCarga(banco.prisma, { dir })
    expect(primeira.classes.criados).toBe(22)
    expect(primeira.requisitos.criados).toBe(834)
    expect(primeira.areas.criados).toBe(9)
    expect(primeira.especialidades.criados).toBe(514)
    expect(primeira.mestrados.criados).toBe(16)
    expect(await contagens()).toEqual({ classes: 22, requisitos: 834, areas: 9, especialidades: 514, mestrados: 16 })
  })

  it.each(REQUISITOS_POR_CLASSE)('%s (%s) tem %i requisitos', async (nome, trilha, total) => {
    const quantidade = await banco.prisma.requisito.count({
      where: { secao: { classe: { nome, trilha: trilha as 'INDIVIDUAL' | 'AGRUPADAS', clubeId: null } } },
    })
    expect(quantidade).toBe(total)
  })

  it('grava as classes como oficiais, com a avancada ligada a regular e logo depois dela na ordem', async () => {
    const amigo = await banco.prisma.classe.findFirstOrThrow({ where: { nome: 'Amigo', clubeId: null } })
    const avancada = await banco.prisma.classe.findFirstOrThrow({ where: { nome: 'Amigo da Natureza', clubeId: null } })
    expect(amigo).toMatchObject({ origem: 'OFICIAL', tipo: 'REGULAR', trilha: 'INDIVIDUAL', idade: 10, classeBaseId: null })
    expect(avancada).toMatchObject({ origem: 'OFICIAL', tipo: 'AVANCADA', classeBaseId: amigo.id })
    expect(avancada.ordem).toBe(amigo.ordem + 1)
    const companheiro = await banco.prisma.classe.findFirstOrThrow({ where: { nome: 'Companheiro', clubeId: null } })
    expect(companheiro.ordem).toBe(amigo.ordem + 100)
    const agrupada = await banco.prisma.classe.findFirstOrThrow({
      where: { nome: 'Agrupadas 12 anos — avançada', clubeId: null },
      include: { classeBase: true },
    })
    expect(agrupada.classeBase?.nome).toBe('Agrupadas 12 anos (Amigo a Pesquisador)')
    expect(agrupada.classeBase?.trilha).toBe('AGRUPADAS')
  })

  it('segunda execucao: zero criados, zero atualizados, zero desativados', async () => {
    const segunda = await executarCarga(banco.prisma, { dir })
    for (const tipo of ['classes', 'secoes', 'requisitos', 'areas', 'especialidades', 'mestrados', 'classesClube'] as const) {
      expect(segunda[tipo]).toEqual(ZERADO)
    }
  })

  it('cria ClasseClube que faltar para cada clube existente', async () => {
    const clube = await banco.prisma.clube.create({ data: { nome: 'C', slug: `c-${Date.now()}` } })
    const resumo = await executarCarga(banco.prisma, { dir })
    expect(resumo.classesClube.criados).toBe(22)
    expect(await banco.prisma.classeClube.count({ where: { clubeId: clube.id } })).toBe(22)
    expect((await executarCarga(banco.prisma, { dir })).classesClube.criados).toBe(0)
  })

  it('texto que muda atualiza o requisito (sem historico nesta fase)', async () => {
    expect(await temHistorico('qualquer-id')).toBe(false)
    editarJson<Caderno>('cadernos/amigo.json', (json) => {
      json.classes[0].secoes[0].requisitos[0].texto = 'Texto revisado.'
    })
    const resumo = await executarCarga(banco.prisma, { dir })
    expect(resumo.requisitos).toEqual({ criados: 0, atualizados: 1, desativados: 0 })
    const req = await banco.prisma.requisito.findFirstOrThrow({
      where: { codigo: 'G1', secao: { codigo: 'G', classe: { nome: 'Amigo', clubeId: null } } },
    })
    expect(req.texto).toBe('Texto revisado.')
  })

  it('requisito removido do JSON vira inativo, e volta a ativo se reaparecer', async () => {
    editarJson<Caderno>('cadernos/amigo.json', (json) => {
      json.classes[0].secoes[0].requisitos.pop()
    })
    const resumo = await executarCarga(banco.prisma, { dir })
    expect(resumo.requisitos.desativados).toBe(1)
    const inativos = await banco.prisma.requisito.count({ where: { ativo: false } })
    expect(inativos).toBe(1)
    expect(await banco.prisma.requisito.count()).toBe(834)

    cpSync(join(DADOS, 'cadernos', 'amigo.json'), join(dir, 'cadernos', 'amigo.json'))
    const volta = await executarCarga(banco.prisma, { dir })
    expect(volta.requisitos.atualizados).toBeGreaterThanOrEqual(1)
    expect(await banco.prisma.requisito.count({ where: { ativo: false } })).toBe(0)
  })

  it('freio: recusa sem --forcar quando desativaria mais de 10% dos requisitos, e nada muda', async () => {
    editarJson<Caderno>('cadernos/agrupadas.json', (json) => {
      json.classes = json.classes.slice(0, 1)
    })
    await expect(executarCarga(banco.prisma, { dir })).rejects.toThrow(/forcar/)
    expect(await banco.prisma.requisito.count({ where: { ativo: false } })).toBe(0)
    const forcada = await executarCarga(banco.prisma, { dir, forcar: true })
    expect(forcada.requisitos.desativados).toBeGreaterThan(83)
    expect(await banco.prisma.requisito.count({ where: { ativo: false } })).toBe(forcada.requisitos.desativados)
  })

  it('freio tambem vale para especialidades', async () => {
    cpSync(DADOS, dir, { recursive: true })
    await executarCarga(banco.prisma, { dir })
    editarJson<Especialidades>('especialidades.json', (json) => {
      for (const area of json.areas.slice(0, 3)) area.especialidades = []
    })
    await expect(executarCarga(banco.prisma, { dir })).rejects.toThrow(/forcar/)
    const forcada = await executarCarga(banco.prisma, { dir, forcar: true })
    expect(forcada.especialidades.desativados).toBeGreaterThan(51)
  })
})
