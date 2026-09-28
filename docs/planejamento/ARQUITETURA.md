# Aplicativo do Desbravador — Arquitetura

Princípio: **poucas peças, todas conhecidas.** Quem mantém é voluntário; cada serviço a mais é
uma senha a mais, uma conta que expira e uma coisa que quebra num domingo de manhã.

## 1. Stack recomendada

A mesma do Desbravadores Finance, que já está em produção e que você já opera.

| Camada | Escolha | Por quê |
|---|---|---|
| Front | **Vite + React 19 + TypeScript**, React Router 7, TanStack Query, Tailwind 4 + shadcn, lucide-react, react-hook-form + zod | Igual ao Finance: mesmo jeito de montar tela, mesmos componentes |
| PWA | **vite-plugin-pwa** (Workbox) | Instalação, cache das telas e funcionamento offline |
| Offline | **Dexie** (IndexedDB) | Guarda a chamada e a aula no aparelho até sincronizar |
| API | **NestJS 11** | Igual ao Finance; módulos, guards de autorização e validação prontos |
| Banco | **PostgreSQL 17 + Prisma 7** | Relacional (o domínio é todo de relações), migrations versionadas |
| Tipos compartilhados | Pacote `shared` com schemas **zod** | O mesmo contrato valida no celular (antes de guardar offline) e na API |
| Fotos e arquivos | Disco do servidor (volume Docker) atrás de uma interface `Armazenamento` + processamento com **sharp** | Zero custo; a interface deixa trocar por Cloudflare R2 sem mexer no resto |
| E-mail | SMTP de um provedor gratuito (Brevo ou Resend) | Convite e recuperação de senha; ~dezenas de e-mails por mês |
| Excel | **exceljs** | Exportação dos relatórios |
| Implantação | **Docker Compose** no mesmo VPS do Finance, atrás do nginx | Mesmo procedimento de deploy que você já usa |

### Alternativas consideradas

| Alternativa | O que ganharia | Por que não agora |
|---|---|---|
| **Supabase** (banco + login + arquivos gerenciados) | Menos código de API e de login | O plano gratuito pausa o projeto sem uso; regras de acesso por linha (RLS) com vários vínculos por pessoa ficam difíceis de testar; offline continua sendo seu problema; outra plataforma para aprender |
| **Firebase** (Firestore) | Offline pronto no SDK | Banco de documentos para um domínio muito relacional (DBV × requisito × aula × critério); relatórios e ranking ficam caros e complicados; aprisiona no Google |
| **Next.js** full-stack | Um projeto só | O Finance migrou de Next para Vite; PWA offline é mais simples numa SPA pura |
| **Integrar no Finance** como módulo | Cadastro único de DBVs e um login só | Acopla o ritmo dos dois apps e aumenta o risco de uma mudança quebrar o financeiro; decidido separar |

## 2. Estrutura de pastas

Monorepo com npm workspaces:

```
desbravadores/
├── apps/
│   ├── api/                      # NestJS
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed/             # cadernos, especialidades, critérios padrão
│   │   └── src/
│   │       ├── comum/            # guards, filtro por clube, erros, paginação
│   │       ├── auth/             # login, refresh, convite, senha
│   │       ├── clubes/           # clube, configuração, vínculos
│   │       ├── pessoas/          # desbravadores, usuários
│   │       ├── unidades/
│   │       ├── classes/          # classes, seções, requisitos, especialidades, matrícula
│   │       ├── calendario/       # eventos do clube
│   │       ├── cronogramas/      # cronograma e aulas planejadas
│   │       ├── reunioes/         # reunião e chamada
│   │       ├── aulas/            # registro de aula, requisitos concluídos
│   │       ├── ranking/          # critérios, lançamentos, cálculo
│   │       ├── midia/            # fotos, materiais, armazenamento
│   │       ├── observacoes/
│   │       ├── notificacoes/
│   │       ├── relatorios/
│   │       └── sync/             # recebe o lote offline
│   └── web/                      # React
│       └── src/
│           ├── app/              # rotas, layouts (celular com barra inferior; Adm com menu lateral)
│           ├── ui/               # componentes base (shadcn + tokens do design)
│           ├── modulos/          # uma pasta por área: conselheiro/, instrutor/, adm/, comum/
│           ├── offline/          # banco Dexie, fila de envio, indicador de sincronização
│           └── api/              # cliente HTTP e hooks do TanStack Query
├── packages/
│   └── shared/                   # schemas zod, enums, permissões, fórmulas (pontos, %)
├── docs/
│   ├── design/                   # handoff de design (referência)
│   └── planejamento/             # estes documentos + dados/cadernos/*.json
├── docker-compose.yml
└── scripts/                      # deploy.sh, update.sh, backup.sh
```

**Fórmulas no pacote `shared`.** Pontos da chamada, % da classe, frequência e "pronto para
investidura" são funções puras usadas pela API (fonte de verdade) e pelo celular (para mostrar
os pontos ao vivo durante a chamada offline). Uma fórmula, dois lugares, sem divergência.

## 3. Autenticação

- **Login por e-mail e senha.** Senha com argon2.
- **Access token** JWT de 15 min na memória do app; **refresh token** de 30 dias em cookie
  httpOnly, com rotação a cada uso e revogação no banco. 30 dias (e não 7, como no Finance)
  porque o conselheiro pode abrir o app só no domingo, e sem internet.
- **Convite**: o Adm cadastra nome, e-mail e vínculos; o sistema manda um link de uso único
  (validade 7 dias) para a pessoa definir a senha. Não existe cadastro aberto.
- **Recuperação de senha** por e-mail, link de uso único de 1 hora.
- **Sem internet**: o app abre com os dados guardados e deixa fazer chamada e aula. Ao voltar a
  internet, renova o token e envia a fila. Se o refresh também tiver expirado, pede login **sem
  apagar a fila** — ela é enviada logo depois.

## 4. Autorização

Três camadas, verificadas na API em toda requisição (o front só esconde botões):

1. **Clube.** Todo registro tem `clubeId`. Um guard injeta o clube ativo e uma extensão do Prisma
   **recusa** consultas de lista sem `clubeId` (a mesma proteção do Finance).
2. **Permissão.** Catálogo fixo em `shared` (ex.: `reuniao.registrar`, `aula.registrar`,
   `requisito.marcar`, `cronograma.montar`, `observacao.ver_outros`, `ranking.configurar`). Cada
   **papel** tem um conjunto padrão; o Adm pode ligar ou desligar por vínculo. O papel Adm tem
   tudo e não é editável.
3. **Escopo.** Conselheiro só age nas unidades do seu vínculo; instrutor só nas classes do seu
   vínculo. O guard recebe a permissão e o recurso: `pode('reuniao.registrar', { unidadeId })`.

**Montar cronograma tem uma trava só:** a escolha "Quem monta" da classe (Adm ou instrutores da
classe). A permissão "Montar cronograma" da tela de Usuários sai — duas travas para a mesma
coisa confundem (ver INCONSISTENCIAS).

A permissão é lida do banco a cada requisição (não do token), para que tirar o acesso de alguém
valha na hora.

## 5. Estratégia offline

**O que funciona sem internet:** abrir o app, ver a unidade e as classes, **fazer a chamada** e
**registrar a aula** (presença + requisitos cumpridos). O resto mostra o último dado guardado
com um aviso "sem conexão".

**Preparação (online).** Sempre que o app abre com internet, ele baixa e guarda no aparelho o
"pacote do domingo" do usuário: DBVs das suas unidades e classes, critérios de pontuação
ativos, as aulas planejadas das próximas 2 semanas com os requisitos, e os requisitos que cada
DBV já concluiu. O Service Worker guarda as telas.

**Registro (offline ou online, mesmo caminho).** A chamada e a aula são gravadas **primeiro no
aparelho** (Dexie), como um registro completo com um id gerado no celular (UUID). Uma fila envia
para a API quando há conexão: ao abrir o app, ao voltar a internet e pelo botão "Enviar agora".
Não dependemos de Background Sync, que o iPhone não suporta.

**Envio idempotente.** A API recebe `PUT /sync/reunioes/{uuid}` com a chamada inteira. Reenviar o
mesmo registro não duplica nada. A resposta devolve os pontos calculados pelo servidor.

**Conflito.** Uma chamada é de uma unidade num domingo. Se dois aparelhos enviarem a mesma
chamada (dois conselheiros da unidade), vale **por DBV o registro mais recente** e a tela do
histórico mostra "editada por X". Na aula, o mesmo por DBV × requisito. Marcar requisito é
aditivo: desmarcar só vale se o registro mais recente for o de desmarcar.

**Visível para quem usa.** Cada chamada mostra um estado: "Salva no celular — será enviada" ou
"Enviada". O Início mostra uma faixa quando há algo esperando envio. Sair do app (logout) com
fila pendente exige confirmação explícita.

## 6. Fotos e arquivos

- **Upload de foto** pela câmera ou galeria do celular. O app **reduz no aparelho** (lado maior
  1600 px, JPEG ~80%) antes de enviar — economiza o 4G do conselheiro. O servidor, com sharp,
  gera a miniatura (400 px) e **apaga os metadados EXIF**, que podem conter a localização GPS
  de onde a foto foi tirada.
- **Autorização de imagem.** Ao enviar, o conselheiro marca quem aparece na foto (opcional);
  se marcar um DBV sem autorização, o app avisa e não publica. Sem marcação, a foto fica visível
  só para a liderança, nunca no público.
- **Fotos não têm URL pública.** São servidas por um endpoint autenticado que confere o clube e
  a permissão; o link expira (URL assinada de 10 min).
- **Materiais de apoio**: PDF, PPT, vídeo curto (limite 50 MB) ou link. Mesma interface de
  armazenamento.
- **Onde fica:** pasta no volume Docker do servidor, organizada por `clube/tipo/ano/uuid`. A
  interface `Armazenamento` tem duas implementações (disco e R2); troca por variável de ambiente.
- **Volume estimado:** ~2.000 fotos/ano × ~350 KB ≈ **0,7 GB/ano**. Cabe no disco do VPS por
  anos.

## 7. Hospedagem e custos

| Item | Onde | Custo mensal estimado |
|---|---|---|
| API + front + banco | Mesmo VPS do Finance (containers novos) | **R$ 0** a mais, se o VPS tiver folga (~300 MB de RAM para API + Postgres) |
| Domínio | Subdomínio do que já existe (ex.: `app.seuclube...`) | R$ 0 |
| HTTPS | nginx + Let's Encrypt, igual ao Finance | R$ 0 |
| E-mail | Brevo (300/dia) ou Resend (3.000/mês), plano gratuito | R$ 0 |
| Backup externo | Cloudflare R2 (10 GB gratuitos) ou Backblaze B2 | R$ 0 até 10 GB; depois centavos por GB |
| **Total** | | **R$ 0 a R$ 5/mês** a mais sobre o que você já paga |

Se o VPS não tiver folga, o plano B é um VPS pequeno só para este app (~R$ 25–40/mês).

**Backup (obrigatório antes de ir para produção).** `pg_dump` diário + cópia das fotos, enviados
para o R2, com retenção de 30 dias. Um teste de restauração por trimestre, anotado no README.

**Observabilidade mínima.** Logs dos containers com rotação, um health check (`/saude`)
monitorado por um serviço gratuito (UptimeRobot), e alerta por e-mail se cair no domingo de
manhã.

## 8. Qualidade

- Testes de unidade para as fórmulas do `shared` (pontos, %, frequência, bloqueio de data).
- Testes de integração da API contra Postgres real em container, cobrindo isolamento por clube e
  as permissões por papel e escopo.
- Um teste ponta a ponta (Playwright) do fluxo de domingo: chamada offline → volta a internet →
  pontos no ranking.
- CI no GitHub Actions: lint, tipos, testes. Deploy manual pelo script, como no Finance.
