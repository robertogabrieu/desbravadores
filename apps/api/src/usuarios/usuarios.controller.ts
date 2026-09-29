import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common'
import {
  UsuarioCriarEntrada,
  UsuarioEditarEntrada,
  UsuarioFiltro,
  Uuid,
  VinculoEditarEntrada,
  VinculoEntrada,
} from '@desbravadores/shared'
import type { z } from 'zod'
import { Pode } from '../comum/decorators/pode.decorator'
import { SessaoDoClube, type SessaoLogada } from '../comum/decorators/sessao.decorator'
import { ZodValidationPipe } from '../comum/pipes/zod-validation.pipe'
import { UsuariosService } from './usuarios.service'

const IdDaRota = new ZodValidationPipe(Uuid)

@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Pode('usuario.gerenciar')
  @Get()
  listar(@SessaoDoClube() sessao: SessaoLogada, @Query(new ZodValidationPipe(UsuarioFiltro)) filtro: z.infer<typeof UsuarioFiltro>) {
    return this.usuarios.listar(sessao, filtro)
  }

  @Pode('usuario.gerenciar')
  @Post()
  criar(@SessaoDoClube() sessao: SessaoLogada, @Body(new ZodValidationPipe(UsuarioCriarEntrada)) entrada: z.infer<typeof UsuarioCriarEntrada>) {
    return this.usuarios.criar(sessao, entrada)
  }

  @Pode('usuario.gerenciar')
  @Patch(':id')
  editar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Body(new ZodValidationPipe(UsuarioEditarEntrada)) entrada: z.infer<typeof UsuarioEditarEntrada>,
  ) {
    return this.usuarios.editar(sessao, id, entrada)
  }

  @Pode('usuario.gerenciar')
  @HttpCode(200)
  @Post(':id/desativar')
  desativar(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string) {
    return this.usuarios.desativar(sessao, id)
  }

  @Pode('usuario.gerenciar')
  @Post(':id/vinculos')
  adicionarVinculo(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Body(new ZodValidationPipe(VinculoEntrada)) entrada: z.infer<typeof VinculoEntrada>,
  ) {
    return this.usuarios.adicionarVinculo(sessao, id, entrada)
  }

  @Pode('usuario.gerenciar')
  @HttpCode(204)
  @Post(':id/convite')
  async reenviarConvite(@SessaoDoClube() sessao: SessaoLogada, @Param('id', IdDaRota) id: string): Promise<void> {
    await this.usuarios.reenviarConvite(sessao, id)
  }
}

@Controller('vinculos')
export class VinculosController {
  constructor(private readonly usuarios: UsuariosService) {}

  @Pode('usuario.gerenciar')
  @Put(':id')
  editar(
    @SessaoDoClube() sessao: SessaoLogada,
    @Param('id', IdDaRota) id: string,
    @Body(new ZodValidationPipe(VinculoEditarEntrada)) entrada: z.infer<typeof VinculoEditarEntrada>,
  ) {
    return this.usuarios.editarVinculo(sessao, id, entrada)
  }
}
