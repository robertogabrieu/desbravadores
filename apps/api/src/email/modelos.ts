import { variavel } from '../comum/ambiente'
import type { MensagemDeEmail } from './servico-email'

function urlDoApp(appUrl?: string): string {
  return (appUrl ?? variavel('APP_URL')).replace(/\/+$/, '')
}

export function emailConvite(dados: {
  para: string
  nome: string
  clube: string
  token: string
  appUrl?: string
}): MensagemDeEmail {
  return {
    para: dados.para,
    assunto: `Seu acesso ao ${dados.clube}`,
    texto: `Olá, ${dados.nome}. Você foi convidado para o app do ${dados.clube}. Defina sua senha em ${urlDoApp(dados.appUrl)}/convite/${dados.token} — o link vale por 7 dias.`,
  }
}

export function emailAdicionado(dados: {
  para: string
  nome: string
  clube: string
  appUrl?: string
}): MensagemDeEmail {
  return {
    para: dados.para,
    assunto: `Você agora faz parte do ${dados.clube}`,
    texto: `Olá, ${dados.nome}. Você agora faz parte do ${dados.clube}. Entre no app em ${urlDoApp(dados.appUrl)}.`,
  }
}

export function emailRedefinicao(dados: { para: string; token: string; appUrl?: string }): MensagemDeEmail {
  return {
    para: dados.para,
    assunto: 'Redefinir sua senha',
    texto: `Use este link em até 1 hora: ${urlDoApp(dados.appUrl)}/senha/redefinir/${dados.token}. Se não foi você, ignore este e-mail.`,
  }
}

export function emailPedidoUnidadeSemDbv(dados: {
  para: string
  conselheiro: string
  unidade: string
  appUrl?: string
}): MensagemDeEmail {
  return {
    para: dados.para,
    assunto: `A unidade ${dados.unidade} está sem desbravadores no app`,
    texto: `${dados.conselheiro} pediu que você cadastre os desbravadores da unidade ${dados.unidade}. ${urlDoApp(dados.appUrl)}/adm/unidades`,
  }
}
