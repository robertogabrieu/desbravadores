import { Abas } from '../../ui/Abas'

interface Propriedades {
  maisVazias: boolean
  aoMudar: (maisVazias: boolean) => void
}

/** "Pela data" ou "Mais vazias primeiro" (soma das duas classes). */
export function OrdemDasDatas({ maisVazias, aoMudar }: Propriedades) {
  return (
    <Abas
      rotulo="Ordem das datas"
      ativa={maisVazias ? 'mais-vazias' : 'pela-data'}
      aoMudar={(id) => aoMudar(id === 'mais-vazias')}
      abas={[
        { id: 'pela-data', rotulo: 'Pela data' },
        { id: 'mais-vazias', rotulo: 'Mais vazias primeiro' },
      ]}
    />
  )
}
