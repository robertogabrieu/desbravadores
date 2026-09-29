# Aplicativo do Desbravador — Riscos

Probabilidade (P) e impacto (I): alta, média, baixa. Ordenados pelo que mais ameaça o projeto.

## Adoção pelos voluntários

| # | Risco | P | I | Mitigação |
|---|---|---|---|---|
| A1 | **Conselheiro volta para o papel** depois de 2–3 domingos, porque o app é mais lento ou falhou uma vez | alta | alta | Chamada em menos de 2 min como critério de pronto; piloto com 2 unidades e papel em paralelo; offline desde a Fase 1; perguntar a cada conselheiro do piloto "o que te atrapalhou hoje" |
| A2 | **Login esquecido** no domingo de manhã, sem ninguém para redefinir a senha | alta | média | Sessão de 30 dias; convite com senha definida pelo próprio usuário; "esqueci a senha" funcionando desde a Fase 0; Adm pode reenviar convite pelo celular |
| A3 | **Só você sabe operar** o sistema; se você se afastar, o app para | média | alta | Fase 3 inteira é para o Adm ficar autônomo; README de operação (deploy, backup, restauração) escrito para outra pessoa; segundo acesso ao servidor com alguém da diretoria |
| A4 | Instrutor não registra aula porque dá aula e anota depois, em casa | média | média | Registro funciona depois do dia (data editável); marcar requisito fora da aula (I6); o alerta de faltas só vale se o registro for feito |
| A5 | Ranking gera ciúme ou desânimo entre os DBVs (e reclamação de pais) | média | média | Período curto (mês) zera a disputa; ranking por unidade além do geral; Adm pode esconder o ranking público; critérios de esforço (Bíblia, uniforme) e não só de desempenho |
| A6 | Celulares velhos ou com pouco espaço não instalam/rodam bem o PWA | média | média | Sem bibliotecas pesadas; fotos reduzidas no aparelho; testar num Android de entrada antes do piloto; funciona também pelo navegador sem instalar |
| A7 | Cadastro duplicado com o Desbravadores Finance cansa a secretaria | alta | baixa | Aceito no MVP; exportar/importar CSV entre os dois é o primeiro passo de integração depois do MVP |

## Privacidade — dados de menores (LGPD)

A LGPD trata dado de criança e adolescente com cuidado especial (art. 14): exige finalidade clara,
o mínimo de dados e consentimento de um responsável para o que não for estritamente necessário.

| # | Risco | P | I | Mitigação |
|---|---|---|---|---|
| P1 | **Ranking público expõe menores** a qualquer um com o link | alta | alta | Só `nomePublico` ("Ana C."), sem classe, foto ou perfil; desligável; página não indexada (`noindex`); limite de requisições |
| P2 | **Foto de criança vaza** (link compartilhado, print, URL pública) | média | alta | Fotos sem URL pública (link assinado de 10 min); metadados de localização apagados; autorização de imagem por DBV; foto sem marcação de pessoas fica só para a liderança |
| P3 | **Coleta sem base legal** — responsáveis não sabem que o clube guarda frequência, progresso e fotos | média | alta | Termo de ciência e autorização de imagem assinado pelo responsável na ficha de inscrição (o clube já coleta ficha); campo e data da autorização no cadastro; aviso de privacidade de uma página, linkado no login |
| P4 | **Dados médicos** entram no sistema por conta própria (o caderno de papel tem ficha médica) | baixa | alta | O app **não** tem campo de saúde; observações têm aviso "não registre informação de saúde"; se um dia precisar, é outro projeto com outra proteção |
| P5 | **Observação sensível** sobre um DBV (comportamento, família) vista por quem não devia | média | alta | Observações só para instrutores e Adm, verificado na API; testes automáticos garantindo que nenhuma rota de conselheiro/pública/perfil as devolve; apagar de verdade quando o autor apaga |
| P6 | **Líder que saiu do clube** continua com acesso | alta | média | Inativar usuário revoga tokens na hora; revisão de usuários ativos no início de cada semestre (lembrete no painel do Adm) |
| P7 | **Pedido de exclusão** de um responsável | baixa | média | Rotina do Adm "anonimizar DBV": troca nome e contatos por "DBV removido", apaga fotos e observações, mantém números agregados |
| P8 | **Vazamento do banco** (servidor invadido, backup exposto) | baixa | alta | Servidor com atualização automática, só portas 80/443 abertas, SSH por chave; backup criptografado antes de ir para o R2; senhas com argon2; dados de contato mínimos |

## Técnicos

| # | Risco | P | I | Mitigação |
|---|---|---|---|---|
| T1 | **Sincronização offline perde ou duplica chamada** | média | alta | Id gerado no celular + gravação idempotente; teste ponta a ponta do ciclo offline; a chamada só sai da fila com resposta de sucesso; nunca apagar fila no logout sem confirmação |
| T1b | **Fotos na fila enchem o celular** ou sobem só com o app aberto | média | média | Fotos reduzidas antes de entrar na fila (≤ 2 MB); aviso de espaço quando a fila passar de 100 MB; a tela de envio diz que o app precisa ficar aberto até terminar |
| T2 | **iPhone apaga os dados do PWA** (Safari limpa armazenamento de sites não usados por ~7 dias; ao instalar na tela de início isso não se aplica) | média | média | Incentivar a instalação; o "pacote do domingo" se refaz a cada abertura com internet; a fila é enviada assim que possível — o risco real é só a chamada feita offline e não enviada por 7 dias |
| T3 | **Os cadernos extraídos têm erros** (digitalização com ruído, página faltando, classe avançada sem seções) | alta | média | Carga como extraída; revisão pelo mantenedor antes do lançamento público (lista em `dados/cadernos/LEIA-ME.md`); correção no JSON + carga reexecutável que atualiza pelo código sem perder progresso; campo `pagina` para conferir |
| T4 | **Caderno oficial muda** (a DSA revisa requisitos periodicamente) | média | média | Requisitos com `ativo` e versionamento por ano do clube; progresso guardado por requisito, não por posição; script de carga que acrescenta sem apagar o que tem histórico |
| T5 | **VPS compartilhado com o Finance**: um problema derruba os dois | baixa | média | Containers e bancos separados, limites de memória por container; alerta de disco; plano B de VPS próprio documentado |
| T6 | **Mudança de regra do ranking bagunça a pontuação** | média | média | Valor copiado no lançamento; lançamentos com origem para estorno; nenhuma pontuação é "recalculada do zero" |
| T7 | Disco enche com vídeos de materiais | baixa | média | Limite de 50 MB por arquivo; incentivo a link do YouTube; alerta de disco em 80% |
| T8 | E-mail de convite cai no spam | média | baixa | Provedor com SPF/DKIM configurados no domínio; Adm pode copiar o link do convite e mandar por WhatsApp |
| T9 | Direitos sobre o conteúdo dos cadernos (material da DSA/CPB) | baixa | média | Carregar só o enunciado dos requisitos (já público nos sites oficiais), sem ilustrações nem textos de apoio; app de uso interno do clube |
