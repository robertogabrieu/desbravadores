import type { AulaEnvio, AulaEnvioSaida } from '@desbravadores/shared'
import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { z } from 'zod'
import type { ContextoAposEnvio, ContextoEnvio, ItemFila } from '../index'
import { obterTipo } from '../registro'
import { chavesCronograma } from '../../api/cronograma'
import { chavesInstrutor } from '../../api/instrutor'
import { chavesProgresso } from '../../api/progresso'
import { chavesRanking } from '../../api/ranking'
import { aoEnviar, fundir } from './aula'
import type { PayloadAulaFila } from './aula'

const avisos = vi.hoisted(() => ({ warning: vi.fn<(texto: string) => void>(), success: vi.fn() }))
vi.mock('sonner', () => ({ toast: avisos }))

const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
type Corpo = z.infer<typeof AulaEnvio>
type Saida = z.infer<typeof AulaEnvioSaida>

const presenca = (n: number, presente: boolean, versaoVista: string | null = null) => ({ dbvId: uuid(n), presente, versaoVista })
const par = (dbv: number, req: number) => ({ dbvId: uuid(dbv), requisitoId: uuid(req) })

function payload(parcial: Partial<Corpo> = {}, extras: Partial<PayloadAulaFila> = {}): PayloadAulaFila {
  return {
    registroAulaId: uuid(700),
    correcao: false,
    classeNome: 'Companheiro',
    nomes: { [uuid(1)]: 'Ana Clara', [uuid(2)]: 'Bruno Lima' },
    codigos: { [uuid(11)]: 'R1', [uuid(12)]: 'R2' },
    corpo: {
      versaoPayload: 1,
      envioId: uuid(800),
      classeId: uuid(400),
      data: '2030-03-10',
      feitaNoAparelhoEm: '2030-03-10T12:00:00.000Z',
      aulaPlanejadaId: null,
      presencas: [presenca(1, true), presenca(2, false), presenca(3, true)],
      requisitosMarcados: [par(1, 11), par(3, 12)],
      requisitosDesmarcados: [],
      ...parcial,
    },
    ...extras,
  }
}

describe('tipo AULA da fila', () => {
  const tipo = obterTipo('AULA')

  it('registra o tipo com rótulo e detalhe de aula nova e de correção', () => {
    expect(tipo?.rotulo(payload())).toBe('Classe · Companheiro · 10/03')
    expect(tipo?.rotulo(payload({}, { correcao: true }))).toBe('Correção na classe · Companheiro · 10/03')
    expect(tipo?.detalhe(payload())).toBe('2 presentes · 2 requisitos')
  })

  it('envia com PUT para o id do registro, com o corpo do payload', async () => {
    const requisitar = vi.fn<ContextoEnvio['requisitar']>(() => Promise.resolve({}))
    const item = { payload: payload() } as ItemFila<PayloadAulaFila>
    await tipo?.enviar(item, { requisitar } as unknown as ContextoEnvio)
    expect(requisitar).toHaveBeenCalledWith(`/api/sync/aulas/${uuid(700)}`, { metodo: 'PUT', corpo: item.payload.corpo })
  })

  describe('fundir', () => {
    it('presenças por desbravador, a nova vence, e o cabeçalho da aula original fica', () => {
      const correcao = payload(
        { envioId: uuid(801), presencas: [presenca(2, true, '2030-03-10T12:00:00.000Z')], requisitosMarcados: [] },
        { registroAulaId: uuid(999), correcao: true },
      )
      const fundido = fundir(payload(), correcao)
      expect(fundido.corpo.presencas.map((p) => [p.dbvId, p.presente])).toEqual([
        [uuid(1), true],
        [uuid(2), true],
        [uuid(3), true],
      ])
      expect(fundido.registroAulaId).toBe(uuid(700))
      expect(fundido.correcao).toBe(false)
      expect(fundido.corpo.envioId).toBe(uuid(801))
    })

    it('marcar depois de desmarcar vale marcado, e desmarcar depois de marcar vale desmarcado', () => {
      const anterior = payload({ requisitosMarcados: [par(1, 11)], requisitosDesmarcados: [par(3, 12)] })
      const novo = payload({ requisitosMarcados: [par(3, 12)], requisitosDesmarcados: [par(1, 11)] })
      const fundido = fundir(anterior, novo)
      expect(fundido.corpo.requisitosMarcados).toEqual([par(3, 12)])
      expect(fundido.corpo.requisitosDesmarcados).toEqual([par(1, 11)])
    })

    it('marcações de pares diferentes se somam, sem repetir o mesmo par', () => {
      const fundido = fundir(payload({ requisitosMarcados: [par(1, 11)] }), payload({ requisitosMarcados: [par(1, 11), par(2, 12)] }))
      expect(fundido.corpo.requisitosMarcados).toEqual([par(1, 11), par(2, 12)])
    })

    it('junta os nomes e códigos e mantém a aula planejada já conhecida', () => {
      const anterior = payload({ aulaPlanejadaId: uuid(50) }, { nomes: { [uuid(1)]: 'Ana Clara' }, codigos: { [uuid(11)]: 'R1' } })
      const novo = payload({ aulaPlanejadaId: null }, { nomes: { [uuid(2)]: 'Bruno Lima' }, codigos: { [uuid(12)]: 'R2' } })
      const fundido = fundir(anterior, novo)
      expect(Object.keys(fundido.nomes)).toHaveLength(2)
      expect(Object.keys(fundido.codigos)).toHaveLength(2)
      expect(fundido.corpo.aulaPlanejadaId).toBe(uuid(50))
    })
  })

  describe('aoEnviar', () => {
    const saida = (parcial: Partial<Saida> = {}): Saida => ({
      registroAulaId: uuid(700),
      presencas: [
        { dbvId: uuid(1), versao: '2030-03-10T12:05:00.000Z' },
        { dbvId: uuid(2), versao: '2030-03-10T12:06:00.000Z' },
      ],
      conflitos: [],
      ignorados: [],
      requisitosSemEfeito: [],
      avisos: [],
      totalPontos: 0,
      ...parcial,
    })

    function contexto(seguintes: ItemFila<PayloadAulaFila>[] = []) {
      const queryClient = new QueryClient()
      const invalidar = vi.spyOn(queryClient, 'invalidateQueries')
      const atualizarPayload = vi.fn<(id: string, p: PayloadAulaFila) => Promise<void>>(() => Promise.resolve())
      const baixarPacote = vi.fn(() => Promise.resolve())
      const ctx: ContextoAposEnvio<PayloadAulaFila> = {
        item: { payload: payload() } as ItemFila<PayloadAulaFila>,
        queryClient,
        seguintesDaChave: () => Promise.resolve(seguintes),
        atualizarPayload,
        baixarPacote,
      }
      return { ctx, invalidar, atualizarPayload, baixarPacote }
    }

    it('invalida as consultas reais do Início, do cronograma, do ranking e do progresso, e baixa o pacote', async () => {
      const { ctx, baixarPacote } = contexto()
      const chaves = [
        chavesInstrutor.inicio,
        chavesCronograma.leitura('classe-1'),
        chavesRanking.mes('2030-03', undefined),
        chavesProgresso.classe('classe-1'),
      ]
      for (const chave of chaves) ctx.queryClient.setQueryData(chave, {})
      await aoEnviar(saida(), ctx)
      for (const chave of chaves) expect(ctx.queryClient.getQueryState(chave)?.isInvalidated, chave.join('/')).toBe(true)
      expect(baixarPacote).toHaveBeenCalledOnce()
    })

    it('rebaseia as versões dos itens seguintes e os marca como correção do registro criado', async () => {
      const seguinte = { id: 'seg', payload: payload({ presencas: [presenca(1, false), presenca(3, true)] }, { registroAulaId: uuid(555) }) } as ItemFila<PayloadAulaFila>
      const { ctx, atualizarPayload } = contexto([seguinte])
      await aoEnviar(saida(), ctx)
      const [id, novo] = atualizarPayload.mock.calls[0] ?? []
      expect(id).toBe('seg')
      expect(novo?.registroAulaId).toBe(uuid(700))
      expect(novo?.correcao).toBe(true)
      expect(novo?.corpo.presencas).toEqual([presenca(1, false, '2030-03-10T12:05:00.000Z'), presenca(3, true, null)])
    })

    it('sem nada a avisar, não avisa', async () => {
      avisos.warning.mockClear()
      await aoEnviar(saida(), contexto().ctx)
      expect(avisos.warning).not.toHaveBeenCalled()
    })

    it('avisa conflitos, ignorados, cada motivo de requisito sem efeito e os avisos, com os nomes', async () => {
      avisos.warning.mockClear()
      await aoEnviar(
        saida({
          conflitos: [{ dbvId: uuid(1), nome: 'Ana Clara' }],
          ignorados: [{ dbvId: uuid(9), nome: 'Zeca Souza' }],
          requisitosSemEfeito: [
            { dbvId: uuid(1), requisitoId: uuid(11), motivo: 'JA_CONCLUIDO', concluidoEm: '2030-02-03' },
            { dbvId: uuid(2), requisitoId: uuid(12), motivo: 'AUSENTE', concluidoEm: null },
            { dbvId: uuid(2), requisitoId: uuid(11), motivo: 'REQUISITO_INVALIDO', concluidoEm: null },
          ],
          avisos: ['Esta aula foi registrada fora do cronograma publicado.'],
        }),
        contexto().ctx,
      )
      const textos = avisos.warning.mock.calls.map(([texto]) => texto)
      expect(textos).toHaveLength(6)
      expect(textos.some((t) => t.includes('Ana Clara') && t.includes('outra pessoa'))).toBe(true)
      expect(textos.some((t) => t.includes('Zeca Souza') && t.includes('ficaram fora'))).toBe(true)
      expect(textos.some((t) => t.includes('Ana Clara (R1)') && t.includes('03/02'))).toBe(true)
      expect(textos.some((t) => t.includes('Bruno Lima (R2)') && t.includes('Faltaram'))).toBe(true)
      expect(textos.some((t) => t.includes('Bruno Lima (R1)') && t.includes('não é mais da classe'))).toBe(true)
      expect(textos).toContain('Esta aula foi registrada fora do cronograma publicado.')
    })
  })
})
