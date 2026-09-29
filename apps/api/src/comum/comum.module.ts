import { Module } from '@nestjs/common'
import { APP_FILTER, APP_GUARD } from '@nestjs/core'
import { FiltroErros } from './filtros/filtro-erros'
import { GuardaPermissao } from './guards/guarda-permissao.guard'
import { GuardaSessao } from './guards/guarda-sessao.guard'

// A ordem importa: a GuardaPermissao le a sessao que a GuardaSessao deixa na requisicao.
@Module({
  providers: [
    { provide: APP_GUARD, useClass: GuardaSessao },
    { provide: APP_GUARD, useClass: GuardaPermissao },
    { provide: APP_FILTER, useClass: FiltroErros },
  ],
})
export class ComumModule {}
