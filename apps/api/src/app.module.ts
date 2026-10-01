import { Module } from '@nestjs/common'
import { AulasModule } from './aulas/aulas.module'
import { ArquivosModule } from './arquivos/arquivos.module'
import { AtividadesModule } from './atividades/atividades.module'
import { AuthModule } from './auth/auth.module'
import { CalendarioModule } from './calendario/calendario.module'
import { EventosModule } from './calendario/eventos.module'
import { AjustesClassesModule } from './classes/ajustes.module'
import { ClassesModule } from './classes/classes.module'
import { ClubeModule } from './clube/clube.module'
import { ComumModule } from './comum/comum.module'
import { PrismaModule } from './comum/prisma/prisma.module'
import { CronogramasModule } from './cronogramas/cronogramas.module'
import { MontagemModule } from './cronogramas/montagem/montagem.module'
import { DesbravadoresModule } from './desbravadores/desbravadores.module'
import { EmailModule } from './email/email.module'
import { EspecialidadesClubeModule } from './especialidades/especialidades-clube.module'
import { EspecialidadesModule } from './especialidades/especialidades.module'
import { FotosModule } from './fotos/fotos.module'
import { InicioModule } from './inicio/inicio.module'
import { InstrutorModule } from './instrutor/instrutor.module'
import { MateriaisModule } from './materiais/materiais.module'
import { ObservacoesModule } from './observacoes/observacoes.module'
import { ProgressoModule } from './progresso/progresso.module'
import { NotificacoesModule } from './notificacoes/notificacoes.module'
import { PedidosModule } from './pedidos/pedidos.module'
import { PermissoesModule } from './permissoes/permissoes.module'
import { PontosModule } from './pontos/pontos.module'
import { RankingModule } from './ranking/ranking.module'
import { ReunioesModule } from './reunioes/reunioes.module'
import { SaudeModule } from './saude/saude.module'
import { SessaoModule } from './sessao/sessao.module'
import { SyncModule } from './sync/sync.module'
import { TarefasModule } from './tarefas/tarefas.module'
import { UnidadesModule } from './unidades/unidades.module'
import { UsuariosModule } from './usuarios/usuarios.module'
import { VisaoGeralModule } from './visao-geral/visao-geral.module'

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
    EventosModule,
    MontagemModule,
    AjustesClassesModule,
    EspecialidadesClubeModule,
    VisaoGeralModule,
    ClubeModule,
    AulasModule,
    ProgressoModule,
    ObservacoesModule,
    MateriaisModule,
    InstrutorModule,
    TarefasModule,
  ],
})
export class AppModule {}
