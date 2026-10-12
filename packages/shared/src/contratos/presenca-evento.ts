import { z } from 'zod'
import { Uuid, InstanteIso } from './comum'

const Contagem = z.number().int().min(0)

/** Quantas pessoas foram e quantas foram com o uniforme que o evento pede: conta de pessoas, nunca de pontos. */
export const ResumoDaPresenca = z.object({
  foram: Contagem,
  uniformizados: Contagem,
  /** Quem está na lista (o roster do ranking do mês do evento). */
  total: Contagem,
})

export const LinhaDePresenca = z.object({
  dbvId: Uuid,
  nome: z.string(),
  foi: z.boolean(),
  comUniforme: z.boolean(),
})

/** `unidadeId` nulo é o bloco "Sem unidade", sempre o último. */
export const UnidadeDaPresenca = z.object({
  unidadeId: Uuid.nullable(),
  nome: z.string(),
  linhas: z.array(LinhaDePresenca),
})

/** GET /calendario/eventos/:id/presenca (só Adm). */
export const PresencaDoEventoSaida = z.object({
  unidades: z.array(UnidadeDaPresenca),
  resumo: ResumoDaPresenca,
  /** hoje >= início do evento, no fuso do clube: antes disso a lista não abre. */
  aberta: z.boolean(),
  listaConcluidaEm: InstanteIso.nullable(),
})

/** Só o que mudou; `comUniforme` omitido não mexe e só vale com `foi`. */
export const MarcaDePresenca = z.object({
  dbvId: Uuid,
  foi: z.boolean().optional(),
  comUniforme: z.boolean().optional(),
}).refine((m) => m.foi !== undefined || m.comUniforme !== undefined, { message: 'Informe foi ou comUniforme' })

/** PUT /calendario/eventos/:id/presenca: uma gravação por toque; o botão em massa é uma só, tudo ou nada. */
export const PresencaDoEventoEntrada = z.object({
  marcas: z.array(MarcaDePresenca).min(1),
})
export const PresencaDoEventoResposta = z.object({
  /** Linhas autoritativas das pessoas tocadas: a tela reconcilia com elas. */
  linhas: z.array(LinhaDePresenca),
  resumo: ResumoDaPresenca,
  listaConcluidaEm: InstanteIso.nullable(),
  /** Só para ids que existem no clube; nunca ecoa nome de id desconhecido. */
  avisos: z.array(z.string()),
})

/** POST /calendario/eventos/:id/presenca/concluir: os totais que o Adm viu; se divergirem do servidor, recusa. */
export const ConclusaoEntrada = z.object({
  foram: Contagem,
  uniformizados: Contagem,
})
export const ConclusaoSaida = z.object({
  foram: Contagem,
  uniformizados: Contagem,
  listaConcluidaEm: InstanteIso,
  avisos: z.array(z.string()),
})
