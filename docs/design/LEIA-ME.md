# Aplicativo do Desbravador — handoff de design

Pacote para quem vai **implementar** as telas. Aqui estão as 25 telas desenhadas, os tokens visuais e as regras de negócio que cada tela assume.

> Todos os nomes, números e datas nas telas são **fictícios**, só para dar contexto. "[Nome do Clube]" é um marcador de texto.

---

## 1. O produto em uma frase

Sistema web + **PWA** para o Clube de Desbravadores (Igreja Adventista, jovens de 10 a 15 anos). Ele organiza três coisas:
- a secretaria das **unidades**, que são pequenos grupos com um conselheiro;
- o ensino das **classes**, que são os currículos por idade dados pelos instrutores;
- um **ranking público** de pontuação, o "DBV Destaque" (DBV = desbravador).

## 2. Perfis (roles)

| Perfil | Onde usa | O que faz |
|---|---|---|
| **Adm** | Desktop (web) | Cadastros, unidades, classes/especialidades, **calendário do clube**, cronogramas, regras do ranking, relatórios, permissões |
| **Conselheiro** | Celular (PWA) | Cuida de **uma unidade**: chamada da reunião (presença, atraso, uniforme, Bíblia), histórico e galeria de fotos |
| **Instrutor** | Celular (PWA) | Cuida de **uma ou mais classes**: cronograma, registro de aula (quem fez cada requisito), materiais, observações, progresso e especialidades |

O ranking público e o perfil do DBV são comuns a todos. O ranking também pode ser visto sem login, pelo botão na tela de Login.

## 3. Inventário de telas

Os arquivos ficam em `telas/`. As telas de celular têm 390×844; as de desktop, 1280×832.

### Comuns (celular)
| Arquivo | Tela | Observações |
|---|---|---|
| `Main.dc.html` | Login | Seletor de perfil + e-mail/senha + atalho público para o ranking |
| `Inicio-Conselheiro.dc.html` | Início do conselheiro | Card da próxima reunião → "Fazer chamada", números da unidade, atalhos, top 3 da unidade |
| `Inicio-Instrutor.dc.html` | Início do instrutor | Próxima aula, progresso das classes, atalhos, alerta de DBVs atrasados |
| `Ranking.dc.html` | Ranking DBV Destaque | Pódio top 3, abas Mês/Trimestre/Ano, filtro por unidade, variação de posição |
| `Perfil-DBV.dc.html` | Perfil do DBV | Dados, posição/pontos/frequência, anel de % da classe, progresso por seção, classes e especialidades concluídas |

### Conselheiro (celular)
| Arquivo | Tela |
|---|---|
| `Minha-Unidade.dc.html` | Lista dos DBVs da unidade (frequência abaixo de 70% fica em vermelho) |
| `Registro-Reuniao.dc.html` | **Chamada**: tocar no nome = presente; depois marcar Atrasou / Uniforme / Bíblia; os pontos somam ao vivo |
| `Historico-Reunioes.dc.html` | Abas "Por reunião" (lista) e "Por DBV" (grade das últimas 8 reuniões: presente / atraso / falta) |
| `Galeria.dc.html` | Álbuns por reunião/evento + botão "Enviar fotos" |

### Instrutor (celular)
| Arquivo | Tela |
|---|---|
| `Minhas-Classes.dc.html` | Cards por classe, na cor oficial da classe |
| `Cronograma.dc.html` | Linha do tempo das aulas (dada / hoje / planejada) + botão "Montar cronograma" |
| `Registro-Aula.dc.html` | Grade DBV × requisitos da aula + resumo "O que falta fazer" |
| `Materiais.dc.html` | Upload de arquivo/link, agrupado por seção do caderno |
| `Observacoes.dc.html` | Notas por aula ou por DBV, visíveis só a instrutores e ao Adm |
| `Progresso-Classe.dc.html` | Média da turma + % por DBV (abaixo de 40% fica em laranja) |
| `Especialidades.dc.html` | Escolher o DBV → marcar especialidades concluídas, agrupadas por área |

### Adm (desktop)
| Arquivo | Tela |
|---|---|
| `Adm-Inicio.dc.html` | Visão geral: indicadores, progresso por classe, atividade recente, unidades |
| `Adm-Desbravadores.dc.html` | Tabela + painel lateral de edição (unidade, classe, responsável) |
| `Adm-Usuarios.dc.html` | Usuários + painel de **perfil e permissões** (as permissões mudam conforme o perfil) |
| `Adm-Unidades.dc.html` | Cards de unidades + mover membros entre "na unidade" e "sem unidade" |
| `Adm-Classes.dc.html` | Classes (seções e requisitos do caderno) e catálogo de especialidades por área |
| `Adm-Calendario.dc.html` | **Calendário anual do clube** (mês a mês) + formulário de evento |
| `Montar-Cronograma.dc.html` | **Montagem do cronograma da classe** com o calendário do clube visível |
| `Adm-Ranking.dc.html` | Critérios de pontuação (ligar/desligar, pontos, quem lança) + simulação |
| `Adm-Relatorios.dc.html` | Frequência mensal, especialidades mais concluídas, tabela por classe, exportar PDF/Excel |

## 4. Navegação

- **Conselheiro**, barra inferior: Início · Unidade · Reuniões · Ranking
- **Instrutor**, barra inferior: Início · Classes · Cronograma · Ranking
- **Adm**, menu lateral: Visão geral · Desbravadores · Usuários · Unidades · Classes e especialidades · Calendário do clube · Cronogramas · Ranking · Relatórios
- Os `<a href="X.dc.html">` dentro das telas indicam o destino de cada botão ou link. Trate cada arquivo como uma rota. Sugestão de rotas: `/login`, `/inicio`, `/ranking`, `/dbv/:id`, `/unidade`, `/reunioes/nova`, `/reunioes`, `/galeria`, `/classes`, `/cronograma`, `/aulas/:id/registro`, `/materiais`, `/observacoes`, `/classes/:id/progresso`, `/especialidades`, `/adm/...`.

## 5. Regras de negócio que as telas assumem

### Ranking
- Critérios padrão, lançados pelo **conselheiro** na chamada:
  - Presença: +10
  - Pontualidade: +5
  - Uniforme completo: +5
  - Bíblia: +3
  - Lição/devocional: +3, desligado por padrão
- Lançados pelo **instrutor**: requisito concluído +4, especialidade concluída +15.
- Lançado pelo **Adm**: participação em evento, +20.
- Todos os critérios são configuráveis: ligar/desligar e mudar o valor. Critérios personalizados podem ser criados.
- Se o DBV está ausente, atraso, uniforme e Bíblia ficam zerados.
- O período do ranking é configurável (mês, trimestre ou ano), assim como exibir ou não o ranking no login e por unidade. Descontar pontos por falta é uma opção, desligada por padrão.

### Classes e requisitos
- Classes regulares, com idade e **cor oficial**: Amigo 10 (azul), Companheiro 11 (vermelho), Pesquisador 12 (verde), Pioneiro 13 (cinza), Excursionista 14 (roxo), Guia 15 (amarelo). Existem também as classes avançadas e as Classes Agrupadas.
- Cada classe tem um **caderno de requisitos pré-definido**, dividido em seções: Gerais, Descoberta espiritual, Servindo aos outros, Desenvolvendo amizade, Saúde e aptidão física, Organização e liderança, Estudo da natureza, Arte de acampar, Enriquecendo a vida.
- O requisito tem um código curto (ex.: `DE1`, `AC3`) e pode ter a etiqueta **CAMPO**, para atividades ao ar livre.
- **% da classe** = requisitos concluídos ÷ total de requisitos da classe.

### Calendário do clube → cronograma (regra central)
- O Adm cadastra os eventos do ano. Tipos: reunião regular (domingos, implícita), **sem reunião**, **acampamento/campo**, **evento do clube**, **feriado**.
- Cada evento tem duas marcações:
  - `bloqueiaAula`: "não há aula de classe neste dia";
  - `bomParaCampo`: "bom para requisitos de campo".
- Na montagem do cronograma:
  - datas com `bloqueiaAula` aparecem **hachuradas e sem o botão "Colocar aqui"**;
  - se o requisito selecionado tem a etiqueta CAMPO, datas com `bomParaCampo` ficam **destacadas em verde** como sugestão.
- Se o Adm cria ou altera um evento que bate com aulas já agendadas, o responsável pelo cronograma deve ser **avisado** (notificação).
- Cada requisito fica em uma data só. Uma data pode ter vários requisitos.

### Quem monta o cronograma
- Por classe, o Adm escolhe **"Adm"** ou **"Instrutor liberado"**.
- Com o instrutor liberado, ele edita. O Adm continua podendo revisar e **publicar**.
- A tela de Usuários tem a permissão "Montar cronograma da classe", desligada por padrão para instrutores.

### Permissões padrão por perfil
- **Conselheiro**: registrar reuniões, enviar fotos, ver os DBVs da própria unidade. Editar dados dos DBVs e ver relatórios da unidade ficam desligados por padrão.
- **Instrutor**: registrar aulas, marcar requisitos/especialidades, enviar materiais, ver relatórios da classe. Montar cronograma e ver observações de outros instrutores ficam desligados por padrão.
- **Adm**: tudo.

### Observações
- Visíveis só a instrutores e ao Adm, **nunca** ao DBV nem ao ranking público.

## 6. Rascunho do modelo de dados

```
Clube(id, nome)
Usuario(id, nome, email, perfil: ADM|CONSELHEIRO|INSTRUTOR, status, permissoes[])
Unidade(id, nome, tipo: MISTA|MASCULINA|FEMININA, conselheiroId, gritoDeGuerra)
Desbravador(id, nome, nascimento, sexo, unidadeId, classeAtualId, responsavel, telefone)
Classe(id, nome, idade, cor, tipo: REGULAR|AVANCADA|AGRUPADA, instrutorIds[])
SecaoRequisito(id, classeId, codigo, nome, ordem)
Requisito(id, secaoId, codigo, descricao, campo: bool)
Especialidade(id, nome, area)
EventoCalendario(id, nome, tipo, inicio, fim, bloqueiaAula: bool, bomParaCampo: bool)
Cronograma(id, classeId, semestre, responsavel: ADM|INSTRUTOR, publicado: bool)
AulaPlanejada(id, cronogramaId, data, requisitoIds[])
Reuniao(id, unidadeId, data, observacoes)
Chamada(reuniaoId, dbvId, presente, atrasou, uniforme, biblia, pontos)
RegistroAula(id, aulaPlanejadaId, data)
PresencaAula(registroAulaId, dbvId, presente)
RequisitoConcluido(dbvId, requisitoId, data, instrutorId)
EspecialidadeConcluida(dbvId, especialidadeId, data, instrutorId)
Observacao(id, autorId, alvo: AULA|DBV, alvoId, texto, criadaEm)
Material(id, classeId, secaoId, tipo: PDF|PPT|VIDEO|LINK, url, nome)
Foto(id, unidadeId, album, url, autorId)
CriterioRanking(id, nome, descricao, pontos, ativo, lancadoPor: CONSELHEIRO|INSTRUTOR|ADM)
LancamentoPontos(dbvId, criterioId, pontos, origemId, data)
```

## 7. Sistema visual

Os tokens estão em `tokens.css`, prontos para usar como variáveis CSS.

- **Fontes** (Google Fonts):
  - `Bricolage Grotesque` (600/700/800) em títulos e números grandes;
  - `Figtree` (400–700) no corpo e na interface.
- **Cores de base**:
  - verde-mata `#1F4D3A` (primária, fundo do menu lateral e botões);
  - creme `#F3E3C8` (destaque sobre o verde);
  - fundo `#F4F1EA`;
  - superfície `#FFFFFF`;
  - texto `#1B221F`;
  - texto secundário `#5B645F`;
  - bordas `#D9D3C5` e `#EFEBE1`.
- **Cores das classes** (sempre para identificar a classe: etiqueta, bolinha, barra, cabeçalho): veja `tokens.css`.
- **Estados**:
  - sucesso `#1F7A45`;
  - erro/queda `#B42318`;
  - alerta `#9A3412` sobre `#FBEFE3`;
  - campo/acampamento `#3F6212` sobre `#E6F0D4`.
- **Raios**: botões 12–14px, cards 16–22px, chips 999px.
- **Toque**: alvos com pelo menos 44px. Inputs com 16px de fonte no celular, para o iOS não dar zoom.
- **Ícones**: traço de 1.8–2px, estilo "lucide". Pode usar `lucide-react` ou similar no lugar dos SVGs inline.

## 8. Como ler os arquivos `.dc.html`

Eles foram exportados de uma ferramenta de design. **Não são código de produção**, são a referência visual e de comportamento.

- **Layout e estilo**: estão como `style="..."` inline, com medidas exatas. Converta para o CSS ou framework do projeto usando os tokens.
- **`{{nome}}`**: um valor dinâmico que vem de `renderVals()`, no `<script>` no fim do arquivo.
- **`<sc-for list="{{itens}}" as="x">`**: repetição, equivale a um `.map()`.
- **`<sc-if value="{{cond}}">`**: renderização condicional.
- **O `<script type="text/x-dc">`**: mostra o **comportamento esperado** da tela. Ali estão o estado, os handlers de clique e os cálculos (ex.: soma de pontos na chamada, % de progresso, bloqueio de datas no cronograma). Os dados ali são exemplos fixos; na implementação eles vêm da API.
- **`support.js`, `<x-dc>`, `<helmet>`**: são da ferramenta de design. Ignore.

## 9. Fora do escopo destas telas (a definir)

- Recuperação de senha, primeiro acesso e convite por e-mail.
- Estados vazios, carregamento e erro.
- Modo offline do PWA (a chamada no domingo pode ser feita sem internet e sincronizada depois — recomendado).
- Visualizador de foto em tela cheia e upload com câmera.
- Tela para o próprio DBV ou para os pais (não pedida).
- Dark mode.
