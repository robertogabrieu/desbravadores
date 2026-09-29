import { resolve } from 'node:path'
import dotenv from 'dotenv'
import { Client } from 'pg'

const RAIZ_REPO = resolve(__dirname, '../../../..')

const PREFIXO_PADRAO = 'teste_'
const HORAS_PADRAO = 2

// A data de criacao do banco e a de modificacao do PG_VERSION, escrito quando ele nasce.
const BANCOS_ANTIGOS = `
  SELECT datname FROM pg_database
  WHERE datname LIKE $1
    AND (pg_stat_file('base/' || oid || '/PG_VERSION')).modification
        < now() - make_interval(secs => $2)
`

export async function apagarBancosAntigos(
  urlAdmin: string,
  horas = HORAS_PADRAO,
  prefixo = PREFIXO_PADRAO,
): Promise<string[]> {
  const admin = new Client({ connectionString: urlAdmin })
  await admin.connect()
  const apagados: string[] = []
  try {
    const { rows } = await admin.query<{ datname: string }>(BANCOS_ANTIGOS, [
      `${prefixo.replace(/[\\%_]/g, '\\$&')}%`,
      horas * 3600,
    ])
    for (const { datname } of rows) {
      await admin.query(`DROP DATABASE IF EXISTS "${datname}" WITH (FORCE)`)
      apagados.push(datname)
    }
  } finally {
    await admin.end()
  }
  return apagados
}

if (require.main === module) {
  dotenv.config({ path: [resolve(RAIZ_REPO, '.env.teste'), resolve(RAIZ_REPO, '.env')], quiet: true })
  const urlAdmin = process.env['DATABASE_URL_ADMIN']
  if (!urlAdmin) throw new Error('Variavel DATABASE_URL_ADMIN ausente (.env ou .env.teste)')
  apagarBancosAntigos(urlAdmin)
    .then((apagados) => console.log(`${apagados.length} banco(s) de teste apagado(s)`))
    .catch((erro: unknown) => {
      console.error(erro)
      process.exit(1)
    })
}
