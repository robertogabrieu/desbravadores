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

Arquivos enviados (fotos) ficam em disco, na pasta de `ARQUIVOS_DIR` (`./.arquivos` no `.env.exemplo`). `ARQUIVOS_SEGREDO` assina os links de imagem; gere com `openssl rand -hex 32`. Os dois entram no `.env`.

## Uso sem conexão

O app do conselheiro e do instrutor abre sem internet. Na abertura ele tenta renovar a sessão, espera 5 s e tenta de novo; se a rede continua fora e a pessoa entrou há menos de 7 dias (último contato com a API), abre em modo sem conexão com a faixa "Sem conexão" no topo, usando o último pacote guardado no aparelho. Sem identidade guardada válida (nunca entrou ou passou de 7 dias), vai para `/conectar`, que pede internet e tem "Tentar de novo". Em modo sem conexão o app tenta renovar a sessão a cada 30 s (aba visível) e quando o navegador avisa que a rede voltou.

- **Pacote:** `GET /api/sync/pacote` (exige login). Traz clube, critérios da chamada, e, para o conselheiro, as unidades com membros, reuniões dos últimos 30 dias e álbuns dos últimos 60; ADM e instrutor recebem as listas de unidades vazias. Só é regravado no aparelho quando a `versao` muda. Baixa na abertura se o guardado tem mais de 15 min, e sempre ao voltar a conexão.
- **Fila de envio (`/fila`, "Aguardando envio"):** o que foi registrado sem conexão fica guardado no aparelho e sobe sozinho, em ordem, quando há internet. Falha de rede ou servidor tenta de novo após 5 s, 15 s, 60 s e 5 min; item em erro mostra a mensagem e oferece "Tentar de novo" e "Descartar" (o descarte avisa quais envios dependem dele e passam a dar erro). "Tentar enviar agora" força uma passada mesmo em modo sem conexão. O selo "N aguardando envio" (pendentes mais erros) leva à fila. Só envia com o app aberto.
- **Avisos na fila:** "Entre de novo para enviar" (sessão expirada), "Pouco espaço" (mais de 100 MB de arquivos esperando), envios antigos de outra pessoa descartados (mais de 30 dias) e "Instale o app na tela inicial" (só no iPhone fora da tela inicial). Itens já enviados somem do aparelho após 24 h.
- **Sair com itens na fila:** "Sair" e "Sair de todos os aparelhos" pedem confirmação ("Sair mesmo assim?"). Sair apaga pacote, identidade e rascunhos do aparelho, mas a fila fica e só sobe quando a pessoa entrar de novo.
- **Sessão expirada durante o uso:** a faixa "Sua sessão expirou — salve e entre de novo" (com "Entrar de novo") aparece sem tirar a pessoa da tela; o que já foi guardado na fila continua lá.

## Testar

```bash
npm run lint         # ESLint, sem tolerar warning
npm run tipos        # TypeScript
npm run teste        # Jest (API) e testes de shared e web
npm run teste:e2e    # Playwright, headless
```

O e2e usa uma pasta temporária como `ARQUIVOS_DIR`, apagada ao final. `e2e/offline.spec.ts` entra, deixa o service worker assumir a página, corta a rede, recarrega e espera a faixa "Sem conexão".

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
| `scripts/deploy.sh [APP_URL]` | Primeira subida: cria o `.env` com segredos novos (`ARQUIVOS_SEGREDO` incluído; se o `.env` já existe, só acrescenta o `ARQUIVOS_SEGREDO` que faltar), sobe a stack e espera a API ficar saudável. A API migra o banco ao iniciar. Depois, preencha `SMTP_*`, `BACKUP_AGE_DESTINATARIO` e `RCLONE_REMOTO` no `.env` |
| `scripts/atualizar.sh` | Recusa árvore com alterações não commitadas, faz `git pull --ff-only`, acrescenta `ARQUIVOS_SEGREDO` ao `.env` se faltar (nunca troca um existente; precisa de `openssl`), reconstrói e sobe. Não roda a carga |
| `scripts/carga.sh [--forcar]` | Carga oficial dentro do container da API |
| `docker compose -f docker-compose.prod.yml --env-file .env exec api node dist/scripts/clube-criar.js --nome ... --slug ... --adm-nome ... --adm-email ...` | Cria um clube em produção |

Os arquivos enviados moram no volume Docker `arquivos`, montado em `/app/arquivos` na API (`ARQUIVOS_DIR`). A URL de imagem é assinada e vale 10 minutos (`GET /api/arquivos/:id`); link vencido ou adulterado responde "Link inválido ou vencido". O limite de memória da API subiu de 256 MB para 384 MB.

## Backup e restauração

- `scripts/backup.sh`: `pg_dump` cifrado com `age` (para `BACKUP_AGE_DESTINATARIO`) e enviado com `rclone` para `RCLONE_REMOTO`. O dump nunca fica em claro no disco. Depois do dump, os arquivos do volume `arquivos` saem em `desbravadores-*.arquivos.tar.age` (também cifrado, lido por um container descartável: não depende da API estar de pé). Se só o backup dos arquivos falhar, o dump já enviado permanece e o script termina com erro. Apaga do destino o que tem mais de 30 dias.
- `scripts/restaurar.sh --arquivo <x.age> --chave <chave-privada> --banco <novo> [--arquivos <x.arquivos.tar.age>]`: restaura num banco novo, nunca por cima do `desbravador`. Com `--arquivos`, devolve também as fotos a `/app/arquivos` da API (só acrescenta, não apaga nada). Depois, aponte o `DATABASE_URL` da API para ele.
- `scripts/testar-backup.sh`: teste de ponta a ponta numa stack descartável (dados, backup do banco e dos arquivos, restauração e uma segunda API lendo o banco restaurado). Precisa de `docker`, `age`, `age-keygen` e `rclone`.
