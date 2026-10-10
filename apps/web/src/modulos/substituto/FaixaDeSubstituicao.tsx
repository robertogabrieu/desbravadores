import type { IdentidadeDaSubstituicao } from '@desbravadores/shared'
import type { z } from 'zod'
import { hora, nomeDoAlvo } from './EstadosDoLink'

/** S4: abre a página e rola junto com ela (o app não usa barra presa); diz quem a pessoa cobre e até quando. */
export function FaixaDeSubstituicao({ identidade }: { identidade: z.infer<typeof IdentidadeDaSubstituicao> }) {
  return (
    <p className="bg-marca-escura px-4 py-2 text-base font-semibold text-white">
      Substituindo na {nomeDoAlvo(identidade)} <span className="font-normal">· aberto até {hora(identidade.fimEm, identidade.fuso)}</span>
    </p>
  )
}
