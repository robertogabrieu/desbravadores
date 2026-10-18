const CHAVE = 'desbravadores:aparelho'
const TRINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000
const VALIDADE_DA_SENHA_MS = 5 * 60 * 1000

/** O que este aparelho lembra: o e-mail e a marca de passkey ativada, e quando a pessoa disse "Agora não". */
export interface Aparelho {
  email?: string
  passkey?: boolean
  recusadoEm?: number
}

function comoAparelho(valor: unknown): Aparelho {
  if (typeof valor !== 'object' || valor === null) return {}
  const aparelho: Aparelho = {}
  if ('email' in valor && typeof valor.email === 'string' && valor.email !== '') aparelho.email = valor.email
  if ('passkey' in valor && valor.passkey === true) aparelho.passkey = true
  if ('recusadoEm' in valor && typeof valor.recusadoEm === 'number') aparelho.recusadoEm = valor.recusadoEm
  return aparelho
}

/** Sem localStorage (modo privado, política do navegador, JSON estragado): o aparelho não lembra de nada. */
export function lerAparelho(): Aparelho {
  try {
    const texto = localStorage.getItem(CHAVE)
    return texto === null ? {} : comoAparelho(JSON.parse(texto))
  } catch {
    return {}
  }
}

function gravar(aparelho: Aparelho): void {
  try {
    if (Object.keys(aparelho).length === 0) localStorage.removeItem(CHAVE)
    else localStorage.setItem(CHAVE, JSON.stringify(aparelho))
  } catch {
    // Sem armazenamento a marca simplesmente não existe: o login volta a ser o de sempre.
  }
}

export function marcarPasskeyAtivada(email: string): void {
  const { recusadoEm } = lerAparelho()
  gravar({ email, passkey: true, ...(recusadoEm === undefined ? {} : { recusadoEm }) })
}

export function registrarRecusaDoConvite(agora = Date.now()): void {
  gravar({ ...lerAparelho(), recusadoEm: agora })
}

/** O "Agora não" ainda vale: só volta a perguntar depois de 30 dias. */
export function recusaDoConviteVale(agora = Date.now()): boolean {
  const { recusadoEm } = lerAparelho()
  return recusadoEm !== undefined && agora - recusadoEm < TRINTA_DIAS_MS
}

/** "Esquecer este aparelho": some a marca e o e-mail, mas o "Agora não" continua valendo. */
export function esquecerAparelho(): void {
  const { recusadoEm } = lerAparelho()
  gravar(recusadoEm === undefined ? {} : { recusadoEm })
}

/** A senha acabou de ser digitada e só serve para o convite: vive nesta variável, nunca em armazenamento nem em estado de navegação. */
let senhaDoConvite: { senha: string; ate: number } | null = null
let temporizadorDaSenha: ReturnType<typeof setTimeout> | undefined

export function guardarSenhaDoConvite(senha: string, agora = Date.now()): void {
  clearTimeout(temporizadorDaSenha)
  senhaDoConvite = { senha, ate: agora + VALIDADE_DA_SENHA_MS }
  // Sem leitura nenhuma, a senha ainda sai da memoria no prazo.
  temporizadorDaSenha = setTimeout(apagarSenhaDoConvite, VALIDADE_DA_SENHA_MS)
}

export function lerSenhaDoConvite(agora = Date.now()): string | null {
  if (senhaDoConvite && agora >= senhaDoConvite.ate) senhaDoConvite = null
  return senhaDoConvite?.senha ?? null
}

export function apagarSenhaDoConvite(): void {
  clearTimeout(temporizadorDaSenha)
  senhaDoConvite = null
}
