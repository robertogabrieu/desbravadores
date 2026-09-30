import { HttpResponse, http } from 'msw'
import type { VisaoGeral } from '../../api/visao-geral'
import { uuid } from './sessao'

export function criarVisaoGeral(parcial: Partial<VisaoGeral> = {}): VisaoGeral {
  return {
    dbvsAtivos: 58,
    variacaoTrimestre: 4,
    unidades: 6,
    instrutores: 5,
    classesCobertas: 6,
    frequenciaMes: 84,
    variacaoFrequencia: 3,
    especialidadesAno: 142,
    especialidadesPorDbv: 2.4,
    progressoClasses: [],
    unidadesResumo: [],
    cronogramasEnviados: [],
    atividades: [],
    ...parcial,
  }
}

export const criarRefClasse = (n: number, nome: string) => ({
  id: uuid(n),
  nome,
  tipo: 'REGULAR' as const,
  trilha: 'INDIVIDUAL' as const,
  corToken: `--classe-${nome.toLowerCase()}`,
})

export const handlerVisaoGeral = (visao: VisaoGeral = criarVisaoGeral()) =>
  http.get('/api/visao-geral', () => HttpResponse.json(visao))

export const handlerErroVisaoGeral = () =>
  http.get('/api/visao-geral', () => HttpResponse.json({ codigo: 'ERRO_INTERNO', mensagem: 'Falha ao montar a visão geral.' }, { status: 500 }))
