import { Injectable } from '@nestjs/common'
import {
  permissoesEfetivas,
  type ObservacaoEditarEntrada,
  type ObservacaoEntrada,
  type ObservacaoFiltro,
  type ObservacaoSaida,
} from '@desbravadores/shared'
import type { z } from 'zod'
import type { SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import { exigirClasseDoEscopo } from './escopo-da-classe'

type Saida = z.infer<typeof ObservacaoSaida>

const SEM_PERMISSAO = 'Você não tem permissão para fazer isso.'
const NAO_ENCONTRADA = 'Observação não encontrada.'

const SELECAO = {
  id: true,
  classeId: true,
  alvo: true,
  autorId: true,
  titulo: true,
  texto: true,
  criadaEm: true,
  editadaEm: true,
  autor: { select: { nome: true } },
  registro: { select: { id: true, data: true } },
  dbv: { select: { id: true, nomePublico: true } },
} as const

type LinhaObservacao = {
  id: string
  classeId: string
  alvo: 'AULA' | 'DBV'
  autorId: string
  titulo: string | null
  texto: string
  criadaEm: Date
  editadaEm: Date | null
  autor: { nome: string }
  registro: { id: string; data: Date } | null
  dbv: { id: string; nomePublico: string } | null
}

@Injectable()
export class ObservacoesService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(sessao: SessaoLogada, filtro: z.infer<typeof ObservacaoFiltro>): Promise<Saida[]> {
    await exigirClasseDoEscopo(this.prisma, sessao, filtro.classeId)
    const veTodas = await this.veObservacoesDeOutros(sessao)
    const linhas = await this.prisma.observacao.findMany({
      where: {
        clubeId: sessao.clubeId,
        classeId: filtro.classeId,
        removidaEm: null,
        ...(filtro.alvo ? { alvo: filtro.alvo } : {}),
        ...(filtro.dbvId ? { dbvId: filtro.dbvId } : {}),
        ...(veTodas ? {} : { autorId: sessao.usuarioId }),
      },
      orderBy: [{ criadaEm: 'desc' }, { id: 'desc' }],
      select: SELECAO,
    })
    return linhas.map((linha) => this.saida(sessao, linha))
  }

  async criar(sessao: SessaoLogada, entrada: z.infer<typeof ObservacaoEntrada>): Promise<Saida> {
    if (sessao.papel === 'ADM') throw new ErroApp('SEM_PERMISSAO', 'O Adm vê e apaga observações, mas não as escreve.')
    await exigirClasseDoEscopo(this.prisma, sessao, entrada.classeId)
    const { clubeId } = sessao
    if (entrada.registroAulaId) {
      const registro = await this.prisma.registroAula.findFirst({
        where: { clubeId, id: entrada.registroAulaId, classeId: entrada.classeId },
        select: { id: true },
      })
      if (!registro) throw new ErroApp('NAO_ENCONTRADO', 'Aula não encontrada.')
    }
    if (entrada.dbvId) {
      const matricula = await this.prisma.matriculaClasse.findFirst({
        where: { clubeId, dbvId: entrada.dbvId, classeId: entrada.classeId },
        select: { id: true },
      })
      if (!matricula) throw new ErroApp('NAO_ENCONTRADO', 'Desbravador não encontrado.')
    }
    const criada = await this.prisma.observacao.create({
      data: {
        clubeId,
        classeId: entrada.classeId,
        autorId: sessao.usuarioId,
        alvo: entrada.alvo,
        registroAulaId: entrada.registroAulaId,
        dbvId: entrada.dbvId,
        titulo: entrada.titulo,
        texto: entrada.texto,
      },
      select: SELECAO,
    })
    return this.saida(sessao, criada)
  }

  async editar(sessao: SessaoLogada, id: string, entrada: z.infer<typeof ObservacaoEditarEntrada>): Promise<Saida> {
    const atual = await this.visivel(sessao, id)
    if (atual.autorId !== sessao.usuarioId) throw new ErroApp('SEM_PERMISSAO', 'Só quem escreveu a observação pode editá-la.')
    const { count } = await this.prisma.observacao.updateMany({
      where: { clubeId: sessao.clubeId, id, removidaEm: null },
      data: {
        ...(entrada.titulo !== undefined ? { titulo: entrada.titulo } : {}),
        ...(entrada.texto !== undefined ? { texto: entrada.texto } : {}),
        editadaEm: new Date(),
      },
    })
    if (count === 0) throw new ErroApp('NAO_ENCONTRADO', NAO_ENCONTRADA)
    return this.saida(sessao, await this.visivel(sessao, id))
  }

  /** Apagar não deleta a linha: zera o conteúdo e marca `removidaEm`, para o texto sumir de vez. */
  async apagar(sessao: SessaoLogada, id: string): Promise<void> {
    const atual = await this.visivel(sessao, id)
    if (sessao.papel !== 'ADM' && atual.autorId !== sessao.usuarioId) {
      throw new ErroApp('SEM_PERMISSAO', 'Só quem escreveu a observação pode apagá-la.')
    }
    const { count } = await this.prisma.observacao.updateMany({
      where: { clubeId: sessao.clubeId, id, removidaEm: null },
      data: { titulo: null, texto: '', removidaEm: new Date() },
    })
    if (count === 0) throw new ErroApp('NAO_ENCONTRADO', NAO_ENCONTRADA)
  }

  /** A observação que esta sessão pode ver; qualquer outra (removida, de outra classe ou de outro autor sem `ver_outros`) é 404. */
  private async visivel(sessao: SessaoLogada, id: string): Promise<LinhaObservacao> {
    if (sessao.papel === 'CONSELHEIRO') throw new ErroApp('SEM_PERMISSAO', SEM_PERMISSAO)
    const linha = await this.prisma.observacao.findFirst({
      where: { clubeId: sessao.clubeId, id, removidaEm: null },
      select: SELECAO,
    })
    if (!linha) throw new ErroApp('NAO_ENCONTRADO', NAO_ENCONTRADA)
    await exigirClasseDoEscopo(this.prisma, sessao, linha.classeId)
    if (linha.autorId !== sessao.usuarioId && !(await this.veObservacoesDeOutros(sessao))) {
      throw new ErroApp('NAO_ENCONTRADO', NAO_ENCONTRADA)
    }
    return linha
  }

  private async veObservacoesDeOutros(sessao: SessaoLogada): Promise<boolean> {
    if (sessao.papel === 'ADM') return true
    const ajustes = await this.prisma.permissaoAjuste.findMany({
      where: { vinculoId: sessao.vinculoId },
      select: { permissao: true, concedida: true },
    })
    const efetivas: string[] = permissoesEfetivas(sessao.papel, ajustes)
    return efetivas.includes('observacao.ver_outros')
  }

  private saida(sessao: SessaoLogada, linha: LinhaObservacao): Saida {
    const souAutor = linha.autorId === sessao.usuarioId
    return {
      id: linha.id,
      classeId: linha.classeId,
      alvo: linha.alvo,
      aula: linha.registro ? { id: linha.registro.id, data: linha.registro.data.toISOString().slice(0, 10) } : null,
      dbv: linha.dbv ? { id: linha.dbv.id, nome: linha.dbv.nomePublico } : null,
      titulo: linha.titulo,
      texto: linha.texto,
      autor: linha.autor.nome,
      criadaEm: linha.criadaEm.toISOString(),
      editadaEm: linha.editadaEm ? linha.editadaEm.toISOString() : null,
      podeEditar: souAutor,
      podeApagar: souAutor || sessao.papel === 'ADM',
    }
  }
}
