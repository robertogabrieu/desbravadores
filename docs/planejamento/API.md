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
| `GET /auth/substituicao/{token}` | Estado do link de substituição (`INEXISTENTE`, `CANCELADO`, `ENCERRADO`, `ANTES`, `EM_OUTRO_APARELHO`, `ABERTO`), alvo, janela, fuso do clube, hora do servidor e, se o cookie de refresh for de um membro do clube, o nome da conta. O segredo do aparelho, se houver, vai no cabeçalho `X-Segredo-Aparelho`. Limite de 30 por minuto por link | público |
| `POST /auth/substituicao/{token}/entrar` | Identifica quem abriu o link — `{ nome }` (sem conta), `{ usarConta: true }` (conta reconhecida pelo cookie) ou `{ segredo }` (mesmo aparelho voltando) — e devolve a credencial de substituição. Só um aparelho por link. Fora de `ABERTO` recusa com `campos.estado`: 410 (inexistente, cancelado, encerrado), 422 (antes da janela) ou 409 (outro aparelho). Depois do fim da janela, só o aparelho já identificado volta, até o fim do envio. Limite de 10 por minuto por link | público |
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
| `GET /unidades/{id}/substituicao` | Link de substituição aberto da unidade (data, janela, quem se identificou) ou `null` | `usuario.gerenciar` |
| `POST /unidades/{id}/substituicao` | Gera o link para o dia `{ data }` (cancela o aberto da unidade); a resposta traz `link`, que só existe nela | `usuario.gerenciar` |
| `DELETE /unidades/{id}/substituicao` | Cancela o link aberto (204); o registro fica com quem cancelou e quando | `usuario.gerenciar` |

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
| `PATCH` / `DELETE /calendario/eventos/{id}` | Edita / exclui; idem conflitos | `calendario.gerenciar` |
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

## Substituição por link

O Adm gera um link para um dia e um alvo (uma unidade, para lançar a chamada; ou uma classe, para registrar a aula). Quem abre o link lança sem ter conta. Um link aberto por alvo: gerar outro cancela o anterior. O link abre no horário da reunião do clube (`horaReuniao`, no fuso do clube) e a leitura vale por 3 h; o que o aparelho salvou ainda sobe até 12 h depois disso. Só dias com reunião (link de unidade) ou com classe (link de classe), de hoje a 28 dias à frente. Gerar para outro dia dá 400; unidade ou classe inativa dá 404.

| Método e rota | O que faz | Permissão |
|---|---|---|
| `GET /substituicoes/datas?tipo=CHAMADA\|CLASSE` | Dias elegíveis com início e fim da janela de cada um | `usuario.gerenciar` |
| `GET` · `POST` · `DELETE /classes/{id}/substituicao` | Igual ao da unidade (acima), para o link de classe | `usuario.gerenciar` |

**Credencial de substituição.** `entrar` devolve um JWT com `tipo: 'substituicao'` (`sub` = id do link), sem refresh, válido até o fim do envio. Não vale como sessão normal e a sessão normal não vale nele. Só as 8 rotas marcadas `@PodeOuSubstituto` / `@LogadoOuSubstituto` o aceitam: `GET /sync/pacote`, `GET /classes/{id}/cronograma`, `PUT /sync/reunioes/{uuid}`, `GET /reunioes`, `GET /reunioes/{id}`, `PUT /sync/aulas/{uuid}`, `GET /classes/{id}/aulas` e `GET /aulas/{id}`. Nelas a sessão assume o papel Conselheiro (link de unidade) ou Instrutor (link de classe) e enxerga só o alvo e o dia do link; fora disso responde 404. As permissões são as do papel, sem ajuste de vínculo.

O link é conferido no banco a cada requisição: GET e HEAD valem até o fim da janela; qualquer outro método, até o fim do envio. Link cancelado, alvo desativado, aparelho ainda não identificado, credencial vencida ou fora do prazo respondem `401` com código `SUBSTITUICAO_ENCERRADA`, que encerra a tela do substituto. O `GET /reunioes/{id}` e o `GET /aulas/{id}` trazem `substituicao` (autor, se tem conta, quem gerou o link e se ele lançou ou só alterou); é `null` sem substituição.

## Reuniões e chamada

| Método e rota | O que faz | Permissão |
|---|---|---|
| `GET /unidades/{id}/reunioes?de=&ate=` | Aba "Por reunião": presentes, atrasos, uniformes, % | `reuniao.ver` + escopo |
| `GET /unidades/{id}/frequencia?ultimas=8` | Aba "Por DBV": grade P/A/F/J | `reuniao.ver` + escopo |
| `GET /reunioes/{id}` | Detalhe, chamada completa, pontos lançados, alterações (quem/quando) | `reuniao.ver` + escopo |
| `PUT /sync/reunioes/{clienteUuid}` | Grava a chamada inteira (idempotente; usado online e offline) → pontos calculados | `reuniao.registrar` + escopo (ou credencial de substituição de unidade, só no dia do link) |

## Aulas

| Método e rota | O que faz | Permissão |
|---|---|---|
| `GET /classes/{id}/aulas?anoClube=` | Aulas registradas ("N aulas dadas"), data decrescente | `aula.registrar` + escopo |
| `GET /aulas/{id}` | Detalhe: presença e requisitos marcados | `aula.registrar` + escopo |
| `PUT /sync/aulas/{clienteUuid}` | Grava presença + requisitos cumpridos, tarefa para casa e entregas de especialidade (idempotente) → pontos | `aula.registrar` + escopo (ou credencial de substituição de classe, só no dia do link) |

## Sincronização offline

| Método e rota | O que faz | Permissão |
|---|---|---|
| `GET /sync/pacote` | Pacote do domingo do usuário: DBVs das unidades/classes, critérios ativos, aulas das próximas 2 semanas, requisitos já concluídos, `versao`. Com a credencial de substituição: só o alvo do link, só a reunião do dia dele e sem álbuns | logado ou credencial de substituição |
| `PUT /sync/reunioes/{uuid}` · `PUT /sync/aulas/{uuid}` | (acima) | — |

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
| `dbv.cadastrar`, `usuario.gerenciar`, `unidade.gerenciar`, `classe.gerenciar`, `calendario.gerenciar`, `ranking.configurar`, `relatorio.geral`, `clube.configurar` | ✔ | — | — |

"desligada" = existe para o papel, começa desligada, o Adm pode ligar. "—" = não se aplica ao papel.
