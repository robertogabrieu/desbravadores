import { HttpResponse, http } from 'msw'
import type { LinhaDaPresenca, MarcaParaGravar, Presenca, ResumoDaPresenca, UnidadeDaPresenca } from '../../api/presenca'
import type { Caixa } from './caixa'
import { uuid } from './sessao'

export const CONCLUIDA_EM = '2026-10-03T19:50:00.000Z'

export function criarLinha(n: number, parcial: Partial<LinhaDaPresenca> = {}): LinhaDaPresenca {
  return { dbvId: uuid(1000 + n), nome: `Desbravador ${n}`, foi: false, comUniforme: false, ...parcial }
}

/** `unidadeId` nulo é o bloco "Sem unidade". */
export function criarUnidadeDaPresenca(nome: string, linhas: LinhaDaPresenca[], unidadeId: string | null = null): UnidadeDaPresenca {
  return { unidadeId, nome, linhas }
}

export function resumoDe(unidades: UnidadeDaPresenca[]): ResumoDaPresenca {
  const linhas = unidades.flatMap((unidade) => unidade.linhas)
  return {
    foram: linhas.filter((linha) => linha.foi).length,
    uniformizados: linhas.filter((linha) => linha.foi && linha.comUniforme).length,
    total: linhas.length,
  }
}

export function criarPresenca(unidades: UnidadeDaPresenca[], parcial: Partial<Presenca> = {}): Presenca {
  return { unidades, resumo: resumoDe(unidades), aberta: true, listaConcluidaEm: null, ...parcial }
}

export interface OpcoesDaPresenca {
  aoLer?: () => void
  /** Corpo do PUT. Devolver uma resposta substitui a do servidor de mentira (falha ou espera controlada pelo teste). */
  antesDeGravar?: (corpo: { marcas: MarcaParaGravar[] }) => Promise<Response | undefined> | Response | undefined
  aoConcluir?: (corpo: unknown) => void
}

/** Servidor de mentira da lista "Quem foi": o `PUT` muda a caixa como a API, e o `POST` conclui se os totais baterem. */
export const handlersPresenca = (presenca: Caixa<Presenca>, opcoes: OpcoesDaPresenca = {}) => [
  http.get('/api/calendario/eventos/:id/presenca', () => {
    opcoes.aoLer?.()
    return HttpResponse.json({ ...presenca.atual, resumo: resumoDe(presenca.atual.unidades) })
  }),
  http.put('/api/calendario/eventos/:id/presenca', async ({ request }) => {
    const corpo = (await request.json()) as { marcas: MarcaParaGravar[] }
    const substituta = await opcoes.antesDeGravar?.(corpo)
    if (substituta) return substituta
    const tocadas: LinhaDaPresenca[] = []
    const unidades = presenca.atual.unidades.map((unidade) => ({
      ...unidade,
      linhas: unidade.linhas.map((linha) => {
        const marca = corpo.marcas.find((m) => m.dbvId === linha.dbvId)
        if (!marca) return linha
        const foi = marca.foi ?? linha.foi
        const nova = { ...linha, foi, comUniforme: foi ? (marca.comUniforme ?? linha.comUniforme) : false }
        tocadas.push(nova)
        return nova
      }),
    }))
    presenca.atual = { ...presenca.atual, unidades, resumo: resumoDe(unidades) }
    return HttpResponse.json({ linhas: tocadas, resumo: presenca.atual.resumo, listaConcluidaEm: presenca.atual.listaConcluidaEm, avisos: [] })
  }),
  http.post('/api/calendario/eventos/:id/presenca/concluir', async ({ request }) => {
    const corpo = (await request.json()) as { foram: number; uniformizados: number }
    opcoes.aoConcluir?.(corpo)
    const resumo = resumoDe(presenca.atual.unidades)
    if (corpo.foram !== resumo.foram || corpo.uniformizados !== resumo.uniformizados) {
      return HttpResponse.json(
        {
          codigo: 'REGRA',
          mensagem: `A lista mudou desde que você abriu: agora são ${resumo.foram} que foram, e eram ${corpo.foram}. Confira a lista e conclua de novo.`,
        },
        { status: 422 },
      )
    }
    presenca.atual = { ...presenca.atual, listaConcluidaEm: presenca.atual.listaConcluidaEm ?? CONCLUIDA_EM }
    return HttpResponse.json({ foram: resumo.foram, uniformizados: resumo.uniformizados, listaConcluidaEm: presenca.atual.listaConcluidaEm, avisos: [] })
  }),
]

export const handlerErroPresenca = (status = 500, erro = { codigo: 'ERRO_INTERNO', mensagem: 'Falha ao ler a lista' }) =>
  http.get('/api/calendario/eventos/:id/presenca', () => HttpResponse.json(erro, { status }))

export const handlerPresencaNaoEncontrada = () =>
  handlerErroPresenca(404, { codigo: 'NAO_ENCONTRADO', mensagem: 'Evento não encontrado.' })

export const erroDaGravacao = () => HttpResponse.json({ codigo: 'ERRO_INTERNO', mensagem: 'Falha ao gravar' }, { status: 500 })
