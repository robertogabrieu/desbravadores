import { useState } from 'react'
import type { FormEvent } from 'react'
import { Botao } from '../../ui/Botao'
import { Campo } from '../../ui/Campo'
import { CampoData } from '../../ui/CampoData'
import { CampoHorario } from '../../ui/CampoHorario'
import { horarioValido } from '../../ui/mascaraHorario'
import { FolhaLateral } from '../../ui/FolhaLateral'
import type { DadosDaAula } from './useAcoesDeMontagem'

export interface AulaEmEdicao {
  /** Preenchido ao criar (Agrupadas): a data é escolhida no formulário. */
  data: string | null
  aulaId: string | null
  dados: DadosDaAula
}

interface Propriedades {
  aula: AulaEmEdicao
  desabilitado: boolean
  aoSalvar: (aula: AulaEmEdicao, data: string) => Promise<boolean>
  aoFechar: () => void
}

const vazioParaNulo = (texto: string): string | null => (texto.trim() === '' ? null : texto.trim())

/** Folha de horário, local e título de uma aula; sem `aulaId` é aula nova e pede também a data. */
export function FormularioAula({ aula, desabilitado, aoSalvar, aoFechar }: Propriedades) {
  const nova = aula.aulaId === null
  const [data, setData] = useState(aula.data ?? '')
  const [horario, setHorario] = useState(aula.dados.horario ?? '')
  const [local, setLocal] = useState(aula.dados.local ?? '')
  const [titulo, setTitulo] = useState(aula.dados.titulo ?? '')
  const [erroDoHorario, setErroDoHorario] = useState<string>()

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (horario && !horarioValido(horario)) return setErroDoHorario('Horário inválido')
    const gravou = await aoSalvar(
      { ...aula, dados: { horario: vazioParaNulo(horario), local: vazioParaNulo(local), titulo: vazioParaNulo(titulo) } },
      data,
    )
    if (gravou) aoFechar()
  }

  return (
    <FolhaLateral aberta titulo={nova ? 'Novo dia de classe' : 'Editar dia de classe'} aoFechar={aoFechar}>
      <form onSubmit={(evento) => void enviar(evento)} className="flex flex-col gap-4">
        {nova && <CampoData rotulo="Data" value={data} onChange={setData} required />}
        <CampoHorario rotulo="Horário" value={horario} erro={erroDoHorario} onChange={(evento) => { setHorario(evento.target.value); setErroDoHorario(undefined) }} />
        <Campo rotulo="Local" value={local} maxLength={120} onChange={(evento) => setLocal(evento.target.value)} />
        <Campo rotulo="Título" value={titulo} maxLength={80} onChange={(evento) => setTitulo(evento.target.value)} />
        <Botao type="submit" disabled={desabilitado || (nova && data === '')}>
          Salvar
        </Botao>
      </form>
    </FolhaLateral>
  )
}
