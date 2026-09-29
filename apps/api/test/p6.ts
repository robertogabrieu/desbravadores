import type { Server } from 'node:http'
import type { INestApplication } from '@nestjs/common'
import { anoClube, hojeNoFuso } from '@desbravadores/shared'
import request from 'supertest'
import { prismaDeTeste } from './fabricas'

/** Ano do clube de hoje, calculado como a API calcula (fuso e inicio padrao). */
export function anoCorrente(): number {
  return anoClube(hojeNoFuso('America/Sao_Paulo', new Date()), '02-01')
}

/** Nascimento (mes de janeiro) que da a idade pedida no inicio do ano do clube corrente. */
export function nascimentoComIdade(idade: number): string {
  return `${anoCorrente() - idade}-01-10`
}

export function hoje(): string {
  return hojeNoFuso('America/Sao_Paulo', new Date())
}

export function corpo<T>(resposta: request.Response): T {
  return resposta.body as T
}

export interface ClienteHttp {
  get: (url: string, auth: string) => request.Test
  post: (url: string, auth: string, dados?: object) => request.Test
  put: (url: string, auth: string, dados?: object) => request.Test
  patch: (url: string, auth: string, dados?: object) => request.Test
}

export function clienteHttp(app: () => INestApplication): ClienteHttp {
  const servidor = (): Server => app().getHttpServer() as Server
  return {
    get: (url, auth) => request(servidor()).get(url).set('Authorization', auth),
    post: (url, auth, dados) => request(servidor()).post(url).set('Authorization', auth).send(dados ?? {}),
    put: (url, auth, dados) => request(servidor()).put(url).set('Authorization', auth).send(dados ?? {}),
    patch: (url, auth, dados) => request(servidor()).patch(url).set('Authorization', auth).send(dados ?? {}),
  }
}

/** Classe propria de um clube (nao oficial). */
export async function criarClasseDoClube(clubeId: string, nome = 'Classe do clube'): Promise<{ id: string }> {
  return prismaDeTeste().classe.create({
    data: { clubeId, origem: 'CLUBE', nome, tipo: 'REGULAR', trilha: 'INDIVIDUAL', ordem: 999 },
    select: { id: true },
  })
}

export async function ajustarPermissao(vinculoId: string, permissao: string, concedida: boolean): Promise<void> {
  await prismaDeTeste().permissaoAjuste.create({ data: { vinculoId, permissao, concedida } })
}
