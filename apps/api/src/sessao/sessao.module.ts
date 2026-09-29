import { Global, Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { variavel } from '../comum/ambiente'
import { ServicoAccessToken } from './access-token.service'
import { ServicoRefresh } from './refresh.service'
import { ServicoSessao } from './sessao.service'
import { ServicoTokenUsoUnico } from './token-uso-unico.service'

@Global()
@Module({
  imports: [JwtModule.registerAsync({ useFactory: () => ({ secret: variavel('JWT_SEGREDO') }) })],
  providers: [ServicoAccessToken, ServicoRefresh, ServicoSessao, ServicoTokenUsoUnico],
  exports: [ServicoAccessToken, ServicoRefresh, ServicoSessao, ServicoTokenUsoUnico],
})
export class SessaoModule {}
