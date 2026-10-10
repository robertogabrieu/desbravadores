/** Diferença entre o relógio do servidor e o do aparelho, tirada do `agora` das rotas públicas do link. */
let deslocamentoMs = 0

/** Anota o `agora` de uma resposta do servidor: celular com hora errada não abre nem fecha o link fora de hora. */
export function registrarAgoraDoServidor(agora: string, recebidoEm = Date.now()): void {
  const instante = Date.parse(agora)
  if (!Number.isNaN(instante)) deslocamentoMs = instante - recebidoEm
}

/** Agora pelo relógio do servidor (epoch ms). Sem `agora` registrado, é o do aparelho. */
export const agoraDoServidor = (): number => Date.now() + deslocamentoMs

/** Só para os testes. */
export function reiniciarRelogio(): void {
  deslocamentoMs = 0
}
