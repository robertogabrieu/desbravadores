import { HttpResponse, http } from 'msw'
import type { HttpHandler } from 'msw'
import type { DataDaMontagem, Montagem, RequisitoDaMontagem } from '../../api/montagem'
import { uuid } from './sessao'

export const CLASSE_MONTAGEM = { id: uuid(100), nome: 'Amigo', tipo: 'REGULAR', trilha: 'INDIVIDUAL', corToken: '--classe-amigo' } as const
export const CRONOGRAMA_ID = uuid(800)
export const ATUALIZADO_EM = '2026-09-01T12:00:00.000Z'

export function criarRequisitoMontagem(n: number, parcial: Partial<RequisitoDaMontagem> = {}): RequisitoDaMontagem {
  return {
    id: uuid(1000 + n),
    codigo: `R${n}`,
    texto: `Requisito ${n}`,
    campo: false,
    secaoCodigo: 'S1',
    aulaId: null,
    data: null,
    ...parcial,
  }
}

export function criarDataMontagem(data: string, parcial: Partial<DataDaMontagem> = {}): DataDaMontagem {
  return {
    data,
    aulaId: null,
    horario: null,
    local: null,
    titulo: null,
    requisitoIds: [],
    situacao: { cancelaReuniao: false, bloqueiaAula: false, bomParaCampo: false, eventos: [] },
    conflito: false,
    aulaDada: false,
    ...parcial,
  }
}

export function criarMontagem(parcial: Partial<Montagem> = {}): Montagem {
  return {
    cronograma: {
      id: CRONOGRAMA_ID,
      status: 'RASCUNHO',
      inicio: '2026-01-01',
      fim: '2026-12-31',
      enviadoEm: null,
      enviadoPor: null,
      publicadoEm: null,
      atualizadoEm: ATUALIZADO_EM,
    },
    classe: CLASSE_MONTAGEM,
    datas: [],
    requisitos: [],
    datasLivres: false,
    ...parcial,
  }
}

export interface ChamadaDeMontagem {
  metodo: string
  caminho: string
  corpo: unknown
}

export interface RegistroMontagem {
  chamadas: ChamadaDeMontagem[]
  /** Quantas vezes a leitura da montagem foi chamada. */
  leituras: number
  /** Ids das classes lidas, na ordem. */
  classesLidas: string[]
  /** O que as leituras e as gravações seguintes devolvem. */
  responder: (saida: Montagem) => void
  /** A próxima gravação falha com este status e este erro. */
  falharProxima: (status: number, erro: { codigo: string; mensagem: string }) => void
}

/** Leitura da montagem e as gravações, com estado: cada gravação registra a chamada e devolve o que `responder` deixou. */
export function handlersMontagem(inicial: Montagem): { handlers: HttpHandler[]; registro: RegistroMontagem } {
  let atual = inicial
  let falha: { status: number; erro: { codigo: string; mensagem: string } } | null = null
  const registro: RegistroMontagem = {
    chamadas: [],
    leituras: 0,
    classesLidas: [],
    responder: (saida) => {
      atual = saida
    },
    falharProxima: (status, erro) => {
      falha = { status, erro }
    },
  }

  const gravar = async ({ request }: { request: Request }) => {
    const texto = await request.text()
    registro.chamadas.push({
      metodo: request.method,
      caminho: new URL(request.url).pathname,
      corpo: texto ? (JSON.parse(texto) as unknown) : undefined,
    })
    if (falha) {
      const { status, erro } = falha
      falha = null
      return HttpResponse.json(erro, { status })
    }
    return HttpResponse.json(atual)
  }

  const handlers = [
    http.get('/api/classes/:id/cronograma/montagem', ({ params }) => {
      registro.leituras += 1
      registro.classesLidas.push(String(params['id']))
      return HttpResponse.json(atual)
    }),
    http.post('/api/cronogramas', gravar),
    http.put('/api/cronogramas/:id/requisitos/:rid', gravar),
    http.delete('/api/cronogramas/:id/requisitos/:rid', gravar),
    http.post('/api/cronogramas/:id/aulas', gravar),
    http.patch('/api/aulas-planejadas/:id', gravar),
    http.post('/api/cronogramas/:id/enviar', gravar),
    http.post('/api/cronogramas/:id/publicar', gravar),
    http.get('/api/clube/configuracao', () =>
      HttpResponse.json({
        diaReuniao: 0, horaReuniao: '09:15', localReuniaoPadrao: null, limiarFrequenciaAlerta: 60,
        limiarProgressoAlerta: 50, metaFrequencia: 80, fuso: 'America/Sao_Paulo', inicioAnoClube: '03-01',
      }),
    ),
  ]
  return { handlers, registro }
}

export const handlerErroMontagem = (status: number, erro: { codigo: string; mensagem: string }) =>
  http.get('/api/classes/:id/cronograma/montagem', () => HttpResponse.json(erro, { status }))

export const REQ_LIVRE = criarRequisitoMontagem(1)
export const REQ_CAMPO = criarRequisitoMontagem(2, { campo: true })
export const REQ_COLOCADO = criarRequisitoMontagem(3, { aulaId: uuid(2001), data: '2026-10-04' })
export const REQ_EM_CONFLITO = criarRequisitoMontagem(4, { aulaId: uuid(2002), data: '2026-10-25' })
export const REQ_DA_AULA_DADA = criarRequisitoMontagem(5, { aulaId: uuid(2003), data: '2026-11-01' })

/** Cinco datas: com aula, bloqueada, de campo, em conflito e com aula dada. */
export function criarMontagemDeExemplo(parcial: Partial<Montagem> = {}): Montagem {
  return criarMontagem({
    requisitos: [REQ_LIVRE, REQ_CAMPO, REQ_COLOCADO, REQ_EM_CONFLITO, REQ_DA_AULA_DADA],
    datas: [
      criarDataMontagem('2026-10-04', { aulaId: uuid(2001), horario: '09:15', local: 'Sala 2', requisitoIds: [REQ_COLOCADO.id] }),
      criarDataMontagem('2026-10-11', { situacao: { cancelaReuniao: true, bloqueiaAula: true, bomParaCampo: false, eventos: ['Feriado prolongado'] } }),
      criarDataMontagem('2026-10-18', { situacao: { cancelaReuniao: true, bloqueiaAula: false, bomParaCampo: true, eventos: ['Acampamento do clube'] } }),
      criarDataMontagem('2026-10-25', {
        aulaId: uuid(2002),
        requisitoIds: [REQ_EM_CONFLITO.id],
        conflito: true,
        situacao: { cancelaReuniao: false, bloqueiaAula: true, bomParaCampo: false, eventos: ['Ensaio da investidura'] },
      }),
      criarDataMontagem('2026-11-01', { aulaId: uuid(2003), requisitoIds: [REQ_DA_AULA_DADA.id], aulaDada: true }),
    ],
    ...parcial,
  })
}
