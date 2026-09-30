import { HttpResponse, http } from 'msw'
import type { ClasseDoInstrutor, InicioInstrutor } from '../../api/instrutor'
import { uuid } from './sessao'

export const CLASSE_AMIGO: ClasseDoInstrutor['classe'] = { id: uuid(100), nome: 'Amigo', tipo: 'REGULAR', trilha: 'INDIVIDUAL', corToken: '--classe-amigo' }
export const CLASSE_COMPANHEIRO: ClasseDoInstrutor['classe'] = { id: uuid(101), nome: 'Companheiro', tipo: 'REGULAR', trilha: 'INDIVIDUAL', corToken: '--classe-companheiro' }
export const CLASSE_AGRUPADAS: ClasseDoInstrutor['classe'] = { id: uuid(102), nome: 'Aventureiros', tipo: 'REGULAR', trilha: 'AGRUPADAS', corToken: '--color-primary' }

export function criarClasseDoInstrutor(parcial: Partial<ClasseDoInstrutor> = {}): ClasseDoInstrutor {
  return {
    classe: CLASSE_AMIGO,
    totalDbvs: 9,
    progressoMedio: 64,
    proximaAula: { aulaId: uuid(300), data: '2030-09-27', horario: '09:15', titulo: 'Descoberta espiritual', totalRequisitos: 2 },
    aulaHoje: false,
    aulaHojeRegistrada: false,
    aulasDadas: 11,
    ...parcial,
  }
}

export function criarInicioInstrutor(parcial: Partial<InicioInstrutor> = {}): InicioInstrutor {
  return { classes: [criarClasseDoInstrutor()], alertaFaltas: [], ...parcial }
}

/** GET /api/inicio/instrutor. */
export const handlerInicioInstrutor = (saida: InicioInstrutor = criarInicioInstrutor()) =>
  http.get('/api/inicio/instrutor', () => HttpResponse.json(saida))

export const handlerErroInicioInstrutor = (status: number, erro: { codigo: string; mensagem: string }) =>
  http.get('/api/inicio/instrutor', () => HttpResponse.json(erro, { status }))

/** POST /api/classes/:id/pedir-liberacao → 204; `aoReceber` recebe o id da classe. */
export const handlerPedirLiberacao = (aoReceber?: (classeId: string) => void) =>
  http.post('/api/classes/:id/pedir-liberacao', ({ params }) => {
    aoReceber?.(String(params.id))
    return new HttpResponse(null, { status: 204 })
  })
