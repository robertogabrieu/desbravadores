import { emailAdicionado, emailConvite, emailRedefinicao } from './modelos'
import { ServicoEmailFalso } from './servico-email-falso'

const APP_URL = 'https://app.exemplo.org'

describe('modelos de e-mail (SPEC 9.2)', () => {
  it('convite', () => {
    expect(emailConvite({ para: 'a@b.c', nome: 'Ana', clube: 'Aguias', token: 'tok', appUrl: APP_URL })).toEqual({
      para: 'a@b.c',
      assunto: 'Seu acesso ao Aguias',
      texto:
        'Olá, Ana. Você foi convidado para o app do Aguias. Defina sua senha em https://app.exemplo.org/convite/tok — o link vale por 7 dias.',
    })
  })

  it('redefinicao', () => {
    expect(emailRedefinicao({ para: 'a@b.c', token: 'tok', appUrl: `${APP_URL}/` })).toEqual({
      para: 'a@b.c',
      assunto: 'Redefinir sua senha',
      texto:
        'Use este link em até 1 hora: https://app.exemplo.org/senha/redefinir/tok. Se não foi você, ignore este e-mail.',
    })
  })

  it('adicionado a outro clube leva o link do app', () => {
    const mensagem = emailAdicionado({ para: 'a@b.c', nome: 'Ana', clube: 'Aguias', appUrl: APP_URL })
    expect(mensagem.assunto).toBe('Você agora faz parte do Aguias')
    expect(mensagem.texto).toContain(APP_URL)
    expect(mensagem.texto).toContain('Ana')
  })
})

describe('ServicoEmailFalso', () => {
  it('guarda as mensagens na memoria e limpa', async () => {
    const falso = new ServicoEmailFalso()
    await falso.enviar({ para: 'a@b.c', assunto: 'x', texto: 'y' })
    expect(falso.enviadas).toEqual([{ para: 'a@b.c', assunto: 'x', texto: 'y' }])
    falso.limpar()
    expect(falso.enviadas).toEqual([])
  })
})
