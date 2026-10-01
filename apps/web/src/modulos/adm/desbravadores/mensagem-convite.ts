import type { Sexo } from '@desbravadores/shared'
import type { z } from 'zod'
import type { ConviteAcesso } from '../../../api/convite-acesso'

type PapelDoConvite = Pick<ConviteAcesso, 'papel' | 'unidades' | 'classes'>
type SexoDaFicha = z.infer<typeof Sexo>

/** Palavra no gênero da ficha: `F` pega a forma feminina. */
const noGenero = (sexo: SexoDaFicha, masculino: string, feminino: string): string => (sexo === 'F' ? feminino : masculino)

const lista = new Intl.ListFormat('pt-BR', { style: 'long', type: 'conjunction' })

/** "conselheiro(a) da unidade X" | "conselheiro(a) das unidades X e Y" | "instrutor(a) de X e Y", no gênero da ficha. */
export function descricaoDoPapelDoConvite({ papel, unidades, classes }: PapelDoConvite, sexo: SexoDaFicha): string {
  if (papel === 'INSTRUTOR') return `${noGenero(sexo, 'instrutor', 'instrutora')} de ${lista.format(classes.map((c) => c.nome))}`
  const conselheiro = noGenero(sexo, 'conselheiro', 'conselheira')
  const nomes = lista.format(unidades.map((u) => u.nome))
  return unidades.length > 1 ? `${conselheiro} das unidades ${nomes}` : `${conselheiro} da unidade ${nomes}`
}

export function mensagemDoConvite(dados: {
  nome: string
  sexo: SexoDaFicha
  clube: string
  convite: PapelDoConvite
  link: string
}): string {
  const primeiroNome = dados.nome.trim().split(/\s+/)[0] ?? dados.nome
  return (
    `Olá, ${primeiroNome}! Você foi ${noGenero(dados.sexo, 'convidado', 'convidada')} para usar o App do Desbravador no ${dados.clube} ` +
    `como ${descricaoDoPapelDoConvite(dados.convite, dados.sexo)}. Crie seu acesso: ${dados.link}`
  )
}

export const linkDoWhatsApp = (mensagem: string): string => `https://wa.me/?text=${encodeURIComponent(mensagem)}`
