import { ServicoEmailFalso } from '../email/servico-email-falso'
import { criarUsuario, desconectarPrismaDeTeste, prismaDeTeste } from '../../test/fabricas'
import { ServicoTokenUsoUnico } from '../sessao/token-uso-unico.service'
import { analisarArgumentos, executarClubeCriar } from './clube-criar'

const CRITERIOS_ESPERADOS = [
  ['Presença', 10, true, 'PRESENCA', 'CONSELHEIRO', 1],
  ['Pontualidade', 5, true, 'PONTUALIDADE', 'CONSELHEIRO', 2],
  ['Uniforme completo', 5, true, 'UNIFORME', 'CONSELHEIRO', 3],
  ['Bíblia', 3, true, 'BIBLIA', 'CONSELHEIRO', 4],
  ['Lição/devocional', 3, false, 'LICAO', 'CONSELHEIRO', 5],
  ['Requisito concluído', 4, true, 'REQUISITO', 'INSTRUTOR', 6],
  ['Especialidade concluída', 15, true, 'ESPECIALIDADE', 'INSTRUTOR', 7],
  ['Participação em evento', 20, true, 'MANUAL', 'ADM', 8],
]

describe('clube:criar (SPEC 5.2 e 5.4)', () => {
  const prisma = prismaDeTeste()
  const email = new ServicoEmailFalso()
  const sufixo = (): string => Math.random().toString(36).slice(2, 10)

  beforeEach(() => email.limpar())
  afterAll(async () => desconectarPrismaDeTeste())

  it('cria clube, configuracao, 22 ClasseClube, 8 criterios e o Adm com vinculo ADM', async () => {
    const s = sufixo()
    const resultado = await executarClubeCriar(
      prisma,
      email,
      { nome: 'Clube Águias', slug: `aguias-${s}`, admNome: 'Ana Adm', admEmail: `Ana.${s}@Exemplo.org ` },
      { appUrl: 'https://app.exemplo.org' },
    )
    const clube = await prisma.clube.findUniqueOrThrow({ where: { id: resultado.clubeId }, include: { configuracao: true } })
    expect(clube.nome).toBe('Clube Águias')
    expect(clube.configuracao).toMatchObject({ fuso: 'America/Sao_Paulo', metaFrequencia: 80 })
    expect(await prisma.classeClube.count({ where: { clubeId: clube.id } })).toBe(22)

    const criterios = await prisma.criterioRanking.findMany({ where: { clubeId: clube.id }, orderBy: { ordem: 'asc' } })
    expect(criterios.map((c) => [c.nome, c.pontos, c.ativo, c.gatilho, c.lancadoPor, c.ordem])).toEqual(CRITERIOS_ESPERADOS)
    expect(criterios.every((c) => c.padrao)).toBe(true)

    const adm = await prisma.usuario.findUniqueOrThrow({ where: { email: `ana.${s}@exemplo.org` } })
    expect(adm).toMatchObject({ nome: 'Ana Adm', status: 'CONVIDADO', senhaHash: null })
    const vinculos = await prisma.vinculo.findMany({ where: { usuarioId: adm.id } })
    expect(vinculos).toHaveLength(1)
    expect(vinculos[0]).toMatchObject({ clubeId: clube.id, papel: 'ADM', ativo: true })
  })

  it('envia o convite pelo servico de e-mail e devolve o link, que consome o token', async () => {
    const s = sufixo()
    const resultado = await executarClubeCriar(
      prisma,
      email,
      { nome: 'Clube Lobos', slug: `lobos-${s}`, admNome: 'Lia', admEmail: `lia.${s}@exemplo.org` },
      { appUrl: 'https://app.exemplo.org' },
    )
    expect(email.enviadas).toHaveLength(1)
    const mensagem = email.enviadas[0]
    expect(mensagem?.para).toBe(`lia.${s}@exemplo.org`)
    expect(mensagem?.assunto).toBe('Seu acesso ao Clube Lobos')
    expect(resultado.linkConvite).toMatch(/^https:\/\/app\.exemplo\.org\/convite\/[A-Za-z0-9_-]{43}$/)
    expect(mensagem?.texto).toContain(resultado.linkConvite)
    const token = resultado.linkConvite?.split('/').pop() ?? ''
    const usuarioId = await new ServicoTokenUsoUnico(prisma).consumir(token, 'CONVITE')
    expect(usuarioId).toBe(resultado.usuarioId)
  })

  it('usuario ATIVO existente ganha o vinculo, sem convite, e recebe o e-mail de adicionado', async () => {
    const s = sufixo()
    const existente = await criarUsuario({ status: 'ATIVO', email: `ativo.${s}@exemplo.org`, nome: 'Rui' })
    const resultado = await executarClubeCriar(
      prisma,
      email,
      { nome: 'Clube Ursos', slug: `ursos-${s}`, admNome: 'Outro Nome', admEmail: existente.email },
      { appUrl: 'https://app.exemplo.org' },
    )
    expect(resultado.usuarioId).toBe(existente.id)
    expect(resultado.linkConvite).toBeNull()
    expect(await prisma.tokenUsoUnico.count({ where: { usuarioId: existente.id } })).toBe(0)
    expect(email.enviadas).toHaveLength(1)
    expect(email.enviadas[0]?.assunto).toBe('Você agora faz parte do Clube Ursos')
    const depois = await prisma.usuario.findUniqueOrThrow({ where: { id: existente.id } })
    expect(depois.nome).toBe('Rui')
    expect(await prisma.vinculo.count({ where: { usuarioId: existente.id, clubeId: resultado.clubeId, papel: 'ADM' } })).toBe(1)
  })

  it('slug repetido falha e nao deixa nada para tras', async () => {
    const s = sufixo()
    const base = { nome: 'Clube X', slug: `x-${s}`, admNome: 'Xis', admEmail: `xis.${s}@exemplo.org` }
    await executarClubeCriar(prisma, email, base, { appUrl: 'https://app.exemplo.org' })
    email.limpar()
    await expect(
      executarClubeCriar(prisma, email, { ...base, admEmail: `outro.${s}@exemplo.org` }, { appUrl: 'https://app.exemplo.org' }),
    ).rejects.toThrow()
    expect(await prisma.usuario.count({ where: { email: `outro.${s}@exemplo.org` } })).toBe(0)
    expect(email.enviadas).toHaveLength(0)
  })

  describe('argumentos da linha de comando', () => {
    it('le --nome --slug --adm-nome --adm-email', () => {
      expect(
        analisarArgumentos(['--nome', 'Clube A', '--slug', 'a', '--adm-nome', 'Ana', '--adm-email', 'a@b.co']),
      ).toEqual({ nome: 'Clube A', slug: 'a', admNome: 'Ana', admEmail: 'a@b.co' })
    })

    it('falta de argumento aponta qual', () => {
      expect(() => analisarArgumentos(['--nome', 'Clube A'])).toThrow(/--slug/)
    })

    it('slug fora do padrao e recusado', () => {
      expect(() =>
        analisarArgumentos(['--nome', 'A', '--slug', 'Slug Ruim', '--adm-nome', 'Ana', '--adm-email', 'a@b.co']),
      ).toThrow(/slug/)
    })
  })
})
