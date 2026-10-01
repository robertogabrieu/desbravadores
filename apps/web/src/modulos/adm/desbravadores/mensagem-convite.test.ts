import { describe, expect, it } from 'vitest'
import { descricaoDoPapelDoConvite, linkDoWhatsApp, mensagemDoConvite } from './mensagem-convite'

const ref = (nome: string) => ({ id: nome, nome })
const classe = (nome: string) => ({ id: nome, nome, tipo: 'REGULAR' as const, trilha: 'INDIVIDUAL' as const, corToken: '--x' })

describe('mensagem do convite de acesso', () => {
  it('descreve conselheiro de uma ou várias unidades e instrutor de classes', () => {
    expect(descricaoDoPapelDoConvite({ papel: 'CONSELHEIRO', unidades: [ref('Águias')], classes: [] }, 'M')).toBe('conselheiro da unidade Águias')
    expect(descricaoDoPapelDoConvite({ papel: 'CONSELHEIRO', unidades: [ref('Águias'), ref('Leões')], classes: [] }, 'M')).toBe(
      'conselheiro das unidades Águias e Leões',
    )
    expect(descricaoDoPapelDoConvite({ papel: 'INSTRUTOR', unidades: [], classes: [classe('Amigo'), classe('Companheiro')] }, 'M')).toBe(
      'instrutor de Amigo e Companheiro',
    )
  })

  it('monta o texto da SPEC com o primeiro nome e o link do WhatsApp codificado', () => {
    const texto = mensagemDoConvite({
      nome: 'Paulo Henrique Souza',
      sexo: 'M',
      clube: 'Clube Órion',
      convite: { papel: 'CONSELHEIRO', unidades: [ref('Águias')], classes: [] },
      link: 'https://app/acesso/abc',
    })
    expect(texto).toBe(
      'Olá, Paulo! Você foi convidado para usar o App do Desbravador no Clube Órion como conselheiro da unidade Águias. Crie seu acesso: https://app/acesso/abc',
    )
    expect(linkDoWhatsApp(texto)).toBe(`https://wa.me/?text=${encodeURIComponent(texto)}`)
  })

  it('no feminino: conselheira, instrutora e convidada', () => {
    expect(descricaoDoPapelDoConvite({ papel: 'CONSELHEIRO', unidades: [ref('Águias')], classes: [] }, 'F')).toBe('conselheira da unidade Águias')
    expect(descricaoDoPapelDoConvite({ papel: 'CONSELHEIRO', unidades: [ref('Águias'), ref('Leões')], classes: [] }, 'F')).toBe(
      'conselheira das unidades Águias e Leões',
    )
    expect(descricaoDoPapelDoConvite({ papel: 'INSTRUTOR', unidades: [], classes: [classe('Amigo')] }, 'F')).toBe('instrutora de Amigo')
    const texto = mensagemDoConvite({
      nome: 'Ana Clara Lima',
      sexo: 'F',
      clube: 'Clube Órion',
      convite: { papel: 'INSTRUTOR', unidades: [], classes: [classe('Amigo')] },
      link: 'https://app/acesso/abc',
    })
    expect(texto).toBe(
      'Olá, Ana! Você foi convidada para usar o App do Desbravador no Clube Órion como instrutora de Amigo. Crie seu acesso: https://app/acesso/abc',
    )
  })
})
