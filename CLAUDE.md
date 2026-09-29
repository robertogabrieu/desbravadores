# Aplicativo do Desbravador — instruções para agentes

Só o que morde em silêncio: o que nenhum lint pega e nenhum erro denuncia antes da produção.
Planejamento em `docs/planejamento/`; decisões de cada fase em `docs/fases/<fase>/SPEC.md`.

- **Zero `any`.** Tipo específico, `unknown` com type guard, ou generic.
- **Contratos só em `packages/shared`.** Nunca redeclare na API ou no front um formato que já
  existe lá.
- **Toda operação de modelo de clube leva `clubeId`.** A guarda de clube lança, não preenche.
  `include` aninhado **não** passa pela guarda: o isolamento dele depende dos testes.
- **Toda rota declara `@Publica`, `@Autenticado`, `@Logado` ou `@Pode`.** Recurso fora do escopo
  ou de outro clube responde 404, nunca 403.
- **`PrismaSistema` (client sem a guarda) só em `sessao/`, `auth/` e `scripts/`.**
- **Classes, requisitos e especialidades oficiais não têm `clubeId`.** O que o clube escolhe
  sobre eles vai em `ClasseClube` e `RequisitoAjuste`.
- **Ids vêm do Prisma Client** (UUID v7): nada de INSERT em SQL cru.
- **Nunca apague linha com histórico**: desative.
- **Usuário é global**: o Adm de um clube não edita e-mail nem senha de ninguém.
- **Testes de integração criam banco próprio** por execução; nunca `TRUNCATE`. Playwright
  sempre headless.
- **Do design não se copia CSS inline**: copia-se estrutura e texto; o estilo sai dos tokens.
- **A carga oficial não roda no deploy automático**: é comando próprio (`scripts/carga.sh`).
- **`LancamentoPontos` só por `ServicoPontos.sincronizar`.** Nenhum outro lugar escreve pontos.
- **Modelo novo de clube entra em `MODELOS_DE_CLUBE` na mesma migration** que o cria.
- **Imagem só por URL assinada**; caminho de arquivo sempre montado pelo servidor, nunca vindo do
  cliente.
- **Conflito de chamada é por `versao`**, nunca pelo relógio do aparelho.
- **Tela de celular trata quatro estados**: carregando, vazio, erro e sem conexão.
- **Modo de conexão só por `useConexao`**, nunca `navigator.onLine` sozinho.
