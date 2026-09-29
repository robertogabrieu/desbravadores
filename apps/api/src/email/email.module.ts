import { Global, Module } from '@nestjs/common'
import { SERVICO_EMAIL } from './servico-email'
import { ServicoEmailSmtp } from './servico-email-smtp'

@Global()
@Module({
  providers: [{ provide: SERVICO_EMAIL, useFactory: () => new ServicoEmailSmtp() }],
  exports: [SERVICO_EMAIL],
})
export class EmailModule {}
