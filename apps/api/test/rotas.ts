import { RequestMethod, type INestApplication } from '@nestjs/common'
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants'
import { MetadataScanner, ModulesContainer } from '@nestjs/core'

export interface RotaRegistrada {
  metodo: string
  caminho: string
  handler: object
  controlador: object
}

type Trecho = string | string[] | undefined

function juntar(...partes: Trecho[]): string {
  const limpas = partes
    .flatMap((parte) => parte ?? '')
    .map((parte) => parte.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
  return `/${limpas.join('/')}`
}

/** Todas as rotas HTTP dos controllers registrados, com o prefixo global `/api`. */
export function listarRotas(app: INestApplication): RotaRegistrada[] {
  const rotas: RotaRegistrada[] = []
  const scanner = new MetadataScanner()
  for (const modulo of app.get(ModulesContainer).values()) {
    for (const wrapper of modulo.controllers.values()) {
      const controlador = wrapper.metatype as (new () => object) | null
      if (!controlador) continue
      const prefixo = Reflect.getMetadata(PATH_METADATA, controlador) as Trecho
      for (const nome of scanner.getAllMethodNames(controlador.prototype as object)) {
        const handler = (controlador.prototype as Record<string, object>)[nome]
        if (!handler) continue
        const metodo = Reflect.getMetadata(METHOD_METADATA, handler) as unknown
        if (typeof metodo !== 'number') continue
        rotas.push({
          metodo: RequestMethod[metodo] ?? String(metodo),
          caminho: juntar('api', prefixo, Reflect.getMetadata(PATH_METADATA, handler) as Trecho),
          handler,
          controlador,
        })
      }
    }
  }
  return rotas
}
