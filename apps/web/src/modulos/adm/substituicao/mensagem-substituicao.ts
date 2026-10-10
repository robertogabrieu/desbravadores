import type { AlvoDaSubstituicao, JanelaElegivel } from '../../../api/substituicao'

/** O alvo com o nome que aparece no texto: "Águias" vira "Unidade Águias"; a classe vai com o nome dela. */
export type AlvoComNome = Pick<AlvoDaSubstituicao, 'tipo'> & { nome: string }

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const DIAS_CURTOS = ['Dom.', 'Seg.', 'Ter.', 'Qua.', 'Qui.', 'Sex.', 'Sáb.']
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

function partes(data: string): { dia: number; mes: number; diaDaSemana: number } {
  const [ano, mes, dia] = data.split('-').map(Number)
  return { dia, mes, diaDaSemana: new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay() }
}

/** "2026-10-12" → "12/10" */
function diaMes(data: string): string {
  const { dia, mes } = partes(data)
  return `${String(dia).padStart(2, '0')}/${String(mes).padStart(2, '0')}`
}

/** "2026-10-12" → "12 de outubro" */
export function diaPorExtenso(data: string): string {
  const { dia, mes } = partes(data)
  return `${dia} de ${MESES[mes - 1]}`
}

/** Instante → "09:00" no fuso do clube. */
export function horaNoFuso(instante: string, fuso: string): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(instante))
}

/** "Dom., 12/10" */
export const diaCurto = (data: string): string => `${DIAS_CURTOS[partes(data).diaDaSemana]}, ${diaMes(data)}`

/** "no domingo" | "na quarta": sábado e domingo pedem "no". */
function noDia(data: string): string {
  const { diaDaSemana } = partes(data)
  return `${diaDaSemana === 0 || diaDaSemana === 6 ? 'no' : 'na'} ${DIAS[diaDaSemana]}`
}

/** "09:00 às 12:00" */
export const janelaEmHoras = (janela: Pick<JanelaElegivel, 'inicioEm' | 'fimEm'>, fuso: string): string =>
  `${horaNoFuso(janela.inicioEm, fuso)} às ${horaNoFuso(janela.fimEm, fuso)}`

/** "a chamada da Unidade Águias" | "o registro da classe Amigo" */
export const tarefaDoAlvo = (alvo: AlvoComNome): string =>
  alvo.tipo === 'unidade' ? `a chamada da Unidade ${alvo.nome}` : `o registro da classe ${alvo.nome}`

/** "Chamada da Unidade Águias" | "Registro da classe Amigo" */
export const paraQuem = (alvo: AlvoComNome): string =>
  alvo.tipo === 'unidade' ? `Chamada da Unidade ${alvo.nome}` : `Registro da classe ${alvo.nome}`

export function mensagemDaSubstituicao(dados: { alvo: AlvoComNome; janela: JanelaElegivel; link: string; fuso: string }): string {
  const { alvo, janela, link, fuso } = dados
  return (
    `Olá! Você vai fazer ${tarefaDoAlvo(alvo)} ${noDia(janela.data)}, ${diaMes(janela.data)}. ` +
    `O link abre às ${horaNoFuso(janela.inicioEm, fuso)} e fecha às ${horaNoFuso(janela.fimEm, fuso)}. Não precisa de senha: ${link}`
  )
}
