# Aplicativo do Desbravador — API

REST com JSON, prefixo `/api`. Todas as rotas, menos as marcadas **público**, exigem login e
operam no **clube ativo** do token. Validação de entrada e saída pelos schemas zod do pacote
`shared`. Coluna "Permissão" = o que o guard confere; "escopo" = unidade ou classe do vínculo.

Convenções: listas paginadas com `?pagina=&porPagina=`; datas em `YYYY-MM-DD`; erros no formato
`{ codigo, mensagem, campos? }` com mensagem em português pronta para a tela.

## Autenticação e conta

| Método e rota | O que faz | Permissão |
|---|---|---|
| `POST /auth/login` | E-mail + senha → access token + cookie de refresh + lista de vínculos | público |
| `POST /auth/refresh` | Renova o access token (rotaciona o refresh) | cookie |
| `POST /auth/logout` | Revoga o refresh deste aparelho | logado |
| `POST /auth/convite/aceitar` | Token do convite + senha → ativa a conta | público |
| `POST /auth/senha/esqueci` | Envia link de redefinição (resposta igual exista ou não o e-mail) | público |
| `POST /auth/senha/redefinir` | Token + nova senha | público |
| `GET /eu` | Usuário, vínculos (papéis, unidades, classes), permissões efetivas | logado |
| `POST /eu/papel-ativo` | Troca o papel/clube ativo (novo access token) | logado |

## Clube e configuração

| Método e rota | O que faz | Permissão |
|---|---|---|
| `GET /clube` | Dados e configuração do clube | logado |
| `PATCH /clube/configuracao` | Dia/hora da reunião, limiares, ano do clube | `clube.configurar` (Adm) |

## Desbravadores

| Método e rota | O que faz | Permissão |
|---|---|---|
| `GET /desbravadores?unidadeId=&classeId=&busca=&ativo=` | Tabela do Adm, lista da unidade | `dbv.ver` + escopo |
| `POST /desbravadores` | Cadastra (com unidade e matrícula na classe do ano) | `dbv.cadastrar` |
| `GET /desbravadores/{id}` | Perfil: dados, pontos, posição, frequência, % da classe por seção, classes investidas, especialidades | `dbv.ver` + escopo; responsável/telefone só com `dbv.ver_contato` |
| `PATCH /desbravadores/{id}` | Edita dados, autorização de imagem | `dbv.editar` (conselheiro: desligado por padrão) |
| `POST /desbravadores/{id}/inativar` | Saída do clube | `dbv.cadastrar` |
| `PUT /desbravadores/{id}/unidade` | Move de unidade (fecha o `MembroUnidade` aberto, abre outro) | `unidade.gerenciar` |
| `POST /desbravadores/{id}/matriculas` | Matricula numa classe do ano | `classe.gerenciar` |
| `POST /desbravadores/{id}/matriculas` · efeito | Matricular na regular cria também a matrícula da avançada ligada | — |
| `POST /matriculas/{id}/investir` | Marca investidura da regular ou da avançada (cada uma exige 100% da própria classe, ou justificativa do Adm) | `classe.gerenciar` |

## Usuários e vínculos

| Método e rota | O que faz | Permissão |
|---|---|---|
| `GET /usuarios?papel=&busca=&pagina=&porPagina=` | Lista do clube em ordem de nome, paginada (`porPagina` padrão 25, máximo 100), com situação no clube, papéis e `ultimoAcessoEm`, mais a contagem por papel | `usuario.gerenciar` |
| `GET /usuarios/{id}` | Um usuário, com todos os vínculos do clube (inclusive inativos) e `ultimoAcessoEm` | `usuario.gerenciar` |
| `POST /usuarios` | Convida: nome, e-mail, gênero e ao menos um vínculo; manda o convite. E-mail que já existe só ganha os vínculos (a resposta ecoa o que foi enviado) | `usuario.gerenciar` |
| `PATCH /usuarios/{id}` | Nome e gênero, só de quem ainda é convidado e não tem vínculo em outro clube (senão 422 `REGRA`); e-mail nunca | `usuario.gerenciar` |
| `POST /usuarios/{id}/vinculos` | Acrescenta um papel com unidades ou classes e ajustes; papel já ativo → 409 `CONFLITO`; papel removido volta no mesmo vínculo, com o escopo e os ajustes do pedido | `usuario.gerenciar` |
| `POST /usuarios/{id}/desativar` | Desativa todos os vínculos da pessoa neste clube; o último Adm ativo não sai (422 `ULTIMO_ADM`) | `usuario.gerenciar` |
| `POST /usuarios/{id}/convite` | Reenvia o convite | `usuario.gerenciar` |
| `PUT /vinculos/{id}` | Unidades ou classes, ajustes de permissão e `ativo` de um vínculo — o papel não muda. `ativo: false` remove o papel (nada se apaga); o último Adm ativo não sai (422 `ULTIMO_ADM`) | `usuario.gerenciar` |
| `GET /permissoes/catalogo` | Catálogo e padrão por papel (monta os interruptores de "Ajustar o que pode fazer") | `usuario.gerenciar` |

## Unidades

| Método e rota | O que faz | Permissão |
|---|---|---|
| `GET /unidades` | Cards: nome, tipo, conselheiros, nº de DBVs (só desbravador ativo com passagem aberta; diretoria e inativos não contam), frequência do mês | logado |
| `GET /unidades/{id}` | Uma unidade, no formato do card (mesmo `totalMembros`); inativa só para o Adm | `dbv.ver` + escopo |
| `POST /unidades` · `PATCH /unidades/{id}` | Cria e edita (inclui grito de guerra) | `unidade.gerenciar` |
| `GET /unidades/{id}/membros` | Membros atuais com frequência e classe | `dbv.ver` + escopo |
| `GET /unidades/sem-membros` | DBVs ativos sem unidade (coluna "Sem unidade") | `unidade.gerenciar` |

## Classes, requisitos e especialidades

| Método e rota | O que faz | Permissão |
|---|---|---|
| `GET /classes?tipo=&trilha=` | Classes com cor, idade, trilha, total de requisitos, instrutores, avançada ligada | logado |
| `GET /classes/{id}` | Seções e requisitos | logado |
| `PATCH /classes/{id}` | `quemMontaCronograma`, ativa | `classe.gerenciar` |
| `POST /classes` | Classe do clube (origem CLUBE) | `classe.gerenciar` |
| `POST /classes/{id}/requisitos` · `PATCH /requisitos/{id}` | Acrescenta/edita requisito (oficial: só desativar ou marcar CAMPO) | `classe.gerenciar` |
| `GET /classes/{id}/progresso` | Média da turma, prontos, abaixo do limiar, % por DBV — de uma classe só (a regular e a avançada são chamadas separadas) | `classe.ver_relatorio` + escopo |
| `GET /especialidades?areaId=&busca=` | Catálogo por área | logado |
| `POST /especialidades` | Especialidade do clube | `classe.gerenciar` |

## Progresso do DBV

| Método e rota | O que faz | Permissão |
|---|---|---|
| `PUT /desbravadores/{id}/requisitos/{requisitoId}` | Marca concluído fora da aula (gera pontos) | `requisito.marcar` + escopo |
| `DELETE /desbravadores/{id}/requisitos/{requisitoId}` | Desmarca (estorna pontos) | `requisito.marcar` + escopo |
| `GET /desbravadores/{id}/especialidades` | Concluídas por área | `dbv.ver` + escopo |
| `PUT` / `DELETE /desbravadores/{id}/especialidades/{espId}` | Marca / desmarca (pontos / estorno) | `requisito.marcar` |

## Calendário

| Método e rota | O que faz | Permissão |
|---|---|---|
| `GET /calendario?ano=` | Eventos + dias de reunião (domingos implícitos e reuniões extras), já resolvidos | logado |
| `POST /calendario/eventos` | Cria; responde com as aulas em conflito e dispara notificações | `calendario.gerenciar` |
| `GET /calendario/eventos/{id}` | Um evento do clube (404 se removido ou de outro clube) | logado |
| `PATCH` / `DELETE /calendario/eventos/{id}` | Edita / exclui; idem conflitos. Evento `CLASSE_BIBLICA` (criado só pela edição da Classe Bíblica) não se cria, edita nem exclui aqui: 422 "Este encontro é da Classe Bíblica: remarque ou cancele pela edição." | `calendario.gerenciar` |
| `GET /calendario/proxima-reuniao?unidadeId=` | Data, hora e local da próxima reunião (card do Início) | logado |

## Cronogramas

| Método e rota | O que faz | Permissão |
|---|---|---|
| `GET /classes/{id}/cronograma?ano=` | Aulas com data, requisitos, estado (dada/hoje/planejada/conflito) | escopo da classe ou Adm |
| `GET /classes/{id}/cronograma/datas` | Datas do período com `bloqueada`, `bomParaCampo`, evento e requisitos já alocados (tela de montagem) | quem monta |
| `PUT /cronogramas/{id}/requisitos/{requisitoId}` | `{ data }` → coloca ou move o requisito (recusa data bloqueada; nas Agrupadas aceita qualquer data e só devolve aviso) | quem monta |
| `POST /cronogramas/{id}/aulas` | Cria data livre com horário e local (Agrupadas) | quem monta |
| `DELETE /cronogramas/{id}/requisitos/{requisitoId}` | Tira da data | quem monta |
| `PATCH /aulas-planejadas/{id}` | Horário, local, título | quem monta |
| `POST /cronogramas/{id}/enviar` | Rascunho → enviado; notifica o Adm | instrutor que monta |
| `POST /cronogramas/{id}/publicar` | Rascunho/enviado → publicado; notifica instrutores | Adm |
| `POST /pedidos-ao-adm` | `{ tipo: LIBERAR_CRONOGRAMA\|UNIDADE_SEM_DBV, classeId?/unidadeId? }` → notificação ao Adm | logado |

"Quem monta" = Adm sempre; instrutor da classe só se `Classe.quemMontaCronograma=INSTRUTOR`.
Instrutor que não monta vê só o cronograma **publicado**.

## Reuniões e chamada

| Método e rota | O que faz | Permissão |
|---|---|---|
| `GET /unidades/{id}/reunioes?de=&ate=` | Aba "Por reunião": presentes, atrasos, uniformes, % | `reuniao.ver` + escopo |
| `GET /unidades/{id}/frequencia?ultimas=8` | Aba "Por DBV": grade P/A/F/J | `reuniao.ver` + escopo |
| `GET /reunioes/{id}` | Detalhe, chamada completa, pontos lançados, alterações (quem/quando) | `reuniao.ver` + escopo |
| `PUT /sync/reunioes/{clienteUuid}` | Grava a chamada inteira (idempotente; usado online e offline) → pontos calculados | `reuniao.registrar` + escopo |

## Aulas

| Método e rota | O que faz | Permissão |
|---|---|---|
| `GET /classes/{id}/aulas?anoClube=` | Aulas registradas ("N aulas dadas"), data decrescente | `aula.registrar` + escopo |
| `GET /aulas/{id}` | Detalhe: presença e requisitos marcados | `aula.registrar` + escopo |
| `PUT /sync/aulas/{clienteUuid}` | Grava presença + requisitos cumpridos, tarefa para casa e entregas de especialidade (idempotente) → pontos | `aula.registrar` + escopo |

## Sincronização offline

| Método e rota | O que faz | Permissão |
|---|---|---|
| `GET /sync/pacote` | Pacote do domingo do usuário: DBVs das unidades/classes, critérios ativos, aulas das próximas 2 semanas, requisitos já concluídos, `versao`; para quem tem `classebiblica.chamada`, também `classeBiblica` (encontros de ±7 dias, grupos do escopo, presenças e chamadas já registradas) | logado |
| `PUT /sync/reunioes/{uuid}` · `PUT /sync/aulas/{uuid}` | (acima) | — |
| `PUT /sync/classe-biblica/encontros/{id}/grupos/{grupoId}` | Chamada de um grupo num encontro (presente e participou por DBV, versão vista, id de envio); gera os pontos | `classebiblica.chamada` + escopo |

## Classe Bíblica

| Método e rota | O que faz | Permissão |
|---|---|---|
| `GET` / `POST /classe-biblica/edicoes` | Lista as edições / cria o rascunho | `classebiblica.gerenciar` |
| `PATCH /classe-biblica/edicoes/{id}` | Salva o rascunho; em edição terminada, horário e local descem aos encontros futuros sem chamada | `classebiblica.gerenciar` |
| `GET /classe-biblica/edicoes/{id}` | Painel da edição (guarda no serviço: gerenciar, ou chamada com grupo no escopo) | logado |
| `GET` / `PUT /classe-biblica/edicoes/{id}/grupos` | Lê / grava os grupos e suas unidades | `classebiblica.gerenciar` |
| `GET /classe-biblica/edicoes/{id}/datas` | Datas possíveis da etapa 3, com o motivo das desmarcadas | `classebiblica.gerenciar` |
| `POST /classe-biblica/edicoes/{id}/terminar` | Cria encontros e eventos `CLASSE_BIBLICA`; idempotente | `classebiblica.gerenciar` |
| `POST /classe-biblica/grupos/{grupoId}/material/link` · `/material/arquivo` | Material de estudo do grupo: link ou PDF de até 20 MB (multipart, campo `arquivo`) | `classebiblica.gerenciar` |
| `GET /classe-biblica/grupos/{grupoId}/frequencia` | Frequência do grupo (guarda no serviço, como o painel) | logado |
| `GET /classe-biblica/encontros/{id}` · `POST .../remarcar` · `.../cancelar` · `.../desfazer-cancelamento` | Detalhe, remarcação, cancelamento com motivo e desfazer | `classebiblica.gerenciar` |
| `GET /classe-biblica/encontros/{id}/grupos/{grupoId}/chamada` | Lista da chamada do grupo | `classebiblica.chamada` + escopo |
| `GET` / `PATCH /classe-biblica/pontos` | Valor e "Contar" dos critérios `CLASSE_BIBLICA_PRESENCA` e `CLASSE_BIBLICA_PARTICIPACAO` | `ranking.configurar` |

## Ranking

| Método e rota | O que faz | Permissão |
|---|---|---|
| `GET /ranking?periodo=MES\|TRIMESTRE\|ANO&unidadeId=` | Posições com pontos e variação | logado |
| `GET /publico/{clubeSlug}/ranking?periodo=` | Igual, com `nomePublico`, sem ids, só se `rankingNoLogin` | **público** (limite de taxa) |
| `GET /ranking/unidades` | Média por DBV por unidade | logado |
| `GET /ranking/criterios` · `PUT /ranking/criterios` | Lê e salva critérios (lista inteira) | ver: logado · salvar: `ranking.configurar` |
| `POST /ranking/criterios` | Critério personalizado (gatilho MANUAL) | `ranking.configurar` |
| `PATCH /clube/configuracao` (ranking) | Período, no login, por unidade, desconto por falta | `ranking.configurar` |
| `POST /ranking/lancamentos` | Lançamento manual `{ criterioId, dbvIds[], data }` (ex.: participação em evento) | `ranking.lancar_manual` |
| `DELETE /ranking/lancamentos/{id}` | Estorna lançamento manual | `ranking.lancar_manual` |

## Mídia

| Método e rota | O que faz | Permissão |
|---|---|---|
| `GET /unidades/{id}/albuns` | Álbuns com contagem e capa | `foto.ver` + escopo |
| `POST /unidades/{id}/albuns` | Cria álbum (nome, ou vinculado a reunião/evento) | `foto.enviar` + escopo |
| `PUT /sync/fotos/{clienteUuid}` | Upload de uma foto da fila (multipart: arquivo, albumId, legenda); idempotente | `foto.enviar` + escopo |
| `GET /unidades/{id}/sem-autorizacao-imagem` | Nomes públicos dos DBVs da unidade sem autorização (aviso do envio) | `foto.enviar` + escopo |
| `GET /arquivos/{id}?miniatura=1` | Entrega por URL assinada de curta duração | conforme o dono |
| `DELETE /fotos/{id}` | Remove (autor ou Adm) | `foto.enviar` |
| `GET /classes/{id}/materiais` | Materiais por seção | logado + escopo (conselheiro: 403) |
| `POST /materiais/link` · `POST /materiais/arquivo` (multipart: `dados`, `arquivo`; até 20 MB) · `PATCH` · `DELETE /materiais/{id}` | Cria, edita título/seção, remove | `material.enviar` + escopo |

## Observações

| Método e rota | O que faz | Permissão |
|---|---|---|
| `GET /observacoes?classeId=&dbvId=&alvo=` | Só as próprias, ou todas com `observacao.ver_outros`; Adm vê todas | Instrutor ou Adm |
| `POST /observacoes` · `PATCH` · `DELETE /observacoes/{id}` | Autor ou Adm | Instrutor ou Adm |

Nenhuma rota de conselheiro, pública ou de perfil do DBV devolve observações.

## Início, notificações e relatórios

| Método e rota | O que faz | Permissão |
|---|---|---|
| `GET /inicio/conselheiro` | Próxima reunião, números da unidade, top 3, pendências de envio | conselheiro |
| `GET /inicio/instrutor` | Próxima aula por classe, progresso, alerta de DBVs com 2+ faltas seguidas | instrutor |
| `GET /inicio/adm` | Indicadores, progresso por classe, unidades, atividade recente | Adm |
| `GET /notificacoes` · `POST /notificacoes/{id}/lida` | Sino | logado |
| `GET /relatorios/frequencia?de=&ate=` | Frequência de reunião por mês e por unidade | `relatorio.geral` |
| `GET /relatorios/especialidades?de=&ate=` | Mais concluídas | `relatorio.geral` |
| `GET /relatorios/classes?ano=` | Por classe: instrutor, DBVs, frequência nas aulas, progresso médio, prontos | `relatorio.geral` |
| `GET /relatorios/{tipo}.xlsx?...` | Exporta o mesmo relatório em Excel | `relatorio.geral` |

## Catálogo de permissões (padrões)

| Permissão | Adm | Conselheiro | Instrutor |
|---|---|---|---|
| `dbv.ver` (no escopo) | ✔ | ✔ | ✔ |
| `dbv.ver_contato` | ✔ | ✔ | — |
| `dbv.editar` | ✔ | desligada | — |
| `reuniao.registrar`, `reuniao.ver` | ✔ | ✔ | — |
| `foto.enviar`, `foto.ver` | ✔ | ✔ | — |
| `relatorio.unidade` | ✔ | desligada | — |
| `aula.registrar`, `requisito.marcar`, `material.enviar` | ✔ | — | ✔ |
| `classe.ver_relatorio` | ✔ | — | ✔ |
| `observacao.ver_outros` | ✔ | — | desligada |
| `ranking.lancar_manual` | ✔ | — | — |
| `classebiblica.chamada` | ✔ | desligada | desligada |
| `dbv.cadastrar`, `usuario.gerenciar`, `unidade.gerenciar`, `classe.gerenciar`, `calendario.gerenciar`, `ranking.configurar`, `relatorio.geral`, `clube.configurar`, `classebiblica.gerenciar` | ✔ | — | — |

"desligada" = existe para o papel, começa desligada, o Adm pode ligar. "—" = não se aplica ao papel.
