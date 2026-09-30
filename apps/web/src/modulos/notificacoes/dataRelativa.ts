const FORMATO = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

const UNIDADES: { unidade: Intl.RelativeTimeFormatUnit; segundos: number }[] = [
  { unidade: 'day', segundos: 86_400 },
  { unidade: 'hour', segundos: 3_600 },
  { unidade: 'minute', segundos: 60 },
]

/** "agora", "há 5 minutos", "há 2 horas", "ontem"…; a partir de 30 dias mostra a data. */
export function dataRelativa(instante: string, agora: Date = new Date()): string {
  const passados = Math.max(0, Math.floor((agora.getTime() - new Date(instante).getTime()) / 1000))
  const escolhida = UNIDADES.find(({ segundos }) => passados >= segundos)
  if (!escolhida) return 'agora'
  const quantidade = Math.floor(passados / escolhida.segundos)
  if (escolhida.unidade === 'day' && quantidade >= 30) return new Date(instante).toLocaleDateString('pt-BR')
  return FORMATO.format(-quantidade, escolhida.unidade)
}
