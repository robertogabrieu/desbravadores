import { HttpResponse, http } from 'msw'
import type { AreaEspecialidades, ClasseDetalhe, RequisitoDetalhe } from '../../api/classes-adm'
import { criarClasse } from './leitura'

export function criarRequisito(parcial: Partial<RequisitoDetalhe> = {}): RequisitoDetalhe {
  return { id: '018f0000-0000-7000-8000-000000000501', codigo: 'G.1', texto: 'Ter 10 anos', campo: false, ativo: true, oficial: { ativo: true, campo: false }, ajustado: false, ...parcial }
}

export function criarDetalhe(parcial: Partial<ClasseDetalhe> = {}): ClasseDetalhe {
  return {
    ...criarClasse(),
    secoes: [{ id: '018f0000-0000-7000-8000-000000000401', codigo: 'G', nome: 'Gerais', ordem: 1, requisitos: [criarRequisito()] }],
    ...parcial,
  }
}

export const handlerDetalheDaClasse = (detalhe: ClasseDetalhe = criarDetalhe()) =>
  http.get('/api/classes/:id', () => HttpResponse.json(detalhe))

export const handlerEditarClasse = (aoReceber?: (id: string, corpo: unknown) => void, resposta: ClasseDetalhe = criarDetalhe()) =>
  http.patch('/api/classes/:id', async ({ request, params }) => {
    aoReceber?.(String(params['id']), await request.json())
    return HttpResponse.json(resposta)
  })

export const handlerErroEditarClasse = (status: number, erro: { codigo: string; mensagem: string }) =>
  http.patch('/api/classes/:id', () => HttpResponse.json(erro, { status }))

export const handlerAjusteDoRequisito = (aoReceber?: (id: string, corpo: unknown) => void, resposta: ClasseDetalhe = criarDetalhe()) =>
  http.patch('/api/requisitos/:id/ajuste', async ({ request, params }) => {
    aoReceber?.(String(params['id']), await request.json())
    return HttpResponse.json(resposta)
  })

export const handlerEspecialidades = (areas: AreaEspecialidades[] = []) =>
  http.get('/api/especialidades', () => HttpResponse.json(areas))

export const handlerCriarEspecialidade = (aoReceber?: (corpo: unknown) => void, areas: AreaEspecialidades[] = []) =>
  http.post('/api/especialidades', async ({ request }) => {
    aoReceber?.(await request.json())
    return HttpResponse.json(areas, { status: 201 })
  })

export const handlerErroCriarEspecialidade = (status: number, erro: { codigo: string; mensagem: string }) =>
  http.post('/api/especialidades', () => HttpResponse.json(erro, { status }))
