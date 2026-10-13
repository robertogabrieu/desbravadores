const DIAS_DA_SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado']

function partes(data: string): { ano: string; mes: string; dia: string } {
  const [ano, mes, dia] = data.split('-')
  return { ano, mes, dia }
}

function diaDaSemana(data: string): string {
  const [ano, mes, dia] = data.split('-').map(Number)
  return DIAS_DA_SEMANA[new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()]
}

/**
 * "sábado, 04/04/2026" (dia único), "21 a 23/08/2026" (mesmo mês), "30/08 a 02/09/2026" (meses diferentes)
 * ou "30/12/2026 a 02/01/2027" (anos diferentes).
 */
export function periodoDoEvento(inicio: string, fim: string): string {
  if (inicio === fim) {
    const { ano, mes, dia } = partes(inicio)
    return `${diaDaSemana(inicio)}, ${dia}/${mes}/${ano}`
  }
  const de = partes(inicio)
  const ate = partes(fim)
  if (de.ano !== ate.ano) return `${de.dia}/${de.mes}/${de.ano} a ${ate.dia}/${ate.mes}/${ate.ano}`
  if (de.mes !== ate.mes) return `${de.dia}/${de.mes} a ${ate.dia}/${ate.mes}/${ate.ano}`
  return `${de.dia} a ${ate.dia}/${ate.mes}/${ate.ano}`
}
