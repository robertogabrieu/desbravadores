import { Injectable } from '@nestjs/common'
import {
  hojeNoFuso,
  PRAZO_DE_EMPRESTIMO_EM_DIAS,
  situacaoDoEmprestimo,
  somarDiasAData,
  type BuscaDeDesbravadorParaEmprestimo,
  type DesbravadorParaEmprestimoSaida,
  type EmprestimoEntrada,
  type EmprestimoSaida,
  type EmprestimosFiltro,
  type EmprestimosSaida,
  type ExemplarSaida,
  type LivroFisicoDetalheSaida,
} from '@desbravadores/shared'
import type { z } from 'zod'
import { ServicoArquivos } from '../arquivos/servico-arquivos'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import { ehViolacaoUnica } from '../comum/violacao-unica'
import { colador, daDataCivil, paraDataCivil, semAcento } from '../desbravadores/apoio'
import type { Prisma } from '../generated/prisma/client.js'
import { buscarDesbravadoresParaEmprestimo } from './busca-de-desbravadores'
import { travarBiblioteca } from './constantes'

const TEMPO_DA_TRANSACAO_MS = 20_000
const DIAS_PARA_TRAS_DO_EMPRESTIMO = 60

const LIVRO_NAO_ENCONTRADO = 'Livro não encontrado.'
const DESBRAVADOR_NAO_ENCONTRADO = 'Desbravador não encontrado.'
const EMPRESTIMO_NAO_ENCONTRADO = 'Empréstimo não encontrado.'
const EXEMPLAR_JA_EMPRESTADO = 'Esse exemplar acabou de ser emprestado.'
const EXEMPLAR_FORA_DO_ACERVO = 'Esse exemplar foi retirado do acervo.'
const JA_DEVOLVIDO = 'Este livro já foi devolvido.'
const DATA_FORA_DA_JANELA = 'Escolha uma data de hoje até 60 dias atrás.'

const SITUACAO_DO_FILTRO = {
  todas: null,
  atrasados: 'ATRASADO',
  'vencem-hoje': 'VENCE_HOJE',
  'no-prazo': 'NO_PRAZO',
} as const

type Banco = Pick<PrismaService, 'emprestimoBiblioteca'>

/** O que a aba, o detalhe e a busca precisam saber do desbravador; a unidade é sempre a atual. */
function selecaoDoDesbravador(clubeId: string) {
  return {
    nome: true,
    ativo: true,
    tipo: true,
    membros: { where: { clubeId, fim: null }, select: { unidade: { select: { nome: true } } } },
  } satisfies Prisma.DesbravadorSelect
}

interface DesbravadorLido {
  nome: string
  ativo: boolean
  tipo: string
  membros: Array<{ unidade: { nome: string } }>
}

/** Inativado ou que deixou de ser DBV: o empréstimo segue aberto, marcado como "(inativo)" na tela (D19). */
function aindaDesbravador(desbravador: DesbravadorLido): boolean {
  return desbravador.ativo && desbravador.tipo === 'DBV'
}

/** Quem foi inativado fica "sem unidade", não com a da época. */
function unidadeAtual(desbravador: DesbravadorLido): string | null {
  return desbravador.ativo ? (desbravador.membros[0]?.unidade.nome ?? null) : null
}

function mensagemDeJaTemLivro(nome: string, titulo: string): string {
  return `${nome} já está com ${titulo}. Peça a devolução antes.`
}

function saidaDoEmprestimo(linha: {
  id: string
  exemplarId: string
  desbravadorId: string
  emprestadoEm: Date
  devolverAte: Date
  devolvidoEm: Date | null
}): EmprestimoSaida {
  return {
    id: linha.id,
    exemplarId: linha.exemplarId,
    desbravadorId: linha.desbravadorId,
    emprestadoEm: paraDataCivil(linha.emprestadoEm),
    devolverAte: paraDataCivil(linha.devolverAte),
    devolvidoEm: linha.devolvidoEm ? paraDataCivil(linha.devolvidoEm) : null,
  }
}

@Injectable()
export class EmprestimosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly arquivos: ServicoArquivos,
  ) {}

  /**
   * As conferências rodam dentro da trava do clube. Os dois índices únicos parciais são a garantia final: se um
   * escapar, o erro do banco vira 409 aqui, fora da transação (a violação a aborta e a mensagem pede uma leitura).
   */
  async emprestar(sessao: SessaoLogada, entrada: EmprestimoEntrada): Promise<EmprestimoSaida> {
    const { clubeId } = sessao
    const hoje = await this.hoje(clubeId)
    const emprestadoEm = entrada.emprestadoEm ?? hoje
    if (emprestadoEm > hoje || emprestadoEm < somarDiasAData(hoje, -DIAS_PARA_TRAS_DO_EMPRESTIMO)) {
      throw new ErroApp('VALIDACAO', DATA_FORA_DA_JANELA, { emprestadoEm: DATA_FORA_DA_JANELA })
    }
    try {
      return await this.escrever(clubeId, (tx) => this.gravarEmprestimo(tx, sessao, entrada, emprestadoEm))
    } catch (erro) {
      if (!ehViolacaoUnica(erro)) throw erro
      throw await this.conflitoDeEmprestimo(clubeId, entrada)
    }
  }

  /** `devolvidoEm` é sempre o hoje do servidor; qualquer um da diretoria com a permissão pode devolver (D16). */
  async devolver(sessao: SessaoLogada, id: string): Promise<EmprestimoSaida> {
    const { clubeId } = sessao
    const hoje = await this.hoje(clubeId)
    return this.escrever(clubeId, async (tx) => {
      const emprestimo = await tx.emprestimoBiblioteca.findFirst({ where: { clubeId, id } })
      if (!emprestimo) throw new ErroApp('NAO_ENCONTRADO', EMPRESTIMO_NAO_ENCONTRADO)
      if (emprestimo.devolvidoEm) throw new ErroApp('CONFLITO', JA_DEVOLVIDO)
      const devolvidoEm = daDataCivil(hoje)
      await tx.emprestimoBiblioteca.updateMany({
        where: { clubeId, id, devolvidoEm: null },
        data: { devolvidoEm, devolvidoPorId: sessao.usuarioId },
      })
      return saidaDoEmprestimo({ ...emprestimo, devolvidoEm })
    })
  }

  /** Exemplares ativos com quem está com cada um, e quem já devolveu o livro (uma linha por desbravador, a mais recente). */
  async exemplaresDoLivro(sessao: SessaoLogada, itemId: string): Promise<LivroFisicoDetalheSaida> {
    const { clubeId } = sessao
    const hoje = await this.hoje(clubeId)
    const livro = await this.prisma.itemBiblioteca.findFirst({
      where: { clubeId, id: itemId, tipo: 'FISICO', removidoEm: null },
      select: { id: true, categoriaId: true, nome: true, descricao: true, capaId: true },
    })
    if (!livro) throw new ErroApp('NAO_ENCONTRADO', LIVRO_NAO_ENCONTRADO)

    const [exemplares, devolvidos] = await Promise.all([
      this.prisma.exemplarBiblioteca.findMany({
        where: { clubeId, itemId, baixadoEm: null },
        orderBy: { numero: 'asc' },
        select: {
          id: true,
          numero: true,
          emprestimos: {
            where: { clubeId, devolvidoEm: null },
            select: {
              id: true,
              desbravadorId: true,
              emprestadoEm: true,
              devolverAte: true,
              desbravador: { select: selecaoDoDesbravador(clubeId) },
            },
          },
        },
      }),
      this.prisma.emprestimoBiblioteca.findMany({
        where: { clubeId, devolvidoEm: { not: null }, exemplar: { is: { clubeId, itemId } } },
        orderBy: [{ devolvidoEm: 'desc' }, { id: 'desc' }],
        select: { desbravadorId: true, devolvidoEm: true, desbravador: { select: selecaoDoDesbravador(clubeId) } },
      }),
    ])

    const saidaDosExemplares = exemplares.map((exemplar): ExemplarSaida => {
      const aberto = exemplar.emprestimos[0]
      if (!aberto) return { id: exemplar.id, numero: exemplar.numero, situacao: 'DISPONIVEL', emprestimo: null }
      const devolverAte = paraDataCivil(aberto.devolverAte)
      return {
        id: exemplar.id,
        numero: exemplar.numero,
        situacao: 'EMPRESTADO',
        emprestimo: {
          id: aberto.id,
          desbravadorId: aberto.desbravadorId,
          desbravadorNome: aberto.desbravador.nome,
          desbravadorAtivo: aindaDesbravador(aberto.desbravador),
          unidade: unidadeAtual(aberto.desbravador),
          emprestadoEm: paraDataCivil(aberto.emprestadoEm),
          devolverAte,
          ...situacaoDoEmprestimo(devolverAte, hoje),
        },
      }
    })

    const jaDevolveram = new Map<string, LivroFisicoDetalheSaida['jaDevolveram'][number]>()
    for (const devolucao of devolvidos) {
      if (jaDevolveram.has(devolucao.desbravadorId) || !devolucao.devolvidoEm) continue
      jaDevolveram.set(devolucao.desbravadorId, {
        desbravadorId: devolucao.desbravadorId,
        desbravadorNome: devolucao.desbravador.nome,
        unidade: unidadeAtual(devolucao.desbravador),
        devolvidoEm: paraDataCivil(devolucao.devolvidoEm),
      })
    }

    return {
      item: {
        id: livro.id,
        categoriaId: livro.categoriaId,
        nome: livro.nome,
        descricao: livro.descricao,
        capaUrl: livro.capaId ? this.arquivos.urlAssinada(clubeId, livro.capaId, 'miniatura') : null,
        tipo: 'FISICO',
        total: saidaDosExemplares.length,
        disponiveis: saidaDosExemplares.filter((exemplar) => exemplar.situacao === 'DISPONIVEL').length,
      },
      exemplares: saidaDosExemplares,
      jaDevolveram: [...jaDevolveram.values()],
    }
  }

  /** Aba do Adm: os empréstimos em aberto, do mais atrasado ao mais no prazo. Os totais não dependem do filtro. */
  async listar(sessao: SessaoLogada, filtro: z.output<typeof EmprestimosFiltro>): Promise<EmprestimosSaida> {
    const { clubeId } = sessao
    const hoje = await this.hoje(clubeId)
    const abertos = await this.prisma.emprestimoBiblioteca.findMany({
      where: { clubeId, devolvidoEm: null },
      select: {
        id: true,
        emprestadoEm: true,
        devolverAte: true,
        exemplar: { select: { numero: true, item: { select: { nome: true } } } },
        desbravador: { select: selecaoDoDesbravador(clubeId) },
      },
    })
    const linhas = abertos.map((emprestimo) => {
      const devolverAte = paraDataCivil(emprestimo.devolverAte)
      return { emprestimo, devolverAte, ...situacaoDoEmprestimo(devolverAte, hoje) }
    })

    const totais = {
      emprestados: linhas.length,
      atrasados: linhas.filter((linha) => linha.situacao === 'ATRASADO').length,
      vencemHoje: linhas.filter((linha) => linha.situacao === 'VENCE_HOJE').length,
    }
    const termo = filtro.busca ? semAcento(filtro.busca) : ''
    const situacaoPedida = SITUACAO_DO_FILTRO[filtro.situacao]
    const itens = linhas
      .filter((linha) => situacaoPedida === null || linha.situacao === situacaoPedida)
      .filter(
        (linha) =>
          termo === '' ||
          semAcento(linha.emprestimo.exemplar.item.nome).includes(termo) ||
          semAcento(linha.emprestimo.desbravador.nome).includes(termo),
      )
      .sort(
        (a, b) =>
          a.devolverAte.localeCompare(b.devolverAte) ||
          colador.compare(a.emprestimo.desbravador.nome, b.emprestimo.desbravador.nome) ||
          a.emprestimo.id.localeCompare(b.emprestimo.id),
      )
      .map(({ emprestimo, devolverAte, situacao, dias }) => ({
        emprestimoId: emprestimo.id,
        titulo: emprestimo.exemplar.item.nome,
        numeroDoExemplar: emprestimo.exemplar.numero,
        desbravadorNome: emprestimo.desbravador.nome,
        desbravadorAtivo: aindaDesbravador(emprestimo.desbravador),
        unidade: unidadeAtual(emprestimo.desbravador),
        emprestadoEm: paraDataCivil(emprestimo.emprestadoEm),
        devolverAte,
        situacao,
        dias,
      }))
    return { totais, itens }
  }

  buscarDesbravadores(sessao: SessaoLogada, filtro: BuscaDeDesbravadorParaEmprestimo): Promise<DesbravadorParaEmprestimoSaida[]> {
    return buscarDesbravadoresParaEmprestimo(this.prisma, sessao.clubeId, filtro.busca)
  }

  private async gravarEmprestimo(
    tx: Prisma.TransactionClient,
    sessao: SessaoLogada,
    entrada: EmprestimoEntrada,
    emprestadoEm: string,
  ): Promise<EmprestimoSaida> {
    const { clubeId } = sessao
    const exemplar = await tx.exemplarBiblioteca.findFirst({
      where: { clubeId, id: entrada.exemplarId, item: { is: { clubeId, tipo: 'FISICO', removidoEm: null } } },
      select: { id: true, baixadoEm: true },
    })
    if (!exemplar) throw new ErroApp('NAO_ENCONTRADO', LIVRO_NAO_ENCONTRADO)
    const desbravador = await tx.desbravador.findFirst({
      where: { clubeId, id: entrada.desbravadorId, ativo: true, tipo: 'DBV' },
      select: { id: true, nome: true, entradaEm: true },
    })
    if (!desbravador) throw new ErroApp('NAO_ENCONTRADO', DESBRAVADOR_NAO_ENCONTRADO)

    if (exemplar.baixadoEm) throw new ErroApp('CONFLITO', EXEMPLAR_FORA_DO_ACERVO)
    if (emprestadoEm < paraDataCivil(desbravador.entradaEm)) {
      const mensagem = `Essa data é anterior à entrada de ${desbravador.nome} no clube.`
      throw new ErroApp('VALIDACAO', mensagem, { emprestadoEm: mensagem })
    }
    const conflito = await this.conflitoAberto(tx, clubeId, entrada)
    if (conflito) throw conflito

    const criado = await tx.emprestimoBiblioteca.create({
      data: {
        clubeId,
        exemplarId: exemplar.id,
        desbravadorId: desbravador.id,
        emprestadoEm: daDataCivil(emprestadoEm),
        devolverAte: daDataCivil(somarDiasAData(emprestadoEm, PRAZO_DE_EMPRESTIMO_EM_DIAS)),
        emprestadoPorId: sessao.usuarioId,
      },
    })
    return saidaDoEmprestimo(criado)
  }

  /** O exemplar já emprestado, ou o desbravador que já está com um livro; a mensagem é a mesma dentro e fora da trava. */
  private async conflitoAberto(banco: Banco, clubeId: string, entrada: EmprestimoEntrada): Promise<ErroApp | null> {
    const doExemplar = await banco.emprestimoBiblioteca.findFirst({
      where: { clubeId, exemplarId: entrada.exemplarId, devolvidoEm: null },
      select: { id: true },
    })
    if (doExemplar) return new ErroApp('CONFLITO', EXEMPLAR_JA_EMPRESTADO)
    const doDesbravador = await banco.emprestimoBiblioteca.findFirst({
      where: { clubeId, desbravadorId: entrada.desbravadorId, devolvidoEm: null },
      select: { desbravador: { select: { nome: true } }, exemplar: { select: { item: { select: { nome: true } } } } },
    })
    if (doDesbravador) {
      return new ErroApp('CONFLITO', mensagemDeJaTemLivro(doDesbravador.desbravador.nome, doDesbravador.exemplar.item.nome))
    }
    return null
  }

  private async conflitoDeEmprestimo(clubeId: string, entrada: EmprestimoEntrada): Promise<ErroApp> {
    return (await this.conflitoAberto(this.prisma, clubeId, entrada)) ?? new ErroApp('CONFLITO', EXEMPLAR_JA_EMPRESTADO)
  }

  private async hoje(clubeId: string): Promise<string> {
    const configuracao = await this.prisma.configuracaoClube.findUniqueOrThrow({ where: { clubeId }, select: { fuso: true } })
    return hojeNoFuso(configuracao.fuso, new Date())
  }

  /** Mesma trava do clube que toda escrita da biblioteca usa: as conferências de dentro valem até o commit. */
  private escrever<T>(clubeId: string, trabalho: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        await travarBiblioteca(tx, clubeId)
        return trabalho(tx)
      },
      { timeout: TEMPO_DA_TRANSACAO_MS },
    )
  }
}
