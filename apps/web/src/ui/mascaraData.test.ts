import { describe, expect, it } from 'vitest'
import { dataParaIso, editarData, isoParaData, isoParaTexto, mascararData, textoParaIso } from './mascaraData'

describe('mascararData', () => {
  it('põe as barras conforme digita e descarta o que não é dígito', () => {
    expect(mascararData('2')).toBe('2')
    expect(mascararData('203')).toBe('20/3')
    expect(mascararData('20052015')).toBe('20/05/2015')
    expect(mascararData('20/05/2015999')).toBe('20/05/2015')
    expect(mascararData('ab1c')).toBe('1')
  })
  it('nunca completa com zero e ignora "/" digitado', () => {
    expect(mascararData('1/')).toBe('1')
    expect(mascararData('01/5/')).toBe('01/5')
    expect(mascararData('1/5/2024')).toBe('15/20/24')
    expect(mascararData('/')).toBe('')
    expect(mascararData('01/05/2024/')).toBe('01/05/2024')
  })
  it('reconhece AAAA-MM-DD colado e converte', () => {
    expect(mascararData('2024-05-01')).toBe('01/05/2024')
  })
  it('apagar a barra do meio reorganiza os blocos', () => {
    expect(mascararData('01/052024')).toBe('01/05/2024')
  })
})

describe('conversão DD/MM/AAAA e ISO', () => {
  it('converte nos dois sentidos', () => {
    expect(textoParaIso('20/05/2015')).toBe('2015-05-20')
    expect(isoParaTexto('2015-05-20')).toBe('20/05/2015')
    expect(isoParaTexto('')).toBe('')
  })

  it('reprova data que não existe e texto incompleto', () => {
    expect(textoParaIso('31/02/2024')).toBeNull()
    expect(textoParaIso('29/02/2023')).toBeNull()
    expect(textoParaIso('00/05/2015')).toBeNull()
    expect(textoParaIso('20/13/2015')).toBeNull()
    expect(textoParaIso('20/05/20')).toBeNull()
    expect(textoParaIso('29/02/2024')).toBe('2024-02-29')
  })

  it('vai e volta entre Date local e ISO sem desvio de fuso', () => {
    const data = isoParaData('2026-03-01')
    expect(data?.getDate()).toBe(1)
    expect(dataParaIso(data!)).toBe('2026-03-01')
    expect(isoParaData('2026-02-31')).toBeUndefined()
    expect(isoParaData(undefined)).toBeUndefined()
  })
})

describe('editarData', () => {
  const digitar = (bruto: string, cursor: number, dado: string) => editarData(bruto, cursor, 'insertText', dado)

  it('"/" digitado depois de um dígito completa o bloco com zero e leva o cursor depois da barra', () => {
    expect(digitar('1/', 2, '/')).toEqual({ texto: '01/', cursor: 3 })
    expect(digitar('01/5/', 5, '/')).toEqual({ texto: '01/05/', cursor: 6 })
  })
  it('"/" digitado em outro ponto é ignorado', () => {
    expect(digitar('12/', 3, '/')).toEqual({ texto: '12', cursor: 2 })
    expect(digitar('1/2', 2, '/').texto).toBe('12')
    expect(digitar('/', 1, '/')).toEqual({ texto: '', cursor: 0 })
  })
  it('apagar um dígito no meio de valor cheio não completa com zero', () => {
    expect(editarData('2/05/2024', 0, 'deleteContentBackward')).toEqual({ texto: '20/52/024', cursor: 0 })
    expect(editarData('1/05/2024', 1, 'deleteContentBackward').texto).toBe('10/52/024')
  })
  it('redigitar no lugar do dígito apagado restaura o valor', () => {
    expect(digitar('12/05/2024', 1, '1')).toEqual({ texto: '12/05/2024', cursor: 1 })
    expect(digitar('12/05/2024', 2, '2')).toEqual({ texto: '12/05/2024', cursor: 3 })
  })
  it('digitar no meio de data parcial só reposiciona os dígitos', () => {
    expect(digitar('132/05/20', 2, '3')).toEqual({ texto: '13/20/520', cursor: 3 })
  })
  it('descarta dígitos excedentes e leva o cursor no máximo ao fim', () => {
    expect(digitar('12/05/20245', 11, '5')).toEqual({ texto: '12/05/2024', cursor: 10 })
  })
  it('colar ISO converte e coloca o cursor no fim', () => {
    expect(editarData('2024-05-01', 10, 'insertFromPaste')).toEqual({ texto: '01/05/2024', cursor: 10 })
  })
})
