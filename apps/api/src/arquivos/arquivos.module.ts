import { Module } from '@nestjs/common'
import { variavel } from '../comum/ambiente'
import { ARMAZENAMENTO, ArmazenamentoDisco } from './armazenamento'
import { ArquivosController } from './arquivos.controller'
import { ServicoArquivos } from './servico-arquivos'

@Module({
  controllers: [ArquivosController],
  providers: [
    { provide: ARMAZENAMENTO, useFactory: () => new ArmazenamentoDisco(variavel('ARQUIVOS_DIR')) },
    ServicoArquivos,
  ],
  exports: [ARMAZENAMENTO, ServicoArquivos],
})
export class ArquivosModule {}
