/** As 9 regras fixas do ranking: fonte única de grupo, ordem, texto e valor inicial (API, tela e semente do clube). */
export const GATILHOS_DE_REGRA = [
  'PRESENCA', 'PONTUALIDADE', 'UNIFORME', 'BIBLIA', 'LICAO',
  'REQUISITO', 'ESPECIALIDADE',
  'CLASSE_BIBLICA_PRESENCA', 'CLASSE_BIBLICA_PARTICIPACAO',
] as const
export type GatilhoDeRegra = (typeof GATILHOS_DE_REGRA)[number]

export type GrupoDeRegra = 'reuniao' | 'aulas' | 'classe-biblica'

export interface DefinicaoDeRegra {
  gatilho: GatilhoDeRegra
  grupo: GrupoDeRegra
  /** Posição da regra na lista (1 a 9). */
  ordem: number
  rotulo: string
  descricao: string
  pontosIniciais: number
  ligadaNoInicio: boolean
  lancadoPor: 'CONSELHEIRO' | 'INSTRUTOR' | 'ADM'
}

export const REGRAS_DE_PONTUACAO: readonly DefinicaoDeRegra[] = [
  { gatilho: 'PRESENCA', grupo: 'reuniao', ordem: 1, rotulo: 'Presença', descricao: 'O desbravador foi marcado como presente na chamada.', pontosIniciais: 10, ligadaNoInicio: true, lancadoPor: 'CONSELHEIRO' },
  { gatilho: 'PONTUALIDADE', grupo: 'reuniao', ordem: 2, rotulo: 'Pontualidade', descricao: 'Chegou presente e sem atraso.', pontosIniciais: 5, ligadaNoInicio: true, lancadoPor: 'CONSELHEIRO' },
  { gatilho: 'UNIFORME', grupo: 'reuniao', ordem: 3, rotulo: 'Uniforme completo', descricao: 'Veio com o uniforme completo do dia.', pontosIniciais: 5, ligadaNoInicio: true, lancadoPor: 'CONSELHEIRO' },
  { gatilho: 'BIBLIA', grupo: 'reuniao', ordem: 4, rotulo: 'Bíblia', descricao: 'Trouxe a Bíblia.', pontosIniciais: 3, ligadaNoInicio: true, lancadoPor: 'CONSELHEIRO' },
  { gatilho: 'LICAO', grupo: 'reuniao', ordem: 5, rotulo: 'Lição ou devocional em dia', descricao: 'Fez o estudo da semana.', pontosIniciais: 3, ligadaNoInicio: false, lancadoPor: 'CONSELHEIRO' },
  { gatilho: 'REQUISITO', grupo: 'aulas', ordem: 6, rotulo: 'Requisito de classe concluído', descricao: 'Cada requisito que o instrutor marca como feito.', pontosIniciais: 4, ligadaNoInicio: true, lancadoPor: 'INSTRUTOR' },
  { gatilho: 'ESPECIALIDADE', grupo: 'aulas', ordem: 7, rotulo: 'Especialidade concluída', descricao: 'Cada especialidade que o instrutor marca como concluída.', pontosIniciais: 15, ligadaNoInicio: true, lancadoPor: 'INSTRUTOR' },
  { gatilho: 'CLASSE_BIBLICA_PRESENCA', grupo: 'classe-biblica', ordem: 8, rotulo: 'Presença na Classe Bíblica', descricao: 'Estar presente num encontro da Classe Bíblica.', pontosIniciais: 10, ligadaNoInicio: true, lancadoPor: 'ADM' },
  { gatilho: 'CLASSE_BIBLICA_PARTICIPACAO', grupo: 'classe-biblica', ordem: 9, rotulo: 'Participação ativa na Classe Bíblica', descricao: 'Participar ativamente do encontro.', pontosIniciais: 5, ligadaNoInicio: true, lancadoPor: 'ADM' },
]

export interface DefinicaoDeGrupo {
  chave: GrupoDeRegra | 'eventos'
  titulo: string
  /** Linha "Quem lança" sob o título do grupo. */
  quemLanca: string
  /** Texto do painel: "Lançado por <isto>". */
  lancadoPor: string
}

export const GRUPOS_DE_REGRA: readonly DefinicaoDeGrupo[] = [
  { chave: 'reuniao', titulo: 'Na reunião de domingo', quemLanca: 'Quem lança: o conselheiro, na chamada', lancadoPor: 'o conselheiro, na chamada da reunião' },
  { chave: 'aulas', titulo: 'Nas aulas', quemLanca: 'Quem lança: o instrutor, ao marcar o que foi feito', lancadoPor: 'o instrutor, ao marcar o que foi feito' },
  { chave: 'classe-biblica', titulo: 'Na Classe Bíblica', quemLanca: 'Quem lança: o responsável pela chamada da classe', lancadoPor: 'o responsável pela chamada' },
  { chave: 'eventos', titulo: 'Em eventos especiais', quemLanca: 'Cada evento define os próprios pontos, no calendário. Lançado na lista de quem foi.', lancadoPor: 'a lista de quem foi ao evento' },
]

export function definicaoDaRegra(gatilho: GatilhoDeRegra): DefinicaoDeRegra {
  const regra = REGRAS_DE_PONTUACAO.find((r) => r.gatilho === gatilho)
  if (!regra) throw new Error(`Gatilho sem definição: ${gatilho}`)
  return regra
}
