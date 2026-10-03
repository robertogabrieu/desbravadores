# Papéis do usuário, um por vez — Plano

> **Para quem executa:** skill `orquestrador` (o principal decide, delega e versiona; o código é dos
> subagentes `implementador`). Passos com caixa (`- [ ]`) para acompanhar.

**Goal:** tirar a edição de papéis da tela "Editar usuário" e levá-la para a ficha: um cartão por
papel com **Alterar** e **Remover papel**, **Acrescentar papel** em dois passos, confirmação de
remover que diz o que a pessoa perde e com que papel segue, convite numa tela só com um papel, e a
trava do último Adm valendo também com dois Adm removendo um ao outro ao mesmo tempo.

**Architecture:** quase tudo é web, em `apps/web/src/modulos/adm/usuarios/`. A API só muda a trava
do último Adm (`pg_advisory_xact_lock` dentro da `$transaction`, em `desativar` e em
`editarVinculo` com `ativo: false`); nenhuma rota, contrato, migration ou mudança em
`packages/shared`. As peças de escolha (cartões de papel, chips de escopo) nascem uma vez e servem a
Acrescentar, Alterar e Convidar. `vinculos.ts` vira o lugar das regras puras (rascunho limpo,
contagem e frase dos ajustes, papel no gênero); a sessão ganha `relerSessao`, e as gravações de
papel passam a refazer unidades, desbravadores e a sessão de quem está logado.

**Tech Stack:** NestJS 11 + Prisma 7 (API, Jest sem checagem de tipos), React 19 + React Router 7 +
TanStack Query 5 (web, Vitest + MSW 2), Zod 4 em `packages/shared`, Postgres 17, Playwright
(e2e, headless).

**Spec:** [SPEC.md](SPEC.md), com o modelo em [modelo/](modelo/) — **o modelo vence a SPEC**
(estrutura, ordem e texto; nunca CSS), salvo as "Exceções ao modelo" da SPEC. `modelo/Hoje.dc.html`
é a tela atual, só para comparar. **Branch:** `feature/papeis-um-por-vez` · **Worktree:**
`/home/robertogabrieu/desbravadores/.claude/worktrees/papeis` · **PR:** #28 (rascunho) ·
**Base:** `main` em `c097f6b` (a branch está em `c380b7b`, um commit só de `docs/`; `origin/main`
não andou — conferido com `git fetch` e `git rev-list --count HEAD..origin/main` = 0 —, então
**nada de merge da main** no P0).

## Global Constraints

- **CLAUDE.md inteiro**, em especial: zero `any`; contratos só em `packages/shared` (nada novo
  aqui); toda operação de modelo de clube leva `clubeId`, fora do clube 404; nunca apagar linha com
  histórico (remover papel é `ativo: false`); usuário é global (o Adm não edita e-mail); tela trata
  carregando, vazio, erro e sem conexão; conexão só por `useConexao`.
- **Do modelo copia-se estrutura, ordem e texto, nunca CSS.** Classes saem dos tokens e de `ui/`.
  Contorno de cartão, chip e interruptor com `border-borda-controle` (3:1), nunca `border-borda`.
- **Nenhum elemento `fixed`/`sticky` novo** — o usuário prefere telas sem barra presa. O único
  `fixed` da fase é o fundo da `Confirmacao`, que já existe.
- **"classe", nunca "aula"**, em todo texto visível novo.
- **Voltar sempre com destino explícito**, nunca `navegar(-1)`, repassando `{ voltarPara,
  voltarRotulo }` que a ficha recebeu, para ela seguir devolvendo a lista com filtro e página
  (padrão de `EditarUsuario.tsx:120`).
- **Testes antes da implementação, dentro de cada pacote:** todos escritos primeiro e vistos
  falhando; depois implementar; depois verde. Nada de intercalar teste por passo.
- **Validação pesada só no P4** (suítes inteiras, lint, build, medição, QA). Por pacote: só os
  testes do pacote e `tipos` do workspace.
- **Baseline por nomes já existe**, da `main` verde: API e web sem falhas. **e2e:** o plano anterior
  registrou 1 falha pré-existente (`e2e/fundacao.spec.ts`, "a instalação PWA existe: manifesto e
  service worker registrados"), mas o próprio commit do e2e daquela fase diz "escritos sem execução
  local": o e2e **não roda nesta máquina** (CLAUDE.md; `pesado` anuncia "e2e nunca: só no CI") e o
  CI não roda e2e. **Não recolher baseline.**
- **Máquina fraca** — tudo pelo `pesado`, uma suíte pesada por vez:
  `export PATH=$HOME/.nvm/versions/node/v22.23.3/bin:$PATH`; testes de dentro do pacote,
  `cd apps/web|apps/api && pesado testar --script teste -- <caminhos>` (já usa 1 worker; **não**
  passar `--maxWorkers`); tipos `pesado -- npm run tipos -w web|api` ou da raiz
  (`pesado -- npm run tipos`); lint `NODE_OPTIONS=--max-old-space-size=3072 pesado --teto 4G -- npm run lint`;
  a espera da fila conta no tempo do Bash (`timeout: 600000` ou segundo plano).
- **`packages/shared` não muda nesta fase.** Se mudar por engano, `pesado -- npm run build -w packages/shared`
  antes de testar a API (a API lê o `dist/`; o web lê o `src/`, `apps/web/vite.config.ts:70`).
- **Banco de teste da API é próprio por execução** (`apps/api/test/global-setup.ts:13` →
  `test/banco.ts:24-45`): não há migration nesta fase.
- **Nenhum subagente roda git.** Commit por pacote, pelo principal (skill `commit`), com o título
  sugerido no fim de cada pacote.

---

## Níveis e ondas

| Onda | Pacote | Nível | Depende de |
|---|---|---|---|
| 0 | **P0** trava do último Adm (API) + peças compartilhadas do web: `Chip` cheio, `Interruptor`, rodapé, `vinculos.ts`, cache, `relerSessao` | agente principal (inline) | — |
| 1 | **P1** ficha com cartões, Remover papel, Desativar no rodapé, sessão sem papel | subagente `implementador` | P0 |
| 1 | **P2** Acrescentar papel em dois passos + escolha do papel e do escopo | subagente `implementador` | P0 |
| 2 | **P3** Alterar papel + Convidar numa tela + Editar só nome e gênero | subagente `implementador` | P0, P1 (avisos na ficha), P2 (escolhas) |
| 3 | **P4** fase final: e2e, suítes, lint, build, revisão, QA com medição, docs, PR | `implementador` (e2e) → `testador` → revisão (opus) → `qa-runner` → `documentador` → `gestor-pr` | todos |

**Paralelo, no máximo dois implementadores de cada vez**, e só pacotes de arquivos disjuntos:

| Onda | Par | Por que não se tocam (conferido nas listas de cada pacote) |
|---|---|---|
| 1 | P1 ‖ P2 | P1 só em `usuarios/{FichaUsuario,CartaoDoPapel,RemoverPapel,remover,remover.test,ficha.test}` e `modulos/acesso/{EscolherPapel,Login,acesso.test}`; P2 só em `usuarios/{EscolhaDoPapel,EscolhaDoEscopo,escopo,escopo.test,AcrescentarPapel,acrescentar.test,rotas}`. Nenhum arquivo em comum; os dois só **leem** o que o P0 escreveu. |

**Onda 2 sozinha:** P3 edita `rotas.tsx` (do P2) e `ficha.test.tsx` (do P1) e consome as escolhas do
P2 e os avisos da ficha do P1 — não pode ir junto de nenhum dos dois.

**Compilação entre as ondas:** nenhuma quebra esperada. O P0 só **acrescenta** a `vinculos.ts`
(as funções que `EditarUsuario.tsx` e `FichaUsuario.tsx` usam hoje ficam até o P3 limpar) e a
assinatura de `ComUsuario` e `SITUACAO` (`FichaUsuario.tsx:22,41-54`) não muda no P1. **Fim de
cada onda: `pesado -- npm run tipos` da raiz verde**, conferido pelo principal.

## Conta do fatiamento

| Pacote | Arquivos alterados | Quem |
|---|---:|---|
| P0 | 13 (API 2; `ui/` 5; `usuarios/vinculos*` 2; `api/usuarios*` 2; sessão 2) | principal — dono compartilhado |
| P1 | 9 | implementador |
| P2 | 7 | implementador |
| P3 | 9 (1 apagado) | implementador |
| P4 | 4 (e2e) + roteiro de QA | implementador + testador + qa-runner + documentador |
| **Total** | **~42** | 4 subagentes de pacote |

Por que assim (skill `spec-e-plano` §3): o custo por arquivo desenha um U — **591k com 1–2
arquivos, 256k com 6–10, 559k com 21+**. Os pacotes delegados ficam entre 7 e 9.

- **Fluxo vertical, por tela, não por camada.** Cada pacote entrega uma ação inteira do Adm (ver e
  remover; acrescentar; alterar e convidar), com teste e tela juntos.
- **A API fica no P0, inline:** são 2 arquivos (`usuarios.service.ts` e o spec) — abaixo de 6, um
  subagente pagaria o piso de contexto para uma troca de dez linhas.
- **P0 passa de 6, mas é todo de dono compartilhado:** `Chip`, `Interruptor` e o rodapé são usados
  por P2 e P3; `vinculos.ts` por P1, P2 e P3; o cache e `relerSessao` por todas as gravações.
  Escritos antes de delegar, dois pacotes nunca editam o mesmo arquivo na mesma onda.
- **Alterar (3 arquivos) e Convidar/Editar (4) sozinhos ficariam abaixo de 6**; juntos dão 9 e
  dependem das mesmas peças do P2 — por isso um pacote só, na onda 2.
- **Rotas do módulo não ficam no P0:** `rotas.tsx` é do módulo, não da raiz; o P2 acrescenta
  `papeis/novo` e o P3, em outra onda, `papeis/:vinculoId` logo depois. Isso evita criar telas de
  mentira no P0 só para a rota compilar.
- **P4 tem 4 arquivos e é delegado:** a saída do e2e e do QA não pode entrar no contexto do
  principal (§3, eixo do contexto).

Orçamento por implementador: **~80 turnos**.

---

## P0 — trava do último Adm e peças compartilhadas · agente principal (inline), onda 0

**Por que inline:** a API tem 2 arquivos; o resto é consumido por dois ou três pacotes.

**Files:**
- Modify: `apps/api/src/usuarios/usuarios.service.ts:163-174,189-208,280-286` (contagem dentro da transação, depois da trava)
- Modify: `apps/api/src/usuarios/usuarios.spec.ts` (concorrência e volta de papel removido, no `describe` de `:278` e de `:322`)
- Modify: `apps/web/src/ui/Chip.tsx:11-24` (variante `cheia`; contorno `border-borda-controle`)
- Create: `apps/web/src/ui/Interruptor.tsx` (`role="switch"`, alvo de 44 px)
- Modify: `apps/web/src/ui/RodapeDoFormulario.tsx` (`rotuloCancelar`, padrão "Cancelar")
- Modify: `apps/web/src/ui/componentes-novos.test.tsx:100-121` (Chip cheio; Interruptor; rodapé)
- Modify: `apps/web/src/ui/contraste.test.tsx:101` (sai `'ui/Chip.tsx': 1`)
- Modify: `apps/web/src/modulos/adm/usuarios/vinculos.ts` (só acrescenta; mensagem de `:90-93`)
- Create: `apps/web/src/modulos/adm/usuarios/vinculos.test.ts`
- Modify: `apps/web/src/api/usuarios.ts:43-81` (gravação de papel: cache e sessão)
- Create: `apps/web/src/api/usuarios.test.tsx` (cache e releitura da sessão)
- Modify: `apps/web/src/sessao/useSessao.ts:9-24` (`relerSessao` no contexto)
- Modify: `apps/web/src/sessao/ProvedorSessao.tsx:79-82,294-310` (`lerEu` devolve o `Eu`; expõe `relerSessao`)

**Interfaces (produz):**

```ts
// ui/Chip.tsx — "suave" é a de hoje (presença, filtros); "cheia" é a do modelo (escopo)
variante?: 'suave' | 'cheia'
// ui/Interruptor.tsx
export function Interruptor(p: { ligado: boolean; aoAlternar: (ligado: boolean) => void; idRotulo: string; idDescricao?: string; disabled?: boolean }): JSX.Element
// ui/RodapeDoFormulario.tsx
rotuloCancelar?: string            // "Voltar" no passo 2 de Acrescentar
// sessao/useSessao.ts
relerSessao: () => Promise<Eu>     // lê /api/eu (é @Autenticado: responde mesmo sem papel ativo) e aplica
// modulos/adm/usuarios/vinculos.ts
export const primeiroNome: (nome: string) => string
export const papelNoGenero: (papel: Papel, genero: 'F' | 'M' | null) => string          // "Conselheira" | "Instrutor" | "Adm"
export const papelDaUrl: (valor: string | null) => Papel | null                          // 'adm' | 'conselheiro' | 'instrutor'
export const urlDoPapel: (papel: Papel) => 'adm' | 'conselheiro' | 'instrutor'
export function rascunhoLimpo(vinculo: VinculoUsuario, catalogo: CatalogoPermissao[]): RascunhoVinculo
export const contarAjustes: (vinculo: VinculoUsuario, catalogo: CatalogoPermissao[]) => number
export function frasesDosAjustes(vinculo: VinculoUsuario, catalogo: CatalogoPermissao[]): string[]
export const textoDoSelo: (n: number) => string            // "sem ajustes" | "+ 1 ajuste" | "+ 2 ajustes"
export const textoDasAlteracoes: (n: number) => string     // "" | "1 alteração" | "2 alterações"
export const ESCOPO_VAZIO: { CONSELHEIRO: 'Escolha pelo menos uma unidade.'; INSTRUTOR: 'Escolha pelo menos uma classe.' }
```

- [ ] **Passo 1: testes primeiro.**

| arquivo › caso | asserção-chave |
|---|---|
| usuarios.spec › duas remoções simultâneas dos dois últimos Adm, por `editarVinculo` | uma resolve, a outra rejeita `ErroApp` `ULTIMO_ADM`; no banco, exatamente 1 vínculo ADM ativo no clube |
| › o mesmo por `desativar` (A desativa B e B desativa A) | idem |
| › remover Adm com outro Adm ativo continua passando; remover não-Adm não trava | 200 nos dois (regressão de `:296-318`) |
| › papel removido volta por `POST /usuarios/:id/vinculos` | mesmo `id` de vínculo, `ativo: true`, classes = as do pedido, `ajustes: []` (o antigo tinha um) |
| componentes-novos › Chip cheio | `aria-pressed`, classe `bg-marca` só quando selecionado, um ícone `aria-hidden` à esquerda só quando selecionado |
| › Chip (os dois) | sem `border-borda` de contorno; `min-h-[var(--touch-min)]` (o caso de `:116` continua) |
| › Interruptor | `role="switch"`, `aria-checked` alterna, nome vem de `idRotulo`, descrição de `idDescricao`, alvo `h-[var(--touch-min)]`; clique chama `aoAlternar(!ligado)`; Espaço também |
| › RodapeDoFormulario com `rotuloCancelar="Voltar"` | link "Voltar" no lugar de "Cancelar"; Salvar antes no DOM |
| contraste.test › contorno de caixa | a lista de pendências sem `'ui/Chip.tsx'` passa (fica vermelho até o Chip mudar) |
| vinculos.test › `rascunhoLimpo` | descarta ajuste igual ao padrão, ajuste de chave que não vale para o papel e chave repetida (vale a **última**, como a API em `usuarios.service.ts:364`) |
| › `contarAjustes` / `textoDoSelo` / `textoDasAlteracoes` | 0 → `"sem ajustes"` e `""`; 1 → `"+ 1 ajuste"`, `"1 alteração"`; 2 → plural |
| › `frasesDosAjustes` | `"Ajuste: também pode Editar dados dos DBVs da unidade"`; `"Ajuste: não pode Ver desbravadores"`; uma frase por ajuste, na ordem do catálogo |
| › `papelNoGenero`, `primeiroNome`, `papelDaUrl` | F → "Conselheira"/"Instrutora"; sem gênero → masculino; `"Carla Mendes"` → `"Carla"`; `'ADM'`/`'x'`/`null` → `null` só para os inválidos |
| › `mensagemDeErro` de ULTIMO_ADM | `'O clube precisa de pelo menos um Adm ativo. Torne outra pessoa Adm antes de remover este papel.'` |
| api/usuarios.test › gravar papel | invalida `['usuarios']`, `['unidades']` e `['desbravadores']` (espiar `invalidateQueries`) |
| › gravar papel do usuário logado | chama `/api/eu` uma vez a mais (handler contando) |
| › remover o papel da sessão do usuário logado | **não** chama `/api/eu` nem refaz a ficha (`refetchType: 'none'`); a tela é que decide |

```bash
cd apps/api && pesado testar --script teste -- src/usuarios/usuarios.spec.ts
cd apps/web && pesado testar --script teste -- src/ui/componentes-novos.test.tsx src/ui/contraste.test.tsx src/modulos/adm/usuarios/vinculos.test.ts src/api/usuarios.test.tsx
```

O teste de concorrência chama o **serviço** (`app.get(UsuariosService)`, como
`arquivos.spec.ts:103`) com duas `SessaoLogada` montadas à mão, não o HTTP: pelo HTTP, a requisição
que chega depois da primeira gravação pode cair na guarda de sessão com `VINCULO_INATIVO` (403), e o
teste ficaria a depender de quem chega antes. Pelo serviço, as duas contagens de hoje rodam antes
de qualquer escrita e o vermelho aparece. **Se o vermelho não aparecer** (janela de corrida curta),
registrar no relatório do pacote — não inventar espera artificial.

```ts
const sessaoDe = (a: Acesso): SessaoLogada => ({ usuarioId: a.usuario.id, vinculoId: a.vinculo.id, clubeId, papel: 'ADM' })
const resultados = await Promise.allSettled([
  servico.editarVinculo(sessaoDe(a), b.vinculo.id, { ativo: false }),
  servico.editarVinculo(sessaoDe(b), a.vinculo.id, { ativo: false }),
])
expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
const recusa = resultados.find((r) => r.status === 'rejected')
expect(recusa?.status === 'rejected' && recusa.reason).toMatchObject({ codigo: 'ULTIMO_ADM' }) // conferir o campo do ErroApp em comum/erros.ts
expect(await prismaDeTeste().vinculo.count({ where: { clubeId, papel: 'ADM', ativo: true } })).toBe(1)
```

- [ ] **Passo 2: a trava (API).** A contagem passa a receber o `tx` e roda depois da trava, na
  mesma transação que grava; a segunda transação espera a primeira terminar e conta de novo
  (Read Committed vê o que a primeira gravou). Padrão do projeto: `materiais.service.ts:181`.

```ts
/** Serializa quem tira Adm do clube: quem chega depois conta os Adm já sem o do primeiro. */
private async travarAdmsDoClube(tx: Cliente, clubeId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`adm-do-clube:${clubeId}`}, 0))`
}

private async exigirOutroAdm(tx: Cliente, clubeId: string, idsSaindo: string[], saiUmAdm: boolean): Promise<void> {
  if (!saiUmAdm) return
  const restantes = await tx.vinculo.count({ where: { clubeId, papel: 'ADM', ativo: true, id: { notIn: idsSaindo } } })
  if (restantes === 0) throw new ErroApp('ULTIMO_ADM', 'O clube precisa de pelo menos um administrador ativo.')
}

// desativar: os ativos são relidos dentro da transação, depois da trava
await this.prisma.$transaction(async (tx) => {
  await this.travarAdmsDoClube(tx, clubeId)
  const ativos = await tx.vinculo.findMany({ where: { clubeId, usuarioId: id, ativo: true }, select: { id: true, papel: true } })
  await this.exigirOutroAdm(tx, clubeId, ativos.map((v) => v.id), ativos.some((v) => v.papel === 'ADM'))
  await tx.vinculo.updateMany({ where: { clubeId, usuarioId: id, ativo: true }, data: { ativo: false } })
  await this.tipo.sincronizarConta(tx, clubeId, id, hoje)
})

// editarVinculo: sai o bloco de :197-199; no começo da transação de :202
if (entrada.ativo === false && vinculo.ativo && vinculo.papel === 'ADM') {
  await this.travarAdmsDoClube(tx, clubeId)
  await this.exigirOutroAdm(tx, clubeId, [vinculo.id], true)
}
```
`carregar` em `desativar` (`:165`) fica: é ele que dá o 404 de quem não é do clube.

- [ ] **Passo 3: `ui/`.** `Chip`: a variante `cheia` selecionada é `border-marca bg-marca
  text-sobre-marca` com `Check` do `lucide-react` (`aria-hidden`, `size-4`) à esquerda; não
  selecionada, nas duas variantes, `border-borda-controle bg-superficie text-texto`. A `suave`
  selecionada fica como hoje (`:19`). Tirar `'ui/Chip.tsx': 1` de `contraste.test.tsx:101`.
  `RodapeDoFormulario` ganha `rotuloCancelar = 'Cancelar'`. O `Interruptor`:

```tsx
/** Liga/desliga acessível: o nome vem do rótulo visível (idRotulo); "padrão"/"alterado" é a descrição. */
export function Interruptor({ ligado, aoAlternar, idRotulo, idDescricao, disabled }: Propriedades) {
  return (
    <button
      type="button" role="switch" aria-checked={ligado} aria-labelledby={idRotulo} aria-describedby={idDescricao} disabled={disabled}
      onClick={() => aoAlternar(!ligado)}
      className="relative inline-flex h-[var(--touch-min)] w-14 shrink-0 items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca disabled:opacity-50"
    >
      <span aria-hidden className={cn('h-7 w-[3.25rem] rounded-full border border-borda-controle transition-colors', ligado ? 'bg-marca' : 'bg-borda-controle')} />
      <span aria-hidden className={cn('absolute top-1/2 size-5 -translate-y-1/2 rounded-full bg-superficie transition-[left]', ligado ? 'left-[1.875rem]' : 'left-1.5')} />
    </button>
  )
}
```
Botão nativo: Espaço e Enter já alternam. Desligado usa a cor do contorno de controle (3,76:1 no
branco), como o trilho desligado do modelo.

- [ ] **Passo 4: `vinculos.ts`.** Só acrescenta (o que `EditarUsuario` e `FichaUsuario` usam hoje
  fica até o P3). `papelNoGenero` sai dos mapas de `FichaUsuario.tsx:26-30` (o P1 passa a importar
  daqui). A mensagem de ULTIMO_ADM troca "mudar esta" por "remover este papel". O rascunho limpo,
  que é o que faz "alterado", "N alterações" e o selo da ficha contarem a mesma coisa:

```ts
/** O rascunho do papel sem ajuste que não muda nada: igual ao padrão, de chave que não vale para o
 *  papel, ou repetido (a API grava o último de cada chave). A API pode ter guardado qualquer um. */
export function rascunhoLimpo(vinculo: VinculoUsuario, catalogo: CatalogoPermissao[]): RascunhoVinculo {
  const padraoDe = new Map(permissoesDoPapel(catalogo, vinculo.papel).map((p) => [p.chave, p.padrao[vinculo.papel] === true]))
  const ultimoPorChave = new Map(vinculo.ajustes.map((a) => [a.permissao, a.concedida]))
  const ajustes = Object.fromEntries([...ultimoPorChave].filter(([chave, concedida]) => padraoDe.has(chave) && padraoDe.get(chave) !== concedida))
  return { papel: vinculo.papel, unidadeIds: vinculo.unidades.map((u) => u.id), classeIds: vinculo.classes.map((c) => c.id), ajustes }
}
```
`frasesDosAjustes` percorre `permissoesDoPapel` (ordem do catálogo) e monta
`Ajuste: também pode <rótulo>` / `Ajuste: não pode <rótulo>` para cada chave do rascunho limpo.

- [ ] **Passo 5: sessão e cache.** `lerEu` passa a devolver o `Eu` que aplicou; o contexto expõe
  `relerSessao: lerEu`. Em `api/usuarios.ts`, as gravações de papel (`useCriarUsuario`,
  `useDesativarUsuario`, `useAcrescentarVinculo`, `useEditarVinculo`) passam a usar:

```ts
/** Gravação que mexe em papel: refaz listas, unidades (mostram os conselheiros) e desbravadores
 *  (o tipo da ficha ligada à conta pode mudar entre Diretoria e DBV); se é o logado, relê a sessão. */
function useEscritaDePapel<V>(escrever: (variaveis: V) => Promise<Usuario>, gravarNaFicha = true) {
  const cliente = useQueryClient()
  const { eu, vinculoAtivo, relerSessao } = useSessao()
  return useMutation({
    mutationFn: escrever,
    onSuccess: async (usuario) => {
      const ehVoce = usuario.id === eu?.usuario.id
      if (ehVoce && usuario.vinculos.some((v) => v.id === vinculoAtivo?.id && !v.ativo)) {
        // A tela leva a /papel ou ao login; reler a ficha agora daria 403 e uma segunda navegação (cliente.ts:138-142).
        await cliente.invalidateQueries({ queryKey: chavesUsuarios.todas, refetchType: 'none' })
        return
      }
      if (gravarNaFicha) naFicha(cliente, usuario)
      if (ehVoce) await relerSessao()
      await Promise.all([chavesUsuarios.todas, ['unidades'], chavesDesbravadores.todos].map((queryKey) => cliente.invalidateQueries({ queryKey })))
    },
  })
}
```
`useCriarUsuario` passa `gravarNaFicha = false` (a resposta é eco, `:57`). `useEditarUsuario` e
`useReenviarConvite` seguem no `useEscrita` de hoje. `api/` já importa a sessão
(`api/auth.ts`, `api/aulas.ts`).

- [ ] **Passo 6:** testes do P0 verdes; `pesado -- npm run tipos` da raiz sem erro.
- [ ] **Passo 7: dois commits:**
  `fix(usuarios): último Adm contado dentro da transação, com trava do clube` (API) e
  `feat(usuarios): chip cheio, interruptor, regras dos ajustes e releitura da sessão` (web).

---

## P1 — ficha com cartões, Remover papel e sessão sem papel · subagente, onda 1

**Files:**
- Modify: `apps/web/src/modulos/adm/usuarios/FichaUsuario.tsx:66-98,100-199` (cabeçalho, cartões, vazio, avisos, rodapé, desativar)
- Create: `apps/web/src/modulos/adm/usuarios/CartaoDoPapel.tsx` (um cartão por papel ativo)
- Create: `apps/web/src/modulos/adm/usuarios/RemoverPapel.tsx` (confirmação e o que vem depois)
- Create: `apps/web/src/modulos/adm/usuarios/remover.ts` (textos da confirmação)
- Create: `apps/web/src/modulos/adm/usuarios/remover.test.ts`
- Modify: `apps/web/src/modulos/adm/usuarios/ficha.test.tsx:62-121` (só estes; `:129-217` é do P3)
- Modify: `apps/web/src/modulos/acesso/EscolherPapel.tsx:24-45` (estado vazio)
- Modify: `apps/web/src/modulos/acesso/Login.tsx` (aviso vindo do estado da navegação)
- Modify: `apps/web/src/modulos/acesso/acesso.test.tsx` (`describe` de `:193`)

**Interfaces:** consome do P0 `papelNoGenero`, `primeiroNome`, `contarAjustes`, `textoDoSelo`,
`frasesDosAjustes`, `escopoDoPapel`, `mensagemDeErro`, `relerSessao`, `useEditarVinculo`,
`useDesativarUsuario`. **Produz:** a ficha mostra `avisos` do estado da navegação
(`useAvisosDaFicha`, `navegacao.ts:38-50`) — o P3 conta com isso para "Este papel foi removido por
outra pessoa."; links `papeis/novo` e `papeis/<id>` com o estado de volta da ficha. **Não muda** a
assinatura nem o export de `ComUsuario` e `SITUACAO` (o P2 e o P3 importam). Alvo: `modelo/A1`,
`modelo/A5`.

- [ ] **Passo 1: testes primeiro.**

| arquivo › caso | asserção-chave |
|---|---|
| ficha.test › um cartão por papel ativo (ex-`:62-70`) | região "Conselheira" com "Unidade Águias", "Permissões do papel", selo "sem ajustes"; sem "O que pode fazer" e sem selo "Ativo" |
| › ajuste vira selo e linha (ex-`:71-77`) | "+ 1 ajuste" e "Ajuste: também pode Editar dados dos desbravadores" (catálogo do handler) |
| › ajuste igual ao padrão não conta | vínculo com `dbv.ver: true` → "sem ajustes" |
| › Adm (ex-`:78-84`) | "Todo o clube", "Todas as permissões do clube", **sem** link Alterar, com "Remover papel" |
| › ordem e ações | cartões Adm, Conselheira, Instrutora; "Alterar" é link para `/adm/usuarios/<id>/papeis/<vinculoId>`; "Acrescentar papel" é link para `…/papeis/novo` |
| › convidado / ativo | convidado: "Editar" e "Reenviar convite" no cabeçalho; ativo: nenhum dos dois |
| › Desativar no rodapé (`:85-114` continuam, com o texto de hoje) | botão "Desativar neste clube" depois dos cartões |
| › ULTIMO_ADM ao desativar | o alerta aparece **dentro** do diálogo, que segue aberto |
| › inativo (ex-`:115-121`) | "Nenhum papel neste clube"; "Acrescentar papel" com `href` `…/papeis/novo` (sem `editar?acrescentar=1`); sem Desativar |
| › avisos do estado | `state.avisos = ['Este papel foi removido por outra pessoa.']` aparece como `role="status"` |
| › Remover: confirma e grava | PUT `/api/vinculos/<id>` com corpo `{ ativo: false }`; diálogo fecha; o cartão some |
| › Remover: ULTIMO_ADM | diálogo aberto, `role="alert"` com o texto novo do P0 |
| › Remover o último papel | depois do PUT (resposta `situacao: 'INATIVO'`): "Nenhum papel neste clube" e sobretítulo "Usuário · Inativo" |
| › Remover o próprio papel da sessão, com outro papel | `/api/eu` relido; vai a `/papel` (`replace`) |
| › Remover o próprio papel da sessão, sem papel em clube nenhum | vai a `/login` com "Você não tem mais acesso a nenhum clube."; `/api/auth/logout` chamado |
| › desativar a si mesmo (ex-`:103-114`) | mesmo destino dos dois casos acima |
| remover.test › cada linha das duas tabelas da SPEC ("Textos da confirmação de remover") | título e parágrafos exatos (ver Passo 3) |
| acesso.test › escolha de papel sem papel | "Você não tem mais acesso a nenhum clube." e botão "Ir para o login", que chama o logout e vai a `/login` |
| › login com aviso no estado | o aviso aparece como `role="status"` acima do formulário |

```bash
cd apps/web && pesado testar --script teste -- src/modulos/adm/usuarios/ficha.test.tsx src/modulos/adm/usuarios/remover.test.ts src/modulos/acesso/acesso.test.tsx
```

- [ ] **Passo 2: ficha e cartão** (ordem do `A1`). Cabeçalho: Voltar "Usuários"; sobretítulo
  `Usuário · <SITUACAO>`; h1 nome; `acoes` só para CONVIDADO: Link "Editar" e Botão "Reenviar
  convite" (sai do rodapé, `:166-173`). Cartão "Dados" como hoje (situação "Ativa · <último
  acesso>", exceção ao modelo). Seção com h2 "Papéis no clube" e Link "Acrescentar papel" à direita
  (`flex flex-wrap justify-between`), lista em `grid md:grid-cols-2`; sem ativos, `EstadoVazio`
  "Nenhum papel neste clube" com o mesmo link. `CartaoDoPapel`: ícone (`Shield` Adm, `Flag`
  conselheiro, `GraduationCap` instrutor, `aria-hidden`, fundo `bg-marca-suave`), h3 com
  `papelNoGenero`, escopo, "Permissões do papel" + `Selo` (`tom="alerta"` com ajuste, `neutro`
  sem), uma `<p>` por frase de ajuste, e as ações Link "Alterar" (fora do Adm) e Botão "Remover
  papel" (`variante="secundario"`). Avisos de `useAvisosDaFicha` acima dos cartões. Rodapé: Botão
  "Desativar neste clube" `variante="texto"` em vermelho discreto, só com ativos — a confirmação de
  hoje, mas fechando **só no sucesso** e com `erro` dentro dela (`Confirmacao.tsx:14-15`).
- [ ] **Passo 3: textos (`remover.ts`).** `textosDaRemocao({ usuario, vinculo, ehVoce }) → { titulo, paragrafos: string[] }`.
  Nome = `primeiroNome`; pronome F "ela", M "ele", **sem gênero, o primeiro nome**; papel no
  gênero em minúscula (Adm fica "Adm"); sem gênero, o masculino. Escopo com `juntarNomes`
  (`formatos.ts:57-60`): "a unidade Águias" / "as unidades Águias e Lobos" (pronome "dela"/"delas");
  "a classe Amigo" / "as classes Amigo e Companheiro". Os que restam: os outros ativos, na ordem
  Adm, Conselheiro, Instrutor, como "Adm", "conselheira da unidade Águias", "instrutor das classes
  Amigo e Guia", juntados por `juntarNomes`.

| Parte | Outra pessoa | É você |
|---|---|---|
| Título | `Remover o papel de <Papel no gênero> de <nome>?` | `Remover o seu papel de <Papel no gênero>?` |
| 1º parágrafo | tabela "pelo papel" da SPEC, com "assim que o aparelho se conectar." para conselheiro e instrutor | `Você perde esse acesso na hora.` |
| 2º parágrafo | `O que já chegou ao clube continua guardado.` + (conselheiro/instrutor) ` Se <nome> registrou algo sem internet, peça que abra o app com internet antes.` | `O que já chegou ao clube continua guardado.` + (conselheiro/instrutor) ` Se você registrou algo sem internet, abra o app com internet antes.` |
| Segue | `<Pronome> segue como <restantes>.` | `Você segue como <restantes>.` |
| Último papel | `Era o último papel de <nome> neste clube: <pronome> deixa de entrar no clube. Para voltar, acrescente um papel.` | `Era o seu último papel neste clube: você deixa de entrar no clube.` |

  Conselheiro ou instrutor sem nenhuma unidade/classe: `<nome> deixa de ser <papel> neste clube,
  assim que o aparelho se conectar.`
- [ ] **Passo 4: `RemoverPapel` e o depois.** `Confirmacao` com `perigo`, `rotuloConfirmar="Remover
  papel"`, `erro={mensagemDeErro(...)}`; fecha só no sucesso. Se o vínculo removido é o da sessão
  (`vinculoAtivo.id`), a ficha não é relida (o P0 já não a refaz) e o fluxo é o mesmo do desativar
  a si mesmo:

```ts
/** Depois de perder o papel em uso: a ficha não abre mais. Com papel em algum clube, escolha; sem, login. */
async function depoisDePerderOPapelDaSessao(): Promise<void> {
  const eu = await relerSessao()
  if (eu.vinculos.length > 0) {
    void navegar('/papel', { replace: true })
    return
  }
  void navegar('/login', { replace: true, state: { aviso: SEM_ACESSO } }) // antes do sair: /login é pública
  await sair()
}
```
- [ ] **Passo 5: sessão sem papel.** `EscolherPapel`, com `vinculos.length === 0`: texto
  `SEM_ACESSO` ("Você não tem mais acesso a nenhum clube.", constante exportada de
  `EscolherPapel.tsx`, que o `RemoverPapel` e a ficha importam) e Botão "Ir para o login"
  (`sair()` e `/login`). `Login` lê `state.aviso` (string, com
  type guard) e mostra `<p role="status">` acima do formulário.
- [ ] **Passo 6:** verdes; `tipos -w web` sem erro. **Commit:**
  `feat(usuarios): ficha com um cartão por papel e remover papel com confirmação`.

---

## P2 — Acrescentar papel em dois passos · subagente, onda 1

**Files:**
- Create: `apps/web/src/modulos/adm/usuarios/EscolhaDoPapel.tsx` (cartões de escolha única, "já tem" opcional)
- Create: `apps/web/src/modulos/adm/usuarios/EscolhaDoEscopo.tsx` (busca, contagem, grupos de chips, vazio, pré-requisito)
- Create: `apps/web/src/modulos/adm/usuarios/escopo.ts` (grupos, inativas, busca sem acento, leitura das opções)
- Create: `apps/web/src/modulos/adm/usuarios/escopo.test.ts`
- Create: `apps/web/src/modulos/adm/usuarios/AcrescentarPapel.tsx` (passo 1 e passo 2 pelo `?papel=`)
- Create: `apps/web/src/modulos/adm/usuarios/acrescentar.test.tsx`
- Modify: `apps/web/src/modulos/adm/usuarios/rotas.tsx:6-11` (`/adm/usuarios/:id/papeis/novo`)

**Interfaces:** consome do P0 `Chip variante="cheia"`, `RodapeDoFormulario rotuloCancelar`,
`papelDaUrl`/`urlDoPapel`, `papelNoGenero`, `primeiroNome`, `ESCOPO_VAZIO`, `useAcrescentarVinculo`;
`ComUsuario` (`FichaUsuario.tsx:41-54`), `semAcento` (`modulos/progresso/formatos.ts:14`),
`useUnidades()`/`useClasses()` (`api/leitura.ts:32-47`). **Produz para o P3:**

```ts
// EscolhaDoPapel.tsx
export function EscolhaDoPapel(p: { escolhido: Papel | null; aoEscolher: (papel: Papel) => void; jaTem?: Papel[] }): JSX.Element
// escopo.ts
export interface OpcaoDeEscopo { id: string; nome: string; inativa: boolean }
export interface GrupoDeEscopo { titulo: 'Unidades' | 'Regulares' | 'Avançadas' | 'Agrupadas'; opcoes: OpcaoDeEscopo[] }
export function gruposDeUnidades(ativas: Unidade[], doPapel: RefUnidade[]): GrupoDeEscopo[]
export function gruposDeClasses(classes: Classe[], doPapel: RefClasse[]): GrupoDeEscopo[]
export function filtrarGrupos(grupos: GrupoDeEscopo[], busca: string): GrupoDeEscopo[]
export function useOpcoesDoEscopo(papel: 'CONSELHEIRO' | 'INSTRUTOR', doPapel?: { unidades: RefUnidade[]; classes: RefClasse[] }):
  { estado: 'carregando' | 'erro' | 'pronto'; erro?: unknown; refazer: () => void; grupos: GrupoDeEscopo[] }
// EscolhaDoEscopo.tsx — controlado; a página valida e foca
export const EscolhaDoEscopo: ForwardRefExoticComponent<{
  papel: 'CONSELHEIRO' | 'INSTRUTOR'; grupos: GrupoDeEscopo[]; escolhidos: string[]; aoMudar: (ids: string[]) => void; idErro?: string
} & RefAttributes<HTMLDivElement>>   // ref = o grupo que recebe o foco (tabIndex -1)
```

- [ ] **Passo 1: testes primeiro.**

| arquivo › caso | asserção-chave |
|---|---|
| escopo.test › classes em três grupos, nomes da tela de classes | Regulares (`tipo REGULAR`, fora de AGRUPADAS), Avançadas (o resto fora de AGRUPADAS), Agrupadas (`trilha AGRUPADAS`), como `PainelClasses.tsx:72-91`; grupo vazio some |
| › só ativas; inativa do papel entra marcável com `inativa: true` no grupo dela | classe inativa fora do papel não aparece; a do papel aparece (vem de `RefClasse`, que tem `tipo` e `trilha`) |
| › unidades num grupo só "Unidades"; unidade inativa do papel entra com `inativa: true` | idem |
| › busca sem acento e sem caixa | "agui" acha "Águias"; grupos sem resultado somem |
| acrescentar.test › passo 1 (`A2`) | sobretítulo "Acrescentar papel · passo 1 de 2"; h1 "Que papel Carla vai ter?"; `fieldset` "Escolha um papel" com três rádios e as descrições do modelo |
| › papel que já tem | rádio desabilitado, `aria-describedby` aponta para "já tem" |
| › com os três papéis | "Carla já tem todos os papéis"; sem Continuar |
| › Adm escolhido | o botão vira "Salvar"; POST `{ papel: 'ADM', unidadeIds: [], classeIds: [], ajustes: [] }`; volta à ficha com `replace` e o estado de volta |
| › Continuar com Instrutor | endereço `…/papeis/novo?papel=instrutor` |
| › passo 2 (`A3`) | "Acrescentar papel · passo 2 de 2 · Instrutora"; h1 "Que classes Carla vai instruir?"; "Buscar classe"; grupos `fieldset` nomeados; chips `aria-pressed` |
| › "N escolhidas" conta o que a busca esconde | escolher Amigo, buscar "guia", escolher Guia → "2 escolhidas" (`aria-live="polite"`) |
| › Salvar sem escolha | nenhum POST; "Escolha pelo menos uma classe." junto do Salvar; foco no grupo; grupo com `aria-describedby` = id da mensagem |
| › Salvar | POST com `classeIds` escolhidos e `ajustes: []`; volta à ficha |
| › ajuda | "Carla começa com as permissões de instrutora. Dá para ajustar depois, em Alterar." |
| › Voltar do passo 2 | link "Voltar" leva a `…/papeis/novo` com Instrutor marcado |
| › `?papel=adm`, `?papel=x`, papel que já tem | volta ao passo 1 com `historyAction` REPLACE |
| › recarregar o passo 2 | abrir direto `…?papel=conselheiro` mostra o passo 2 de unidades |
| › sem unidade ativa | "Nenhuma unidade ativa no clube" com link para `/adm/unidades`; sem Salvar (classes: "Nenhuma classe ativa", link `/adm/classes`) |
| › busca sem resultado | "Nenhuma classe com esse nome" |
| › estados | carregando (sem a tela até usuário e lista lidos); "Não encontramos este usuário"; erro com "Tentar de novo"; sem conexão "Disponível com internet" |
| › erro ao gravar | 409 da API aparece na tela, sem sair |

```bash
cd apps/web && pesado testar --script teste -- src/modulos/adm/usuarios/escopo.test.ts src/modulos/adm/usuarios/acrescentar.test.tsx
```
Os testes conferem caminho e corpo do pedido, **nunca o conteúdo da ficha** (o P1 a reescreve na
mesma onda).

- [ ] **Passo 2: `EscolhaDoPapel`** (estrutura do `A2`): `fieldset` com legenda "Escolha um papel";
  cada papel é um `<label>` com `<input type="radio" name="papel">`, ícone (os mesmos do cartão da
  ficha), nome e descrição (textos do modelo). Contorno `border-borda-controle`; marcado
  `border-2 border-marca`; "já tem" com `bg-superficie-suave`, rádio `disabled` e `Selo` com `id`
  apontado por `aria-describedby`.
- [ ] **Passo 3: `escopo.ts` e `EscolhaDoEscopo`** (estrutura do `A3`): `Campo` de busca ("Buscar
  unidade"/"Buscar classe"); `<p aria-live="polite">` com "N escolhida(s)"; um `fieldset` por grupo
  com `legend` do título; `Chip variante="cheia"` por opção, rótulo `<nome>` ou `<nome> (inativa)`.
  O contêiner externo é `role="group"` com `aria-labelledby` no h1 da página, `tabIndex={-1}`, o
  `ref` encaminhado e `aria-describedby={idErro}`. Sem opção nenhuma: o pré-requisito com link; a
  página esconde o Salvar quando `grupos` vem vazio sem busca.
- [ ] **Passo 4: `AcrescentarPapel`.** `ComUsuario` → página. `papel = papelDaUrl(params.get('papel'))`;
  inválido, ADM ou já ativo → `<Navigate to="…/papeis/novo" replace state={estado} />`. Passo 1
  guarda a escolha em `useState`, inicial vindo de `state.papelEscolhido` (o Voltar do passo 2
  manda); Continuar navega com `?papel=<urlDoPapel>` (push, para o voltar do navegador funcionar).
  Passo 2: `useOpcoesDoEscopo(papel)` sem `doPapel` (Acrescentar só oferece ativas); a tela só
  aparece com tudo lido. Salvar com escopo vazio: `setErro(ESCOPO_VAZIO[papel])` e
  `grupo.current?.focus()`, sem gravar. O estado de volta da ficha (`{ voltarPara, voltarRotulo }`)
  viaja em todos os links e no `navegar` final, com `replace`. Rodapé:
  `RodapeDoFormulario` com `rotuloSalvar` "Continuar"/"Salvar" e, no passo 2, `rotuloCancelar="Voltar"`
  apontando para o passo 1. Mensagem de escopo vazio e erro da API num `<p role="alert" id>` logo
  acima do rodapé.
- [ ] **Passo 5: rota** `{ path: '/adm/usuarios/:id/papeis/novo', element: <AcrescentarPapel /> }`
  logo depois de `:id`.
- [ ] **Passo 6:** verdes; `tipos -w web`. **Commit:** `feat(usuarios): acrescentar papel em dois passos, com cartões e chips`.

---

## P3 — Alterar papel, Convidar numa tela, Editar só nome e gênero · subagente, onda 2

**Files:**
- Create: `apps/web/src/modulos/adm/usuarios/AlterarPapel.tsx` (escopo, ajustes, salvar)
- Create: `apps/web/src/modulos/adm/usuarios/AjustesDoPapel.tsx` ("Ajustar o que pode fazer", recolhível)
- Create: `apps/web/src/modulos/adm/usuarios/alterar.test.tsx`
- Modify: `apps/web/src/modulos/adm/usuarios/EditarUsuario.tsx:37-106` (convite numa tela) e `:112-225` (só nome e gênero; redireciona quem não é convidado)
- Delete: `apps/web/src/modulos/adm/usuarios/BlocoVinculo.tsx`
- Modify: `apps/web/src/modulos/adm/usuarios/vinculos.ts` (sai o que ficou sem uso: `oQuePodeFazer`, `rascunhoDoVinculo`, `mesmoRascunho` se não servir ao Alterar, `rascunhoVazio`)
- Modify: `apps/web/src/modulos/adm/usuarios/rotas.tsx` (`/adm/usuarios/:id/papeis/:vinculoId`, depois de `papeis/novo`)
- Modify: `apps/web/src/modulos/adm/usuarios/usuarios.test.tsx:126-178` (convite reescrito) e `:188-248` (sai)
- Modify: `apps/web/src/modulos/adm/usuarios/ficha.test.tsx:129-217` (edição e convite)

**Interfaces:** consome do P0 `Interruptor`, `rascunhoLimpo`, `alternarPermissao`,
`permissaoLigada`, `permissoesDoPapel`, `corpoDaEdicao`, `entradaDoVinculo`, `textoDasAlteracoes`,
`ESCOPO_VAZIO`, `useEditarVinculo`, `useCriarUsuario`; do P2 `EscolhaDoPapel`, `EscolhaDoEscopo`,
`useOpcoesDoEscopo`; do P1 a ficha mostrando `avisos`. Alvo: `modelo/A4`; Convidar sem modelo
(peças do `A2` e `A3` abaixo dos dados).

- [ ] **Passo 1: testes primeiro.**

| arquivo › caso | asserção-chave |
|---|---|
| alterar.test › tela (`A4`) | Voltar "Carla Mendes"; sobretítulo "Carla Mendes · Alterar papel"; h1 "Conselheira"; chips da unidade marcados |
| › unidade inativa que o papel tem | chip "Lobos (inativa)" marcado; Salvar sem mexer nela manda o id dela no PUT |
| › "Ajustar o que pode fazer" | botão com `aria-expanded="false"` e `aria-controls`; lista escondida; com ajuste, "1 alteração" no cabeçalho |
| › aberto | um `switch` por permissão do papel, nome = rótulo; descrição "padrão"/"alterado" |
| › ligar uma desligada | `aria-checked` true, etiqueta "alterado", cabeçalho "1 alteração"; desligar de novo volta a "padrão" e o ajuste some do corpo |
| › "Volta ao padrão do papel" | zera os ajustes do rascunho; nada é gravado até Salvar |
| › rascunho limpo | vínculo com ajuste igual ao padrão: "padrão" e nenhuma alteração; Salvar sem mexer **não chama** a API e volta à ficha |
| › Salvar | PUT com `corpoDaEdicao` (escopo + ajustes, nunca `papel`); volta à ficha com `replace` e o estado de volta |
| › escopo vazio | sem PUT; "Escolha pelo menos uma unidade." junto do Salvar; foco no grupo |
| › papel removido por outra pessoa | resposta com o vínculo `ativo: false` → ficha com o aviso "Este papel foi removido por outra pessoa." |
| › não encontrado | vínculo inexistente, inativo, de Adm ou de outra pessoa → "Não encontramos este papel" com link para a ficha |
| › estados | carregando; erro com "Tentar de novo"; "Disponível com internet" |
| › erro ao gravar (AJUSTE_INVALIDO) | mensagem de `vinculos.ts` na tela, sem sair |
| usuarios.test › convite numa tela (ex-`:126-178`) | Nome, E-mail, Gênero; h2 "Que papel a pessoa vai ter?" vira "Que papel Rui vai ter?" ao digitar; três cartões, nenhum marcado, nenhum "já tem" |
| › Conselheiro escolhido | aparece o bloco de unidades; trocar para Instrutor limpa o escopo e mostra classes; Adm esconde o bloco |
| › recusas | sem nome/e-mail: "Preencha o nome e o e-mail."; sem papel: "Escolha um papel."; sem escopo: "Escolha pelo menos uma unidade."; 409: mensagem da API |
| › Salvar | POST `/api/usuarios` com **um** vínculo, `ajustes: []`; vai à ficha do criado (lida do servidor, `ficha.test` ex-`:201-217`) |
| › ajuda | "Começa com as permissões do papel. Outros papéis e ajustes, depois, na ficha." |
| ficha.test › Editar de convidado (ex-`:129-150`) | só Nome e Gênero (sem E-mail, sem blocos); "Salvar alterações" faz PATCH e volta à ficha |
| › `/editar` de quem não é convidado (ex-`:151-162`) | redireciona para a ficha com `replace` |
| › recusa da API (outro clube) | mensagem no formulário |
| › Cancelar (`:163-168`) e não encontrado (`:219-222`) | continuam |
| usuarios.test › `:181-186` e `:249-279` | continuam sem mudar |

```bash
cd apps/web && pesado testar --script teste -- src/modulos/adm/usuarios
```

- [ ] **Passo 2: `AjustesDoPapel`** (estrutura do `A4`, começando recolhido — exceção ao modelo):

```tsx
const idLista = useId()
const alteracoes = Object.keys(rascunho.ajustes).length
<button type="button" aria-expanded={aberto} aria-controls={idLista} onClick={() => setAberto(!aberto)} className="… min-h-[var(--touch-min)]">
  Ajustar o que pode fazer {alteracoes > 0 && <Selo tom="alerta">{textoDasAlteracoes(alteracoes)}</Selo>}
</button>
<div id={idLista} hidden={!aberto}>
  {permissoesDoPapel(catalogo, rascunho.papel).map((p) => {
    const alterada = p.chave in rascunho.ajustes
    return (
      <div key={p.chave} className="flex items-center justify-between gap-3 border-t border-divisor py-1.5">
        <span id={`${idLista}-${p.chave}`}>{p.rotulo}</span>
        <span className="flex items-center gap-2">
          <Selo id={`${idLista}-${p.chave}-estado`} tom={alterada ? 'alerta' : 'neutro'}>{alterada ? 'alterado' : 'padrão'}</Selo>
          <Interruptor ligado={permissaoLigada(p, rascunho)} aoAlternar={() => aoMudar(alternarPermissao(rascunho, p))}
            idRotulo={`${idLista}-${p.chave}`} idDescricao={`${idLista}-${p.chave}-estado`} />
        </span>
      </div>
    )
  })}
  <Botao variante="texto" onClick={() => aoMudar({ ...rascunho, ajustes: {} })}>Volta ao padrão do papel</Botao>
</div>
```
No celular a linha quebra (`flex-wrap`) se o rótulo for longo; nunca rolagem lateral.

- [ ] **Passo 3: `AlterarPapel`.** `ComUsuario` → acha o vínculo por `:vinculoId` entre os
  `ativos` que não são ADM; senão `EstadoNaoEncontrado registro="este papel"` com
  `lista = { para: ficha, rotulo: 'Voltar para a ficha' }`. Espera catálogo e opções
  (`useOpcoesDoEscopo(papel, { unidades, classes } do vínculo)`). Rascunho inicial
  `rascunhoLimpo(vinculo, catalogo)`; Salvar: igual ao inicial (mesmos ids em qualquer ordem e mesmos
  ajustes) → volta sem chamar a API; escopo vazio → mensagem e foco; senão
  `useEditarVinculo().mutateAsync({ vinculoId, corpo: corpoDaEdicao(rascunho) })` e, se a resposta
  trouxer esse vínculo com `ativo: false`, volta à ficha com `state.avisos = ['Este papel foi
  removido por outra pessoa.']`. Rodapé: `RodapeDoFormulario rotuloSalvar="Salvar alterações"`,
  Cancelar → ficha.
- [ ] **Passo 4: Convidar** (`NovoUsuario`, mesmo arquivo e mesma rota): dados; h2 `Que papel
  <primeiroNome> vai ter?` (sem nome: "Que papel a pessoa vai ter?"); `EscolhaDoPapel` sem `jaTem`;
  conselheiro ou instrutor → `EscolhaDoEscopo` (só ativas); trocar o papel zera o escopo; ajuda;
  `RodapeDoFormulario`. Salvar: `useCriarUsuario` com `vinculos: [entradaDoVinculo(...)]` e
  `ajustes: []`; vai à ficha com `replace` (a resposta é eco; a ficha lê do servidor).
- [ ] **Passo 5: Editar.** `FormularioExistente` com `usuario.situacao !== 'CONVIDADO'` →
  `<Navigate to={ficha} replace state={estado} />`. Sobra Nome, Gênero e o erro do formulário; sai o
  E-mail, os blocos, "+ Acrescentar papel", `?acrescentar=1` e a gravação em sequência. "Salvar
  alterações": PATCH só se mudou, depois ficha com `replace`. Apagar `BlocoVinculo.tsx` e limpar
  `vinculos.ts` do que não tem mais quem chame (conferir com `grep -rn` no `src/`).
- [ ] **Passo 6: rota** `{ path: '/adm/usuarios/:id/papeis/:vinculoId', element: <AlterarPapel /> }`
  **depois** de `papeis/novo`.
- [ ] **Passo 7:** verdes (a pasta inteira do módulo); `tipos -w web`. **Commit:**
  `feat(usuarios): alterar papel, convite numa tela e editar só nome e gênero`.

---

## P4 — fase final · onda 3

**Files (implementador):**
- Modify: `e2e/fundacao.spec.ts:41-50` (convite: cartão "Conselheiro" e chip da unidade)
- Modify: `e2e/domingo.spec.ts:59-65` (idem)
- Modify: `e2e/fichas.spec.ts:243-300` (medição das telas novas)
- Modify: `e2e/adm.spec.ts` (caso novo de sessão, com `novaSessao` de `:58-63`)

- [ ] **Passo 1 (implementador): e2e.**
  - `fundacao.spec.ts:46-47` e `domingo.spec.ts:63-64`: `getByRole('radio', { name: /Conselheiro/ }).check()`
    e `getByRole('button', { name: unidade, exact: true }).click()` no lugar do `selectOption` e
    do `check`.
  - `fichas.spec.ts:66-88` continua (convidado, Editar, "Salvar alterações"); `:216`
    (`/editar` de convidado, título "Editar usuário") continua.
  - Medição (`:243`, larguras `LARGURAS = [390, 820, 1280]`), acrescentando: `/adm/usuarios/novo`
    com Instrutor escolhido e chips carregados (semear uma classe ativa como `adm.spec.ts:74-75`);
    `…/papeis/<vinculoId>` de um instrutor com o "Ajustar o que pode fazer" **aberto**;
    `…/papeis/novo` e `…/papeis/novo?papel=instrutor`; a ficha de um usuário com **três papéis**,
    um deles com dois ajustes (pior caso do cartão). O diálogo de remover, **só em 390**: abrir
    pela ficha e medir rolagem lateral da página e do diálogo
    (`scrollWidth - clientWidth` do `[role=dialog]` igual a 0), contando `fixed`/`sticky` **fora**
    do fundo da `Confirmacao` (`fixed inset-0` dela já existe e não é barra presa).
  - `adm.spec.ts`, caso novo: uma pessoa com conselheiro e instrutor entra (segunda sessão) e
    escolhe conselheiro; o Adm remove o papel de conselheiro pela ficha; no próximo toque da pessoa,
    ela cai em "Como você quer entrar?" só com Instrutor.

  **O e2e não roda nesta máquina** (CLAUDE.md; o `pesado` recusa) **e o CI não o roda**. Escrever,
  conferir com `pesado -- npm run tipos` da raiz e lint, e **não contornar**: onde rodar vira
  `PRECISO DE VOCÊ` no fechamento, como na fase anterior.

- [ ] **Passo 2 (`testador`):** um de cada vez, contra o baseline por nomes (API e web sem
  falhas): lint (`NODE_OPTIONS=--max-old-space-size=3072 pesado --teto 4G -- npm run lint`),
  `pesado -- npm run tipos`, `pesado testar --script teste --tudo` de dentro de `apps/api` e de
  `apps/web` (e de `packages/shared`, só para confirmar que nada mudou), `pesado -- npm run build`.
  Falhas → `saneador`, todas de uma vez.
- [ ] **Passo 3 (principal): buscas finais.** Elemento preso novo:
  `git diff main -- apps/web/src | grep -nE "^\+.*\b(fixed|sticky)\b"` vazio. "aula" em texto
  visível novo: `git diff main -- apps/web/src | grep -niE "^\+.*\baula"` só com nomes internos
  (`aula.registrar`, rotas). `editar?acrescentar` e `BlocoVinculo` sem ocorrência em `apps/web/src`.
- [ ] **Passo 4 (principal): revisão da PR inteira** (skill `code-review`, opus) contra a `main`,
  até nenhum achado Critical/Important (até 3 rodadas; Minor vira pendência).
- [ ] **Passo 5: QA com medição** — `qa-roteiro` escreve o roteiro com **um item por bloco de cada
  artboard** (`A1-Ficha`, `A2-Papel`, `A3-Classes`, `A4-Alterar`, `A5-Remover`), mais: Adm no passo
  1 (vira Salvar); `?papel=adm` e `?papel=x`; recarregar o passo 2; cada variação de texto do
  remover (outra pessoa com um e com dois papéis restantes, sem gênero, último papel, é você — com e
  sem outro papel); bloqueio de último Adm no remover e no desativar; chips "(inativa)" no Alterar;
  Convidar com cada papel; `/editar` de quem não é convidado; remover o próprio papel em uso indo a
  `/papel` e ao login. **E a medição no DOM** (o e2e não roda aqui), headless, em 390, 820 e 1280,
  nas mesmas telas e piores casos do Passo 1: `scrollWidth - clientWidth` do documento igual a 0 e
  nenhum `fixed`/`sticky` fora do fundo da `Confirmacao`. `qa-runner` executa.
- [ ] **Passo 6:** `documentador` com a branch e a base — só o que o diff tornou falso
  (`README.md` e `docs/planejamento/` se descreverem a edição de papéis por blocos; `docs/fases/`
  antigas ficam). `gestor-pr` sobe e, pelo ritual de `rules/pr-pronta.md`, tira a PR #28 do
  rascunho, com o resultado da medição no corpo e a nota de que o e2e foi escrito sem execução.

**Pronto:** lint, tipos, suítes de API e web e build verdes contra o baseline por nomes; e2e escrito
e com tipos verdes (execução fora desta máquina); medição sem rolagem lateral e sem `fixed`/`sticky`
novo em 390/820/1280, incluindo os piores casos; buscas do Passo 3 limpas; revisão limpa; QA sem
FALHOU ancorado no modelo; PR #28 fora do rascunho.

---

## O que NÃO quebra (conferido no código em c380b7b)

| Medo | Por que não quebra |
|---|---|
| Quem não foi afetado é jogado para fora ou troca de papel sozinho | `relerSessao` só roda quando a resposta é o próprio usuário logado (`usuario.id === eu.usuario.id`, P0); a ida a `/papel` de outra pessoa continua sendo só o 403 `VINCULO_INATIVO` do pedido dela (`cliente.ts:138-142`, guarda em `guarda-sessao.guard.ts:28-31`), que já existe. |
| Remover papel apaga dados | `PUT /vinculos/:id` com `{ ativo: false }` só faz `update` de `ativo` (`usuarios.service.ts:203`); `substituirRelacoes` só troca o que veio no corpo (`:347-368`, `if (novas.unidadeIds)`…), e o corpo do remover não traz escopo nem ajustes. Reuniões, chamadas, classes, observações, materiais e fotos apontam para a pessoa (`schema.prisma:660,697,805,953,1107,1137`). |
| A trava muda a gravação de quem não mexe em Adm | Em `editarVinculo` a trava só entra com `ativo: false` num vínculo ADM; escopo e ajustes seguem sem trava. Em `desativar` ela entra sempre, mas é por clube e dura só a transação (padrão de `materiais.service.ts:181`). `acrescentarPapel` do convite por link (`:224-245`) não desativa nada e não muda. |
| Fábricas e handlers de teste quebram outros testes | `apps/api/test/fabricas.ts` (`criarVinculo :115`, `criarAcesso :205`) e `apps/web/src/testes/handlers/usuarios.ts` não mudam; os handlers de escrita já servem a todas as telas novas (`:67-90`). |
| Telas do conselheiro e do instrutor mudam com o `Chip` | A variante padrão continua a de hoje (`aria-pressed`, selecionado suave); só o contorno do não selecionado passa a `border-borda-controle`, mais escuro, em `FormularioChamada`, `PartesDaReuniao`, `BlocoCobranca`, `TelaCronograma`, `ChipsDeClasse` e `Ranking`. Nenhum outro arquivo dessas telas é tocado. |
| Lista de usuários | `AdmUsuarios.tsx` não é tocado; "Convidar usuário" (`:88-90`) continua indo a `/adm/usuarios/novo`; a lista continua refeita por `['usuarios']`; `usuarios.test.tsx:60-123` e `:281-316` ficam como estão. |
| e2e de fichas | `fichas.spec.ts:66-88` usa usuário CONVIDADO com "Editar" e "Salvar alterações": Editar continua para convidado, com o mesmo rótulo; `:216` abre `/editar` de convidado, título "Editar usuário". |
| Desativar a si mesmo some no meio | O P0 não relê a ficha de quem perdeu o papel em uso; o P1 leva a `/papel` ou ao login, como no remover — hoje a releitura da ficha dava 403 e caía em `/papel` pelo cliente. |
| Ficha de desbravador ligada à conta | A regra de Diretoria não muda (`tipo-da-ficha.service.ts:119-123`); `sincronizarConta` segue dentro das mesmas transações; só o cache passa a refazer `['desbravadores']`. |

## Contrato de retorno do subagente

Cada `implementador` devolve, em até 15 linhas, sem diff e sem trecho de código:

1. pacote concluído (P1…P4) e se fechou inteiro;
2. arquivos tocados — caminhos, nunca conteúdo;
3. testes do pacote: quantos verdes, os nomes que falharam, e **se o vermelho inicial foi visto**
   (todos os testes escritos antes da implementação);
4. erros de `tipos` fora do pacote, em uma linha (esperado: nenhum);
5. decisões tomadas sozinho, uma linha cada, no formato `DECISÃO / IMPASSE / ALTERNATIVA`;
6. pendências, uma linha cada.

O principal confere com `git diff --stat` e um `git diff <arquivo>` dirigido no ponto que o
relatório disse ter sido difícil, antes do commit. Briefing de cada pacote: worktree, branch,
commit-base, a seção do pacote neste plano, as linhas do ONDE FICA do assunto, o artboard-alvo,
"não rode git", "~80 turnos", contrato acima.

## ONDE FICA

```
ONDE FICA
- rotas do módulo                         apps/web/src/modulos/adm/usuarios/rotas.tsx:6-11
- ficha (carga, cartão, cabeçalho, rodapé) apps/web/src/modulos/adm/usuarios/FichaUsuario.tsx:22 (SITUACAO), :26-30 (papel no gênero), :32-36 (situação), :41-54 (ComUsuario), :59-64 (catálogo), :66-98 (cartão), :100-199 (ficha; :166-183 rodapé, Reenviar :167-171; :179 acrescentar=1; :185-197 desativar)
- convidar / editar usuário                apps/web/src/modulos/adm/usuarios/EditarUsuario.tsx:37-106 (convite), :112-225 (editar; :120 estado de volta; :126 acrescentar=1; :133-165 gravação; :171-179 campos; :186-219 blocos)
- bloco de vínculo (sai)                   apps/web/src/modulos/adm/usuarios/BlocoVinculo.tsx
- regras do vínculo                        apps/web/src/modulos/adm/usuarios/vinculos.ts:15 (vazio), :17-22 (rascunho), :25-26 (do papel), :28-37 (ligada/alternar), :42-47 (entrada), :50-60 (mesmo), :62-67 (corpo da edição), :70-75 (oQuePodeFazer), :78-88 (escopo), :90-96 (mensagens)
- entrada do convite na lista              apps/web/src/modulos/adm/usuarios/AdmUsuarios.tsx:88-90
- juntar nomes / busca sem acento          apps/web/src/modulos/adm/formatos.ts:57-60 ; apps/web/src/modulos/progresso/formatos.ts:14
- voltar com destino e avisos              apps/web/src/modulos/adm/navegacao.ts:27-35, :38-50
- grupos de classes                        apps/web/src/modulos/adm/classes/PainelClasses.tsx:71-91 ; rotas /adm/classes e /adm/unidades
- hooks de usuário e leitura               apps/web/src/api/usuarios.ts:43-55, :58-81 ; apps/web/src/api/leitura.ts:23-30, :32-47, :57-63 ; apps/web/src/api/desbravadores.ts:48-52
- ui                                       apps/web/src/ui/Chip.tsx:11-24 ; Confirmacao.tsx:14-15, :91 (fixed do fundo) ; RodapeDoFormulario.tsx ; Selo.tsx ; EstadoNaoEncontrado.tsx ; Campo.tsx
- testes de ui                             apps/web/src/ui/componentes-novos.test.tsx:100-121 ; contraste.test.tsx:92-121 ; apps/web/src/testes/dialogo-fecha-no-sucesso.test.ts
- sessão no web                            apps/web/src/sessao/useSessao.ts:9-24 ; ProvedorSessao.tsx:79-82, :140, :282-310 ; GuardaRota.tsx ; apps/web/src/api/cliente.ts:138-142 ; layouts/SeloPapel.tsx:51
- acesso                                   apps/web/src/modulos/acesso/EscolherPapel.tsx:24-45 ; Login.tsx ; rotas.tsx (/login pública, /papel semVinculo) ; acesso.test.tsx:193-230
- API usuários e vínculos                  apps/api/src/usuarios/usuarios.service.ts:46-49 (situação), :163-174 (desativar), :176-187 (acrescentar), :189-208 (editarVinculo), :280-286 (exigirOutroAdm), :338-345 (reaproveita o vínculo), :347-368 (substitui relações)
- trava consultiva (padrão)                apps/api/src/materiais/materiais.service.ts:181 ; desbravadores/importacao.service.ts:175 ; calendario/servico-eventos.ts:151
- /api/eu sem papel ativo                  apps/api/src/auth/auth.controller.ts:130-138 (@Autenticado) ; auth.service.ts:91-110 ; auth/vinculos-resumo.ts:9-12 (só ativos) ; sessao/sessao.service.ts:29-33
- testes API                               apps/api/src/usuarios/usuarios.spec.ts:161-172 (volta pelo POST /usuarios), :278-320 (último Adm), :322-425 ; serviço por app.get: arquivos/arquivos.spec.ts:103
- testes web                               apps/web/src/modulos/adm/usuarios/ficha.test.tsx:62-121 (P1), :129-222 (P3) ; usuarios.test.tsx:126-248 (P3) ; testes/handlers/usuarios.ts:9-93 ; testes/handlers/leitura.ts:5,23,51,54
- e2e                                      e2e/fundacao.spec.ts:41-50 ; e2e/domingo.spec.ts:59-65 ; e2e/fichas.spec.ts:66-88, :204-241, :243-300 ; e2e/adm.spec.ts:50-63
- registros apontam para a pessoa          apps/api/prisma/schema.prisma:660, :697, :805, :953, :1107, :1137
- conferido em                             c380b7b (código igual ao de c097f6b: o commit da branch só toca docs/)
```

## Cobertura da SPEC (autorrevisão)

| SPEC › seção | Onde |
|---|---|
| O que muda para quem usa | P1 (ficha, remover, desativar), P2 (acrescentar), P3 (alterar, convidar, editar) |
| Endereços (rotas, Voltar com destino, `?papel=` no endereço, link do inativo) | P2 (passo 1/2, rota `papeis/novo`), P3 (rota `papeis/:vinculoId`), P1 (link do inativo) |
| Regras › Acrescentar ("já tem", todos os papéis, sem ajustes, volta limpo, só ativas) | P2; volta limpo testada na API no P0 |
| Regras › Escopo (ao menos um, mensagem, foco, grupos, busca, contagem) | P2 (peças e Acrescentar); P3 (Alterar e Convidar) |
| Regras › Inativas no Alterar | P2 (`escopo.ts` com `inativa`); P3 (chip marcado, segue no PUT) |
| Regras › Alterar (recolhido, padrão/alterado, Volta ao padrão, sem mudança sem API, Adm sem Alterar, rascunho limpo, removido por outra pessoa) | P0 (`rascunhoLimpo`); P3; P1 (sem Alterar no Adm, avisos) |
| Regras › Remover (PUT `ativo: false`, último Adm no diálogo, último papel, próprio papel, Diretoria) | P1; P0 (mensagem e cache) |
| Desativar neste clube (rodapé, erro no diálogo) | P1 |
| Convidado que fica sem papel | nada a fazer (aceito pela SPEC); `DefinirSenha` não muda |
| Textos da confirmação de remover | P1 Passo 3 (tabela fechada, inclusive "é você") |
| Editar dados (só convidado, redireciona, sem e-mail) | P3 |
| Convidar usuário (uma tela, um papel, escopo, recusas) | P3 |
| API (só a trava; teste de concorrência e de volta) | P0 |
| Telas, estados, acessibilidade | P1, P2, P3 (tabelas de teste); P4 (QA e medição) |
| Componentes (`Chip` cheio, `Interruptor`, `vinculos.ts`, `relerSessao`) | P0 |
| Cache | P0 (`useEscritaDePapel`); P1 (o caso do papel da sessão) |
| Exceções ao modelo | P1 (situação, ações de convidado, Desativar, texto do remover); P2 (Adm vira Salvar); P3 (recolhido, Convidar) |
| Descobribilidade | P2 (pré-requisito, vazio de busca); P1 (vazio da ficha, escolha sem papel, bloqueios) |
| Critério de pronto › testes web que mudam | P1 (`ficha.test:62-121`), P3 (`ficha.test:129-217`, `usuarios.test:126-248`), P0 (`contraste.test`) |
| Critério de pronto › e2e, QA, medição | P4 |
| Fora de escopo | não planejado (lista no Comando de execução) |

## Comando de execução

```
Aja como orquestrador (skill orquestrador) e execute o plano "Papéis do usuário, um por vez".

ONDE: continue na worktree existente /home/robertogabrieu/desbravadores/.claude/worktrees/papeis,
branch feature/papeis-um-por-vez, PR #28 (rascunho). Não crie branch nem PR novos. Base: main em
c097f6b (a branch só tem um commit de docs/ por cima e a main não andou: nada de merge).

LEIA PRIMEIRO, inteiros e uma vez: docs/fases/papeis-do-usuario/SPEC.md e
docs/fases/papeis-do-usuario/PLANO.md. Os modelos em docs/fases/papeis-do-usuario/modelo/*.dc.html
(A1 a A5) são o alvo e vencem a SPEC, salvo as "Exceções ao modelo" (estrutura, ordem e texto;
nunca CSS); Hoje.dc.html é só comparação. CLAUDE.md da raiz vale inteiro.

DECISÕES TRAVADAS (não reabrir):
- a ficha mostra um cartão por papel ativo, com escopo, "Permissões do papel" + selo e linha de
  ajuste, e as ações Alterar (nunca no Adm) e Remover papel; "Acrescentar papel" acima dos cartões;
- acrescentar é em dois passos (papel; depois unidades ou classes em chips), o papel do passo 2 mora
  no endereço (?papel=), Adm não tem passo 2 e o Continuar vira Salvar;
- o papel não se troca: vira-se instrutor removendo um e acrescentando o outro;
- "Ajustar o que pode fazer" começa recolhido, cada permissão com interruptor e "padrão"/"alterado",
  e os ajustes são normalizados no rascunho (igual ao padrão, fora do papel ou repetido saem), para
  "alterado", "N alterações" e o selo da ficha contarem a mesma coisa;
- o convite é uma tela só, com as mesmas peças de Acrescentar e um papel só; outros papéis e
  ajustes depois, na ficha; "Editar" só para convidado, só nome e gênero;
- "Desativar neste clube" fica no rodapé da ficha, discreto, e o erro de último Adm aparece dentro
  da confirmação, que só fecha no sucesso;
- a trava do último Adm é pg_advisory_xact_lock por clube dentro da $transaction que grava, em
  desativar e em editarVinculo com ativo: false;
- remover o próprio papel em uso relê a sessão e vai a /papel; sem papel em clube nenhum, vai ao
  login com "Você não tem mais acesso a nenhum clube.";
- os textos da confirmação de remover são os da SPEC, com a tabela do P1 Passo 3 (inclusive "é você");
- nenhum elemento fixed/sticky novo — o usuário prefere telas sem barra presa;
- "classe", nunca "aula", em texto visível;
- as decisões do PLANO: API inline no P0 (2 arquivos); peças de ui/, vinculos.ts, cache e
  relerSessao no P0; rotas do módulo acrescentadas pelo P2 e pelo P3, sem telas de mentira;
  escopo da confirmação como "da unidade Águias"/"das classes Amigo e Guia";
- testes antes da implementação dentro de cada pacote; validação pesada só no P4; baseline por
  nomes já existe (API e web sem falhas) — não recolha;
- máquina fraca: tudo pelo `pesado`, uma suíte pesada por vez, Node 22, comandos da seção Global
  Constraints do PLANO (testes de dentro do pacote, sem --maxWorkers).

FORA DE ESCOPO: atribuir papéis a partir da unidade ou da classe (opção C); a ficha toda editável
(opção B); convidar com mais de um papel ou com ajustes; mudar o catálogo de permissões, a regra de
Diretoria ou o motor da fila offline; ver ou restaurar papéis removidos; impedir que o convidado
sem papel grave a senha ao aceitar (o convite dele segue válido e ele não entra — aceito); push
fora do gestor-pr.

EXECUÇÃO: ondas 0 a 3 do PLANO. O P0 é seu, inline (API e arquivos de dono compartilhado), com dois
commits, antes de delegar. P1 e P2 vão ao `implementador` (sonnet) em paralelo — são o único par
disjunto —; P3 depois, sozinho; o e2e do P4 também ao implementador. Cada briefing com a seção do
pacote, as linhas do ONDE FICA do assunto e o artboard-alvo; nenhum subagente roda git; commit por
pacote pela skill `commit`, com o título do plano; `tipos` da raiz verde no fim de cada onda;
revisão com opus; push e saída do rascunho só pelo `gestor-pr` no fim.

GATE: "Pronto" do P4 — lint, tipos, suítes de API e web e build verdes contra o baseline por
nomes; e2e escrito e com tipos verdes (não roda nesta máquina nem no CI: onde rodar vai em PRECISO
DE VOCÊ); medição no DOM sem rolagem lateral e sem fixed/sticky novo em 390/820/1280, incluindo os
piores casos (ficha com três papéis e ajustes, Alterar aberto, Convidar com Instrutor, diálogo de
remover em 390); revisão da PR limpa; QA sem FALHOU ancorado no modelo e nos itens extras da SPEC;
PR #28 fora do rascunho.

RETORNO: relatório de fechamento da skill orquestrador, com as decisões tomadas fora do PLANO em
PENDÊNCIAS.
```
