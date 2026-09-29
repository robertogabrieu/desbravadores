import { Module } from '@nestjs/common'
import { SaudeModule } from './saude/saude.module'

@Module({ imports: [SaudeModule] })
export class AppModule {}
