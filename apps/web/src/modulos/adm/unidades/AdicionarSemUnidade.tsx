import { useState } from 'react'
import { useMoverUnidade } from '../../../api/desbravadores'
import { useSemMembros } from '../../../api/leitura'
import type { Unidade } from '../../../api/leitura'
import { Confirmacao } from '../../../ui/Confirmacao'
import { Selecao } from '../../../ui/Selecao'
import { MENSAGEM_GENERICA, lerErroDaApi } from '../desbravadores/erros'

/** Janela de um campo: escolhe quem está sem unidade e põe nesta. Fechar é com `aoFechar`. */
export function AdicionarSemUnidade({ unidade, aoFechar }: { unidade: Unidade; aoFechar: () => void }) {
  const semUnidade = useSemMembros()
  const mover = useMoverUnidade()
  const [escolhido, setEscolhido] = useState('')
  const [erro, setErro] = useState<string>()

  async function confirmar() {
    if (!escolhido) {
      setErro('Escolha um desbravador.')
      return
    }
    setErro(undefined)
    try {
      await mover.mutateAsync({ id: escolhido, unidadeId: unidade.id })
      aoFechar()
    } catch (falha) {
      setErro(lerErroDaApi(falha).geral ?? MENSAGEM_GENERICA)
    }
  }

  return (
    <Confirmacao aberta titulo={`Adicionar a ${unidade.nome}`} rotuloConfirmar="Adicionar" aoConfirmar={() => void confirmar()} aoCancelar={aoFechar}>
      <div className="flex flex-col gap-3">
        <Selecao rotulo="Desbravador sem unidade" value={escolhido} onChange={(evento) => setEscolhido(evento.target.value)}>
          <option value="">Escolha</option>
          {(semUnidade.data ?? []).map((membro) => (
            <option key={membro.dbvId} value={membro.dbvId}>
              {membro.nome}
            </option>
          ))}
        </Selecao>
        {erro && (
          <p role="alert" className="text-sm font-medium text-perigo">
            {erro}
          </p>
        )}
      </div>
    </Confirmacao>
  )
}
