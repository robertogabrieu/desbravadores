import { createTransport, type Transporter } from 'nodemailer'
import { variavel } from '../comum/ambiente'
import type { MensagemDeEmail, ServicoEmail } from './servico-email'

export class ServicoEmailSmtp implements ServicoEmail {
  private readonly transporte: Transporter
  private readonly remetente: string

  constructor() {
    const usuario = process.env['SMTP_USUARIO']
    this.remetente = variavel('SMTP_FROM')
    this.transporte = createTransport({
      host: variavel('SMTP_HOST'),
      port: Number(variavel('SMTP_PORTA')),
      auth: usuario ? { user: usuario, pass: process.env['SMTP_SENHA'] ?? '' } : undefined,
    })
  }

  async enviar(mensagem: MensagemDeEmail): Promise<void> {
    await this.transporte.sendMail({
      from: this.remetente,
      to: mensagem.para,
      subject: mensagem.assunto,
      text: mensagem.texto,
    })
  }
}
