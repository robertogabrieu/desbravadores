export interface MensagemDeEmail {
  para: string
  assunto: string
  texto: string
}

export interface ServicoEmail {
  enviar(mensagem: MensagemDeEmail): Promise<void>
}

/** Token de injecao: a interface some na compilacao. */
export const SERVICO_EMAIL = Symbol('SERVICO_EMAIL')
