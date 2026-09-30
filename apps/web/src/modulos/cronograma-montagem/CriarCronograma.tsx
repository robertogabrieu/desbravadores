import { useState } from 'react'
import { ErroDaApi } from '../../api/cliente'
import { useCriarCronograma, useInicioAnoClube } from '../../api/montagem'
import { Botao } from '../../ui/Botao'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { FaixaAviso } from '../../ui/FaixaAviso'
import { periodoPadrao } from './datas'

interface Propriedades {
  classeId: string
  nomeDaClasse: string
  ano: number
}

const dataCompleta = (data: string): string => `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`

/** Sem cronograma: oferece criar, com o ano do clube como período (G5). */
export function CriarCronograma({ classeId, nomeDaClasse, ano }: Propriedades) {
  const inicioAno = useInicioAnoClube()
  const criar = useCriarCronograma(classeId, ano)
  const [erro, setErro] = useState<string | null>(null)
  const periodo = inicioAno.data ? periodoPadrao(ano, inicioAno.data) : null

  async function aoCriar() {
    if (!periodo) return
    setErro(null)
    try {
      await criar.mutateAsync({ classeId, anoClube: ano, ...periodo })
    } catch (falha) {
      setErro(falha instanceof ErroDaApi ? falha.erro.mensagem : 'Não foi possível criar agora. Tente de novo.')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {erro && <FaixaAviso>{erro}</FaixaAviso>}
      <EstadoVazio
        titulo={`${nomeDaClasse} ainda não tem cronograma em ${ano}`}
        descricao={
          periodo
            ? `Ele começa valendo o ano do clube: de ${dataCompleta(periodo.inicio)} a ${dataCompleta(periodo.fim)}.`
            : 'Ele começa valendo o ano do clube.'
        }
        acao={
          <Botao carregando={criar.isPending} disabled={periodo === null} onClick={() => void aoCriar()}>
            Criar cronograma
          </Botao>
        }
      />
    </div>
  )
}
