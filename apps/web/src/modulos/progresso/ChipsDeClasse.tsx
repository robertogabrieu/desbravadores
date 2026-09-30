import type { RefClasse } from '@desbravadores/shared'
import { useSearchParams } from 'react-router-dom'
import type { z } from 'zod'
import { useSessao } from '../../sessao/useSessao'
import { Chip } from '../../ui/Chip'

export type ClasseDoVinculo = z.infer<typeof RefClasse>

/** Classe da tela `?classe=`: a da consulta, ou a primeira do vínculo. Trocar remove o `dbv`, que pertence à classe anterior. */
export function useClasseEscolhida() {
  const { vinculoAtivo } = useSessao()
  const [consulta, definirConsulta] = useSearchParams()
  const classes = vinculoAtivo?.classes ?? []
  const classeId = consulta.get('classe') ?? classes[0]?.id ?? ''
  const escolher = (id: string) => definirConsulta({ classe: id }, { replace: true })
  return { classes, classeId, escolher }
}

interface Propriedades {
  classes: ClasseDoVinculo[]
  ativaId: string
  aoEscolher: (classeId: string) => void
}

/** Sem classe no vínculo não há o que escolher. */
export function ChipsDeClasse({ classes, ativaId, aoEscolher }: Propriedades) {
  if (classes.length === 0) return null
  return (
    <div role="group" aria-label="Classe" className="flex flex-wrap gap-2">
      {classes.map((classe) => (
        <Chip key={classe.id} selecionado={classe.id === ativaId} aoAlternar={() => aoEscolher(classe.id)}>
          {classe.nome}
        </Chip>
      ))}
    </div>
  )
}
