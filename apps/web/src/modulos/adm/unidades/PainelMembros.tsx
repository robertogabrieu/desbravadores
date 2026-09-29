import { useEffect, useState } from 'react'
import { useMoverUnidade } from '../../../api/desbravadores'
import { useMembrosUnidade, useSemMembros } from '../../../api/leitura'
import type { Membro, Unidade } from '../../../api/leitura'
import { Botao } from '../../../ui/Botao'
import { Cartao } from '../../../ui/Cartao'
import { EstadoVazio } from '../../../ui/EstadoVazio'
import { MENSAGEM_GENERICA, lerErroDaApi } from '../desbravadores/erros'

const SEGUNDOS_PARA_DESFAZER = 5

interface Desfazer {
  membro: Membro
  frase: string
  /** Unidade para onde a chamada inversa leva o desbravador. */
  voltarPara: string | null
}

function ListaDeMembros({ membros, rotuloDoBotao, aoTocar, ocupado }: {
  membros: Membro[]
  rotuloDoBotao: (membro: Membro) => string
  aoTocar: (membro: Membro) => void
  ocupado: boolean
}) {
  if (membros.length === 0) return <EstadoVazio titulo="Ninguém aqui" />
  return (
    <ul className="flex flex-col gap-2">
      {membros.map((membro) => (
        <li key={membro.dbvId}>
          <Botao variante="secundario" largura="total" className="justify-between" aria-label={rotuloDoBotao(membro)} disabled={ocupado} onClick={() => aoTocar(membro)}>
            <span>{membro.nome}</span>
            <span className="text-sm font-normal text-texto-2">{membro.classeAtual?.nome ?? 'sem classe'}</span>
          </Botao>
        </li>
      ))}
    </ul>
  )
}

/** Duas colunas: tocar num nome move na hora; o Desfazer fica 5 segundos. */
export function PainelMembros({ unidade }: { unidade: Unidade }) {
  const naUnidade = useMembrosUnidade(unidade.id)
  const semUnidade = useSemMembros()
  const moverUnidade = useMoverUnidade()
  const [desfazer, setDesfazer] = useState<Desfazer | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!desfazer) return
    const relogio = setTimeout(() => setDesfazer(null), SEGUNDOS_PARA_DESFAZER * 1000)
    return () => clearTimeout(relogio)
  }, [desfazer])

  async function mover(membro: Membro, destino: string | null, aposMover: Desfazer | null) {
    setErro(null)
    try {
      await moverUnidade.mutateAsync({ id: membro.dbvId, unidadeId: destino })
      setDesfazer(aposMover)
    } catch (falha) {
      setDesfazer(null)
      setErro(lerErroDaApi(falha).geral ?? MENSAGEM_GENERICA)
    }
  }

  const entrar = (membro: Membro) =>
    mover(membro, unidade.id, { membro, frase: `${membro.nome} entrou em ${unidade.nome}.`, voltarPara: null })
  const sair = (membro: Membro) =>
    mover(membro, null, { membro, frase: `${membro.nome} saiu de ${unidade.nome}.`, voltarPara: unidade.id })

  const ocupado = moverUnidade.isPending
  const dentro = naUnidade.data ?? []
  const fora = semUnidade.data ?? []

  return (
    <section aria-labelledby="titulo-membros" className="flex flex-col gap-3">
      <h2 id="titulo-membros" className="font-titulo text-xl font-bold text-texto">
        Membros de {unidade.nome}
      </h2>
      {(naUnidade.isError || semUnidade.isError) && (
        <p role="alert" className="text-sm font-medium text-perigo">
          Não foi possível carregar os membros. Tente de novo.
        </p>
      )}
      {erro && (
        <p role="alert" className="text-sm font-medium text-perigo">
          {erro}
        </p>
      )}
      {desfazer && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-botao bg-superficie-suave px-4 py-2 text-base text-texto">
          <span>{desfazer.frase}</span>
          <Botao
            variante="texto"
            onClick={() => {
              const { membro, voltarPara } = desfazer
              setDesfazer(null)
              void mover(membro, voltarPara, null)
            }}
          >
            Desfazer
          </Botao>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Cartao className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-texto-2">Na unidade ({dentro.length})</h3>
          <ListaDeMembros membros={dentro} ocupado={ocupado} rotuloDoBotao={(m) => `Tirar ${m.nome} de ${unidade.nome}`} aoTocar={(m) => void sair(m)} />
        </Cartao>
        <Cartao className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-texto-2">Sem unidade ({fora.length})</h3>
          <ListaDeMembros membros={fora} ocupado={ocupado} rotuloDoBotao={(m) => `Colocar ${m.nome} em ${unidade.nome}`} aoTocar={(m) => void entrar(m)} />
        </Cartao>
      </div>
    </section>
  )
}
