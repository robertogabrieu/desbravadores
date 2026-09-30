import { describe, expect, it } from 'vitest'
import { obterTipo } from '../registro'

describe('tipo AULA', () => {
  it('fica registrado na fila ao carregar os tipos e ainda não envia', async () => {
    // O setup limpa o registro a cada teste; o import dentro do teste registra de novo.
    await import('./todos')
    const tipo = obterTipo('AULA')
    expect(tipo?.tipo).toBe('AULA')
    await expect(tipo?.enviar({} as never, {} as never)).rejects.toThrow('não implementado')
  })
})
