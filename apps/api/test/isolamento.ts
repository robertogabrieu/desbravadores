import type { Server } from 'node:http'
import type { INestApplication } from '@nestjs/common'
import type { Clube } from '../src/generated/prisma/client.js'
import type { Papel } from '@desbravadores/shared'
import request from 'supertest'
import { criarAcesso, criarClube } from './fabricas'

type Metodo = 'get' | 'post' | 'put' | 'patch' | 'delete'

/** O pedido que aponta para um recurso do clube B, montado por `semear`. */
export interface PedidoContraOutroClube {
  metodo: Metodo
  caminho: string
  corpo?: object
  /** Ids do clube B que nao podem aparecer na resposta (para rotas de lista). */
  idsDoOutroClube?: string[]
  /** Roda depois da tentativa do clube A: confere que o dado do clube B nao mudou. */
  conferirIntacto?: () => Promise<void>
}

export interface RotaParaIsolar {
  titulo: string
  /** App de teste ja criado pelo arquivo; recebido por funcao porque nasce no `beforeAll`. */
  app: () => INestApplication
  /** Papel do usuario do clube A (o do B e sempre ADM). */
  papel: Papel
  /** Cria no clube B o recurso que a rota alcanca e descreve o pedido. */
  semear: (clubeB: Clube) => Promise<PedidoContraOutroClube>
  esperado: { tipo: 'NAO_ENCONTRADO' } | { tipo: 'LISTA_SEM_OS_IDS' }
}

/**
 * Usuario do clube A nao le, lista, altera nem descobre nada do clube B: 404 `NAO_ENCONTRADO`
 * (ou lista sem os ids do B). Fecha com um controle: o dono do recurso (clube B) consegue
 * fazer o mesmo pedido, senao o teste passaria por a rota estar quebrada.
 */
export function testarIsolamento(rota: RotaParaIsolar): void {
  describe(`isolamento entre clubes: ${rota.titulo}`, () => {
    let pedido: PedidoContraOutroClube
    let autorizacaoA: string
    let autorizacaoB: string

    const servidor = (): Server => rota.app().getHttpServer() as Server
    const enviar = async (autorizacao: string): Promise<request.Response> => {
      const req = request(servidor())[pedido.metodo](pedido.caminho).set('Authorization', autorizacao)
      return pedido.corpo ? req.send(pedido.corpo) : req
    }

    beforeAll(async () => {
      const clubeA = await criarClube()
      const clubeB = await criarClube()
      autorizacaoA = (await criarAcesso({ clubeId: clubeA.id, papel: rota.papel })).autorizacao
      autorizacaoB = (await criarAcesso({ clubeId: clubeB.id, papel: 'ADM' })).autorizacao
      pedido = await rota.semear(clubeB)
    })

    it('o usuario do clube A nao alcanca o recurso do clube B', async () => {
      const resposta = await enviar(autorizacaoA)
      if (rota.esperado.tipo === 'NAO_ENCONTRADO') {
        expect(resposta.status).toBe(404)
        expect(resposta.body).toMatchObject({ codigo: 'NAO_ENCONTRADO' })
      } else {
        expect(resposta.status).toBe(200)
        const texto = JSON.stringify(resposta.body)
        for (const id of pedido.idsDoOutroClube ?? []) expect(texto).not.toContain(id)
      }
    })

    it('o dado do clube B continua igual', async () => {
      await pedido.conferirIntacto?.()
    })

    it('controle: o proprio clube B consegue fazer o mesmo pedido', async () => {
      const resposta = await enviar(autorizacaoB)
      expect(resposta.status).toBeLessThan(300)
      if (rota.esperado.tipo === 'LISTA_SEM_OS_IDS') {
        const texto = JSON.stringify(resposta.body)
        for (const id of pedido.idsDoOutroClube ?? []) expect(texto).toContain(id)
      }
    })
  })
}
