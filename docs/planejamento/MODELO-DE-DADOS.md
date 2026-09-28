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
  status: CONVIDADO|ATIVO|INATIVO, ultimoAcessoEm)
  # sem clubeId: a mesma pessoa pode estar em mais de um clube

Vinculo(id, usuarioId, clubeId, papel: ADM|CONSELHEIRO|INSTRUTOR, ativo)
  UNIQUE(usuarioId, clubeId, papel)
VinculoUnidade(vinculoId, unidadeId)             # conselheiro → unidades (1 ou mais)
VinculoClasse(vinculoId, classeId)               # instrutor → classes (1 ou mais)
PermissaoAjuste(vinculoId, permissao: texto, concedida: bool)
  # só as diferenças em relação ao padrão do papel; o catálogo vive no código (shared)

Convite(id, usuarioId, tokenHash, expiraEm, usadoEm?)
RefreshToken(id, usuarioId, tokenHash, expiraEm, revogadoEm?, aparelho)
```

Uma pessoa conselheira e instrutora tem **dois Vínculos** no mesmo clube. O app mostra o
seletor de papel quando há mais de um.

## 2. Desbravadores e unidades

```
Desbravador(id, nome, nomePublico,               # "Ana C." — calculado, editável
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

## 3. Classes, requisitos e especialidades

```
Classe(id, nome, idade?, cor, tipo: REGULAR|AVANCADA|AGRUPADA,
  classeBaseId?,                                 # avançada aponta para a regular
  ordem, origem: OFICIAL|CLUBE, ativa,
  quemMontaCronograma: ADM|INSTRUTOR = ADM)      # a trava única do cronograma
  # instrutores vêm de VinculoClasse

SecaoRequisito(id, classeId, codigo: "G"|"DE"|..., nome, ordem)
Requisito(id, secaoId, codigo: "DE1", texto, campo: bool, ordem, ativo)

AreaEspecialidade(id, nome, cor, ordem)
Especialidade(id, areaId, nome, codigo?, origem: OFICIAL|CLUBE, ativa)
```

Os dados `OFICIAL` vêm da carga inicial (`docs/planejamento/dados/cadernos/*.json`) e são
**compartilhados por todos os clubes** (sem `clubeId`). Um clube pode desativar ou acrescentar os
seus (`origem=CLUBE`, com `clubeId`).

## 4. Matrícula, progresso e investidura

```
MatriculaClasse(id, dbvId, classeId, anoClube: int,
  status: CURSANDO|CONCLUIDA|INVESTIDA|DESISTIU,
  investidaEm?: date)
  UNIQUE(dbvId, classeId, anoClube)
  # um DBV pode cursar a regular e uma avançada no mesmo ano

RequisitoConcluido(id, dbvId, requisitoId, concluidoEm: date,
  instrutorId, registroAulaId?,                  # nulo = marcado fora da aula (reposição, casa)
  removidoEm?, removidoPor?)                     # desmarcar = remoção lógica, com estorno de pontos
  UNIQUE(dbvId, requisitoId) entre os não removidos

EspecialidadeConcluida(id, dbvId, especialidadeId, concluidaEm, instrutorId,
  removidoEm?, removidoPor?)
```

**Regras derivadas (funções em `shared`, não colunas):**
- `% da classe = requisitos concluídos (não removidos) da classe ÷ requisitos ativos da classe`.
  A média da turma é a média dos % exatos, arredondada só no fim.
- `pronto para investidura = % da classe = 100%`.
- "Classe atual" do DBV = matrícula `CURSANDO` do ano corrente na classe regular.

## 5. Calendário e cronograma

```
EventoCalendario(id, nome, tipo: SEM_REUNIAO|ACAMPAMENTO|EVENTO|FERIADO,
  inicio: date, fim: date, horario?, local?,
  bloqueiaAula: bool, bomParaCampo: bool,
  cancelaReuniao: bool)                          # separa "não há reunião" de "não há aula"
```
A reunião regular é **implícita**: todo `diaReuniao` sem evento com `cancelaReuniao`. Eventos de
vários dias valem para **todos os domingos do intervalo**. Com dois eventos na mesma data, basta
um com `bloqueiaAula` para bloquear; `bomParaCampo` vale se qualquer um tiver.

Padrões por tipo (editáveis no formulário): SEM_REUNIAO → cancela e bloqueia; EVENTO → bloqueia;
ACAMPAMENTO → cancela a reunião, bom para campo, **não** bloqueia; FERIADO → nada.

```
Cronograma(id, classeId, anoClube, inicio: date, fim: date,
  status: RASCUNHO|PUBLICADO, publicadoEm?, publicadoPor?)
  UNIQUE(classeId, anoClube)

AulaPlanejada(id, cronogramaId, data, horario?, local?, titulo?,  # "Saída de campo"
  cancelada: bool)
AulaRequisito(aulaPlanejadaId, requisitoId)
  UNIQUE(cronogramaId, requisitoId)              # cada requisito em uma data só (via aula)
```

Um evento criado ou alterado que bloqueia a data de uma `AulaPlanejada` gera `Notificacao` para
os instrutores da classe (e para o Adm, se `quemMontaCronograma=ADM`) e marca a aula com
**conflito** (derivado, não coluna) até alguém mover os requisitos.

## 6. Reunião e aula

```
Reuniao(id, unidadeId, data, horario, local?, eventoId?,  # evento, se a "reunião" foi um evento
  observacoes?, registradaPor, registradaEm,
  clienteUuid UNIQUE)                            # id gerado no celular, para sincronizar sem duplicar
  UNIQUE(unidadeId, data)

Chamada(reuniaoId, dbvId,
  situacao: PRESENTE|ATRASADO|FALTA|FALTA_JUSTIFICADA,
  uniforme: bool, biblia: bool, licao: bool,
  atualizadoEm, atualizadoPor)
  PK(reuniaoId, dbvId)

RegistroAula(id, aulaPlanejadaId?, classeId, data, instrutorId,
  clienteUuid UNIQUE, registradoEm)
  # aulaPlanejadaId nulo = aula extra fora do cronograma
PresencaAula(registroAulaId, dbvId, presente: bool)
```

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

- Pontuação no período = soma dos lançamentos não estornados com `data` no período corrente
  (mês, trimestre ou ano do clube, conforme a configuração).
- Posição: ordem decrescente de pontos; empate → maior frequência → nome.
- Variação: posição atual comparada à posição calculada até o dia de reunião anterior.
- Ranking de unidade = **média** de pontos por DBV ativo da unidade (soma favoreceria unidade
  grande).

## 8. Conteúdo, mídia e avisos

```
Album(id, unidadeId, titulo, data, reuniaoId?, eventoId?)
Foto(id, albumId, arquivoId, enviadaPor, visibilidade: LIDERANCA|UNIDADE)
FotoPessoa(fotoId, dbvId)                        # quem aparece — bloqueia se sem autorização

Material(id, classeId, secaoId?, titulo, tipo: PDF|APRESENTACAO|VIDEO|LINK,
  arquivoId?, url?, enviadoPor)
Arquivo(id, caminho, mime, bytes, larguraPx?, alturaPx?, miniaturaCaminho?)

Observacao(id, autorId, classeId, alvo: AULA|DBV, registroAulaId?, dbvId?,
  titulo?, texto, editadaEm?, removidaEm?)
  # nunca exposta fora de instrutores e Adm; ver "outros instrutores" depende de permissão

Notificacao(id, usuarioId, tipo: CONFLITO_CRONOGRAMA|CRONOGRAMA_PUBLICADO|CONVITE|...,
  titulo, link, lidaEm?)

Atividade(id, autorId, tipo, descricao, link, criadaEm)   # feed da visão geral do Adm
```

## 9. O que mudou em relação ao rascunho do LEIA-ME

| Rascunho | Agora | Por quê |
|---|---|---|
| `Usuario.perfil` único + `permissoes[]` | `Vinculo` por papel + `PermissaoAjuste` | Uma pessoa com dois papéis; vários clubes |
| `Unidade.conselheiroId` | `VinculoUnidade` | Mais de um conselheiro por unidade |
| `Classe.instrutorIds[]` | `VinculoClasse` | Mesmo motivo, e o escopo do instrutor sai daqui |
| `Desbravador.unidadeId` / `classeAtualId` | `MembroUnidade` e `MatriculaClasse` com datas/ano | Frequência com denominador certo; troca de classe sem perder histórico |
| `Desbravador.responsavel, telefone` | Campos separados + `autorizacaoImagem` + `nomePublico` | Tela junta os dois; LGPD e ranking público |
| `Chamada.presente, atrasou, pontos` | `situacao` + `licao`; sem pontos | Falta justificada; pontos só em `LancamentoPontos` (uma fonte) |
| `Cronograma.semestre` | `anoClube` + `inicio/fim` + `status` | O calendário é anual; publicação tem estado |
| `AulaPlanejada.requisitoIds[]` | `AulaRequisito` com unicidade | Garante "um requisito, uma data" no banco |
| `EventoCalendario` | + `cancelaReuniao`, horário, local | "Sem reunião" ≠ "sem aula" (acampamento cancela reunião mas é bom para campo) |
| `RequisitoConcluido` | + `registroAulaId?` + remoção lógica | Reposição fora da aula; estorno de pontos |
| `Foto.album` texto | `Album` + `FotoPessoa` | Álbum por reunião/evento; autorização de imagem |
| `Observacao` | + `classeId`, `titulo`, remoção | Instrutor com duas classes; editar/apagar |
| `CriterioRanking.lancadoPor` | + `gatilho`, `padrao` | O sistema precisa saber quando lançar cada critério |
| `LancamentoPontos` | + `origemTipo`, `estornadoEm`, unicidade | Estorno e regravação da chamada sem duplicar |
| — | `ConfiguracaoClube`, `Notificacao`, `Atividade`, `Convite`, `RefreshToken`, `Arquivo`, `AreaEspecialidade`, `MembroUnidade`, `MatriculaClasse` | Exigidos pelas telas ou pelas decisões |
