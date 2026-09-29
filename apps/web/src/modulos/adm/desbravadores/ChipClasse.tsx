import type { Desbravador } from '../../../api/desbravadores'

/** Cor do chip vem do nome do token de tema da classe (`--classe-amigo`), nunca de cor fixa. */
export function ChipClasse({ classe }: { classe: NonNullable<Desbravador['classeAtual']> }) {
  return (
    <span
      style={{ backgroundColor: `var(${classe.corToken})` }}
      className="inline-block rounded-full px-2.5 py-0.5 text-sm font-semibold text-white"
    >
      {classe.nome}
    </span>
  )
}
