import { parseArgs } from 'node:util'
import { PrismaSistema } from '../comum/prisma/prisma-sistema'
import { emailAdicionado, emailConvite } from '../email/modelos'
import type { ServicoEmail } from '../email/servico-email'
import { ServicoEmailSmtp } from '../email/servico-email-smtp'
import type { Clube, Prisma } from '../generated/prisma/client.js'
import { ServicoTokenUsoUnico } from '../sessao/token-uso-unico.service'

export interface ArgumentosDoClube {
  nome: string
  slug: string
  admNome: string
  admEmail: string
}

export interface ResultadoDoClube {
  clubeId: string
  usuarioId: string
  /** Link do convite; `null` quando o Adm ja e um usuario ativo (recebe so o aviso de que foi adicionado). */
  linkConvite: string | null
}

// Criterios padrao do ranking (SPEC 5.4).
const CRITERIOS_PADRAO = [
  { nome: 'Presença', pontos: 10, ativo: true, gatilho: 'PRESENCA', lancadoPor: 'CONSELHEIRO' },
  { nome: 'Pontualidade', pontos: 5, ativo: true, gatilho: 'PONTUALIDADE', lancadoPor: 'CONSELHEIRO' },
  { nome: 'Uniforme completo', pontos: 5, ativo: true, gatilho: 'UNIFORME', lancadoPor: 'CONSELHEIRO' },
  { nome: 'Bíblia', pontos: 3, ativo: true, gatilho: 'BIBLIA', lancadoPor: 'CONSELHEIRO' },
  { nome: 'Lição/devocional', pontos: 3, ativo: false, gatilho: 'LICAO', lancadoPor: 'CONSELHEIRO' },
  { nome: 'Requisito concluído', pontos: 4, ativo: true, gatilho: 'REQUISITO', lancadoPor: 'INSTRUTOR' },
  { nome: 'Especialidade concluída', pontos: 15, ativo: true, gatilho: 'ESPECIALIDADE', lancadoPor: 'INSTRUTOR' },
  { nome: 'Participação em evento', pontos: 20, ativo: true, gatilho: 'MANUAL', lancadoPor: 'ADM' },
] as const satisfies Omit<Prisma.CriterioRankingCreateManyInput, 'clubeId' | 'ordem' | 'padrao'>[]

const FORMATO_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** Clube, configuracao, uma ClasseClube por classe oficial e os 8 criterios padrao. */
export async function criarClubeBase(
  tx: Prisma.TransactionClient,
  dados: { nome: string; slug: string },
): Promise<Clube> {
  const clube = await tx.clube.create({ data: { nome: dados.nome, slug: dados.slug } })
  await tx.configuracaoClube.create({ data: { clubeId: clube.id } })
  const classes = await tx.classe.findMany({ where: { clubeId: null }, select: { id: true } })
  await tx.classeClube.createMany({ data: classes.map((c) => ({ clubeId: clube.id, classeId: c.id })) })
  await tx.criterioRanking.createMany({
    data: CRITERIOS_PADRAO.map((criterio, indice) => ({
      ...criterio,
      clubeId: clube.id,
      ordem: indice + 1,
      padrao: true,
    })),
  })
  return clube
}

/** Numa transacao: clube + Adm (novo ou existente). Depois dela: convite por e-mail ou aviso de "adicionado". */
export async function executarClubeCriar(
  prisma: PrismaSistema,
  email: ServicoEmail,
  argumentos: ArgumentosDoClube,
  opcoes: { appUrl: string },
): Promise<ResultadoDoClube> {
  const admEmail = argumentos.admEmail.trim().toLowerCase()
  const { clube, adm } = await prisma.$transaction(async (tx) => {
    const clube = await criarClubeBase(tx, { nome: argumentos.nome, slug: argumentos.slug })
    const adm =
      (await tx.usuario.findUnique({ where: { email: admEmail } })) ??
      (await tx.usuario.create({ data: { nome: argumentos.admNome, email: admEmail } }))
    await tx.vinculo.create({ data: { usuarioId: adm.id, clubeId: clube.id, papel: 'ADM' } })
    return { clube, adm }
  })

  if (adm.status === 'ATIVO') {
    await email.enviar(emailAdicionado({ para: adm.email, nome: adm.nome, clube: clube.nome, appUrl: opcoes.appUrl }))
    return { clubeId: clube.id, usuarioId: adm.id, linkConvite: null }
  }
  const token = await new ServicoTokenUsoUnico(prisma).gerar(adm.id, 'CONVITE')
  await email.enviar(
    emailConvite({ para: adm.email, nome: adm.nome, clube: clube.nome, token, appUrl: opcoes.appUrl }),
  )
  return { clubeId: clube.id, usuarioId: adm.id, linkConvite: `${opcoes.appUrl.replace(/\/+$/, '')}/convite/${token}` }
}

export function analisarArgumentos(argv: string[]): ArgumentosDoClube {
  const { values } = parseArgs({
    args: argv,
    options: {
      nome: { type: 'string' },
      slug: { type: 'string' },
      'adm-nome': { type: 'string' },
      'adm-email': { type: 'string' },
    },
  })
  const nome = values.nome
  const slug = values.slug
  const admNome = values['adm-nome']
  const admEmail = values['adm-email']
  if (!nome) throw new Error('Falta --nome')
  if (!slug) throw new Error('Falta --slug')
  if (!admNome) throw new Error('Falta --adm-nome')
  if (!admEmail) throw new Error('Falta --adm-email')
  if (!FORMATO_SLUG.test(slug)) throw new Error('O slug usa so letras minusculas, numeros e hifen (ex.: aguias-de-fogo)')
  return { nome, slug, admNome, admEmail }
}

async function principal(): Promise<void> {
  const argumentos = analisarArgumentos(process.argv.slice(2))
  const appUrl = process.env['APP_URL'] ?? 'http://localhost:5173'
  const prisma = new PrismaSistema()
  try {
    const resultado = await executarClubeCriar(prisma, new ServicoEmailSmtp(), argumentos, { appUrl })
    console.log(`Clube "${argumentos.nome}" criado (${resultado.clubeId}).`)
    if (resultado.linkConvite) console.log(`Link do convite do Adm: ${resultado.linkConvite}`)
    else console.log('O Adm ja tinha conta ativa: recebeu o aviso de que foi adicionado ao clube.')
  } finally {
    await prisma.$disconnect()
  }
}

if (require.main === module) {
  principal().catch((erro: unknown) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exitCode = 1
  })
}
