import { Injectable } from '@nestjs/common'
import type { AreaComEspecialidades, EspecialidadeFiltro } from '@desbravadores/shared'
import type { z } from 'zod'
import { PrismaService } from '../comum/prisma/prisma.service'
import { colador, semAcento } from '../desbravadores/apoio'

type Area = z.infer<typeof AreaComEspecialidades>

@Injectable()
export class EspecialidadesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Areas por ordem, especialidades ativas (oficiais e do clube) por nome; com `busca`, areas sem resultado somem. */
  async listar(clubeId: string, filtro: z.infer<typeof EspecialidadeFiltro>): Promise<Area[]> {
    const [areas, especialidades] = await Promise.all([
      this.prisma.areaEspecialidade.findMany({
        where: filtro.areaId ? { id: filtro.areaId } : {},
        orderBy: { ordem: 'asc' },
      }),
      this.prisma.especialidade.findMany({
        where: { ativa: true, OR: [{ clubeId: null }, { clubeId }], ...(filtro.areaId ? { areaId: filtro.areaId } : {}) },
        select: { id: true, nome: true, origem: true, areaId: true },
      }),
    ])
    const termo = filtro.busca ? semAcento(filtro.busca) : undefined
    const resultado = areas.map((area) => ({
      id: area.id,
      codigo: area.codigo,
      nome: area.nome,
      ordem: area.ordem,
      especialidades: especialidades
        .filter((e) => e.areaId === area.id && (!termo || semAcento(e.nome).includes(termo)))
        .map((e) => ({ id: e.id, nome: e.nome, origem: e.origem }))
        .sort((a, b) => colador.compare(a.nome, b.nome)),
    }))
    return termo ? resultado.filter((area) => area.especialidades.length > 0) : resultado
  }
}
