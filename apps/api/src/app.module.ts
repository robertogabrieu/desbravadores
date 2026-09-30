import { Module } from '@nestjs/common'
import { AulasModule } from './aulas/aulas.module'
import { ArquivosModule } from './arquivos/arquivos.module'
import { AuthModule } from './auth/auth.module'
import { AtividadesModule } from './atividades/atividades.module'
import { CalendarioModule } from './calendario/calendario.module'
import { ClassesModule } from './classes/classes.module'
import { ComumModule } from './comum/comum.module'
import { PrismaModule } from './comum/prisma/prisma.module'
import { CronogramasModule } from './cronogramas/cronogramas.module'
import { DesbravadoresModule } from './desbravadores/desbravadores.module'
import { EmailModule } from './email/email.module'
import { EspecialidadesModule } from './especialidades/especialidades.module'
import { FotosModule } from './fotos/fotos.module'
import { InicioModule } from './inicio/inicio.module'
import { InstrutorModule } from './instrutor/instrutor.module'
import { MateriaisModule } from './materiais/materiais.module'
import { ObservacoesModule } from './observacoes/observacoes.module'
import { ProgressoModule } from './progresso/progresso.module'
import { NotificacoesModule } from './notificacoes/notificacoes.module'
import { PermissoesModule } from './permissoes/permissoes.module'
import { PedidosModule } from './pedidos/pedidos.module'
import { PontosModule } from './pontos/pontos.module'
import { RankingModule } from './ranking/ranking.module'
import { ReunioesModule } from './reunioes/reunioes.module'
import { SaudeModule } from './saude/saude.module'
import { SessaoModule } from './sessao/sessao.module'
import { SyncModule } from './sync/sync.module'
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
    PontosModule,
    ArquivosModule,
    SyncModule,
    ReunioesModule,
    RankingModule,
    InicioModule,
    FotosModule,
    PedidosModule,
    CalendarioModule,
    CronogramasModule,
    NotificacoesModule,
    AtividadesModule,
    AulasModule,
    ProgressoModule,
    ObservacoesModule,
    MateriaisModule,
    InstrutorModule,
  ],
})
export class AppModule {}
