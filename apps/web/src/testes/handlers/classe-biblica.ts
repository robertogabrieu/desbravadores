import { HttpResponse, http } from 'msw'
import type { JsonBodyType } from 'msw'
import type { z } from 'zod'
import type {
  ChamadaCBEnvioSaida,
  ChamadaCBSaida,
  ClasseBiblicaDoRequisito,
  DatasSaida,
  EdicaoResumo,
  EdicaoSaida,
  EdicoesSaida,
  EncontroDetalheSaida,
  EncontroSaida,
  FrequenciaGrupoSaida,
  GruposSaida,
  PacoteClasseBiblica,
  PainelSaida,
  PontosCBSaida,
} from '@desbravadores/shared'
import { uuid } from './sessao'

type Edicao = z.infer<typeof EdicaoSaida>
type Resumo = z.infer<typeof EdicaoResumo>
type Edicoes = z.infer<typeof EdicoesSaida>
type Grupos = z.infer<typeof GruposSaida>
type Datas = z.infer<typeof DatasSaida>
type Painel = z.infer<typeof PainelSaida>
type Frequencia = z.infer<typeof FrequenciaGrupoSaida>
type Encontro = z.infer<typeof EncontroSaida>
type EncontroDetalhe = z.infer<typeof EncontroDetalheSaida>
type Chamada = z.infer<typeof ChamadaCBSaida>
type EnvioSaida = z.infer<typeof ChamadaCBEnvioSaida>
type Pacote = z.infer<typeof PacoteClasseBiblica>
type DoRequisito = z.infer<typeof ClasseBiblicaDoRequisito>
type Pontos = z.infer<typeof PontosCBSaida>

/** Os números do modelo: Grupo Daniel (Águias 10, Leões 10, Gaviões 11), Grupo Ester (Falcões 9, Panteras 10), Tigres de fora. */
export const EDICAO_CB_ID = uuid(5001)
export const GRUPO_DANIEL_ID = uuid(5011)
export const GRUPO_ESTER_ID = uuid(5012)
export const ENCONTRO_CB_ID = uuid(5101)
export const UNIDADES_CB = {
  aguias: { id: uuid(5201), nome: 'Águias', dbvs: 10 },
  leoes: { id: uuid(5202), nome: 'Leões', dbvs: 10 },
  gavioes: { id: uuid(5203), nome: 'Gaviões', dbvs: 11 },
  falcoes: { id: uuid(5204), nome: 'Falcões', dbvs: 9 },
  panteras: { id: uuid(5205), nome: 'Panteras', dbvs: 10 },
  tigres: { id: uuid(5206), nome: 'Tigres', dbvs: 10 },
} as const

/** Águias na ordem da chamada do modelo; Lívia é a da ficha, Noah entrou em 01/10. */
export const AGUIAS_CB = [
  'Ana Clara Souza', 'Davi Carvalho', 'Enzo Barros', 'Gabriel Nunes', 'Isabela Martins',
  'Júlia Ramos', 'Lívia Fernandes', 'Pedro Henrique Lima', 'Noah Campos', 'Alice Moura',
].map((nome, i) => ({ dbvId: uuid(5301 + i), nome }))

const ATUALIZADA_EM = '2026-10-10T15:42:00.000-03:00'

function membros(base: number, quantos: number, prefixo: string): { dbvId: string; nome: string }[] {
  return Array.from({ length: quantos }, (_, i) => ({ dbvId: uuid(base + i), nome: `${prefixo} ${i + 1}` }))
}

const DBVS_POR_UNIDADE: Record<keyof typeof UNIDADES_CB, { dbvId: string; nome: string }[]> = {
  aguias: AGUIAS_CB,
  leoes: membros(5401, 10, 'Leão'),
  gavioes: membros(5501, 11, 'Gavião'),
  falcoes: membros(5601, 9, 'Falcão'),
  panteras: membros(5701, 10, 'Pantera'),
  tigres: membros(5801, 10, 'Tigre'),
}

export function criarEdicaoCB(parcial: Partial<Edicao> = {}): Edicao {
  return {
    id: EDICAO_CB_ID,
    nome: 'Classe Bíblica 2026 · 2º semestre',
    inicio: '2026-08-16',
    fim: '2026-12-13',
    diaSemana: 0,
    horario: '14:00',
    local: 'Sala 3 da igreja',
    etapa: 3,
    situacao: 'EM_ANDAMENTO',
    terminadaEm: '2026-08-01T10:00:00.000-03:00',
    atualizadaEm: ATUALIZADA_EM,
    ...parcial,
  }
}

export function criarEdicaoResumo(n: number, parcial: Partial<Resumo> = {}): Resumo {
  return {
    id: uuid(5000 + n),
    nome: 'Classe Bíblica 2026 · 2º semestre',
    situacao: 'EM_ANDAMENTO',
    etapa: 3,
    inicio: '2026-08-16',
    fim: '2026-12-13',
    encontros: 17,
    encontrosFeitos: 8,
    presencaMedia: 84,
    proximoEncontro: { data: '2026-10-11', horario: '14:00' },
    atualizadaEm: ATUALIZADA_EM,
    ...parcial,
  }
}

/** As três situações do modelo `Lista-Edicoes`. */
export function criarEdicoes(parcial: Partial<Edicoes> = {}): Edicoes {
  return {
    edicoes: [
      criarEdicaoResumo(2, {
        nome: 'Classe Bíblica 2027 · 1º semestre', situacao: 'NAO_TERMINADA', etapa: 2,
        inicio: '2027-03-07', fim: '2027-06-27', encontros: 0, encontrosFeitos: 0, presencaMedia: null, proximoEncontro: null,
      }),
      criarEdicaoResumo(1),
      criarEdicaoResumo(3, {
        nome: 'Classe Bíblica 2026 · 1º semestre', situacao: 'ENCERRADA',
        inicio: '2026-03-01', fim: '2026-06-28', encontros: 16, encontrosFeitos: 16, presencaMedia: 78, proximoEncontro: null,
      }),
    ],
    unidades: 6,
    padroes: { diaSemana: 0, local: 'Sala 3 da igreja' },
    ...parcial,
  }
}

/** Etapa 2 do modelo: Grupo Daniel com material, Grupo Ester sem, Tigres de fora. */
export function criarGrupos(parcial: Partial<Grupos> = {}): Grupos {
  const daniel = [UNIDADES_CB.aguias.id, UNIDADES_CB.leoes.id, UNIDADES_CB.gavioes.id]
  const ester = [UNIDADES_CB.falcoes.id, UNIDADES_CB.panteras.id]
  return {
    grupos: [
      {
        id: GRUPO_DANIEL_ID, nome: 'Grupo Daniel', ordem: 0, unidadeIds: daniel, temChamada: false,
        material: { titulo: 'Estudo Bíblico Ilustrado — lições 1 a 20', tipo: 'PDF', url: 'https://arquivos.exemplo/estudo.pdf', bytes: 4_404_019 },
      },
      { id: GRUPO_ESTER_ID, nome: 'Grupo Ester', ordem: 1, unidadeIds: ester, temChamada: false, material: null },
    ],
    unidades: Object.values(UNIDADES_CB).map((unidade) => ({
      ...unidade,
      ocupadaPor: daniel.includes(unidade.id)
        ? { tipo: 'GRUPO' as const, nome: 'Grupo Daniel' }
        : ester.includes(unidade.id) ? { tipo: 'GRUPO' as const, nome: 'Grupo Ester' } : null,
    })),
    atualizadaEm: ATUALIZADA_EM,
    ...parcial,
  }
}

/** 17 domingos de 07/03 a 27/06/2027; 28/03 com "Sem reunião: Páscoa" e 02/05 em feriado, desmarcadas. */
export function criarDatas(parcial: Partial<Datas> = {}): Datas {
  const datas = Array.from({ length: 17 }, (_, i) => {
    const data = new Date(Date.UTC(2027, 2, 7 + 7 * i)).toISOString().slice(0, 10)
    const motivo = data === '2027-03-28' ? 'Sem reunião: Páscoa' : data === '2027-05-02' ? 'Feriado: Dia do Trabalho' : null
    return { data, marcada: motivo === null, motivo }
  })
  return { datas, ...parcial }
}

function encontroDoPainel(data: string, parcial: Partial<Painel['grupos'][number]['encontros'][number]> = {}) {
  return {
    id: uuid(5100 + Number(data.slice(5, 7)) * 31 + Number(data.slice(8, 10))),
    data, horario: '14:00', local: 'Sala 3 da igreja', dataOriginal: null, cancelado: false, motivo: null,
    temChamada: true, unidades: ['Águias', 'Leões', 'Gaviões'], chamada: { presentes: 26, total: 31, participaram: 16 },
    ...parcial,
  }
}

/** `Painel-Edicao`: Grupo Daniel com 8 encontros feitos e 84%; Grupo Ester sem material. */
export function criarPainel(parcial: Partial<Painel> = {}): Painel {
  const proximo = encontroDoPainel('2026-10-11', { id: ENCONTRO_CB_ID, temChamada: false, chamada: null })
  const unidades = (chaves: (keyof typeof UNIDADES_CB)[]) => chaves.map((chave) => UNIDADES_CB[chave])
  return {
    edicao: criarEdicaoCB(),
    grupos: [
      {
        id: GRUPO_DANIEL_ID, nome: 'Grupo Daniel', unidades: unidades(['aguias', 'leoes', 'gavioes']),
        material: { titulo: 'Estudo Bíblico Ilustrado — lições 1 a 20', tipo: 'PDF', url: 'https://arquivos.exemplo/estudo.pdf', bytes: 4_404_019 },
        proximoEncontro: proximo, frequenciaMedia: 84, encontrosFeitos: 8, encontrosPorVir: 9, abaixoDaMetade: 3,
        mudancas: [],
        encontros: [
          encontroDoPainel('2026-10-04'),
          encontroDoPainel('2026-09-27', { chamada: { presentes: 24, total: 31, participaram: 14 } }),
          encontroDoPainel('2026-09-20', { chamada: { presentes: 28, total: 31, participaram: 19 } }),
          encontroDoPainel('2026-09-19', { dataOriginal: '2026-09-13', chamada: { presentes: 22, total: 31, participaram: 12 } }),
          encontroDoPainel('2026-09-06', { chamada: { presentes: 26, total: 31, participaram: 17 } }),
          encontroDoPainel('2026-08-30', { chamada: { presentes: 25, total: 31, participaram: 15 } }),
          encontroDoPainel('2026-08-23', { chamada: { presentes: 29, total: 31, participaram: 20 } }),
          encontroDoPainel('2026-08-16', { chamada: { presentes: 27, total: 31, participaram: 18 } }),
        ],
      },
      {
        id: GRUPO_ESTER_ID, nome: 'Grupo Ester', unidades: unidades(['falcoes', 'panteras']), material: null,
        proximoEncontro: proximo, frequenciaMedia: 88, encontrosFeitos: 8, encontrosPorVir: 9, abaixoDaMetade: 0, encontros: [], mudancas: [],
      },
    ],
    podeGerenciar: true,
    podeFazerChamada: true,
    ...parcial,
  }
}

export function criarFrequencia(parcial: Partial<Frequencia> = {}): Frequencia {
  return {
    grupo: { id: GRUPO_DANIEL_ID, nome: 'Grupo Daniel' },
    itens: AGUIAS_CB.map((dbv, i) => ({
      ...dbv, unidade: 'Águias', encontros: 8, presencas: Math.min(8, 3 + i), participacoes: Math.min(5, i),
    })),
    ...parcial,
  }
}

export function criarEncontroCB(parcial: Partial<Encontro> = {}): Encontro {
  return {
    id: ENCONTRO_CB_ID, edicaoId: EDICAO_CB_ID, data: '2026-10-18', horario: '14:00', local: 'Sala 3 da igreja',
    dataOriginal: null, cancelado: false, motivo: null, temChamada: false, podeDesfazer: false,
    ...parcial,
  }
}

/** `Encontro-Remarcar`: 18/10, com 24/10 livre e 12/10 em feriado. */
export function criarEncontroDetalhe(parcial: Partial<EncontroDetalhe> = {}): EncontroDetalhe {
  return {
    encontro: criarEncontroCB(),
    edicao: { id: EDICAO_CB_ID, nome: 'Classe Bíblica 2026 · 2º semestre', inicio: '2026-08-16', fim: '2026-12-13' },
    grupos: ['Grupo Daniel', 'Grupo Ester'],
    ocupadas: ['2026-10-11', '2026-10-25', '2026-11-01'],
    avisos: [{ data: '2026-10-12', motivo: 'Feriado: Nossa Senhora Aparecida' }],
    ...parcial,
  }
}

/** `Chamada-Encontro`: Grupo Daniel em 11/10, 31 desbravadores, todos presentes e sem linha gravada. */
export function criarChamadaCB(parcial: Partial<Chamada> = {}): Chamada {
  const unidade = (chave: 'aguias' | 'leoes' | 'gavioes') => ({
    id: UNIDADES_CB[chave].id,
    nome: UNIDADES_CB[chave].nome,
    desbravadores: DBVS_POR_UNIDADE[chave].map((dbv) => ({
      ...dbv,
      entrouEm: dbv.nome === 'Noah Campos' ? '2026-10-01' : null,
      presente: true,
      participou: false,
      versao: null,
    })),
  })
  return {
    encontro: {
      id: ENCONTRO_CB_ID, edicaoId: EDICAO_CB_ID, edicaoNome: 'Classe Bíblica 2026 · 2º semestre',
      data: '2026-10-11', horario: '14:00', local: 'Sala 3 da igreja', dataOriginal: null,
    },
    grupo: { id: GRUPO_DANIEL_ID, nome: 'Grupo Daniel' },
    unidades: [unidade('aguias'), unidade('leoes'), unidade('gavioes')],
    registrada: false,
    ...parcial,
  }
}

/** Pacote com o encontro de 11/10 e os dois grupos, sem presença gravada. */
export function criarPacoteClasseBiblica(parcial: Partial<Pacote> = {}): Pacote {
  const unidade = (chave: keyof typeof UNIDADES_CB) => ({
    id: UNIDADES_CB[chave].id,
    nome: UNIDADES_CB[chave].nome,
    membros: DBVS_POR_UNIDADE[chave].map((dbv) => ({
      ...dbv, inicio: dbv.nome === 'Noah Campos' ? '2026-10-01' : '2026-02-01', fim: null,
    })),
  })
  return {
    encontros: [{
      id: ENCONTRO_CB_ID, edicaoId: EDICAO_CB_ID, edicaoNome: 'Classe Bíblica 2026 · 2º semestre',
      data: '2026-10-11', horario: '14:00', local: 'Sala 3 da igreja', dataOriginal: null,
    }],
    grupos: [
      { id: GRUPO_DANIEL_ID, encontroIds: [ENCONTRO_CB_ID], nome: 'Grupo Daniel', unidades: [unidade('aguias'), unidade('leoes'), unidade('gavioes')] },
      { id: GRUPO_ESTER_ID, encontroIds: [ENCONTRO_CB_ID], nome: 'Grupo Ester', unidades: [unidade('falcoes'), unidade('panteras')] },
    ],
    presencas: [],
    chamadasRegistradas: [],
    ...parcial,
  }
}

/** `Progresso-Requisito`: Lívia, 6 de 8, participou em 5, Grupo Daniel, com a edição anterior. */
export function criarClasseBiblicaDoRequisito(parcial: Partial<DoRequisito> = {}): DoRequisito {
  return {
    edicao: 'Classe Bíblica 2026 · 2º semestre',
    encontros: 8,
    presencas: 6,
    participacoes: 5,
    grupo: 'Grupo Daniel',
    semGrupo: false,
    anteriores: [{ edicao: 'Classe Bíblica 2026 · 1º semestre', encontros: 16, presencas: 12, participacoes: 9 }],
    ...parcial,
  }
}

export function criarPontosCB(parcial: Partial<Pontos> = {}): Pontos {
  return {
    itens: [
      { gatilho: 'CLASSE_BIBLICA_PRESENCA', nome: 'Presença na Classe Bíblica', pontos: 10, ativo: true },
      { gatilho: 'CLASSE_BIBLICA_PARTICIPACAO', nome: 'Participou ativamente da Classe Bíblica', pontos: 5, ativo: true },
    ],
    ...parcial,
  }
}

export function criarEnvioCBSaida(parcial: Partial<EnvioSaida> = {}): EnvioSaida {
  return { linhas: [], conflitos: [], ignorados: [], presentes: 0, participaram: 0, ...parcial }
}

export interface DadosClasseBiblica {
  edicoes?: Edicoes
  edicao?: Edicao
  grupos?: Grupos
  datas?: Datas
  painel?: Painel
  frequencia?: Frequencia
  encontro?: EncontroDetalhe
  chamada?: Chamada
  pontos?: Pontos
  /** Chamado com o método, o caminho e o corpo (null sem corpo) de cada escrita. */
  aoGravar?: (metodo: string, caminho: string, corpo: unknown) => void
}

async function corpoDe(request: Request): Promise<unknown> {
  const tipo = request.headers.get('content-type') ?? ''
  if (tipo.includes('application/json')) return request.json()
  if (tipo.includes('multipart/form-data')) return request.formData()
  return null
}

/** Todas as rotas da Classe Bíblica, com os números do modelo. As escritas devolvem o estado do modelo. */
export function handlersClasseBiblica(dados: DadosClasseBiblica = {}) {
  const gravar = (metodo: string, resposta: (corpo: unknown, params: Record<string, string>) => JsonBodyType, status = 200) =>
    async ({ request, params }: { request: Request; params: Record<string, string | readonly string[] | undefined> }) => {
      const corpo = await corpoDe(request)
      dados.aoGravar?.(metodo, new URL(request.url).pathname, corpo)
      const simples = Object.fromEntries(Object.entries(params).map(([chave, valor]) => [chave, String(valor)]))
      return HttpResponse.json(resposta(corpo, simples), { status })
    }
  const edicao = dados.edicao ?? criarEdicaoCB()
  return [
    http.get('/api/classe-biblica/edicoes', () => HttpResponse.json(dados.edicoes ?? criarEdicoes())),
    http.post('/api/classe-biblica/edicoes', gravar('POST', (corpo) => ({
      ...criarEdicaoCB({ nome: null, inicio: null, fim: null, horario: null, etapa: 1, situacao: 'NAO_TERMINADA', terminadaEm: null }),
      ...(corpo as object),
    }), 201)),
    http.get('/api/classe-biblica/edicoes/:id', () => HttpResponse.json(dados.painel ?? criarPainel({ edicao }))),
    http.patch('/api/classe-biblica/edicoes/:id', gravar('PATCH', (corpo) => ({ ...edicao, ...(corpo as object) }))),
    http.get('/api/classe-biblica/edicoes/:id/grupos', () => HttpResponse.json(dados.grupos ?? criarGrupos())),
    http.put('/api/classe-biblica/edicoes/:id/grupos', gravar('PUT', () => dados.grupos ?? criarGrupos())),
    http.get('/api/classe-biblica/edicoes/:id/datas', () => HttpResponse.json(dados.datas ?? criarDatas())),
    http.post('/api/classe-biblica/edicoes/:id/terminar', gravar('POST', () => dados.painel ?? criarPainel({ edicao }))),
    http.get('/api/classe-biblica/grupos/:grupoId/frequencia', () => HttpResponse.json(dados.frequencia ?? criarFrequencia())),
    http.post('/api/classe-biblica/grupos/:grupoId/material/arquivo', gravar('POST', () => criarGrupos().grupos[0])),
    http.post('/api/classe-biblica/grupos/:grupoId/material/link', gravar('POST', (corpo) => ({
      ...criarGrupos().grupos[1], material: { ...(corpo as { titulo: string; url: string }), tipo: 'LINK', bytes: null },
    }))),
    http.get('/api/classe-biblica/encontros/:id', () => HttpResponse.json(dados.encontro ?? criarEncontroDetalhe())),
    http.post('/api/classe-biblica/encontros/:id/remarcar', gravar('POST', (corpo) => ({
      dados: criarEncontroCB({ ...(corpo as { data: string }), dataOriginal: '2026-10-18' }),
      avisos: [],
    }), 201)),
    http.post('/api/classe-biblica/encontros/:id/cancelar', gravar('POST', (corpo) => criarEncontroCB({
      cancelado: true, motivo: (corpo as { motivo: string }).motivo, podeDesfazer: true,
    }))),
    http.post('/api/classe-biblica/encontros/:id/desfazer-cancelamento', gravar('POST', () => criarEncontroCB())),
    http.get('/api/classe-biblica/encontros/:id/grupos/:grupoId/chamada', () => HttpResponse.json(dados.chamada ?? criarChamadaCB())),
    http.put('/api/sync/classe-biblica/encontros/:id/grupos/:grupoId', gravar('PUT', (corpo) => {
      const linhas = (corpo as { linhas: { dbvId: string; presente: boolean; participou: boolean }[] }).linhas
      const versao = '2026-10-11T14:31:00.000-03:00'
      return criarEnvioCBSaida({
        linhas: linhas.map((linha) => ({ ...linha, participou: linha.presente && linha.participou, versao })),
        presentes: linhas.filter((linha) => linha.presente).length,
        participaram: linhas.filter((linha) => linha.presente && linha.participou).length,
      })
    })),
    http.get('/api/classe-biblica/pontos', () => HttpResponse.json(dados.pontos ?? criarPontosCB())),
    http.patch('/api/classe-biblica/pontos', gravar('PATCH', (corpo) => {
      const entrada = (corpo as { itens: { gatilho: string; pontos: number; ativo: boolean }[] }).itens
      const atual = dados.pontos ?? criarPontosCB()
      return { itens: atual.itens.map((item) => ({ ...item, ...entrada.find((novo) => novo.gatilho === item.gatilho) })) }
    })),
  ]
}

/** O servidor recusa o envio da fila (encontro cancelado ou remarcado para o futuro). */
export const handlerChamadaCBRecusada = (mensagem: string, status = 422) =>
  http.put('/api/sync/classe-biblica/encontros/:id/grupos/:grupoId', () => HttpResponse.json({ codigo: 'REGRA', mensagem }, { status }))
