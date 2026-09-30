import { Injectable } from '@nestjs/common'
import {
  AVISOS_IMPORTACAO,
  avisoDeSexoDaUnidade,
  DesbravadorCriarEntrada,
  LIMITE_LINHAS_IMPORTACAO,
  errosDaLinhaImportada,
  idade,
  type Aviso,
  type ImportacaoEntrada,
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

const textoOuNulo = (texto: string | null): string | null => texto?.trim() || null

/** Classe desligada pelo clube (`ClasseClube.ativa = false`) não existe para a importação. */
const ativaNoClube = (clubeId: string) => ({ clubes: { none: { clubeId, ativa: false } } })

@Injectable()
export class ImportacaoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly escopo: ServicoEscopo,
    private readonly desbravadores: DesbravadoresService,
  ) {}

  async previa(sessao: SessaoLogada, arquivo: { buffer: Buffer; originalname: string } | undefined): Promise<z.infer<typeof PreviaImportacao>> {
    if (!arquivo) throw new ErroApp('REGRA', 'Escolha a planilha para enviar.')
    const [cabecalho, ...dados] = await lerPlanilha(arquivo.buffer, arquivo.originalname)
    const colunas = mapearCabecalho(cabecalho?.celulas ?? [])
    const colunasFaltando = COLUNAS_OBRIGATORIAS.filter(({ campo }) => !colunas.has(campo)).map(({ titulo }) => titulo)
    if (colunasFaltando.length > 0) return { colunasFaltando, linhas: [] }
    if (dados.length > LIMITE_LINHAS_IMPORTACAO) {
      throw new ErroApp('REGRA', `A planilha tem ${dados.length} linhas; o limite é ${LIMITE_LINHAS_IMPORTACAO}. Divida a planilha.`)
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
        linha.avisos.push({ codigo: AVISOS_IMPORTACAO.duplicado, mensagem: 'Já existe no clube um desbravador com este nome e nascimento.' })
      } else if (repetidaNaLinha !== undefined) {
        linha.duplicado = true
        linha.avisos.push({ codigo: AVISOS_IMPORTACAO.duplicado, mensagem: `Esta pessoa já aparece na linha ${repetidaNaLinha} da planilha.` })
      }
      if (chave && repetidaNaLinha === undefined) vistasNaPlanilha.set(chave, lida.numero)
      linhas.push(linha)
    }
    return { colunasFaltando: [], linhas }
  }

  /** Tudo ou nada: revalida as linhas marcadas e só grava se nenhuma tiver erro. */
  async confirmar(sessao: SessaoLogada, entrada: z.infer<typeof ImportacaoEntrada>): Promise<{ importados: number }> {
    const { clubeId } = sessao
    const relogio = await this.escopo.relogio(clubeId)
    const [unidades, classes] = await Promise.all([this.unidadesAtivas(clubeId), this.classesRegularesAtivas(clubeId)])
    const unidadeIds = new Set(unidades.map((unidade) => unidade.id))
    const classesPorId = new Map(classes.map((classe) => [classe.id, classe]))

    const erros = entrada.linhas.flatMap((linha) => {
      const mensagens = Object.values(errosDaLinhaImportada(linha))
      if (linha.unidadeId && !unidadeIds.has(linha.unidadeId)) mensagens.push('A unidade escolhida não existe no clube.')
      if (linha.classeId && !classesPorId.has(linha.classeId)) mensagens.push('A classe escolhida não existe.')
      return mensagens.length > 0 ? [{ linha: linha.linha, mensagens }] : []
    })
    if (erros.length > 0) throw new ErroLinhasDaImportacao(erros)

    await this.prisma.$transaction(
      async (tx) => {
        for (const linha of entrada.linhas) {
          await this.desbravadores.gravarNovo(tx, {
            clubeId,
            anoClube: relogio.anoClube,
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
    const errosDeLeitura: Partial<Record<keyof Linha, string>> = {}

    const nascimento = converterData(celula('nascimento'))
    if (!nascimento && texto('nascimento')) errosDeLeitura.nascimento = `Data de nascimento inválida: ${texto('nascimento')}`
    const sexo = converterSexo(celula('sexo'))
    if (!sexo && texto('sexo')) errosDeLeitura.sexo = `Sexo inválido: ${texto('sexo')}`
    const entradaEm = texto('entradaEm') ? converterData(celula('entradaEm')) : contexto.relogio.hoje
    if (!entradaEm) errosDeLeitura.entradaEm = `Data de entrada inválida: ${texto('entradaEm')}`

    const avisos: AvisoDaLinha[] = []
    const nomeDaUnidade = texto('unidade')
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
    const erros = Object.values({ ...errosDaLinhaImportada(campos), ...errosDeLeitura })
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
