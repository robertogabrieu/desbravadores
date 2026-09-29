// Fase 1 — contratos novos (zod 4). A onda 1a-0 copia cada bloco "ARQUIVO:" para
// packages/shared/src/<caminho> sem mudar nomes nem campos — só acrescenta os `import` que a
// divisão exige e a linha em src/index.ts. Mudanças em contratos da Fase 0 estão marcadas ALTERA.
// Regra da Fase 0 mantida: `.default()` só em contrato de criação/filtro, nunca de edição.
// Conferido com typescript 5.9.3 + zod 4.3.6 (`tsc --noEmit --strict`) contra o shared real.
import { z } from 'zod'
import { Uuid, DataCivil, InstanteIso } from './comum'
import { Sexo } from '../enums'
import { RefUnidade, RefClasse } from './auth'
import { DesbravadorSaida } from './desbravadores'

// ═══════════════ ARQUIVO: enums.ts (ACRESCENTA ao arquivo existente) ═══════════════
export const SITUACOES_CHAMADA = ['PRESENTE', 'ATRASADO', 'FALTA', 'FALTA_JUSTIFICADA'] as const
export const SituacaoChamadaZ = z.enum(SITUACOES_CHAMADA) // formulas/situacao.ts passa a derivar o tipo daqui
export const ORIGENS_ALTERACAO = ['EDICAO', 'CONFLITO_SYNC'] as const

/** "AAAA-MM" */
export const MesCivil = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Mês inválido')
/** "HH:MM" 24 h */
export const Horario = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido')

// ═══════════════ ARQUIVO: contratos/comum.ts (ALTERA: acrescenta um código) ═══════════════
// CODIGOS_ERRO ganha 'TEMPORARIO' (503): corrida ou indisponibilidade que a fila deve repetir.

// ═══════════════ ARQUIVO: contratos/reunioes.ts ═══════════════
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

// ═══════════════ ARQUIVO: contratos/sync.ts ═══════════════
export const MembroPacote = z.object({
  dbvId: Uuid,
  nome: z.string(),
  nomePublico: z.string(),
  sexo: Sexo,
  idade: z.number().int(),
  classeAtual: RefClasse.nullable(),
  autorizacaoImagem: z.boolean(),
})
export const PacoteSaida = z.object({
  /** SHA-256 do JSON canônico do conteúdo (sem geradoEm; unidades e membros por nome, reuniões por data). */
  versao: z.string(),
  geradoEm: InstanteIso,
  usuarioId: Uuid,
  vinculoId: Uuid,
  clube: z.object({
    id: Uuid, nome: z.string(), fuso: z.string(),
    diaReuniao: z.number().int().min(0).max(6), horaReuniao: Horario, localReuniaoPadrao: z.string().nullable(),
    descontarFalta: z.boolean(), pontosDescontoFalta: z.number().int(),
  }),
  /** Os 5 critérios padrão de chamada (um por gatilho), ativos e inativos. */
  criterios: z.array(z.object({
    gatilho: z.enum(['PRESENCA', 'PONTUALIDADE', 'UNIFORME', 'BIBLIA', 'LICAO']),
    nome: z.string(), pontos: z.number().int(), ativo: z.boolean(),
  })),
  unidades: z.array(z.object({ id: Uuid, nome: z.string(), membros: z.array(MembroPacote) })),
  /** Reuniões dos últimos 30 dias das unidades do usuário, com a chamada e as versões. */
  reunioesRecentes: z.array(z.object({
    id: Uuid, unidadeId: Uuid, data: DataCivil, horario: Horario,
    local: z.string().nullable(), observacoes: z.string().nullable(), cabecalhoVersao: InstanteIso,
    chamada: z.array(MarcacaoChamadaServidor),
  })),
  /** Álbuns dos últimos 60 dias (com ou sem foto). */
  albunsRecentes: z.array(z.object({
    id: Uuid, unidadeId: Uuid, titulo: z.string(), data: DataCivil, reuniaoId: Uuid.nullable(),
  })),
})
// GET /api/sync/pacote → PacoteSaida (CONSELHEIRO; ADM e INSTRUTOR recebem unidades: [] nesta fase)

// ═══════════════ ARQUIVO: contratos/fotos.ts ═══════════════
/** Campo `dados` (JSON) do multipart de PUT /api/sync/fotos/:uuid; o campo `arquivo` é a imagem. */
export const FotoEnvioDados = z.object({
  versaoPayload: z.literal(1),
  album: z.discriminatedUnion('tipo', [
    /** Álbum da reunião (unidade, data): a reunião precisa existir no servidor (a fila garante a ordem). */
    z.object({ tipo: z.literal('REUNIAO'), unidadeId: Uuid, data: DataCivil }),
    /** Álbum já existente (do pacote ou criado antes por esta mesma fila). */
    z.object({ tipo: z.literal('EXISTENTE'), id: Uuid }),
    /** Álbum novo, com id gerado no aparelho; reenvio com o mesmo id reaproveita. */
    z.object({ tipo: z.literal('NOVO'), id: Uuid, unidadeId: Uuid, titulo: z.string().trim().min(1).max(80), data: DataCivil }),
  ]),
  legenda: z.string().trim().max(300).nullable(),
})
export const FotoEnvioSaida = z.object({ fotoId: Uuid, albumId: Uuid })

export const AlbumFiltro = z.object({ unidadeId: Uuid })
export const AlbumResumo = z.object({
  id: Uuid,
  titulo: z.string(),
  data: DataCivil,
  reuniaoId: Uuid.nullable(),
  totalFotos: z.number().int(),
  capaUrl: z.string().nullable(),
  enviadoPor: z.array(z.string()), // nomes distintos; a tela mostra "Thiago" ou "Thiago e mais 2"
})
// GET /api/albuns?unidadeId → AlbumResumo[] (data decrescente; só com foto não removida).
// O total do cabeçalho da galeria é a soma de totalFotos (front).
export const FotoSaida = z.object({
  id: Uuid,
  legenda: z.string().nullable(),
  enviadaPor: z.string(),
  enviadaEm: InstanteIso,
  url: z.string(),
  miniaturaUrl: z.string(),
  podeRemover: z.boolean(),
})
export const AlbumDetalhe = z.object({
  id: Uuid, titulo: z.string(), data: DataCivil, unidade: RefUnidade, reuniaoId: Uuid.nullable(),
  fotos: z.array(FotoSaida), // enviadaEm crescente; só não removidas
})
// GET /api/albuns/:id → AlbumDetalhe · DELETE /api/fotos/:id → 204
export const SemAutorizacaoSaida = z.object({ nomes: z.array(z.string()) }) // nomePublico, ordem alfabética

// ═══════════════ ARQUIVO: contratos/ranking.ts ═══════════════
export const RankingFiltro = z.object({
  mes: MesCivil.optional(),  // padrão: mês corrente no fuso do clube
  unidadeId: Uuid.optional(),
})
export const RankingItem = z.object({
  posicao: z.number().int(),
  dbvId: Uuid,
  /** Nome completo para ADM e para DBVs no escopo de quem pede; senão `nomePublico` ("Ana C."). */
  nome: z.string(),
  unidade: RefUnidade.nullable(),
  classe: RefClasse.nullable(),
  pontos: z.number().int(),
  /** Só para DBVs no escopo de quem pede (senão null). */
  frequencia: z.number().int().nullable(),
  /** true = quem pede pode abrir o perfil (está no escopo dele). */
  abrePerfil: z.boolean(),
})
export const RankingSaida = z.object({ mes: MesCivil, itens: z.array(RankingItem) })
export const RankingUnidadesSaida = z.array(z.object({
  posicao: z.number().int(), unidade: RefUnidade, mediaPontos: z.number(), totalDbvs: z.number().int(),
}))
// GET /api/ranking?mes&unidadeId → RankingSaida · GET /api/ranking/unidades?mes → RankingUnidadesSaida

// ═══════════════ ARQUIVO: contratos/perfil.ts ═══════════════
export const PerfilDbvSaida = z.object({
  dbv: DesbravadorSaida,              // `contato` só com dbv.ver_contato (regra da Fase 0)
  mes: MesCivil,
  posicaoMes: z.number().int().nullable(),
  pontosMes: z.number().int(),
  frequenciaMes: z.number().int().nullable(),
  classesInvestidas: z.array(z.object({ classe: RefClasse, anoClube: z.number().int() })),
})
// GET /api/desbravadores/:id/perfil → PerfilDbvSaida

// ═══════════════ ARQUIVO: contratos/inicio.ts ═══════════════
export const InicioConselheiroFiltro = z.object({ unidadeId: Uuid.optional() })
/** Conselheiro sem unidade: `unidade` e `proximaReuniao` null, `unidades` vazio (tela mostra vazio). */
export const InicioConselheiroSaida = z.object({
  unidade: RefUnidade.nullable(),
  unidades: z.array(RefUnidade), // todas as do conselheiro, para o seletor
  proximaReuniao: z.object({
    data: DataCivil, horario: Horario, local: z.string().nullable(),
    ehHoje: z.boolean(), chamadaFeita: z.boolean(),
  }).nullable(),
  totalDbvs: z.number().int(),
  frequenciaMes: z.number().int().nullable(),
  posicaoUnidade: z.object({ posicao: z.number().int(), total: z.number().int() }).nullable(),
  /** Top 3 do mês DA UNIDADE selecionada (posição dentro da unidade). */
  destaques: z.array(z.object({ posicao: z.number().int(), dbvId: Uuid, nome: z.string(), pontos: z.number().int() })).max(3),
})
// GET /api/inicio/conselheiro?unidadeId → InicioConselheiroSaida

// ═══════════════ ARQUIVO: contratos/pedidos.ts ═══════════════
export const PedidoAoAdmEntrada = z.object({ tipo: z.literal('UNIDADE_SEM_DBV'), unidadeId: Uuid })
// POST /api/pedidos-ao-adm → 204 (e-mail a cada Adm ativo; 1 por unidade por 24 h, repetição → 204 sem
// enviar; unidade que já tem DBV → 422 REGRA "A unidade já tem desbravadores.")

// ═══════════════ ARQUIVO: contratos/unidades.ts (ALTERA MembroSaida) ═══════════════
// MembroSaida ganha `frequencia: z.number().int().nullable().optional()` — preenchida em
// GET /api/unidades/:id/membros quando quem pede tem `reuniao.ver` (frequência do mês corrente).
