# Classe pela idade, automática — SPEC e plano

Hoje a classe regular do desbravador é escolhida à mão, uma vez por ano do clube, e nada a renova:
na virada do ano (`inicioAnoClube`, padrão 1º de fevereiro) todo desbravador fica **sem classe** —
some das aulas, do progresso e das tarefas — até o Adm matricular um por um. A idade só entra como
aviso, medida no primeiro dia do ano do clube.

O dono do produto quer: **a classe é a da idade que o desbravador completa até 30/06 do ano**, e ela
é atribuída **sozinha**, com o Adm podendo trocar à mão.

## Decisões do dono do produto (não se reabrem)

1. **Régua:** a classe é a da idade completada até **30/06** do ano. Faz 11 no 2º semestre → ainda é
   Amigo naquele ano; faz 11 no 1º semestre → começa o ano em Companheiro.
2. **Automática**, e **o Adm pode mudar manualmente**.

## Decisões de desenho (tomadas na spec)

| # | Decisão | Por quê |
|---|---|---|
| D1 | "O ano" é o **ano do clube**: idade em `${anoClube}-06-30`. | Matrícula é por `anoClube` (`schema.prisma:610-624`). Em janeiro, antes de `inicioAnoClube`, ainda vale o ano anterior — a régua acompanha a matrícula que se está preenchendo. |
| D2 | A automação **só preenche**: matricula quem não tem nenhuma matrícula **regular** no ano com status diferente de `DESISTIU`. Nunca troca uma classe existente. | É o que torna a escolha do Adm respeitada **sem campo novo**: a troca manual cria matrícula CURSANDO, e a automação não toca nela até o ano acabar. No ano seguinte não há matrícula e a régua volta a valer. Trocar classe existente no meio do ano deixaria o progresso preso na classe antiga (`requisitos-dbv.service.ts:108`, `servico-progresso.ts:92`) e o instrutor sem o aluno. |
| D3 | Só **tipo DBV ativo**. Diretoria e Líder continuam à mão. | A Diretoria já é por idade (16 até 30/06) e cursa o que o Adm escolher (Agrupadas); Líder não tem classe no formulário. |
| D4 | Classe alvo: **regular, trilha INDIVIDUAL, `idade` igual à idade de referência, ativa e ativa no clube** (`ativaNoClube`, `importacao.service.ts:77`); empate → menor `ordem`. Sem classe para a idade (menos de 10, ou classe desativada no clube) → nada é feito. | Com a régua D1, todo DBV tem até 15 (16 até 30/06 vira Diretoria, `diretoria.ts:3-14`): as Agrupadas nunca são alvo automático. |
| D5 | Matricula **com a avançada ligada** (`incluirAvancada = true`). | Mesmo padrão do cadastro (`contratos/desbravadores.ts:30`) e da importação. |
| D6 | **Dois gatilhos:** (a) cadastro e importação de DBV sem classe → matricula na hora; (b) a varredura periódica de 6 h (`tarefas.service.ts`) preenche o resto — inclusive a virada do ano. | Sem (a), o cadastrado ficaria até 6 h sem classe. (b) cobre a virada, DIRETORIA que voltou a DBV e reativação. |
| D7 | Aviso de idade (`avisosDoCadastro`) e sugestão da importação (`sugerirClasse`) passam para a **mesma régua D1**. | Hoje medem no 1º dia do ano do clube (`desbravadores.service.ts:547`, `importacao.service.ts:307`); duas réguas no mesmo app mandam o Adm para classes diferentes. |
| D8 | **Trava por desbravador**: `pg_advisory_xact_lock` sobre o id, no início de `matricular` e antes da reconferência da varredura, na mesma transação. Molde: `importacao.service.ts:175` (`$executeRaw` no `tx`, fora da guarda de modelos). | Sem a trava, a varredura que leu "sem classe" um instante antes de o Adm matricular faria a regular do Adm virar `DESISTIU` (`matricular` desiste da CURSANDO da mesma trilha, `desbravadores.service.ts:462`). Todo caminho de escrita de matrícula passa por `matricular` (troca manual `:400`, cadastro e importação via `gravarNovo`), então a trava ali cobre todos. Lock advisory é reentrante na mesma sessão e a transação é uma sessão só. Sem deadlock: a importação pega a trava do clube e depois a do DBV; a varredura só pega a do DBV. |
| D9 | Editar a data de nascimento **não troca** a classe; o aviso de idade (D7) mostra a esperada. | Consequência de D2; o Adm decide se troca. |
| D10 | **Reativar devolve a classe da régua**, não a que o Adm tinha escolhido antes de inativar. | `inativar` passa toda CURSANDO a DESISTIU (`desbravadores.service.ts:359-362`) e `reativar` não reabre nada (`:368-373`); reabrir a escolha antiga exigiria guardar qual era. O Adm troca de novo se quiser. |
| D11 | **Não existe DBV "sem classe de propósito"** quando há classe para a idade: DESISTIU conta como ausência, e a varredura matricula. | Manter alguém sem classe exigiria campo novo; o pedido é a classe automática. Quem não deve cursar a individual é Diretoria (cursa o que o Adm escolher) ou tem matrícula em outra trilha — e matrícula regular em AGRUPADAS conta como "tem classe" (D2 diz *regular*, qualquer trilha). |

## Regras

### A régua (`packages/shared`)

- `idadeDaClasse(nascimento, anoClube)` = `idade(nascimento, \`${anoClube}-06-30\`)` em
  `packages/shared/src/formulas/` (novo `classe.ts`, exportado como as outras fórmulas), com
  `DIA_DE_CORTE_DA_CLASSE = '06-30'`. `idade` já trata 29/02 (`datas.ts:18-28`).
- Exemplos que viram teste: ano do clube 2026 — nascido 15/03/2015 → 11 (Companheiro); 15/09/2015 →
  10 (Amigo); 30/06/2015 → 11; 01/07/2015 → 10; 29/02/2016 → 10 (faz 10 em 01/03/2026).

### Classe da idade (API)

- Uma função só, em `desbravadores.service.ts`, substitui `classeEsperada` (`:564`) e serve aos quatro
  usos (aviso, sugestão, cadastro, varredura): recebe cliente/tx, `clubeId`, `nascimento`,
  `anoClube`; devolve a classe D4 (`id`, `nome`, `tipo`, `trilha`) ou nada.
- `ondeClasseDaIdade` (`:155`) continua sendo o filtro; ganha `ativaNoClube`, que hoje só a importação
  aplica (passa a ser constante compartilhada, sem duplicar).

### Cadastro e importação (gatilho a)

- `gravarNovo` (`desbravadores.service.ts:249`): depois de decidir o Tipo, se **tipo final = DBV** e
  **nenhuma classe veio**, calcula a classe da idade e matricula (D5). Classe vinda do Adm prevalece,
  mesmo fora da idade (com o aviso).
- A importação usa o mesmo `gravarNovo` (`importacao.service.ts:190`): herda sem código novo. A prévia
  segue sugerindo (`sugerirClasse`), agora pela régua D1; o texto do aviso não muda.
- A sugestão da importação mantém o recuo para AGRUPADAS (`importacao.service.ts:310`) — só serve a
  linha que vira Diretoria e não entra no gatilho.

### Varredura (gatilho b)

- Serviço novo `ServicoClassePelaIdade` (`desbravadores/classe-pela-idade.service.ts`), no molde de
  `ServicoTipoDaFicha.sincronizarClube` (`tipo-da-ficha.service.ts:117`), em duas etapas públicas:
  - `sincronizarClube(clubeId, hoje?)`: obtém `inicioAnoClube` e o "hoje" do clube; com `hoje` fixo
    (teste da virada), deriva `anoClube(hoje, inicioAnoClube)` do shared — `ServicoEscopo.relogio`
    (`escopo.service.ts:22`) recebe `Date`, não a data civil. Lista DBV ativos **sem** matrícula
    regular não-DESISTIU no ano e chama `aplicar` para cada um. Erro numa ficha vai para o log e não
    para as outras. Devolve quantos matriculou.
  - `aplicar(clubeId, dbvId, anoClube)`: uma transação — trava (D8) → **reconfere** D2 e tipo DBV ativo
    → calcula a classe → matricula. Devolve se matriculou. É o ponto que o teste chama depois de criar
    uma matrícula "no meio", para provar a reconferência.
- `TarefasPeriodicas.varrer` (`tarefas.service.ts:47`) chama, por clube, **depois** da sincronização do
  Tipo (quem acabou de virar Diretoria não recebe classe automática), cada uma com o seu try/catch.
  Loga "Clube X: N desbravador(es) matriculado(s) pela idade" quando N > 0 — é o que mostra o efeito da
  primeira rodada em produção (a varredura roda ao subir a API). O comentário da classe passa a falar
  das duas varreduras.
- **Módulos:** `ServicoClassePelaIdade` é provider **e export** de `DesbravadoresModule`
  (`desbravadores.module.ts:14-20`, hoje exporta só `ServicoEscopo` e `ServicoPerfil`);
  `TarefasModule` (`tarefas.module.ts:5-8`) passa a importar `DesbravadoresModule`. O construtor de
  `TarefasPeriodicas` ganha o serviço novo: o `beforeAll` de `tarefas.spec.ts:19-20`, que constrói à
  mão, precisa construir também o serviço (e o `DesbravadoresService` com as dependências dele).
- `matricular` hoje é `private` (`desbravadores.service.ts:462`); o serviço novo precisa dele. Expor um
  método público estreito (ex.: `matricularPelaIdade(tx, dbv, anoClube)`) é preferível a abrir
  `matricular` inteiro.

### Avisos (D7)

- `avisosDoCadastro` (`:540`) usa `idadeDaClasse(nascimento, relogio.anoClube)` no lugar de
  `idadeNoInicio`, também para o mínimo das Agrupadas. Texto dos avisos inalterado.

### Tela (`FormularioDesbravador.tsx`)

- **Cadastro de tipo DBV:** a opção vazia do select "Classe do ano" passa de "Sem classe" para
  **"Pela idade"**, com a ajuda "Fica na classe da idade que completa até 30/06, quando houver. Dá para
  trocar depois." O "quando houver" é necessário: menos de 10 anos não tem classe, e quem tem 16 até
  junho é gravado como Diretoria (`gravarNovo`, `:263-271`) e não recebe classe. Diretoria continua com
  "Sem classe". Edição não muda (troca manual = D2).
- **Grade da importação** (`GradeImportacao.tsx:157`): a opção vazia passa de "Sem classe" para
  "Pela idade", porque a linha sem classe agora é matriculada pela régua ao gravar.
- Sem mockup: muda dois rótulos e uma frase de ajuda.

## O que NÃO quebra

- Nenhuma migration: não há campo novo (D2 dispensa a marca "pelo Adm").
- Matrículas já existentes no ano corrente ficam como estão — a automação só preenche quem está sem
  classe. Em produção, no primeiro ciclo, ganham classe só os DBV ativos que estão sem nenhuma.
- Trocar a classe à mão segue o mesmo caminho (`POST /desbravadores/:id/matriculas`) e o mesmo aviso de
  desistência.
- Pacote offline do instrutor (`sync/pacote-instrutor.service.ts:98`) lê CURSANDO do ano: matrícula
  nova aparece na próxima sincronização, como qualquer matrícula feita pelo Adm.

## Testes (escritos antes, todos falhando)

- `packages/shared`: `idadeDaClasse` com os exemplos da régua.
- `classe-pela-idade.service.spec.ts` (banco isolado, molde de `tarefas.spec.ts`):
  - virada: DBV sem matrícula em 2027 recebe a classe da régua (Amigo e Companheiro pelos exemplos), com
    a avançada;
  - não troca matrícula CURSANDO existente fora da idade (escolha do Adm); não cria quando há
    CONCLUIDA/INVESTIDA no ano; cria quando só há DESISTIU;
  - ignora Diretoria, Líder e inativo; idade sem classe (9 anos) e classe desativada no clube → nada;
  - reconferência: matrícula criada pelo Adm antes de `aplicar` → `aplicar` não grava e a do Adm
    continua CURSANDO.
- `tarefas.spec.ts`: a varredura chama as duas sincronizações, Tipo antes; erro numa não impede a outra
  (simular falha como em `:141`, mock da etapa).
- `desbravadores.spec.ts`: cadastro DBV sem classe → matriculado pela régua; com classe → a do Adm;
  Diretoria sem classe → sem matrícula; aviso de idade pela régua com datas fixas nos dois semestres
  (testes novos — os existentes usam `nascimentoComIdade`, que nasce em 10/01, `test/p6.ts:10-12`, e
  dão a mesma idade nas duas réguas); reativar sem matrícula no ano → a varredura dá a classe da régua
  (D10); DBV só com matrícula em AGRUPADAS → a varredura não cria a individual (D11).
- `importacao.spec.ts:374`: sugestão pela régua; importação sem classe grava a matrícula.
- **Testes que mudam de comportamento** (todo POST de DBV sem classe agora matricula) — rodar as suítes
  inteiras e ajustar onde a contagem de matrículas mudar: `desbravadores.spec.ts:228` e `:376`,
  `desbravadores.isolamento.spec.ts:64`, `importacao.spec.ts:167` e `:578`.
- Web: o rótulo "Pela idade" no cadastro de DBV e "Sem classe" na Diretoria; "Pela idade" na grade.

## Execução

- **Agente principal:** esta spec, git, revisão do diff, PR.
- **Subagente (um pacote, `implementador`):** tudo acima — ~15 arquivos alterados (shared 2–3, API
  ~9, web 3), dentro da faixa de 6 a 15; partir em dois pagaria dois pisos para arquivos que se leem
  juntos (o serviço novo depende da função da classe e do `matricular`).
- Gate: suítes filtradas do que mudou via `pesado testar`; o CI da PR roda o resto (sem e2e neste
  repo).

## ONDE FICA

```
- régua de idade / 29/02                packages/shared/src/datas.ts:18-28
- regra da Diretoria (16 até 30/06)     packages/shared/src/formulas/diretoria.ts:3-14
- matrícula e unicidade por ano         apps/api/prisma/schema.prisma:610-624
- classe atual = CURSANDO do ano        apps/api/src/desbravadores/desbravadores.service.ts:78,113
- filtro da classe da idade             apps/api/src/desbravadores/desbravadores.service.ts:155-165
- cadastro / gravarNovo                 apps/api/src/desbravadores/desbravadores.service.ts:221-300
- matricularEmClasse / matricular       apps/api/src/desbravadores/desbravadores.service.ts:400,462-530
- avisos de idade / classeEsperada      apps/api/src/desbravadores/desbravadores.service.ts:540-570
- ativaNoClube / sugerirClasse          apps/api/src/desbravadores/importacao.service.ts:77,305-322
- varredura de 6 h                      apps/api/src/tarefas/tarefas.service.ts:20-60
- sincronização do Tipo (molde)         apps/api/src/desbravadores/tipo-da-ficha.service.ts:117-190
- testes da varredura                   apps/api/src/tarefas/tarefas.spec.ts
- testes de aviso / sugestão            apps/api/src/desbravadores/desbravadores.spec.ts:260; importacao.spec.ts:374
- select da classe no formulário        apps/web/src/modulos/adm/desbravadores/FormularioDesbravador.tsx:327-350
- select da classe na importação        apps/web/src/modulos/adm/desbravadores/GradeImportacao.tsx:157
- inativar / reativar                   apps/api/src/desbravadores/desbravadores.service.ts:344-373
- módulos                               apps/api/src/desbravadores/desbravadores.module.ts; apps/api/src/tarefas/tarefas.module.ts
- relógio do clube                      apps/api/src/desbravadores/escopo.service.ts:22
- advisory lock (molde)                 apps/api/src/desbravadores/importacao.service.ts:175
- nascimentoComIdade (nasce em 10/01)   apps/api/test/p6.ts:10-12
- conferido em                          fe8d606
```
