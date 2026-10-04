import { useState } from 'react'
import { Abas } from '../../../ui/Abas'
import { PainelClasses } from './PainelClasses'
import { PainelEspecialidades } from './PainelEspecialidades'

const ABAS = [
  { id: 'classes', rotulo: 'Classes' },
  { id: 'especialidades', rotulo: 'Especialidades' },
]

export function AdmClasses() {
  const [aba, setAba] = useState('classes')
  return (
    <div className="flex flex-col gap-5 py-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-texto-2">Catálogo do clube</p>
          <h1 className="font-titulo text-2xl font-bold text-texto">Classes e especialidades</h1>
        </div>
        <Abas rotulo="Catálogo" abas={ABAS} ativa={aba} aoMudar={setAba} />
      </header>
      {aba === 'classes' ? <PainelClasses /> : <PainelEspecialidades />}
    </div>
  )
}
