/** Datas civis trafegam como "AAAA-MM-DD"; instantes como Date. */

function partesDaData(data: string): { ano: number; mes: number; dia: number } {
  const [ano, mes, dia] = data.split('-').map(Number)
  return { ano, mes, dia }
}

/** `inicioAnoClube` no formato "MM-DD". Antes dessa data, vale o ano anterior. */
export function anoClube(data: string, inicioAnoClube: string): number {
  const { ano } = partesDaData(data)
  return data.slice(5) >= inicioAnoClube ? ano : ano - 1
}

function ehBissexto(ano: number): boolean {
  return (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0
}

/** Quem nasceu em 29/02 faz aniversário em 01/03 nos anos não bissextos. */
export function idade(nascimento: string, hoje: string): number {
  const nasc = partesDaData(nascimento)
  const atual = partesDaData(hoje)
  const nascEm29Fev = nasc.mes === 2 && nasc.dia === 29
  const aniversario =
    nascEm29Fev && !ehBissexto(atual.ano) ? { mes: 3, dia: 1 } : { mes: nasc.mes, dia: nasc.dia }
  const jaFezAniversario =
    atual.mes > aniversario.mes || (atual.mes === aniversario.mes && atual.dia >= aniversario.dia)
  return atual.ano - nasc.ano - (jaFezAniversario ? 0 : 1)
}

export function hojeNoFuso(fuso: string, agora: Date): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(agora)
  const valor = (tipo: string): string => partes.find((p) => p.type === tipo)?.value ?? ''
  return `${valor('year')}-${valor('month')}-${valor('day')}`
}
