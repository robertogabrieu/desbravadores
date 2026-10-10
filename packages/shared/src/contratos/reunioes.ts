import { z } from 'zod'
import { Horario, MesCivil, SituacaoChamadaZ } from '../enums'
import { DataCivil, InstanteIso, Uuid } from './comum'
import { RefUnidade } from './auth'
import { SubstituicaoNoRegistro } from './substituicao'

const camposMarcacao = {
  situacao: SituacaoChamadaZ,
  uniforme: z.boolean(),
  biblia: z.boolean(),
  licao: z.boolean(),
}
const ausenteSemChips = (m: { situacao: string; uniforme: boolean; biblia: boolean; licao: boolean }) =>
  m.situacao === 'PRESENTE' || m.situacao === 'ATRASADO' || (!m.uniforme && !m.biblia && !m.licao)

/** Uma linha enviada. `versaoVista` = `versao` da linha que o aparelho tinha quando a pessoa
 *  mexeu (null = a linha não existia para ele). É assim que o servidor detecta conflito (SPEC §5.2). */
export const MarcacaoChamadaEnvio = z
  .object({ dbvId: Uuid, ...camposMarcacao, versaoVista: InstanteIso.nullable() })
  .refine(ausenteSemChips, { message: 'Ausente não tem uniforme, Bíblia nem Lição', path: ['situacao'] })

/** Linha como o servidor a tem. `versao` = instante em que o servidor a gravou pela última vez. */
export const MarcacaoChamadaServidor = z.object({ dbvId: Uuid, ...camposMarcacao, versao: InstanteIso })

export const CabecalhoReuniaoEnvio = z.object({
  horario: Horario,
  local: z.string().trim().max(120).nullable(),
  observacoes: z.string().trim().max(2000).nullable(),
  versaoVista: InstanteIso.nullable(),
})

/** PUT /api/sync/reunioes/:uuid. Nova: `linhas` traz TODOS os membros (a tela não salva com
 *  alguém sem marcação) e `cabecalho` obrigatório. Correção: só as linhas tocadas; `cabecalho`
 *  null se horário, local e observações não foram tocados. */
export const ReuniaoEnvio = z.object({
  versaoPayload: z.literal(1),
  /** UUID novo a cada gravação/fusão na fila (o id do item da fila não muda). Reenvio do mesmo
   *  envioId responde o estado atual sem gravar (EnvioProcessado). */
  envioId: Uuid,
  unidadeId: Uuid,
  data: DataCivil,
  /** Relógio do aparelho ao salvar; o servidor usa min(isto, agora) para o prazo (SPEC E11). */
  feitaNoAparelhoEm: InstanteIso,
  cabecalho: CabecalhoReuniaoEnvio.nullable(),
  linhas: z.array(MarcacaoChamadaEnvio).min(1).max(200),
})
export const ReuniaoEnvioSaida = z.object({
  reuniaoId: Uuid,                   // pode diferir do :uuid se a (unidade, data) já existia
  pontos: z.array(z.object({ dbvId: Uuid, pontos: z.number().int() })), // todas as linhas da reunião
  totalPontos: z.number().int(),
  /** Versão atual de todas as linhas e do cabeçalho — o `aoEnviar` atualiza o `versaoVista` dos
   *  itens seguintes da mesma chave, para não gerar conflito falso contra o próprio aparelho. */
  linhas: z.array(z.object({ dbvId: Uuid, versao: InstanteIso })),
  cabecalhoVersao: InstanteIso,
  /** O cabeçalho tinha sido mudado por outra pessoa depois do que este aparelho viu (o deste valeu). */
  conflitoCabecalho: z.boolean(),
  /** Linhas que outra pessoa tinha mudado depois do que este aparelho viu: a versão deste envio
   *  valeu e a anterior ficou registrada. A tela avisa com os nomes. */
  conflitos: z.array(z.object({ dbvId: Uuid, nome: z.string() })),
  /** DBVs que não eram membros DBV ativos da unidade na data (lista do aparelho desatualizada). */
  ignorados: z.array(z.object({ dbvId: Uuid, nome: z.string() })),
})

export const ReuniaoFiltro = z.object({ unidadeId: Uuid, mes: MesCivil })
export const ReuniaoResumo = z.object({
  id: Uuid,
  data: DataCivil,
  horario: Horario,
  presentes: z.number().int(),   // PRESENTE + ATRASADO
  total: z.number().int(),       // linhas da chamada
  atrasos: z.number().int(),
  uniformes: z.number().int(),
  biblias: z.number().int(),
  percentual: z.number().int().nullable(), // Math.round(presentes/total*100); null se total 0
  alterada: z.boolean(),         // existe ChamadaAlteracao para a reunião
})
// GET /api/reunioes?unidadeId&mes → ReuniaoResumo[] (ordem: data decrescente)

export const LinhaChamadaSaida = MarcacaoChamadaServidor.extend({
  nome: z.string(),
  nomePublico: z.string(),
  pontos: z.number().int(),   // soma dos lançamentos ativos desta linha
})
export const ReuniaoDetalhe = z.object({
  id: Uuid,
  unidade: RefUnidade,
  data: DataCivil,
  horario: Horario,
  local: z.string().nullable(),
  observacoes: z.string().nullable(),
  cabecalhoVersao: InstanteIso,
  registradaPor: z.object({ nome: z.string() }),
  registradaEm: InstanteIso,
  /** Última ChamadaAlteracao; `conflito` = alguma foi CONFLITO_SYNC. */
  alterada: z.object({ por: z.string(), em: InstanteIso, conflito: z.boolean() }).nullable(),
  podeEditar: z.boolean(),
  chamada: z.array(LinhaChamadaSaida), // ordem: nome
  totais: z.object({
    presentes: z.number().int(), total: z.number().int(), atrasos: z.number().int(),
    uniformes: z.number().int(), biblias: z.number().int(), pontos: z.number().int(),
  }),
  album: z.object({ id: Uuid, totalFotos: z.number().int(), miniaturas: z.array(z.string()).max(4) }).nullable(),
  /** R1: houve substituição na última gravação por link de substituição. */
  substituicao: SubstituicaoNoRegistro.nullable().default(null),
})

export const MARCAS_GRADE = ['P', 'A', 'F', 'J'] as const
export const GradeFrequenciaFiltro = z.object({ ultimas: z.coerce.number().int().min(1).max(20).default(8) })
export const GradeFrequenciaSaida = z.object({
  reunioes: z.array(z.object({ id: Uuid, data: DataCivil })), // da mais antiga à mais recente
  linhas: z.array(z.object({
    dbvId: Uuid,
    nome: z.string(),
    marcas: z.array(z.enum(MARCAS_GRADE).nullable()), // null = sem linha nessa reunião
    percentual: z.number().int().nullable(),
  })),
})
// GET /api/unidades/:id/frequencia?ultimas → GradeFrequenciaSaida (linhas: membros DBV atuais, ordem nome)
