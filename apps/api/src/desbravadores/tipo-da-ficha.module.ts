import { Module } from '@nestjs/common'
import { ServicoEscopo } from './escopo.service'
import { ServicoTipoDaFicha } from './tipo-da-ficha.service'

/** O Tipo da ficha (DBV, Diretoria, Líder) recalculado pelos gatilhos de desbravadores, usuários, convite e tarefas. */
@Module({
  providers: [ServicoTipoDaFicha, ServicoEscopo],
  exports: [ServicoTipoDaFicha],
})
export class TipoDaFichaModule {}
