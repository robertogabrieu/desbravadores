import { Module } from '@nestjs/common'
import { PainelService } from './painel.service'
import { PedidosController } from './pedidos.controller'
import { PedidosService } from './pedidos.service'
import { VendasController } from './vendas.controller'
import { VendasService } from './vendas.service'

@Module({
  controllers: [VendasController, PedidosController],
  providers: [VendasService, PedidosService, PainelService],
  exports: [VendasService],
})
export class VendasModule {}
