import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'

const RAIZ_API = resolve(__dirname, '../../..')
const RAIZ_REPO = resolve(RAIZ_API, '../..')
const SRC = join(RAIZ_API, 'src')
const PASTAS_PERMITIDAS = ['sessao', 'auth', 'scripts', 'tarefas', join('comum', 'prisma')]

function arquivosTs(pasta: string): string[] {
  return readdirSync(pasta, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = join(pasta, entrada.name)
    if (entrada.isDirectory()) return entrada.name === 'generated' ? [] : arquivosTs(caminho)
    return caminho.endsWith('.ts') ? [caminho] : []
  })
}

function permitido(caminho: string): boolean {
  const rel = relative(SRC, caminho)
  return PASTAS_PERMITIDAS.some((pasta) => rel.startsWith(pasta + sep))
}

describe('PrismaSistema so vive em sessao/, auth/, scripts/ e tarefas/', () => {
  it('nenhum arquivo de producao fora dessas pastas importa o PrismaSistema', () => {
    const infratores = arquivosTs(SRC)
      .filter((arq) => !arq.endsWith('.spec.ts') && !permitido(arq))
      .filter((arq) => /prisma-sistema/.test(readFileSync(arq, 'utf8')))
      .map((arq) => relative(SRC, arq))
    expect(infratores).toEqual([])
  })

  function regraPara(arquivo: string): string {
    const saida = execFileSync('npx', ['eslint', '--print-config', arquivo], {
      cwd: RAIZ_REPO,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    })
    const regra = (JSON.parse(saida) as { rules: Record<string, unknown> }).rules['no-restricted-imports']
    return JSON.stringify(regra) ?? ''
  }

  it('o lint barra o import do PrismaSistema em modulos de feature', () => {
    for (const pasta of ['usuarios', 'desbravadores', 'comum/guards', 'saude']) {
      const regra = regraPara(`apps/api/src/${pasta}/x.ts`)
      expect(regra).toContain('prisma-sistema')
      expect(regra).toMatch(/^\[(2|"error"),/)
    }
  })

  it('o lint libera o import em sessao, auth, scripts e tarefas', () => {
    for (const pasta of ['sessao', 'auth', 'scripts', 'tarefas']) {
      expect(regraPara(`apps/api/src/${pasta}/x.ts`)).not.toContain('prisma-sistema')
    }
  })
})
