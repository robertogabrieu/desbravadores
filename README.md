# Aplicativo do Desbravador

Monorepo do aplicativo de gestão de clubes de Desbravadores.

| Pasta | O que é |
|---|---|
| `apps/api` | API (NestJS + Prisma + PostgreSQL) |
| `apps/web` | Front (React + Vite, PWA) |
| `packages/shared` | Código compartilhado entre API e front |

Visão, arquitetura e decisões: `docs/planejamento`. Fase 0 (fundação): `docs/fases/fase-0`. Convenções para agentes: `CLAUDE.md`.

## Pré-requisitos

- Node 22 (`.nvmrc`)
- Docker com Compose
- `age` e `rclone`, só para backup

## Subir o ambiente de dev

```bash
docker compose up -d     # Postgres em localhost:5442; Mailpit: SMTP em 1026, web em http://localhost:8026
cp .env.exemplo .env
npm ci
npm run dev              # API (porta 3001) e front (http://localhost:5173)
```

Os e-mails enviados pela API em dev (convites, por exemplo) aparecem no Mailpit.

## Testar

```bash
npm run lint         # ESLint, sem tolerar warning
npm run tipos        # TypeScript
npm run teste        # Jest (API) e testes de shared e web
npm run teste:e2e    # Playwright, headless
```

Jest e Playwright leem `.env.teste` (ignorado pelo git; o `.env.exemplo` é o modelo). Cada execução da API cria o próprio banco e o apaga ao final. Se uma execução morrer no meio e deixar bancos órfãos, `npm run teste:limpar -w api` apaga os bancos `teste_*` criados há mais de 2 horas.

## Carga oficial

Carrega classes, requisitos e especialidades:

```bash
npm run carga -w api
npm run carga -w api -- --forcar
```

A carga recusa aplicar se desativaria mais de 10% dos itens existentes de um tipo, ou se mudaria o texto de um requisito que já tem histórico. `--forcar` ignora as duas travas. Nunca roda no deploy automático: em produção é sempre um passo manual (`scripts/carga.sh`).

## Criar um clube

```bash
npm run clube:criar -w api -- --nome "Clube Exemplo" --slug clube-exemplo --adm-nome "Fulano" --adm-email fulano@exemplo.org
```

`--slug` aceita só minúsculas, números e hífens. Se o e-mail do administrador ainda não tem conta, o convite é enviado por e-mail e o link também sai no terminal; se já tem, ele só recebe o aviso de que foi acrescentado ao clube.

## Produção

Stack em `docker-compose.prod.yml`, operada pelos scripts em `scripts/`:

| Comando | O que faz |
|---|---|
| `scripts/deploy.sh [APP_URL]` | Primeira subida: cria o `.env` com segredos novos (se ainda não existir), sobe a stack e espera a API ficar saudável. A API migra o banco ao iniciar. Depois, preencha `SMTP_*`, `BACKUP_AGE_DESTINATARIO` e `RCLONE_REMOTO` no `.env` |
| `scripts/atualizar.sh` | Recusa árvore com alterações não commitadas, faz `git pull --ff-only`, reconstrói e sobe. Não roda a carga |
| `scripts/carga.sh [--forcar]` | Carga oficial dentro do container da API |
| `docker compose -f docker-compose.prod.yml --env-file .env exec api node dist/scripts/clube-criar.js --nome ... --slug ... --adm-nome ... --adm-email ...` | Cria um clube em produção |

## Backup e restauração

- `scripts/backup.sh`: `pg_dump` cifrado com `age` (para `BACKUP_AGE_DESTINATARIO`) e enviado com `rclone` para `RCLONE_REMOTO`. O dump nunca fica em claro no disco. Apaga do destino o que tem mais de 30 dias.
- `scripts/restaurar.sh --arquivo <x.age> --chave <chave-privada> --banco <novo>`: restaura num banco novo, nunca por cima do `desbravador`. Depois, aponte o `DATABASE_URL` da API para ele.
- `scripts/testar-backup.sh`: teste de ponta a ponta numa stack descartável (dados, backup, restauração e uma segunda API lendo o banco restaurado). Precisa de `docker`, `age`, `age-keygen` e `rclone`.
