import { Module } from '@nestjs/common'
import { ArquivosModule } from '../arquivos/arquivos.module'
import { ComprovanteService } from './comprovante.service'
import { PainelService } from './painel.service'
import { PedidosController } from './pedidos.controller'
import { PedidosService } from './pedidos.service'
import { VendasController } from './vendas.controller'
import { VendasService } from './vendas.service'

@Module({
  imports: [ArquivosModule],
  controllers: [VendasController, PedidosController],
  providers: [VendasService, PedidosService, ComprovanteService, PainelService],
  exports: [VendasService],
})
export class VendasModule {}
