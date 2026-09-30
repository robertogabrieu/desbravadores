import { Module } from '@nestjs/common'
import { ServicoAtividade } from './servico-atividade'

@Module({
  providers: [ServicoAtividade],
  exports: [ServicoAtividade],
})
export class AtividadesModule {}
