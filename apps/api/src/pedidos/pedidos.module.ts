import { Module } from '@nestjs/common'
import { DesbravadoresModule } from '../desbravadores/desbravadores.module'
import { PedidosController } from './pedidos.controller'
import { PedidosService } from './pedidos.service'

@Module({
  imports: [DesbravadoresModule],
  controllers: [PedidosController],
  providers: [PedidosService],
})
export class PedidosModule {}
