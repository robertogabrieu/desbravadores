import type { MensagemDeEmail, ServicoEmail } from './servico-email'

/** Guarda as mensagens na memoria, para os testes conferirem o que seria enviado. */
export class ServicoEmailFalso implements ServicoEmail {
  readonly enviadas: MensagemDeEmail[] = []

  enviar(mensagem: MensagemDeEmail): Promise<void> {
    this.enviadas.push(mensagem)
    return Promise.resolve()
  }

  limpar(): void {
    this.enviadas.length = 0
  }
}
