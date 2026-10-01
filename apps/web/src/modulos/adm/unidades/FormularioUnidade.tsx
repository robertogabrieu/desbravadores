import { UnidadeCriarEntrada, UnidadeEditarEntrada } from '@desbravadores/shared'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useCriarUnidade, useEditarUnidade } from '../../../api/unidades'
import type { Unidade } from '../../../api/leitura'
import { CaixaMarcacao } from '../../../ui/CaixaMarcacao'
import { Campo } from '../../../ui/Campo'
import { RodapeDoFormulario } from '../../../ui/RodapeDoFormulario'
import { Selecao } from '../../../ui/Selecao'
import { lerErroDaApi } from '../desbravadores/erros'
import { TIPOS_DE_UNIDADE, rotuloDoTipo } from './tipos'
import type { TipoUnidade } from './tipos'

interface Propriedades {
  /** Ausente: unidade nova. */
  unidade?: Unidade
  cancelar: { para: string; estado?: object }
  aoConcluir: (unidade: Unidade) => void
}

export function FormularioUnidade({ unidade, cancelar, aoConcluir }: Propriedades) {
  const [nome, setNome] = useState(unidade?.nome ?? '')
  const [tipo, setTipo] = useState<TipoUnidade>(unidade?.tipo ?? 'MISTA')
  const [grito, setGrito] = useState(unidade?.gritoDeGuerra ?? '')
  const [ativa, setAtiva] = useState(unidade?.ativa ?? true)
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const criar = useCriarUnidade()
  const editar = useEditarUnidade()

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setErros({})
    setErroGeral(null)
    const gritoDeGuerra = grito.trim() || null
    const entrada = { nome, tipo, gritoDeGuerra }
    if (!(unidade ? UnidadeEditarEntrada : UnidadeCriarEntrada).safeParse(entrada).success) {
      setErros({ nome: 'Informe o nome da unidade' })
      return
    }
    try {
      const gravada = unidade ? await editar.mutateAsync({ id: unidade.id, entrada: { ...entrada, ativa } }) : await criar.mutateAsync(entrada)
      aoConcluir(gravada)
    } catch (falha) {
      const { campos, geral } = lerErroDaApi(falha)
      setErros(campos)
      setErroGeral(geral)
    }
  }

  return (
    <form noValidate onSubmit={(evento) => void enviar(evento)} className="flex flex-col gap-4">
      <Campo rotulo="Nome" value={nome} erro={erros['nome']} onChange={(e) => setNome(e.target.value)} />
      <Selecao rotulo="Tipo" value={tipo} onChange={(e) => setTipo(TIPOS_DE_UNIDADE.find((t) => t === e.target.value) ?? 'MISTA')}>
        {TIPOS_DE_UNIDADE.map((t) => (
          <option key={t} value={t}>
            {rotuloDoTipo(t)}
          </option>
        ))}
      </Selecao>
      <Campo rotulo="Grito de guerra" value={grito} erro={erros['gritoDeGuerra']} onChange={(e) => setGrito(e.target.value)} />
      {unidade && <CaixaMarcacao rotulo="Unidade ativa" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} />}
      {erroGeral && (
        <p role="alert" className="text-sm font-medium text-perigo">
          {erroGeral}
        </p>
      )}
      <RodapeDoFormulario cancelar={cancelar} rotuloSalvar={unidade ? 'Salvar alterações' : 'Salvar'} salvando={criar.isPending || editar.isPending} />
    </form>
  )
}
