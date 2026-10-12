import { Module } from '@nestjs/common'
import { PontosModule } from '../pontos/pontos.module'
import { PresencaController } from './presenca.controller'
import { ServicoPontosEvento } from './servico-pontos-evento'
import { ServicoPresenca } from './servico-presenca'

/** Não importa `EventosModule`: o sentido é eventos → eventos-especiais, que exporta os pontos do evento. */
@Module({
  imports: [PontosModule],
  controllers: [PresencaController],
  providers: [ServicoPresenca, ServicoPontosEvento],
  exports: [ServicoPontosEvento],
})
export class EventosEspeciaisModule {}
