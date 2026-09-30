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

    const existentes = await this.prisma.especialidade.findMany({
      where: { areaId: area.id, OR: [{ clubeId: null }, { clubeId }] },
      select: { nome: true },
    })
    const nomeNormalizado = semAcento(entrada.nome)
    if (existentes.some((existente) => semAcento(existente.nome) === nomeNormalizado)) {
      throw new ErroApp('CONFLITO', 'Já existe uma especialidade com esse nome nesta área.')
    }

    await this.prisma.especialidade.create({ data: { clubeId, origem: 'CLUBE', areaId: area.id, nome: entrada.nome } })
    return this.especialidades.listar(clubeId, {})
  }
}
