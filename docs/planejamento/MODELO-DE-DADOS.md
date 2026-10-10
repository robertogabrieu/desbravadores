# Aplicativo do Desbravador — Modelo de dados

Parte do rascunho do `docs/design/LEIA-ME.md` (§6), corrigido para as decisões da VISAO e para o
que as telas exibem. As mudanças em relação ao rascunho estão no fim.

Convenções: toda tabela tem `id` (UUID), `criadoEm`, `atualizadoEm`. Toda tabela de dados do
clube tem `clubeId` (omitido abaixo para não repetir). Exclusão de cadastro é **lógica**
(`ativo=false`) — nada que tenha histórico de pontos ou presença é apagado de verdade.

## 1. Clube, pessoas e acesso

```
Clube(id, nome, cidade, igreja, associacao, logoUrl)

ConfiguracaoClube(clubeId PK,
  diaReuniao: 0..6 = 0 (domingo), horaReuniao = "09:00", localReuniaoPadrao,
  inicioAnoClube: MM-DD = "02-01",               # quando começa o "ano do clube"
  limiarFrequenciaAlerta = 70,                   # vermelho abaixo disto
  limiarProgressoAlerta = 40,                    # laranja abaixo disto
  metaFrequencia = 80,
  rankingPeriodo: MES|TRIMESTRE|ANO = MES,
  rankingNoLogin = true, rankingPorUnidade = true,
  descontarFalta = false, pontosDescontoFalta = 0)

Usuario(id, nome, email UNIQUE, senhaHash?, genero?: F|M,   # "Instrutora"/"Instrutor"
  status: CONVIDADO|ATIVO|INATIVO|SUBSTITUTO, ultimoAcessoEm)
  # SUBSTITUTO = quem lançou por link de substituição sem ter conta: sem senha, e-mail só marcador
  # (substituto-<id do link>@substituto.invalid); o cadastro de usuário recusa esse e-mail
  # sem clubeId: a mesma pessoa pode estar em mais de um clube

Vinculo(id, usuarioId, clubeId, papel: ADM|CONSELHEIRO|INSTRUTOR, ativo)
  UNIQUE(usuarioId, clubeId, papel)
VinculoUnidade(vinculoId, unidadeId)             # conselheiro → unidades (1 ou mais)
VinculoClasse(vinculoId, classeId)               # instrutor → classes (1 ou mais)
PermissaoAjuste(vinculoId, permissao: texto, concedida: bool)
  # só as diferenças em relação ao padrão do papel; o catálogo vive no código (shared)

Convite(id, usuarioId, tokenHash, expiraEm, usadoEm?)
RefreshToken(id, usuarioId, tokenHash, expiraEm, revogadoEm?, aparelho)

Substituicao(id, clubeId, tipo: CHAMADA|CLASSE, unidadeId?, classeId?, data,
  inicioEm, fimEm, fimEnvioEm,                   # janela gravada na geração: fimEm = início + 3 h, fimEnvioEm = fimEm + 12 h
  tokenHash UNIQUE,                              # o link em si só existe na resposta que o gerou
  aparelhoHash?, identificadaEm?, substitutoId?, # o aparelho que abriu primeiro; quem lança (membro ou Usuario SUBSTITUTO)
  criadoPorId, criadoEm, canceladoEm?, canceladoPorId?)
  # CHECK: exatamente um de unidadeId e classeId, coerente com tipo. Nada se apaga: cancelar preenche canceladoEm.
  # Aberto = não cancelado e fimEnvioEm no futuro; um aberto por alvo (gerar outro cancela o anterior).
```

Uma pessoa conselheira e instrutora tem **dois Vínculos** no mesmo clube. O app mostra o
seletor de papel quando há mais de um.

## 2. Desbravadores e unidades

```
Desbravador(id, nome, nomePublico,               # "Ana C." — calculado, editável
  tipo: DBV|LIDER = DBV,                         # LIDER = líder cursando classe (em geral Agrupadas)
  usuarioId?,                                    # liga o LIDER à conta dele, quando houver
  nascimento: date, sexo: F|M,
  responsavelNome, responsavelTelefone, responsavelEmail?,
  autorizacaoImagem: bool, autorizacaoImagemEm?, # quem autorizou fica em observação do cadastro
  fotoUrl?, ativo, entradaEm: date, saidaEm?)

Unidade(id, nome, tipo: MISTA|MASCULINA|FEMININA, gritoDeGuerra?, ativa)
  # conselheiros vêm de VinculoUnidade (pode haver conselheiro e associado)

MembroUnidade(id, dbvId, unidadeId, inicio: date, fim?: date)
  # histórico: denominador correto da frequência e "sem unidade" = sem linha aberta
  UNIQUE parcial: um registro aberto (fim nulo) por dbvId
```

Quem cursa uma classe é sempre um `Desbravador`. O **líder** que faz as Agrupadas (em geral
instrutor de uma classe individual) entra como `tipo=LIDER`: tem matrícula e progresso, mas não
tem unidade, não entra na chamada, na frequência nem no ranking.

## 3. Classes, requisitos e especialidades

```
Classe(id, nome, idade?, cor,
  tipo: REGULAR|AVANCADA,
  trilha: INDIVIDUAL|AGRUPADAS,                  # AGRUPADAS = supletivo, requisitos próprios
  classeBaseId?,                                 # avançada aponta para a regular da mesma trilha
  ordem, origem: OFICIAL|CLUBE, ativa,
  quemMontaCronograma: ADM|INSTRUTOR = ADM)      # a trava única do cronograma
  # instrutores vêm de VinculoClasse

SecaoRequisito(id, classeId, codigo: "G"|"DE"|..., nome, ordem)
Requisito(id, secaoId, codigo: "DE1", texto, campo: bool, ordem, ativo)

AreaEspecialidade(id, codigo: "AD"|"HM"|..., nome, cor, ordem)
Especialidade(id, areaId, nome, origem: OFICIAL|CLUBE, ativa)
Mestrado(id, nome)                               # catálogo carregado; marcar conclusão fica para depois
  # carga: dados/especialidades.json — 514 especialidades em 9 áreas + 16 mestrados, só nomes
```

**Trilhas.** A trilha individual tem 6 regulares (Amigo a Guia), cada uma com sua avançada. A
trilha **Agrupadas** é um supletivo para quem tem **16 anos ou mais**: uma turma só, com uma
regular ("Agrupadas (Amigo a Guia)") e uma avançada que reúne as seis avançadas do caderno (seções
AN, CE, PC, PN, EM, GE). Classe oficial que sai da carga não é apagada: fica `ativa = false`, some
das listas de escolha e continua legível para quem já tinha matrícula ou vínculo nela. Os
requisitos das duas trilhas são **registros diferentes**, mesmo quando o texto coincide: o
progresso de uma nunca conta na outra.

A carga é **reexecutável**: casa cada requisito pela chave (classe + código) e atualiza texto e
CAMPO sem trocar o id — o progresso já registrado continua apontando para o mesmo requisito.

Os dados `OFICIAL` vêm da carga inicial (`docs/planejamento/dados/cadernos/*.json`) e são
**compartilhados por todos os clubes** (sem `clubeId`). Um clube pode acrescentar os seus
(`origem=CLUBE`, com `clubeId`).

**O que o clube escolhe sobre um item oficial não mora na linha oficial** (corrigido na Fase 0,
D12): a linha é compartilhada, e gravar nela a escolha de um clube a imporia a todos. A escolha
vai em tabelas por clube — `ClasseClube(clubeId, classeId, ativa, quemMontaCronograma)` e
`RequisitoAjuste(clubeId, requisitoId, ativo, campo)`. Requisito oficial desativado pela carga
prevalece sobre o ajuste. Especialidade oficial não tem ajuste por clube nesta fase.

## 4. Matrícula, progresso e investidura

```
MatriculaClasse(id, dbvId, classeId, anoClube: int,
  status: CURSANDO|CONCLUIDA|INVESTIDA|DESISTIU,
  investidaEm?: date)
  UNIQUE(dbvId, classeId, anoClube)
  # regular e avançada são matrículas separadas; matricular na regular cria também a da
  # avançada correspondente (o Adm pode remover — ela é recomendada, não obrigatória)

RequisitoConcluido(id, dbvId, requisitoId, concluidoEm: date,
  instrutorId, registroAulaId?,                  # nulo = marcado fora da aula (reposição, casa)
  removidoEm?, removidoPor?)                     # desmarcar = remoção lógica, com estorno de pontos
  UNIQUE(dbvId, requisitoId) entre os não removidos

EspecialidadeConcluida(id, dbvId, especialidadeId, concluidaEm, instrutorId,
  registroAulaId?,                               # nulo = marcada fora do registro de aula
  removidoEm?, removidoPor?)
```

**Regras derivadas (funções em `shared`, não colunas):**
- `% da classe = requisitos concluídos (não removidos) da classe ÷ requisitos ativos da classe`.
  A média da turma é a média dos % exatos, arredondada só no fim.
- `pronto para investidura = % da REGULAR = 100%`. A avançada **não** é condição: ela tem o seu
  próprio % e a sua própria investidura (`MatriculaClasse` dela com status `INVESTIDA`).
- O % é sempre mostrado **separado** para regular e avançada (perfil, progresso, relatórios).
- "Classe atual" do DBV = matrícula `CURSANDO` do ano corrente na classe regular.

## 5. Calendário e cronograma

```
EventoCalendario(id, nome, tipo: SEM_REUNIAO|ACAMPAMENTO|EVENTO|FERIADO|FERIAS|REUNIAO_EXTRA,
  inicio: date, fim: date, horario?, local?,
  temReuniao: bool, temClasse: bool,             # marcações afirmativas: "terá reunião", "terá classe"
  bomParaCampo: bool)
```
A reunião regular é **implícita**: todo `diaReuniao` sem evento com `temReuniao = não`. Eventos de
vários dias valem para **todos os dias do intervalo**. A regra do dia é única
(`situacaoDaData`, em `packages/shared/src/formulas/calendario.ts`): entre os eventos comuns (todos
menos Reunião extra), basta um tirar a reunião ou a classe para tirar; `bomParaCampo` vale se
qualquer um tiver. Há classe num dia se nenhum comum a tira e o dia é de reunião ou bom para campo.
A **Reunião extra** só acrescenta: dá reunião e/ou classe numa data fora do dia normal e vence a
sobreposição com os outros eventos.

Padrões por tipo (`MARCACOES_PADRAO`, editáveis no formulário): SEM_REUNIAO → sem reunião e sem
classe; EVENTO → com reunião, sem classe; ACAMPAMENTO → sem reunião, com classe, bom para campo;
FERIADO → com reunião e com classe; FERIAS → sem reunião, com classe (a API grava sempre este
padrão; "com classe" evita que as férias derrubem um acampamento dentro delas, e sem reunião e sem
campo não há classe); REUNIAO_EXTRA → com reunião e com classe, e nunca bom para campo.

Cronograma(id, classeId, anoClube, inicio: date, fim: date,
  status: RASCUNHO|ENVIADO|PUBLICADO,            # ENVIADO = instrutor mandou para o Adm publicar
  enviadoEm?, enviadoPor?, publicadoEm?, publicadoPor?)
  # instrutor que edita um cronograma ENVIADO o devolve a RASCUNHO; editar um PUBLICADO cria
  # nova versão em RASCUNHO e a publicada continua valendo até a próxima publicação
  UNIQUE(classeId, anoClube)

AulaPlanejada(id, cronogramaId, data, horario?, local?, titulo?,  # "Saída de campo"
  cancelada: bool)
AulaRequisito(aulaPlanejadaId, requisitoId)
  UNIQUE(cronogramaId, requisitoId)              # cada requisito em uma data só (via aula)
```

**Agrupadas não dependem da reunião.** Quem cursa costuma dar aula numa classe individual no
domingo, então as aulas das Agrupadas acontecem em outro dia e horário. Para classes da trilha
`AGRUPADAS`, o cronograma aceita **qualquer data** (não só o dia de reunião); o calendário do clube
só **avisa** quando a data cai num evento, sem bloquear. O cronograma é opcional para elas.

Um evento criado ou alterado que bloqueia a data de uma `AulaPlanejada` gera `Notificacao` para
os instrutores da classe (e para o Adm, se `quemMontaCronograma=ADM`) e marca a aula com
**conflito** (derivado, não coluna) até alguém mover os requisitos.

## 6. Reunião e aula

```
Reuniao(id, unidadeId, data, horario, local?, eventoId?,  # evento, se a "reunião" foi um evento
  substituicaoId?,                               # preenchido quando um link de substituição gravou alguma linha da chamada
  observacoes?, registradaPor, registradaEm,
  clienteUuid UNIQUE)                            # id gerado no celular, para sincronizar sem duplicar
  UNIQUE(unidadeId, data)

Chamada(reuniaoId, dbvId,
  situacao: PRESENTE|ATRASADO|FALTA|FALTA_JUSTIFICADA,
  uniforme: bool, biblia: bool, licao: bool,
  atualizadoEm, atualizadoPor)
  PK(reuniaoId, dbvId)

RegistroAula(id, aulaPlanejadaId?, classeId, data, instrutorId,
  substituicaoId?,                               # idem Reuniao, para o link de classe
  clienteUuid UNIQUE, registradoEm)
  # aulaPlanejadaId nulo = aula extra fora do cronograma
PresencaAula(registroAulaId, dbvId, presente: bool)

TarefaCasa(id, classeId, registroAulaId UNIQUE, anoClube, criadaPorId, criadaEm,
  encerradaEm?, encerradaPorId?)                 # tarefa para casa passada num registro de aula
TarefaItem(id, tarefaId, requisitoId?, especialidadeId?, criadoPorId,
  removidoEm?, removidoPorId?)                   # CHECK: exatamente um de requisitoId e especialidadeId
  UNIQUE(tarefaId, requisitoId) e UNIQUE(tarefaId, especialidadeId) entre os não removidos
```
A pendência da tarefa (quem ainda deve o quê) é **derivada**, nunca guardada: sai dos itens ativos
contra o que cada desbravador já concluiu.
```
```

ChamadaAlteracao(id, reuniaoId, dbvId, antes: json, depois: json,
  alteradoPor, alteradoEm, origem: EDICAO|CONFLITO_SYNC)
  # "alterações ficam registradas": cada correção guarda o antes e o depois por DBV.
  # CONFLITO_SYNC = dois aparelhos gravaram a mesma chamada; vale a última, e o Adm vê a outra.

Frequência (função em `shared`): `presenças (PRESENTE+ATRASADO) ÷ reuniões realizadas da
unidade no período em que o DBV era membro dela`. `FALTA_JUSTIFICADA` conta como falta na
frequência, mas não sofre desconto de pontos. A chamada não guarda pontos.

## 7. Ranking

```
CriterioRanking(id, nome, descricao, pontos: int, ativo, ordem,
  gatilho: PRESENCA|PONTUALIDADE|UNIFORME|BIBLIA|LICAO|REQUISITO|ESPECIALIDADE|MANUAL,
  lancadoPor: CONSELHEIRO|INSTRUTOR|ADM,
  padrao: bool)                                  # os 8 de fábrica não podem ser apagados, só desligados

LancamentoPontos(id, dbvId, criterioId, pontos: int,   # valor COPIADO do critério no momento
  data: date,
  origemTipo: CHAMADA|REQUISITO|ESPECIALIDADE|MANUAL|FALTA,
  origemId,                                      # chave da origem, para estornar
  lancadoPor, estornadoEm?)
  UNIQUE(origemTipo, origemId, criterioId) entre os não estornados
```

**`LancamentoPontos` é a única fonte da pontuação.** Salvar uma chamada gera (ou regrava) os
lançamentos daquela chamada; desmarcar requisito estorna o lançamento. Mudar o valor do critério
não toca no passado (decisão 8).

- Só `Desbravador.tipo=DBV` pontua e aparece no ranking; o LIDER não.
- Pontuação no período = soma dos lançamentos não estornados com `data` no período corrente
  (mês, trimestre ou ano do clube, conforme a configuração).
- Posição: ordem decrescente de pontos; empate → maior frequência → nome.
- Variação: posição atual comparada à posição calculada até o dia de reunião anterior.
- Ranking de unidade = **média** de pontos por DBV ativo da unidade (soma favoreceria unidade
  grande).

## 8. Conteúdo, mídia e avisos

```
Album(id, unidadeId, titulo, data, reuniaoId?, eventoId?)
Foto(id, albumId, arquivoId, legenda?, enviadaPor, clienteUuid UNIQUE)
  # legenda é digitada uma vez por lote e copiada para cada foto
  # fotos são visíveis só para líderes logados do clube; nunca em link público

Material(id, classeId, secaoId?, titulo, tipo: PDF|APRESENTACAO|VIDEO|LINK,
  arquivoId?, url?, enviadoPor)
Arquivo(id, caminho, mime, bytes, larguraPx?, alturaPx?, miniaturaCaminho?)

Observacao(id, autorId, classeId, alvo: AULA|DBV, registroAulaId?, dbvId?,
  titulo?, texto, editadaEm?, removidaEm?)
  # nunca exposta fora de instrutores e Adm; ver "outros instrutores" depende de permissão

Notificacao(id, usuarioId,
  tipo: CONFLITO_CRONOGRAMA|CRONOGRAMA_ENVIADO|CRONOGRAMA_PUBLICADO|PEDIDO_AO_ADM|CONVITE|...,
  titulo, link, lidaEm?)

Atividade(id, autorId, tipo, descricao, link, criadaEm)   # feed da visão geral do Adm
```

## 9. O que mudou em relação ao rascunho do LEIA-ME

| Rascunho | Agora | Por quê |
|---|---|---|
| `Usuario.perfil` único + `permissoes[]` | `Vinculo` por papel + `PermissaoAjuste` | Uma pessoa com dois papéis; vários clubes |
| `Unidade.conselheiroId` | `VinculoUnidade` | Mais de um conselheiro por unidade |
| `Classe.instrutorIds[]` | `VinculoClasse` | Mesmo motivo, e o escopo do instrutor sai daqui |
| `Classe.tipo: REGULAR\|AVANCADA\|AGRUPADA` | `tipo: REGULAR\|AVANCADA` + `trilha: INDIVIDUAL\|AGRUPADAS` | Agrupadas também têm avançada; trilha separa o supletivo |
| — | `Desbravador.tipo: DBV\|LIDER` | Quem faz Agrupadas costuma ser líder, fora de unidade e ranking |
| `Desbravador.unidadeId` / `classeAtualId` | `MembroUnidade` e `MatriculaClasse` com datas/ano | Frequência com denominador certo; troca de classe sem perder histórico |
| `Desbravador.responsavel, telefone` | Campos separados + `autorizacaoImagem` + `nomePublico` | Tela junta os dois; LGPD e ranking público |
| `Chamada.presente, atrasou, pontos` | `situacao` + `licao`; sem pontos | Falta justificada; pontos só em `LancamentoPontos` (uma fonte) |
| `Cronograma.semestre` | `anoClube` + `inicio/fim` + `status` | O calendário é anual; publicação tem estado |
| `AulaPlanejada.requisitoIds[]` | `AulaRequisito` com unicidade | Garante "um requisito, uma data" no banco |
| `EventoCalendario` | + `temReuniao`, `temClasse`, horário, local; tipos `FERIAS` e `REUNIAO_EXTRA` | "Sem reunião" ≠ "sem classe" (acampamento não tem reunião mas é bom para campo); extra e férias têm tipo próprio |
| `RequisitoConcluido` e `EspecialidadeConcluida` | + `registroAulaId?` + remoção lógica | Reposição fora da aula; estorno de pontos |
| `Foto.album` texto | `Album` + `Foto.legenda` | Álbum por reunião, evento ou avulso; legenda do lote |
| — | `ChamadaAlteracao` | Correção de chamada e conflito entre aparelhos ficam registrados |
| `Observacao` | + `classeId`, `titulo`, remoção | Instrutor com duas classes; editar/apagar |
| `CriterioRanking.lancadoPor` | + `gatilho`, `padrao` | O sistema precisa saber quando lançar cada critério |
| `LancamentoPontos` | + `origemTipo`, `estornadoEm`, unicidade | Estorno e regravação da chamada sem duplicar |
| — | `ConfiguracaoClube`, `Notificacao`, `Atividade`, `Convite`, `RefreshToken`, `Arquivo`, `AreaEspecialidade`, `MembroUnidade`, `MatriculaClasse` | Exigidos pelas telas ou pelas decisões |
