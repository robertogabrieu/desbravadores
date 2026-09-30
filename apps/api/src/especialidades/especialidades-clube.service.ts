import { Injectable } from '@nestjs/common'
import type { AreaComEspecialidades, EspecialidadeClubeEntrada } from '@desbravadores/shared'
import type { z } from 'zod'
import { ErroApp } from '../comum/erros'
import { PrismaService } from '../comum/prisma/prisma.service'
import { semAcento } from '../desbravadores/apoio'
import { EspecialidadesService } from './especialidades.service'

type Area = z.infer<typeof AreaComEspecialidades>

@Injectable()
export class EspecialidadesClubeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly especialidades: EspecialidadesService,
  ) {}

  /** Nome unico na area entre as oficiais e as do clube (sem distinguir caixa nem acento). */
  async criar(clubeId: string, entrada: z.infer<typeof EspecialidadeClubeEntrada>): Promise<Area[]> {
    const area = await this.prisma.areaEspecialidade.findUnique({ where: { id: entrada.areaId }, select: { id: true } })
    if (!area) throw new ErroApp('NAO_ENCONTRADO', 'Área não encontrada.')

    // Serializa a criação por (clube, área): o banco não tem índice único para o nome, então a checagem e a gravação andam juntas sob o lock.
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('especialidade-do-clube'), hashtext(${`${clubeId}:${area.id}`}))`
      const existentes = await tx.especialidade.findMany({
        where: { areaId: area.id, OR: [{ clubeId: null }, { clubeId }] },
        select: { nome: true },
      })
      const nomeNormalizado = semAcento(entrada.nome)
      if (existentes.some((existente) => semAcento(existente.nome) === nomeNormalizado)) {
        throw new ErroApp('CONFLITO', 'Já existe uma especialidade com esse nome nesta área.')
      }
      await tx.especialidade.create({ data: { clubeId, origem: 'CLUBE', areaId: area.id, nome: entrada.nome } })
    })
    return this.especialidades.listar(clubeId, {})
  }
}
