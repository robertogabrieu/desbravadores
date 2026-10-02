import { NotFoundException, type ArgumentsHost } from '@nestjs/common'
import { captureException } from '@sentry/nestjs'
import { ErroApp } from '../erros'
import { FiltroErros } from './filtro-erros'

jest.mock('@sentry/nestjs', () => ({ captureException: jest.fn() }))

function hostFalso(): ArgumentsHost {
  const resposta = { status: () => resposta, json: () => resposta }
  return { switchToHttp: () => ({ getResponse: () => resposta }) } as unknown as ArgumentsHost
}

describe('FiltroErros e o Sentry', () => {
  beforeEach(() => jest.mocked(captureException).mockClear())

  it('manda ao Sentry o erro inesperado (500)', () => {
    const erro = new Error('quebrou')
    new FiltroErros().catch(erro, hostFalso())
    expect(captureException).toHaveBeenCalledWith(erro)
  })

  it('manda o erro de servidor que o proprio codigo levanta (5xx)', () => {
    const erro = new ErroApp('ERRO_INTERNO', 'x')
    new FiltroErros().catch(erro, hostFalso())
    expect(captureException).toHaveBeenCalledWith(erro)
  })

  it('nao manda erro esperado: regra de negocio e 4xx', () => {
    new FiltroErros().catch(new ErroApp('NAO_ENCONTRADO', 'x'), hostFalso())
    new FiltroErros().catch(new NotFoundException(), hostFalso())
    expect(captureException).not.toHaveBeenCalled()
  })
})
