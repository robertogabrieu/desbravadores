import { Check, Shirt } from 'lucide-react'
import type { LinhaDaPresenca } from '../../../../api/presenca'
import { Botao } from '../../../../ui/Botao'
import { cn } from '../../../../ui/cn'
import { mensagemDaFalha, primeiroNome } from './LinhaDeMarca'
import type { NomeDoUniforme, ToquesDaLinha } from './LinhaDeMarca'
import type { MarcaDaPessoa } from './useMarcasDaPresenca'

interface Propriedades {
  linhas: LinhaDaPresenca[]
  uniforme: NomeDoUniforme
  semInternet: boolean
  marcaDe: (dbvId: string) => MarcaDaPessoa
  toquesDe: (dbvId: string) => ToquesDaLinha
}

const BOTAO =
  'inline-flex min-h-[var(--touch-min)] items-center gap-2 rounded-botao border-2 px-3 text-base font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca disabled:cursor-not-allowed disabled:opacity-50'

function textoDoFoi(marca: MarcaDaPessoa): string {
  if (marca.situacao === 'salvando') return 'Salvando…'
  if (marca.situacao === 'falhou') return 'Não salvou ainda'
  return marca.foi ? 'Foi' : 'Não foi'
}

/** A lista do computador (≥ 900 px): uma tabela por unidade, com botão de verdade nas duas colunas. A `ui/Tabela` é paginada e vira cartão, por isso não serve. */
export function TabelaDePresenca({ linhas, uniforme, semInternet, marcaDe, toquesDe }: Propriedades) {
  return (
    <table className="w-full border-collapse text-left">
      <thead>
        <tr className="border-b border-borda text-sm text-texto-2">
          <th scope="col" className="px-3 py-2 font-semibold">
            Nome
          </th>
          <th scope="col" className="px-3 py-2 font-semibold">
            Foi
          </th>
          <th scope="col" className="px-3 py-2 font-semibold">{`Foi de ${uniforme}`}</th>
        </tr>
      </thead>
      <tbody>
        {linhas.map((linha) => {
          const marca = marcaDe(linha.dbvId)
          const toques = toquesDe(linha.dbvId)
          const travada = marca.situacao !== 'salva' || semInternet
          return (
            <tr key={linha.dbvId} aria-busy={marca.situacao === 'salvando'} className="border-b border-borda last:border-b-0">
              <td className="px-3 py-1 align-middle">
                <span className="font-semibold text-texto">{linha.nome}</span>
                {marca.situacao === 'falhou' && !semInternet && (
                  <div role="alert" className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-perigo">{mensagemDaFalha(linha.nome)}</span>
                    <Botao variante="secundario" onClick={toques.aoTentarDeNovo}>
                      Tentar de novo
                    </Botao>
                  </div>
                )}
              </td>
              <td className="px-3 py-1 align-middle">
                <button
                  type="button"
                  aria-pressed={marca.foi}
                  disabled={travada}
                  onClick={toques.aoTocarNome}
                  className={cn(BOTAO, marca.foi ? 'border-marca bg-marca-suave text-marca' : 'border-borda-controle bg-superficie text-texto')}
                >
                  <span aria-hidden className={cn('flex size-6 shrink-0 items-center justify-center rounded-md', marca.foi ? 'bg-marca text-sobre-marca' : 'border-2 border-borda-controle bg-superficie')}>
                    {marca.foi && <Check className="size-4" />}
                  </span>
                  {textoDoFoi(marca)}
                </button>
              </td>
              <td className="px-3 py-1 align-middle">
                <button
                  type="button"
                  aria-pressed={marca.comUniforme}
                  aria-label={marca.foi ? undefined : `De ${uniforme}: indisponível porque ${primeiroNome(linha.nome)} não foi`}
                  disabled={!marca.foi || travada}
                  onClick={toques.aoTocarUniforme}
                  className={cn(BOTAO, uniforme === 'gala' ? 'border-solid' : 'border-dashed', marca.comUniforme ? 'border-marca bg-marca-suave text-marca' : 'border-borda-controle bg-superficie text-texto')}
                >
                  {marca.comUniforme && <Shirt aria-hidden className="size-4 shrink-0" />}
                  {marca.foi ? `De ${uniforme}` : `De ${uniforme} · só quem foi`}
                </button>
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
