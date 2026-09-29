# Cadernos de classe — dados extraídos

Requisitos extraídos dos PDFs oficiais "Caderno de Atividades" (7 arquivos, fora do repositório),
para a carga inicial do app. **Ainda não revisados por uma pessoa** — ver "Revisão" abaixo.

Só o enunciado de cada requisito entrou. Ficha pessoal, ficha médica, espaços de resposta,
ilustrações e o conteúdo detalhado das especialidades ficaram de fora.

## Formato

Um JSON por caderno: `fonte`, `classes[]` (nome, idade, tipo, `secoes[]` com `requisitos[]`) e
`avisos[]` — tudo que o extrator teve dúvida. Cada classe tem `tipo` (REGULAR ou AVANCADA) e
`trilha` (INDIVIDUAL ou AGRUPADAS); a avançada aponta para a sua regular em `classeBase`. Cada requisito tem `codigo`, `texto`, `campo` e
`pagina` (página do PDF, para conferir).

Seções: G Gerais · DE Descoberta espiritual · SO Servindo aos outros · DA Desenvolvendo amizade ·
SA Saúde e aptidão física · OL Organização e liderança · EN Estudo da natureza · AC Arte de
acampar · EV Enriquecendo a vida. Classe avançada: seção única **AV** (o caderno não a divide),
na ordem do caderno, com `classeBase` apontando para a regular.

## Conteúdo

| Arquivo | Classe | Tipo | Requisitos | CAMPO |
|---|---|---|---|---|
| amigo | Amigo (10) | regular | 24 | 5 |
| amigo | Amigo da Natureza | avançada | 9 | 4 |
| companheiro | Companheiro (11) | regular | 26 | 4 |
| companheiro | Companheiro de Excursionismo | avançada | 12 | 4 |
| pesquisador | Pesquisador (12) | regular | 23 | 3 |
| pesquisador | Pesquisador de Campo e Bosque | avançada | 11 | 4 |
| pioneiro | Pioneiro (13) | regular | 24 | 2 |
| pioneiro | Pioneiro de Novas Fronteiras | avançada | 13 | 5 |
| excursionista | Excursionista (14) | regular | 26 | 3 |
| excursionista | Excursionista na Mata | avançada | 8 ⚠ | 3 |
| guia | Guia (15) | regular | 29 | 4 |
| guia | Guia de Exploração | avançada | 8 | 2 |
| agrupadas | Agrupadas 11 anos (Amigo e Companheiro) | regular · agrupadas | 46 | 10 |
| agrupadas | Agrupadas 11 anos — avançada | avançada · agrupadas | 21 | |
| agrupadas | Agrupadas 12 anos (Amigo a Pesquisador) | regular · agrupadas | 63 | 13 |
| agrupadas | Agrupadas 12 anos — avançada | avançada · agrupadas | 32 | |
| agrupadas | Agrupadas 13 anos (Amigo a Pioneiro) | regular · agrupadas | 80 | 14 |
| agrupadas | Agrupadas 13 anos — avançada | avançada · agrupadas | 42 | |
| agrupadas | Agrupadas 14 anos (Amigo a Excursionista) | regular · agrupadas | 98 | 15 |
| agrupadas | Agrupadas 14 anos — avançada | avançada · agrupadas | 53 | |
| agrupadas | Agrupadas 15 anos ou mais (Amigo a Guia) | regular · agrupadas | 123 | 18 |
| agrupadas | Agrupadas 15 anos ou mais — avançada | avançada · agrupadas | 63 | |

**Agrupadas** são um supletivo, em geral cursado por líderes: para cada idade de entrada, o
caderno junta uma versão reduzida dos requisitos das classes anteriores (marcados por caixas de
idade). Os requisitos são próprios da trilha — o progresso não se mistura com o das classes
individuais — e o mesmo requisito aparece em várias agrupadas, cada uma com código próprio.

O caderno traz também as 6 avançadas numa versão própria do supletivo. Pela mesma caixa de
idade, elas foram reunidas em uma **avançada agrupada por idade**, que acumula as das idades
anteriores; cada avançada individual vira uma seção (AN, CE, PC, PN, EM, GE).

## Revisão antes da carga

1. **Excursionista na Mata** — o PDF não tem as páginas impressas 44–45: falta o requisito 1 e o
   nome (deduzido). A versão das Agrupadas começa com "Fazer uma apresentação escrita ou falada
   sobre o respeito que devemos ter com a Lei de Deus…" — provável requisito que falta. Conferir
   no caderno de papel.
2. **Amigo da Natureza AV8** — enunciado ausente no PDF, texto **reconstruído**. Conferir.
3. **Avançadas do Companheiro e do Pioneiro** — o extrator as distribuiu por seção e depois foram
   reordenadas por página; conferir a ordem com a numeração impressa.
4. **CAMPO** — inferido pelo assunto; os duvidosos estão em `avisos`. Um instrutor revisa cada
   classe.
5. **Agrupadas** — as caixas de idade foram lidas pela cor na imagem; conferir uma amostra
   (principalmente DE e SO). Confirmar também que a avançada agrupada acumula as anteriores
   (15+ faz as seis).
6. Leia os `avisos` de cada arquivo: são 8 a 21 por caderno.
