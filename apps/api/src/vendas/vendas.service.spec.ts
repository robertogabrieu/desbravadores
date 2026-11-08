import type { INestApplication } from '@nestjs/common'
import type { VendaEntrada } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import { criarClube, desconectarPrismaDeTeste, prismaDeTeste } from '../../test/fabricas'
import { VendasService } from './vendas.service'

type Entrada = z.output<typeof VendaEntrada>

const SEM_PRODUTO = 'Cadastre ao menos um produto.'
const SEM_FORMA = 'Escolha ao menos uma forma de pagamento.'
const ENCERRADA = 'Esta venda foi encerrada. Reabra para alterar.'

function entrada(sobrescrever: Partial<Entrada> = {}): Entrada {
  return {
    nome: 'Pizza',
    taxaEntrega: 0,
    retiradaData: null,
    retiradaHorario: null,
    retiradaLocal: null,
    instrucoes: null,
    produtos: [{ nome: 'Pizza', nomeCurto: 'Pizza', preco: 4000 }],
    formas: [{ tipo: 'DINHEIRO' }],
    ...sobrescrever,
  }
}

describe('VendasService', () => {
  let app: INestApplication
  let vendas: VendasService

  beforeAll(async () => {
    app = await criarAppDeTeste()
    vendas = app.get(VendasService)
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  describe('salvar sem produto ou forma', () => {
    it('recusa com 422 ao criar', async () => {
      const clube = await criarClube()
      await expect(vendas.criar(clube.id, entrada({ produtos: [] }))).rejects.toMatchObject({ codigo: 'REGRA', mensagem: SEM_PRODUTO })
      await expect(vendas.criar(clube.id, entrada({ formas: [] }))).rejects.toMatchObject({ codigo: 'REGRA', mensagem: SEM_FORMA })
      expect(await prismaDeTeste().vendaArrecadacao.count({ where: { clubeId: clube.id } })).toBe(0)
    })

    it('recusa com 422 quando a edição deixaria zero ativos, e nada muda', async () => {
      const clube = await criarClube()
      const venda = await vendas.criar(clube.id, entrada())
      await expect(vendas.atualizar(clube.id, venda.id, entrada({ nome: 'Outra', produtos: [] }))).rejects.toMatchObject({
        codigo: 'REGRA',
        mensagem: SEM_PRODUTO,
      })
      await expect(vendas.atualizar(clube.id, venda.id, entrada({ nome: 'Outra', formas: [] }))).rejects.toMatchObject({
        codigo: 'REGRA',
        mensagem: SEM_FORMA,
      })
      const atual = await vendas.obter(clube.id, venda.id)
      expect(atual.nome).toBe('Pizza')
      expect(atual.produtos.filter((produto) => produto.ativo)).toHaveLength(1)
      expect(atual.formas.filter((forma) => forma.ativo)).toHaveLength(1)
    })

    it('a edição recusada por 422 desfaz tudo o que já tinha gravado', async () => {
      const clube = await criarClube()
      const venda = await vendas.criar(clube.id, entrada())
      const repetido = venda.produtos[0].id
      await expect(
        vendas.atualizar(
          clube.id,
          venda.id,
          entrada({
            nome: 'Outra',
            produtos: [
              { id: repetido, nome: 'a', nomeCurto: 'a', preco: 100 },
              { id: repetido, nome: 'b', nomeCurto: 'b', preco: 100 },
            ],
          }),
        ),
      ).rejects.toMatchObject({ codigo: 'REGRA' })
      expect((await vendas.obter(clube.id, venda.id)).nome).toBe('Pizza')
    })
  })

  describe('escrever', () => {
    it('entrega a venda do clube dentro da transação', async () => {
      const clube = await criarClube()
      const venda = await vendas.criar(clube.id, entrada())
      const lida = await vendas.escrever(clube.id, venda.id, async (tx, atual) => {
        const mesma = await tx.vendaArrecadacao.findFirst({ where: { clubeId: clube.id, id: venda.id } })
        return { atual: atual.id, mesma: mesma?.id }
      })
      expect(lida).toEqual({ atual: venda.id, mesma: venda.id })
    })

    it('venda de outro clube ou inexistente responde 404 e a função nem roda', async () => {
      const dono = await criarClube()
      const intruso = await criarClube()
      const venda = await vendas.criar(dono.id, entrada())
      const trabalho = jest.fn().mockResolvedValue(undefined)
      await expect(vendas.escrever(intruso.id, venda.id, trabalho)).rejects.toMatchObject({ codigo: 'NAO_ENCONTRADO', mensagem: 'Venda não encontrada.' })
      await expect(vendas.escrever(dono.id, '0192e0aa-0000-7000-8000-000000000000', trabalho)).rejects.toMatchObject({ codigo: 'NAO_ENCONTRADO' })
      expect(trabalho).not.toHaveBeenCalled()
    })

    it('uma escrita espera a outra: o encerramento só entra depois que a primeira termina', async () => {
      const clube = await criarClube()
      const venda = await vendas.criar(clube.id, entrada())
      const ordem: string[] = []
      let liberar: () => void = () => undefined
      const portao = new Promise<void>((resolver) => {
        liberar = resolver
      })

      const primeira = vendas.escrever(clube.id, venda.id, async () => {
        await portao
        ordem.push('primeira')
      })
      await new Promise((resolver) => setTimeout(resolver, 150))
      const encerramento = vendas.encerrar(clube.id, venda.id).then(() => ordem.push('encerramento'))
      await new Promise((resolver) => setTimeout(resolver, 300))
      expect(ordem).toEqual([])
      liberar()
      await Promise.all([primeira, encerramento])
      expect(ordem).toEqual(['primeira', 'encerramento'])
    })

    it('a conferência de estado vê o que a escrita anterior gravou, não o que havia antes da trava', async () => {
      const clube = await criarClube()
      const venda = await vendas.criar(clube.id, entrada())
      let liberar: () => void = () => undefined
      const portao = new Promise<void>((resolver) => {
        liberar = resolver
      })
      const encerrando = vendas.escrever(clube.id, venda.id, async (tx) => {
        await portao
        await tx.vendaArrecadacao.updateMany({ where: { clubeId: clube.id, id: venda.id }, data: { encerradaEm: new Date() } })
      })
      await new Promise((resolver) => setTimeout(resolver, 150))
      const edicao = vendas.atualizar(clube.id, venda.id, entrada({ nome: 'Tarde demais' }))
      await new Promise((resolver) => setTimeout(resolver, 150))
      liberar()
      await encerrando
      await expect(edicao).rejects.toMatchObject({ codigo: 'CONFLITO', mensagem: ENCERRADA })
      expect((await vendas.obter(clube.id, venda.id)).nome).toBe('Pizza')
    })
  })
})
