import { useState } from 'react'
import type { FormEvent } from 'react'
import { hojeDoClube, useInativarDesbravador } from '../../../api/desbravadores'
import type { Desbravador } from '../../../api/desbravadores'
import { Botao } from '../../../ui/Botao'
import { Campo } from '../../../ui/Campo'
import { lerErroDaApi } from './erros'

interface Propriedades {
  desbravador: Desbravador
  aoConcluir: () => void
  aoCancelar: () => void
}

export function FormularioInativar({ desbravador, aoConcluir, aoCancelar }: Propriedades) {
  const [saidaEm, setSaidaEm] = useState(hojeDoClube())
  const [erro, setErro] = useState<string | null>(null)
  const inativar = useInativarDesbravador()

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setErro(null)
    try {
      await inativar.mutateAsync({ id: desbravador.id, saidaEm })
      aoConcluir()
    } catch (falha) {
      setErro(lerErroDaApi(falha).geral)
    }
  }

  return (
    <form noValidate onSubmit={(evento) => void enviar(evento)} className="flex flex-col gap-4">
      <p className="text-base text-texto-2">
        {desbravador.nome} sai do clube na data escolhida: deixa a unidade e as classes em curso ficam como desistência. O histórico permanece.
      </p>
      <Campo rotulo="Data de saída" type="date" value={saidaEm} onChange={(e) => setSaidaEm(e.target.value)} />
      {erro && (
        <p role="alert" className="text-sm font-medium text-perigo">
          {erro}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Botao variante="secundario" onClick={aoCancelar}>
          Cancelar
        </Botao>
        <Botao type="submit" variante="perigo" carregando={inativar.isPending}>
          Inativar
        </Botao>
      </div>
    </form>
  )
}
