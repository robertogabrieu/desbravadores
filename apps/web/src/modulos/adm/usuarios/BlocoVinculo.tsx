import type { Papel } from '@desbravadores/shared'
import { PAPEIS } from '@desbravadores/shared'
import type { ReactNode } from 'react'
import { useClasses, useCatalogoPermissoes, useUnidades } from '../../../api/leitura'
import { CaixaMarcacao } from '../../../ui/CaixaMarcacao'
import { Selecao } from '../../../ui/Selecao'
import { rotuloDoPapel } from '../../acesso/papeis'
import { alternarPermissao, permissaoLigada, permissoesDoPapel, rascunhoVazio } from './vinculos'
import type { RascunhoVinculo } from './vinculos'

const alternar = (lista: string[], id: string): string[] => (lista.includes(id) ? lista.filter((x) => x !== id) : [...lista, id])

interface PropriedadesBloco {
  indice: number
  rascunho: RascunhoVinculo
  aoMudar: (rascunho: RascunhoVinculo) => void
  papelTravado?: boolean
  erro?: string
  /** Botões do rodapé do bloco (remover). */
  acoes?: ReactNode
}

/** Papel, unidades ou classes e caixas de permissão de um vínculo; quem usa decide como salvar. */
export function BlocoVinculo({ indice, rascunho, aoMudar, papelTravado = false, erro, acoes }: PropriedadesBloco) {
  const unidades = useUnidades()
  const classes = useClasses()
  const catalogo = useCatalogoPermissoes()
  const { papel } = rascunho
  const permissoes = permissoesDoPapel(catalogo.data ?? [], papel)

  return (
    <section role="group" aria-label={`Vínculo ${indice}`} className="flex flex-col gap-3 rounded-cartao border border-borda p-4">
      <Selecao
        rotulo="Papel"
        value={papel}
        disabled={papelTravado}
        onChange={(evento) => aoMudar(rascunhoVazio(evento.target.value as Papel))}
      >
        {PAPEIS.map((p) => (
          <option key={p} value={p}>
            {rotuloDoPapel(p)}
          </option>
        ))}
      </Selecao>

      {papel === 'CONSELHEIRO' && (
        <fieldset className="flex flex-col">
          <legend className="text-sm font-semibold">Unidades</legend>
          {(unidades.data ?? []).filter((u) => u.ativa).map((u) => (
            <CaixaMarcacao key={u.id} rotulo={u.nome} checked={rascunho.unidadeIds.includes(u.id)} onChange={() => aoMudar({ ...rascunho, unidadeIds: alternar(rascunho.unidadeIds, u.id) })} />
          ))}
        </fieldset>
      )}

      {papel === 'INSTRUTOR' && (
        <fieldset className="flex flex-col">
          <legend className="text-sm font-semibold">Classes</legend>
          {(classes.data ?? []).filter((c) => c.ativa).map((c) => (
            <CaixaMarcacao key={c.id} rotulo={c.nome} checked={rascunho.classeIds.includes(c.id)} onChange={() => aoMudar({ ...rascunho, classeIds: alternar(rascunho.classeIds, c.id) })} />
          ))}
        </fieldset>
      )}

      {permissoes.length > 0 && (
        <fieldset className="flex flex-col">
          <legend className="text-sm font-semibold">O que pode fazer</legend>
          {permissoes.map((permissao) => (
            <CaixaMarcacao
              key={permissao.chave}
              rotulo={permissao.rotulo}
              checked={permissaoLigada(permissao, rascunho)}
              onChange={() => aoMudar(alternarPermissao(rascunho, permissao))}
            />
          ))}
        </fieldset>
      )}

      {erro && (
        <p role="alert" className="text-sm font-medium text-perigo">
          {erro}
        </p>
      )}
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </section>
  )
}
