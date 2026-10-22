import { hojeNoFuso } from '@desbravadores/shared'

/** O "hoje" que a tela usa para escolher data e medir atraso: dia de calendário no fuso do aparelho, como o Início do instrutor. */
export const hojeDaTela = (): string => hojeNoFuso(Intl.DateTimeFormat().resolvedOptions().timeZone, new Date())

/** "(inativo)" ao lado do nome de quem deixou o clube com livro em aberto (o contrato não traz o gênero). */
export const nomeComSituacao = (nome: string, ativo: boolean): string => (ativo ? nome : `${nome} (inativo)`)

export const unidadeOuSem = (unidade: string | null): string => unidade ?? 'sem unidade'
