import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common'
import { PrismaService } from './prisma.service'
import { PrismaSistema } from './prisma-sistema'

@Global()
@Module({
  providers: [
    { provide: PrismaService, useFactory: () => new PrismaService() },
    { provide: PrismaSistema, useFactory: () => new PrismaSistema() },
  ],
  exports: [PrismaService, PrismaSistema],
})
export class PrismaModule implements OnModuleDestroy {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PrismaSistema) private readonly sistema: PrismaSistema,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.prisma.$disconnect(), this.sistema.$disconnect()])
  }
}
