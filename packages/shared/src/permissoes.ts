import type { Papel } from './enums'

type PadraoPorPapel = Partial<Record<Papel, boolean>>

interface ItemCatalogo {
  rotulo: string
  /** Papel ausente = a permissão não se aplica a ele; `false` = existe e começa desligada. */
  padrao: PadraoPorPapel
}

export const CATALOGO_PERMISSOES = {
  'dbv.ver': { rotulo: 'Ver desbravadores', padrao: { ADM: true, CONSELHEIRO: true, INSTRUTOR: true } },
  'dbv.ver_contato': { rotulo: 'Ver contato do responsável', padrao: { ADM: true, CONSELHEIRO: true } },
  'dbv.editar': { rotulo: 'Editar dados dos DBVs da unidade', padrao: { ADM: true, CONSELHEIRO: false } },
  'dbv.cadastrar': { rotulo: 'Cadastrar desbravadores', padrao: { ADM: true } },
  'reuniao.registrar': { rotulo: 'Registrar reuniões', padrao: { ADM: true, CONSELHEIRO: true } },
  'reuniao.ver': { rotulo: 'Ver histórico de reuniões', padrao: { ADM: true, CONSELHEIRO: true } },
  'foto.enviar': { rotulo: 'Enviar fotos na galeria', padrao: { ADM: true, CONSELHEIRO: true } },
  'foto.ver': { rotulo: 'Ver a galeria', padrao: { ADM: true, CONSELHEIRO: true } },
  'relatorio.unidade': { rotulo: 'Ver relatórios da unidade', padrao: { ADM: true, CONSELHEIRO: false } },
  'aula.registrar': { rotulo: 'Registrar classes', padrao: { ADM: true, INSTRUTOR: true } },
  'requisito.marcar': { rotulo: 'Marcar requisitos e especialidades', padrao: { ADM: true, INSTRUTOR: true } },
  'material.enviar': { rotulo: 'Enviar materiais de apoio', padrao: { ADM: true, INSTRUTOR: true } },
  'classe.ver_relatorio': { rotulo: 'Ver relatórios da classe', padrao: { ADM: true, INSTRUTOR: true } },
  'observacao.ver_outros': { rotulo: 'Ver observações de outros instrutores', padrao: { ADM: true, INSTRUTOR: false } },
  'ranking.lancar_manual': { rotulo: 'Lançar pontos manuais', padrao: { ADM: true } },
  'usuario.gerenciar': { rotulo: 'Gerenciar usuários', padrao: { ADM: true } },
  'unidade.gerenciar': { rotulo: 'Gerenciar unidades', padrao: { ADM: true } },
  'classe.gerenciar': { rotulo: 'Gerenciar classes e matrículas', padrao: { ADM: true } },
  'calendario.gerenciar': { rotulo: 'Gerenciar o calendário', padrao: { ADM: true } },
  'biblioteca.gerenciar': { rotulo: 'Montar a biblioteca do clube', padrao: { ADM: true } },
  'ranking.configurar': { rotulo: 'Configurar o ranking', padrao: { ADM: true } },
  'relatorio.geral': { rotulo: 'Ver relatórios gerais', padrao: { ADM: true } },
  'clube.configurar': { rotulo: 'Configurar o clube', padrao: { ADM: true } },
} as const satisfies Record<string, ItemCatalogo>

export type ChavePermissao = keyof typeof CATALOGO_PERMISSOES

export const CHAVES_PERMISSAO = Object.keys(CATALOGO_PERMISSOES) as ChavePermissao[]

export function ehChavePermissao(chave: string): chave is ChavePermissao {
  return Object.hasOwn(CATALOGO_PERMISSOES, chave)
}

/** A permissão existe para o papel (mesmo que comece desligada)? ADM não aceita ajuste. */
export function permissaoSeAplica(papel: Papel, chave: string): boolean {
  if (!ehChavePermissao(chave)) return false
  const padrao: PadraoPorPapel = CATALOGO_PERMISSOES[chave].padrao
  return padrao[papel] !== undefined
}

export interface AjusteDePermissao {
  permissao: string
  concedida: boolean
}

/** ADM tem todas; os outros papéis, o padrão com os ajustes que se aplicam a eles. */
export function permissoesEfetivas(papel: Papel, ajustes: readonly AjusteDePermissao[]): ChavePermissao[] {
  if (papel === 'ADM') return [...CHAVES_PERMISSAO]
  const ligadas = new Set<ChavePermissao>()
  for (const chave of CHAVES_PERMISSAO) {
    const padrao: PadraoPorPapel = CATALOGO_PERMISSOES[chave].padrao
    if (padrao[papel] === true) ligadas.add(chave)
  }
  for (const ajuste of ajustes) {
    if (!ehChavePermissao(ajuste.permissao) || !permissaoSeAplica(papel, ajuste.permissao)) continue
    if (ajuste.concedida) ligadas.add(ajuste.permissao)
    else ligadas.delete(ajuste.permissao)
  }
  return CHAVES_PERMISSAO.filter((chave) => ligadas.has(chave))
}
