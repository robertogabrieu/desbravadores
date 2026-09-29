import { Module } from '@nestjs/common'
import { AuthModule } from './auth/auth.module'
import { ClassesModule } from './classes/classes.module'
import { ComumModule } from './comum/comum.module'
import { PrismaModule } from './comum/prisma/prisma.module'
import { DesbravadoresModule } from './desbravadores/desbravadores.module'
import { EmailModule } from './email/email.module'
import { EspecialidadesModule } from './especialidades/especialidades.module'
import { PermissoesModule } from './permissoes/permissoes.module'
import { SaudeModule } from './saude/saude.module'
import { SessaoModule } from './sessao/sessao.module'
import { UnidadesModule } from './unidades/unidades.module'
import { UsuariosModule } from './usuarios/usuarios.module'

// Um módulo por linha: cada pacote (e cada fase) preenche a pasta do seu sem editar este arquivo.
@Module({
  imports: [
    PrismaModule,
    SessaoModule,
    EmailModule,
    ComumModule,
    SaudeModule,
    AuthModule,
    UsuariosModule,
    DesbravadoresModule,
    UnidadesModule,
    ClassesModule,
    EspecialidadesModule,
    PermissoesModule,
  ],
})
export class AppModule {}
