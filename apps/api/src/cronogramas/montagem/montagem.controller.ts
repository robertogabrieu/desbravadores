import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common'
import {
  AulaCriarEntrada,
  AulaEditarEntrada,
  ColocarRequisitoEntrada,
  CronogramaCriarEntrada,
  CronogramaLeituraFiltro,
  CronogramaPeriodoEntrada,
  EnviarPublicarEntrada,
  Uuid,
  type MontagemSaida,
} from '@desbravadores/shared'
import type { z } from 'zod'
import { Logado } from '../../comum/decorators/logado.decorator'
import { SessaoDoClube, type SessaoLogada } from '../../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../../comum/pipes/zod-validation.pipe'
import { ServicoMontagem } from './servico-montagem'
import { ServicoMontagemLeitura } from './servico-montagem-leitura'

type Saida = Promise<z.infer<typeof MontagemSaida>>

const id = (): ZodValidationPipe<typeof Uuid> => new ZodValidationPipe(Uuid)

@Controller()
export class MontagemController {
  constructor(
    private readonly leitura: ServicoMontagemLeitura,
    private readonly montagem: ServicoMontagem,
  ) {}

  @Logado()
  @Get('classes/:id/cronograma/montagem')
  ler(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', id()) classeId: string,
    @Query(new ZodValidationPipe(CronogramaLeituraFiltro)) filtro: z.infer<typeof CronogramaLeituraFiltro>,
  ): Saida {
    return this.leitura.montagem(sessao, classeId, filtro.anoClube)
  }

  @Logado()
  @Post('cronogramas')
  criar(@SessaoDoClube() sessao: SessaoLogada, @Body(new ZodValidationPipe(CronogramaCriarEntrada)) entrada: z.infer<typeof CronogramaCriarEntrada>): Saida {
    return this.montagem.criar(sessao, entrada)
  }

  @Logado()
  @Patch('cronogramas/:id')
  editarPeriodo(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', id()) cronogramaId: string,
    @Body(new ZodValidationPipe(CronogramaPeriodoEntrada)) periodo: z.infer<typeof CronogramaPeriodoEntrada>,
  ): Saida {
    return this.montagem.editarPeriodo(sessao, cronogramaId, periodo)
  }

  @Logado()
  @Put('cronogramas/:id/requisitos/:requisitoId')
  colocarRequisito(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', id()) cronogramaId: string,
    @Param('requisitoId', id()) requisitoId: string,
    @Body(new ZodValidationPipe(ColocarRequisitoEntrada)) entrada: z.infer<typeof ColocarRequisitoEntrada>,
  ): Saida {
    return this.montagem.colocarRequisito(sessao, cronogramaId, requisitoId, entrada.data)
  }

  @Logado()
  @Delete('cronogramas/:id/requisitos/:requisitoId')
  tirarRequisito(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', id()) cronogramaId: string,
    @Param('requisitoId', id()) requisitoId: string,
  ): Saida {
    return this.montagem.tirarRequisito(sessao, cronogramaId, requisitoId)
  }

  @Logado()
  @Post('cronogramas/:id/aulas')
  criarAula(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', id()) cronogramaId: string,
    @Body(new ZodValidationPipe(AulaCriarEntrada)) entrada: z.infer<typeof AulaCriarEntrada>,
  ): Saida {
    return this.montagem.criarAula(sessao, cronogramaId, entrada)
  }

  @Logado()
  @Patch('aulas-planejadas/:id')
  editarAula(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', id()) aulaId: string,
    @Body(new ZodValidationPipe(AulaEditarEntrada)) entrada: z.infer<typeof AulaEditarEntrada>,
  ): Saida {
    return this.montagem.editarAula(sessao, aulaId, entrada)
  }

  @Logado()
  @Delete('aulas-planejadas/:id')
  removerAula(@SessaoDoClube() sessao: SessaoLogada, @Param('id', id()) aulaId: string): Saida {
    return this.montagem.removerAula(sessao, aulaId)
  }

  @Logado()
  @HttpCode(200)
  @Post('cronogramas/:id/enviar')
  enviar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', id()) cronogramaId: string,
    @Body(new ZodValidationPipe(EnviarPublicarEntrada)) entrada: z.infer<typeof EnviarPublicarEntrada>,
  ): Saida {
    return this.montagem.enviar(sessao, cronogramaId, entrada.atualizadoEmVisto)
  }

  @Logado()
  @HttpCode(200)
  @Post('cronogramas/:id/publicar')
  publicar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', id()) cronogramaId: string,
    @Body(new ZodValidationPipe(EnviarPublicarEntrada)) entrada: z.infer<typeof EnviarPublicarEntrada>,
  ): Saida {
    return this.montagem.publicar(sessao, cronogramaId, entrada.atualizadoEmVisto)
  }
}
