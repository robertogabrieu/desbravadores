import { EspecialidadeClubeEntrada } from '@desbravadores/shared'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useCriarEspecialidade } from '../../../api/classes-adm'
import type { AreaEspecialidades } from '../../../api/classes-adm'
import { Botao } from '../../../ui/Botao'
import { Campo } from '../../../ui/Campo'
import { Selecao } from '../../../ui/Selecao'
import { lerErroDaApi } from '../desbravadores/erros'

interface Propriedades {
  areas: AreaEspecialidades[]
  aoConcluir: () => void
  aoCancelar: () => void
}

export function FormularioEspecialidade({ areas, aoConcluir, aoCancelar }: Propriedades) {
  const [areaId, setAreaId] = useState('')
  const [nome, setNome] = useState('')
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const criar = useCriarEspecialidade()

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setErroGeral(null)
    const entrada = { areaId, nome: nome.trim() }
    if (!EspecialidadeClubeEntrada.safeParse(entrada).success) {
      setErros({
        ...(areaId === '' && { areaId: 'Escolha a área' }),
        ...(entrada.nome === '' && { nome: 'Informe o nome da especialidade' }),
      })
      return
    }
    setErros({})
    try {
      await criar.mutateAsync(entrada)
      aoConcluir()
    } catch (falha) {
      const { campos, geral } = lerErroDaApi(falha)
      setErros(campos)
      setErroGeral(geral)
    }
  }

  return (
    <form noValidate onSubmit={(evento) => void enviar(evento)} className="flex flex-col gap-4">
      <Selecao rotulo="Área" value={areaId} erro={erros['areaId']} onChange={(e) => setAreaId(e.target.value)}>
        <option value="">Escolha a área</option>
        {areas.map((area) => (
          <option key={area.id} value={area.id}>
            {area.nome}
          </option>
        ))}
      </Selecao>
      <Campo rotulo="Nome" value={nome} erro={erros['nome']} onChange={(e) => setNome(e.target.value)} />
      {erroGeral && (
        <p role="alert" className="text-sm font-medium text-perigo">
          {erroGeral}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Botao variante="secundario" onClick={aoCancelar}>
          Cancelar
        </Botao>
        <Botao type="submit" carregando={criar.isPending}>
          Salvar
        </Botao>
      </div>
    </form>
  )
}
