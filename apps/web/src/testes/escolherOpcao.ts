import { screen, waitFor } from '@testing-library/react'

interface Usuario {
  click: (elemento: Element) => Promise<void>
  keyboard: (teclas: string) => Promise<unknown>
}

/** Abre o `Selecao` e clica na opção, pelo valor ou pelo texto, como o `selectOptions` fazia no select nativo. */
export async function escolherOpcao(usuario: Usuario, campo: HTMLElement, valorOuTexto: string) {
  await usuario.click(campo)
  // A lista pode chegar da rede depois de o campo aparecer: espera a opção em vez de falhar na primeira leitura.
  const opcao = await waitFor(() => {
    const opcoes = screen.getAllByRole('option')
    const achada =
      opcoes.find((item) => item.getAttribute('data-valor') === valorOuTexto) ??
      opcoes.find((item) => item.textContent === valorOuTexto)
    if (!achada)
      throw new Error(
        `Opção "${valorOuTexto}" não encontrada: ${opcoes.map((item) => item.textContent).join(' | ')}`,
      )
    return achada
  })
  await usuario.click(opcao)
}

/** O quadro do `Selecao`, a partir do campo achado pelo rótulo: é onde está o texto da opção escolhida. */
export const quadroDe = (campo: HTMLElement): HTMLElement => {
  const quadro = campo.closest<HTMLElement>('[data-valor]')
  if (!quadro) throw new Error('O campo não é um Selecao')
  return quadro
}

/** O valor escolhido no `Selecao` (o que `toHaveValue` lia no select nativo). */
export const valorDe = (campo: HTMLElement): string | null =>
  quadroDe(campo).getAttribute('data-valor')

/** Abre o `Selecao`, devolve o texto das opções na ordem e fecha o menu. */
export async function textosDasOpcoes(usuario: Usuario, campo: HTMLElement): Promise<string[]> {
  await usuario.click(campo)
  const textos = (await screen.findAllByRole('option')).map((item) => item.textContent ?? '')
  await usuario.keyboard('{Escape}')
  return textos
}
