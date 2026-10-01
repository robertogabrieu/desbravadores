# Troca rápida de papel — SPEC

Um mesmo usuário frequentemente é conselheiro e instrutor (ou Adm e instrutor). Ele já está logado
quando a reunião começa, age como conselheiro na chamada e, no meio da reunião, assume a aula como
instrutor. Hoje trocar custa 3 toques escondidos (menu do usuário → "Trocar de papel" → cartão) numa
tela à parte. Esta SPEC põe a troca **à vista, em 2 toques, sem sair do fluxo**.

## O que muda para quem usa

- **Selo do papel no cabeçalho**, para quem tem **2 ou mais vínculos ativos no clube atual**: mostra
  o papel em uso ("Conselheiro ▾"). Quem tem um papel só não vê o selo.
- **Tocar no selo** abre um menu curto com os papéis do clube, o atual marcado (✓), cada um com o
  escopo em letra menor ("Conselheiro · Águias", "Instrutor · Amigo, Companheiro", "Adm").
- **Tocar num papel** troca na hora: o app vai para o início daquele papel (layout do Adm quando o
  papel é Adm; celular nos demais) e mostra por 3 s a confirmação "Agora você está como Instrutor."
- Vale no **cabeçalho do celular** (LayoutCelular) e no **cabeçalho do painel do Adm** (LayoutAdm, no
  computador e no celular), sempre no mesmo lugar.
- O item "Trocar de papel" do menu do usuário continua, para quem procurar ali, e a tela /papel
  continua para escolher papel de **outro clube**.
- **Sem internet:** o selo continua visível, mas trocar mostra "Trocar de papel precisa de internet."
  (a troca renova a sessão no servidor).
- **Envios pendentes do outro papel:** o que foi registrado sem internet num papel só sobe quando a
  pessoa volta a ele. Ao trocar, se o papel que ficou para trás tem envios aguardando, a confirmação
  diz também "2 envios da chamada aguardam você voltar a Conselheiro."

## Regras

- A troca usa a rota existente (`POST /api/auth/papel-ativo`) e o mesmo caminho do ProvedorSessao
  (`escolherPapel`): nada muda na sessão, no token nem no pacote offline (que já é por vínculo).
- O menu lista só os vínculos ativos **do clube da sessão**; os de outros clubes ficam em /papel.
- Acessibilidade: o selo é um botão com nome "Papel: Conselheiro. Trocar de papel"; o menu é navegável
  por teclado, fecha com Esc e devolve o foco; a confirmação é anunciada (role="status").
- Área de toque ≥ 44 px; cabe no cabeçalho de 320 px (o nome do usuário encolhe antes do selo).

## Critério de pronto

- Testes de tela: selo só com 2+ papéis no clube; menu com os papéis e o atual marcado; trocar chama a
  rota com o vínculo certo, navega para o início do papel e anuncia a confirmação; sem internet não
  troca e avisa; aviso de envios pendentes do papel anterior; teclado (Esc, foco); presente no
  LayoutAdm e no LayoutCelular.
- Lint, tipos e suíte do web passam; medido em 320, 390 e 1440 px sem rolagem lateral.
