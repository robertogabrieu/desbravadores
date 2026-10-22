import { AcrescentarExemplares } from '@desbravadores/shared'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAcrescentarExemplares, useDarBaixa } from '../../api/emprestimos'
import { Campo } from '../../ui/Campo'
import { Confirmacao } from '../../ui/Confirmacao'
import { mensagemDe } from './DialogosDaBiblioteca'

/** A mesma regra do contrato (1 a 50); o campo de número devolve texto, então vazio e fração são tratados antes. */
function erroDaQuantidade(texto: string): string | null {
  const quantidade = texto.trim() === '' ? 0 : Number(texto)
  if (!Number.isInteger(quantidade)) return 'Informe um número inteiro de exemplares.'
  const lida = AcrescentarExemplares.shape.quantidade.safeParse(quantidade)
  return lida.success ? null : lida.error.issues[0].message
}

export function DialogoAcrescentarExemplares({ itemId, aoFechar }: { itemId: string; aoFechar: () => void }) {
  const acrescentar = useAcrescentarExemplares()
  const [quantidade, definirQuantidade] = useState('1')
  const [tentou, definirTentou] = useState(false)
  const erro = erroDaQuantidade(quantidade)

  const confirmar = () => {
    definirTentou(true)
    if (erro) return
    acrescentar.mutate({ itemId, quantidade: Number(quantidade) }, { onSuccess: aoFechar })
  }

  return (
    <Confirmacao
      aberta
      titulo="Acrescentar exemplares"
      rotuloConfirmar="Acrescentar"
      ocupada={acrescentar.isPending}
      erro={acrescentar.isError ? mensagemDe(acrescentar.error) : null}
      aoConfirmar={confirmar}
      aoCancelar={aoFechar}
    >
      <form
        onSubmit={(evento: FormEvent) => {
          evento.preventDefault()
          confirmar()
        }}
      >
        <Campo
          rotulo="Quantidade de exemplares"
          type="number"
          inputMode="numeric"
          min={1}
          max={50}
          value={quantidade}
          ajuda="Cada exemplar vira uma linha para emprestar e devolver."
          erro={tentou ? (erro ?? undefined) : undefined}
          onChange={(evento) => {
            if (acrescentar.isError) acrescentar.reset()
            definirQuantidade(evento.target.value)
          }}
        />
      </form>
    </Confirmacao>
  )
}

export function DialogoDarBaixa({ itemId, titulo, exemplar, aoFechar }: { itemId: string; titulo: string; exemplar: { id: string; numero: number }; aoFechar: () => void }) {
  const darBaixa = useDarBaixa()
  return (
    <Confirmacao
      aberta
      titulo={`Dar baixa no exemplar ${exemplar.numero}?`}
      rotuloConfirmar="Dar baixa"
      perigo
      ocupada={darBaixa.isPending}
      erro={darBaixa.isError ? mensagemDe(darBaixa.error) : null}
      aoConfirmar={() => darBaixa.mutate({ itemId, exemplarId: exemplar.id }, { onSuccess: aoFechar })}
      aoCancelar={aoFechar}
    >
      {`O exemplar ${exemplar.numero} de “${titulo}” sai da estante e do total de exemplares. O histórico de empréstimos fica, mas a baixa não pode ser desfeita.`}
    </Confirmacao>
  )
}
