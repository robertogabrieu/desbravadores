import { Botao } from '../../../ui/Botao'

/** "Fechar" das folhas da visão geral: sozinho, abaixo do conteúdo, à direita. */
export function FecharDaFolha({ aoFechar }: { aoFechar: () => void }) {
  return (
    <div className="mt-4 flex justify-end">
      <Botao variante="secundario" onClick={aoFechar}>
        Fechar
      </Botao>
    </div>
  )
}
