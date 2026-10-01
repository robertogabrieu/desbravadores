import { Injectable } from '@nestjs/common'
import {
  AVISOS_IMPORTACAO,
  avisoDeSexoDaUnidade,
  DesbravadorCriarEntrada,
  LIMITE_LINHAS_IMPORTACAO,
  MENSAGEM_DIRETORIA_SEM_UNIDADE,
  MENSAGEM_JA_EXISTE_NO_CLUBE,
  mensagemRepetidaNaPlanilha,
  errosDaLinhaImportada,
  errosEmLista,
  idade,
  tipoDaFicha,
  type CampoDaLinhaImportada,
  type ErroDeCampo,
  type Aviso,
  type ImportacaoEntrada,
  type LinhaConfirmada,
  type LinhaDaPrevia,
  type LinhaImportada,
  type PreviaImportacao,
} from '@desbravadores/shared'
import type { z } from 'zod'
import { ErroApp } from '../comum/erros'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { PrismaService } from '../comum/prisma/prisma.service'
import type { TipoUnidade } from '../generated/prisma/client.js'
import { paraDataCivil } from './apoio'
import { DesbravadoresService, ORDEM_CLASSE_DA_IDADE, ondeClasseDaIdade, type ClasseParaMatricula } from './desbravadores.service'
import { ServicoEscopo, type RelogioDoClube } from './escopo.service'
import { ErroLinhasDaImportacao } from './filtro-importacao'
import {
  COLUNAS_OBRIGATORIAS,
  chaveDePessoa,
  converterData,
  converterSexo,
  lerPlanilha,
  mapearCabecalho,
  nomeNormalizado,
  textoDaCelula,
  type CampoDaPlanilha,
  type Celula,
  type LinhaLida,
} from './planilha-importacao'

type Linha = z.infer<typeof LinhaImportada>
type LinhaPrevia = z.infer<typeof LinhaDaPrevia>
type AvisoDaLinha = z.infer<typeof Aviso>

interface UnidadeDoClube {
  id: string
  nome: string
  tipo: TipoUnidade
}

interface ClasseDoClube extends ClasseParaMatricula {
  nome: string
}

/** Tudo do clube que a prévia consulta, lido uma vez por planilha. */
interface ContextoDaPrevia {
  relogio: RelogioDoClube
  unidadesPorNome: Map<string, UnidadeDoClube>
  classesPorNome: Map<string, ClasseDoClube>
  pessoasDoClube: Set<string>
  sugestaoPorIdade: Map<number, ClasseDoClube | null>
}

const MAXIMO_DA_TRANSACAO_MS = 120_000

/** Ler planilha pesa na memória e na CPU: acima disto, a prévia seguinte espera a vez do Adm. */
const MAXIMO_DE_PREVIAS_SIMULTANEAS = 2

const textoOuNulo = (texto: string | null): string | null => texto?.trim() || null

/** Classe desligada pelo clube (`ClasseClube.ativa = false`) não existe para a importação. */
const ativaNoClube = (clubeId: string) => ({ clubes: { none: { clubeId, ativa: false } } })

/**
 * Mensagem de cada linha repetida — no clube (inclusive inativo) ou numa linha anterior da mesma
 * confirmação — que chegou sem `importarMesmoRepetido`.
 */
function repeticoesSemAMarca(linhas: z.infer<typeof LinhaConfirmada>[], pessoasDoClube: Set<string>): Map<number, string> {
  const repetidas = new Map<number, string>()
  const vistas = new Map<string, number>()
  for (const linha of linhas) {
    if (!linha.nascimento) continue
    const chave = chaveDePessoa(linha.nome, linha.nascimento)
    const anterior = vistas.get(chave)
    if (!linha.importarMesmoRepetido) {
      if (pessoasDoClube.has(chave)) repetidas.set(linha.linha, MENSAGEM_JA_EXISTE_NO_CLUBE)
      else if (anterior !== undefined) repetidas.set(linha.linha, mensagemRepetidaNaPlanilha(anterior))
    }
    if (anterior === undefined) vistas.set(chave, linha.linha)
  }
  return repetidas
}

/** Pessoa nova, sem conta: o Tipo sai só da idade, pela mesma função do cadastro. */
function entraNaDiretoria(nascimento: string, hoje: string): boolean {
  const ficha = { tipo: 'DBV', diretoriaPeloAdm: false, diretoriaDesde: null, nascimento, papeis: [] } as const
  return tipoDaFicha(ficha, hoje).tipo === 'DIRETORIA'
}

@Injectable()
export class ImportacaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escopo: ServicoEscopo,
    private readonly desbravadores: DesbravadoresService,
  ) {}

  /** Prévias lendo planilha agora, neste processo. */
  private previasEmAndamento = 0

  async previa(sessao: SessaoLogada, arquivo: { buffer: Buffer; originalname: string } | undefined): Promise<z.infer<typeof PreviaImportacao>> {
    if (!arquivo) throw new ErroApp('REGRA', 'Escolha a planilha para enviar.')
    if (this.previasEmAndamento >= MAXIMO_DE_PREVIAS_SIMULTANEAS) {
      throw new ErroApp('REGRA', 'Outra importação está em andamento; tente de novo em instantes.')
    }
    this.previasEmAndamento++
    try {
      return await this.lerPrevia(sessao, arquivo)
    } finally {
      this.previasEmAndamento--
    }
  }

  private async lerPrevia(sessao: SessaoLogada, arquivo: { buffer: Buffer; originalname: string }): Promise<z.infer<typeof PreviaImportacao>> {
    const {
      linhas: [cabecalho, ...dados],
      totalDeDados,
    } = await lerPlanilha(arquivo.buffer, arquivo.originalname)
    const colunas = mapearCabecalho(cabecalho?.celulas ?? [])
    const colunasFaltando = COLUNAS_OBRIGATORIAS.filter(({ campo }) => !colunas.has(campo)).map(({ titulo }) => titulo)
    if (colunasFaltando.length > 0) return { colunasFaltando, linhas: [] }
    if (totalDeDados > LIMITE_LINHAS_IMPORTACAO) {
      throw new ErroApp('REGRA', `A planilha tem ${totalDeDados} linhas; o limite é ${LIMITE_LINHAS_IMPORTACAO}. Divida a planilha.`)
    }

    const contexto = await this.contextoDaPrevia(sessao.clubeId)
    const vistasNaPlanilha = new Map<string, number>()
    const linhas: LinhaPrevia[] = []
    for (const lida of dados) {
      const linha = await this.converterLinha(sessao.clubeId, lida, colunas, contexto)
      const chave = linha.nascimento ? chaveDePessoa(linha.nome, linha.nascimento) : null
      const repetidaNaLinha = chave ? vistasNaPlanilha.get(chave) : undefined
      if (chave && contexto.pessoasDoClube.has(chave)) {
        linha.duplicado = true
        linha.avisos.push({ codigo: AVISOS_IMPORTACAO.duplicado, mensagem: MENSAGEM_JA_EXISTE_NO_CLUBE })
      } else if (repetidaNaLinha !== undefined) {
        linha.duplicado = true
        linha.avisos.push({ codigo: AVISOS_IMPORTACAO.duplicado, mensagem: mensagemRepetidaNaPlanilha(repetidaNaLinha) })
      }
      if (chave && repetidaNaLinha === undefined) vistasNaPlanilha.set(chave, lida.numero)
      linhas.push(linha)
    }
    return { colunasFaltando: [], linhas }
  }

  /**
   * Tudo ou nada: revalida as linhas marcadas e só grava se nenhuma tiver erro. A pessoa repetida é
   * conferida dentro da transação, sob a trava do clube: confirmar a mesma lista em duas abas, ou
   * reenviar depois de uma queda de rede, encontra a primeira gravação e é recusado.
   */
  async confirmar(sessao: SessaoLogada, entrada: z.infer<typeof ImportacaoEntrada>): Promise<{ importados: number }> {
    const { clubeId } = sessao
    const relogio = await this.escopo.relogio(clubeId)
    const [unidades, classes] = await Promise.all([this.unidadesAtivas(clubeId), this.classesRegularesAtivas(clubeId)])
    const unidadeIds = new Set(unidades.map((unidade) => unidade.id))
    const classesPorId = new Map(classes.map((classe) => [classe.id, classe]))

    await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`importacao-desbravadores:${clubeId}`}, 0))`
        const pessoas = await tx.desbravador.findMany({ where: { clubeId }, select: { nome: true, nascimento: true } })
        const pessoasDoClube = new Set(pessoas.map((pessoa) => chaveDePessoa(pessoa.nome, paraDataCivil(pessoa.nascimento))))
        const repetidas = repeticoesSemAMarca(entrada.linhas, pessoasDoClube)
        const erros = entrada.linhas.flatMap((linha) => {
          const mensagens: z.infer<typeof ErroDeCampo>[] = errosEmLista(errosDaLinhaImportada(linha))
          if (linha.unidadeId && !unidadeIds.has(linha.unidadeId)) mensagens.push({ campo: 'unidadeId', mensagem: 'A unidade escolhida não existe no clube.' })
          if (linha.classeId && !classesPorId.has(linha.classeId)) mensagens.push({ campo: 'classeId', mensagem: 'A classe escolhida não existe.' })
          const repetida = repetidas.get(linha.linha)
          if (repetida) mensagens.push({ campo: null, mensagem: repetida })
          return mensagens.length > 0 ? [{ linha: linha.linha, mensagens }] : []
        })
        if (erros.length > 0) throw new ErroLinhasDaImportacao(erros)

        for (const linha of entrada.linhas) {
          await this.desbravadores.gravarNovo(tx, {
            clubeId,
            anoClube: relogio.anoClube,
            hoje: relogio.hoje,
            entrada: this.paraCadastro(linha),
            classe: linha.classeId ? classesPorId.get(linha.classeId) : undefined,
          })
        }
      },
      { timeout: MAXIMO_DA_TRANSACAO_MS },
    )
    return { importados: entrada.linhas.length }
  }

  private paraCadastro(linha: Linha): z.infer<typeof DesbravadorCriarEntrada> {
    return DesbravadorCriarEntrada.parse({
      nome: linha.nome,
      nascimento: linha.nascimento,
      sexo: linha.sexo,
      tipo: 'DBV',
      responsavelNome: textoOuNulo(linha.responsavelNome),
      responsavelTelefone: textoOuNulo(linha.responsavelTelefone),
      responsavelEmail: textoOuNulo(linha.responsavelEmail),
      entradaEm: linha.entradaEm,
      unidadeId: linha.unidadeId,
      classeId: linha.classeId,
      incluirAvancada: true,
    })
  }

  private async contextoDaPrevia(clubeId: string): Promise<ContextoDaPrevia> {
    const [relogio, unidades, classes, pessoas] = await Promise.all([
      this.escopo.relogio(clubeId),
      this.unidadesAtivas(clubeId),
      this.classesRegularesAtivas(clubeId),
      this.prisma.desbravador.findMany({ where: { clubeId }, select: { nome: true, nascimento: true } }),
    ])
    const classesPorNome = new Map<string, ClasseDoClube>()
    for (const classe of classes) {
      const nome = nomeNormalizado(classe.nome)
      if (!classesPorNome.has(nome)) classesPorNome.set(nome, classe)
    }
    return {
      relogio,
      unidadesPorNome: new Map(unidades.map((unidade) => [nomeNormalizado(unidade.nome), unidade])),
      classesPorNome,
      pessoasDoClube: new Set(pessoas.map((pessoa) => chaveDePessoa(pessoa.nome, paraDataCivil(pessoa.nascimento)))),
      sugestaoPorIdade: new Map(),
    }
  }

  private async converterLinha(
    clubeId: string,
    lida: LinhaLida,
    colunas: Map<CampoDaPlanilha, number>,
    contexto: ContextoDaPrevia,
  ): Promise<LinhaPrevia> {
    const celula = (campo: CampoDaPlanilha): Celula => {
      const coluna = colunas.get(campo)
      return coluna === undefined ? null : (lida.celulas[coluna] ?? null)
    }
    const texto = (campo: CampoDaPlanilha): string => textoDaCelula(celula(campo))
    const errosDeLeitura: Partial<Record<z.infer<typeof CampoDaLinhaImportada>, string>> = {}

    const nascimento = converterData(celula('nascimento'))
    if (!nascimento && texto('nascimento')) errosDeLeitura.nascimento = `Data de nascimento inválida: ${texto('nascimento')}`
    const sexo = converterSexo(celula('sexo'))
    if (!sexo && texto('sexo')) errosDeLeitura.sexo = `Sexo inválido: ${texto('sexo')}`
    const entradaEm = texto('entradaEm') ? converterData(celula('entradaEm')) : contexto.relogio.hoje
    if (!entradaEm) errosDeLeitura.entradaEm = `Data de entrada inválida: ${texto('entradaEm')}`

    const avisos: AvisoDaLinha[] = []
    // Mesma decisão do cadastro: quem já tem 16 até junho entra como Diretoria, e Diretoria não tem unidade.
    const diretoria = nascimento !== null && entraNaDiretoria(nascimento, contexto.relogio.hoje)
    if (diretoria) avisos.push({ codigo: AVISOS_IMPORTACAO.diretoriaSemUnidade, mensagem: MENSAGEM_DIRETORIA_SEM_UNIDADE })
    const nomeDaUnidade = diretoria ? '' : texto('unidade')
    const unidade = nomeDaUnidade ? contexto.unidadesPorNome.get(nomeNormalizado(nomeDaUnidade)) : undefined
    if (nomeDaUnidade && !unidade) {
      avisos.push({ codigo: AVISOS_IMPORTACAO.unidadeInexistente, mensagem: `A unidade ${nomeDaUnidade} não existe no clube` })
    }
    const avisoDeSexo = unidade && sexo ? avisoDeSexoDaUnidade(unidade, sexo) : undefined
    if (avisoDeSexo) avisos.push(avisoDeSexo)

    const nomeDaClasse = texto('classe')
    let classe = nomeDaClasse ? contexto.classesPorNome.get(nomeNormalizado(nomeDaClasse)) : undefined
    if (nomeDaClasse && !classe) {
      avisos.push({ codigo: AVISOS_IMPORTACAO.classeInexistente, mensagem: `A classe ${nomeDaClasse} não existe` })
    }
    if (!nomeDaClasse && nascimento) {
      classe = await this.sugerirClasse(clubeId, nascimento, contexto)
      if (classe) avisos.push({ codigo: AVISOS_IMPORTACAO.classeSugerida, mensagem: `Classe sugerida pela idade: ${classe.nome}` })
    }

    const campos = {
      nome: texto('nome'),
      nascimento: nascimento ?? '',
      sexo: sexo ?? '',
      responsavelNome: texto('responsavelNome') || null,
      responsavelTelefone: texto('responsavelTelefone') || null,
      responsavelEmail: texto('responsavelEmail') || null,
      entradaEm: entradaEm ?? '',
    } satisfies Partial<Linha>
    const erros = errosEmLista({ ...errosDaLinhaImportada(campos), ...errosDeLeitura })
    return {
      linha: lida.numero,
      ...campos,
      unidadeId: unidade?.id ?? null,
      classeId: classe?.id ?? null,
      erros,
      avisos,
      duplicado: false,
    }
  }

  /** Mesma regra do aviso de idade do cadastro, entre as classes ativas: a individual primeiro. */
  private async sugerirClasse(clubeId: string, nascimento: string, contexto: ContextoDaPrevia): Promise<ClasseDoClube | undefined> {
    const { relogio, sugestaoPorIdade } = contexto
    const idadeNoInicio = idade(nascimento, `${relogio.anoClube}-${relogio.inicioAnoClube}`)
    if (!sugestaoPorIdade.has(idadeNoInicio)) {
      let sugerida: ClasseDoClube | null = null
      for (const trilha of ['INDIVIDUAL', 'AGRUPADAS'] as const) {
        sugerida = await this.prisma.classe.findFirst({
          where: { ...ondeClasseDaIdade(clubeId, trilha, idadeNoInicio), ...ativaNoClube(clubeId) },
          orderBy: ORDEM_CLASSE_DA_IDADE,
          select: { id: true, nome: true, tipo: true, trilha: true },
        })
        if (sugerida) break
      }
      sugestaoPorIdade.set(idadeNoInicio, sugerida)
    }
    return sugestaoPorIdade.get(idadeNoInicio) ?? undefined
  }

  private unidadesAtivas(clubeId: string): Promise<UnidadeDoClube[]> {
    return this.prisma.unidade.findMany({ where: { clubeId, ativa: true }, select: { id: true, nome: true, tipo: true } })
  }

  private classesRegularesAtivas(clubeId: string): Promise<ClasseDoClube[]> {
    return this.prisma.classe.findMany({
      where: { OR: [{ clubeId: null }, { clubeId }], ativa: true, tipo: 'REGULAR', ...ativaNoClube(clubeId) },
      orderBy: { ordem: 'asc' },
      select: { id: true, nome: true, tipo: true, trilha: true },
    })
  }
}
