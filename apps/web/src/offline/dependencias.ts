/** Dependências do navegador que o jsdom não tem de verdade; os testes trocam por falsas. */
export const dependencias = {
  criarXhr: (): XMLHttpRequest => new XMLHttpRequest(),
}
