import { describe, expect, it } from 'vitest'
import { dataParaIso, isoParaData, isoParaTexto, mascararData, textoParaIso } from './mascaraData'

describe('mascararData', () => {
  it('põe as barras conforme digita e descarta o que não é dígito', () => {
    expect(mascararData('2')).toBe('2')
    expect(mascararData('203')).toBe('20/3')
    expect(mascararData('20052015')).toBe('20/05/2015')
    expect(mascararData('20/05/2015999')).toBe('20/05/2015')
    expect(mascararData('ab1c')).toBe('1')
  })
  it('"/" digitado fecha o bloco e completa com zero', () => {
    expect(mascararData('1/')).toBe('01/')
    expect(mascararData('01/5/')).toBe('01/05/')
    expect(mascararData('1/5/2024')).toBe('01/05/2024')
    expect(mascararData('/')).toBe('')
    expect(mascararData('01//')).toBe('01/')
    expect(mascararData('01/05/2024/')).toBe('01/05/2024')
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
