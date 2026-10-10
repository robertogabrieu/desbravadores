import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { criarBancoIsolado, type BancoIsolado } from '../../test/banco-isolado'
import { executarCarga, temHistorico, type ResumoDaCarga } from './carga'
import { criarClubeBase } from './clube-criar'

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
  ['Agrupadas (Amigo a Guia)', 'AGRUPADAS', 123],
  ['Agrupadas — avançada', 'AGRUPADAS', 63],
]

interface Caderno {
  classes: { secoes: { requisitos: { texto: string }[] }[] }[]
}
interface Especialidades {
  areas: { especialidades: unknown[] }[]
}

const MIGRATION_CLASSE_BIBLICA = resolve(__dirname, '../../prisma/migrations/20261010120000_classe_biblica/migration.sql')
const MARCADOS_CLASSE_BIBLICA = [
  'AGRUPADAS|Agrupadas (Amigo a Guia)|G|G15|oficial',
  'INDIVIDUAL|Amigo|G|G6|oficial',
  'INDIVIDUAL|Companheiro|G|G6|oficial',
  'INDIVIDUAL|Pesquisador|G|G6|oficial',
]

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

  it('primeira carga cria 14 classes, 399 requisitos, 9 areas, 514 especialidades e 16 mestrados', async () => {
    primeira = await executarCarga(banco.prisma, { dir })
    expect(primeira.classes.criados).toBe(14)
    expect(primeira.requisitos.criados).toBe(399)
    expect(primeira.areas.criados).toBe(9)
    expect(primeira.especialidades.criados).toBe(514)
    expect(primeira.mestrados.criados).toBe(16)
    expect(await contagens()).toEqual({ classes: 14, requisitos: 399, areas: 9, especialidades: 514, mestrados: 16 })
  })

  async function marcadosClasseBiblica(): Promise<string[]> {
    const requisitos = await banco.prisma.requisito.findMany({
      where: { classeBiblica: true },
      select: { codigo: true, secao: { select: { codigo: true, classe: { select: { nome: true, trilha: true, clubeId: true } } } } },
    })
    return requisitos
      .map((r) => `${r.secao.classe.trilha}|${r.secao.classe.nome}|${r.secao.codigo}|${r.codigo}|${r.secao.classe.clubeId ?? 'oficial'}`)
      .sort()
  }

  it('liga a marca de Classe Bíblica exatamente em Amigo G6, Companheiro G6, Pesquisador G6 e Agrupadas G15', async () => {
    expect(await marcadosClasseBiblica()).toEqual(MARCADOS_CLASSE_BIBLICA)
  })

  it('o UPDATE da migration, rodado com a marca zerada, liga os mesmos 4 requisitos', async () => {
    const sql = readFileSync(MIGRATION_CLASSE_BIBLICA, 'utf8')
    const inicio = sql.indexOf('UPDATE "Requisito"')
    expect(inicio).toBeGreaterThanOrEqual(0)
    const update = sql.slice(inicio, sql.indexOf(';', inicio) + 1)
    await banco.prisma.requisito.updateMany({ data: { classeBiblica: false } })
    expect(await marcadosClasseBiblica()).toEqual([])

    await banco.prisma.$executeRawUnsafe(update)

    expect(await marcadosClasseBiblica()).toEqual(MARCADOS_CLASSE_BIBLICA)
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
      where: { nome: 'Agrupadas — avançada', clubeId: null },
      include: { classeBase: true },
    })
    expect(agrupada).toMatchObject({ idade: 16, tipo: 'AVANCADA', trilha: 'AGRUPADAS', ativa: true })
    expect(agrupada.classeBase).toMatchObject({ nome: 'Agrupadas (Amigo a Guia)', idade: 16, trilha: 'AGRUPADAS' })
    expect(await banco.prisma.classe.count({ where: { trilha: 'AGRUPADAS', clubeId: null } })).toBe(2)
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
    expect(resumo.classesClube.criados).toBe(14)
    expect(await banco.prisma.classeClube.count({ where: { clubeId: clube.id } })).toBe(14)
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
    expect(await banco.prisma.requisito.count()).toBe(399)

    cpSync(join(DADOS, 'cadernos', 'amigo.json'), join(dir, 'cadernos', 'amigo.json'))
    const volta = await executarCarga(banco.prisma, { dir })
    expect(volta.requisitos.atualizados).toBeGreaterThanOrEqual(1)
    expect(await banco.prisma.requisito.count({ where: { ativo: false } })).toBe(0)
  })

  it('classe oficial que sai dos arquivos fica inativa, fora dos clubes novos, e volta ativa se reaparecer', async () => {
    const naturezaAtiva = { nome: 'Amigo da Natureza', trilha: 'INDIVIDUAL', clubeId: null } as const
    editarJson<Caderno>('cadernos/amigo.json', (json) => {
      json.classes = json.classes.slice(0, 1)
    })
    const resumo = await executarCarga(banco.prisma, { dir })
    expect(resumo.classes.desativados).toBe(1)
    expect(resumo.requisitos.desativados).toBe(9)
    const natureza = await banco.prisma.classe.findFirstOrThrow({ where: naturezaAtiva })
    expect(natureza.ativa).toBe(false)
    expect(await banco.prisma.classe.count({ where: { clubeId: null, ativa: true } })).toBe(13)
    expect((await executarCarga(banco.prisma, { dir })).classes).toEqual(ZERADO)

    const novo = await banco.prisma.$transaction((tx) => criarClubeBase(tx, { nome: 'Novo', slug: `novo-${Date.now()}` }))
    const doNovo = await banco.prisma.classeClube.findMany({ where: { clubeId: novo.id }, select: { classeId: true } })
    expect(doNovo).toHaveLength(13)
    expect(doNovo.map((c) => c.classeId)).not.toContain(natureza.id)

    const semNada = await banco.prisma.clube.create({ data: { nome: 'Sem classes', slug: `sem-${Date.now()}` } })
    await executarCarga(banco.prisma, { dir })
    const completadas = await banco.prisma.classeClube.findMany({ where: { clubeId: semNada.id }, select: { classeId: true } })
    expect(completadas).toHaveLength(13)
    expect(completadas.map((c) => c.classeId)).not.toContain(natureza.id)

    cpSync(join(DADOS, 'cadernos', 'amigo.json'), join(dir, 'cadernos', 'amigo.json'))
    const volta = await executarCarga(banco.prisma, { dir })
    expect(volta.classes).toEqual({ criados: 0, atualizados: 1, desativados: 0 })
    expect((await banco.prisma.classe.findFirstOrThrow({ where: naturezaAtiva })).ativa).toBe(true)
    expect(await banco.prisma.requisito.count({ where: { ativo: false } })).toBe(0)
    expect(await banco.prisma.classeClube.count({ where: { clubeId: novo.id, classeId: natureza.id } })).toBe(1)
  })

  it('freio: recusa sem --forcar quando desativaria mais de 10% dos requisitos, e nada muda', async () => {
    editarJson<Caderno>('cadernos/agrupadas.json', (json) => {
      json.classes = json.classes.slice(0, 1)
    })
    await expect(executarCarga(banco.prisma, { dir })).rejects.toThrow(/forcar/)
    expect(await banco.prisma.requisito.count({ where: { ativo: false } })).toBe(0)
    const forcada = await executarCarga(banco.prisma, { dir, forcar: true })
    expect(forcada.requisitos.desativados).toBe(63)
    expect(forcada.classes.desativados).toBe(1)
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
