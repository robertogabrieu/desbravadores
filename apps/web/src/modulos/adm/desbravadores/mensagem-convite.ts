import type { ConviteAcesso } from '../../../api/convite-acesso'

type PapelDoConvite = Pick<ConviteAcesso, 'papel' | 'unidades' | 'classes'>

const lista = new Intl.ListFormat('pt-BR', { style: 'long', type: 'conjunction' })

/** "conselheiro da unidade X" | "conselheiro das unidades X e Y" | "instrutor de X e Y". */
export function descricaoDoPapelDoConvite({ papel, unidades, classes }: PapelDoConvite): string {
  if (papel === 'INSTRUTOR') return `instrutor de ${lista.format(classes.map((c) => c.nome))}`
  const nomes = lista.format(unidades.map((u) => u.nome))
  return unidades.length > 1 ? `conselheiro das unidades ${nomes}` : `conselheiro da unidade ${nomes}`
}

export function mensagemDoConvite(dados: { nome: string; clube: string; convite: PapelDoConvite; link: string }): string {
  const primeiroNome = dados.nome.trim().split(/\s+/)[0] ?? dados.nome
  return (
    `Olá, ${primeiroNome}! Você foi convidado para usar o App do Desbravador no ${dados.clube} ` +
    `como ${descricaoDoPapelDoConvite(dados.convite)}. Crie seu acesso: ${dados.link}`
  )
}

export const linkDoWhatsApp = (mensagem: string): string => `https://wa.me/?text=${encodeURIComponent(mensagem)}`
