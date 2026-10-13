import { GRUPOS_DE_REGRA, definicaoDaRegra } from '@desbravadores/shared'
import type { DefinicaoDeRegra } from '@desbravadores/shared'
import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useSalvarRegra } from '../../../api/ranking-regras'
import type { RegraDoClube } from '../../../api/ranking-regras'
import { Botao } from '../../../ui/Botao'
import { CampoComPasso } from '../../../ui/CampoComPasso'
import { FolhaLateral } from '../../../ui/FolhaLateral'
import { MENSAGEM_GENERICA, lerErroDaApi } from '../desbravadores/erros'
import { pontosDaReuniaoPerfeita } from './resumo'

const MENSAGEM_DE_PONTOS = 'Use um número inteiro entre 0 e 1000.'

/** Inteiro de 0 a 1000, ou nulo. */
function lerPontos(texto: string): number | null {
  const limpo = texto.trim()
  if (!/^\d+$/.test(limpo)) return null
  const numero = Number(limpo)
  return numero <= 1000 ? numero : null
}

interface PropriedadesDoPainel {
  /** A regra em edição; nula com o painel fechado. */
  regra: RegraDoClube | null
  regras: RegraDoClube[]
  aoFechar: () => void
  aoSalvar: (salva: RegraDoClube) => void
}

export function PainelDaRegra({ regra, regras, aoFechar, aoSalvar }: PropriedadesDoPainel) {
  return (
    <FolhaLateral aberta={regra !== null} titulo={regra ? definicaoDaRegra(regra.gatilho).rotulo : ''} aoFechar={aoFechar}>
      {regra && <CorpoDoPainel key={regra.gatilho} regra={regra} regras={regras} aoFechar={aoFechar} aoSalvar={aoSalvar} />}
    </FolhaLateral>
  )
}

function textoDoEfeito(definicao: DefinicaoDeRegra, regra: RegraDoClube, regras: RegraDoClube[], pontos: number | null, ativa: boolean) {
  if (pontos === null) return 'Corrija o valor para ver o efeito.'
  if (!ativa) {
    return (
      <>
        Desligada: <b>{definicao.rotulo}</b> deixa de dar ponto.
      </>
    )
  }
  if (definicao.grupo !== 'reuniao') {
    return (
      <>
        Cada vez que isso acontecer, o desbravador ganha <b>{pontos}</b> pontos.
      </>
    )
  }
  const hoje = pontosDaReuniaoPerfeita(regras)
  const semEstaRegra = hoje - (regra.ativo ? regra.pontos : 0)
  return (
    <>
      Uma reunião perfeita vai de <b>{hoje}</b> para <b>{semEstaRegra + pontos}</b> pontos.
    </>
  )
}

function CorpoDoPainel({ regra, regras, aoFechar, aoSalvar }: PropriedadesDoPainel & { regra: RegraDoClube }) {
  const definicao = definicaoDaRegra(regra.gatilho)
  const lancadoPor = GRUPOS_DE_REGRA.find((g) => g.chave === definicao.grupo)?.lancadoPor ?? ''
  const idLiga = useId()
  const [texto, setTexto] = useState(String(regra.pontos))
  const [ativa, setAtiva] = useState(regra.ativo)
  const [verErro, setVerErro] = useState(false)
  const campo = useRef<HTMLInputElement>(null)
  const salvar = useSalvarRegra()

  const pontos = lerPontos(texto)
  const erroDoCampo = verErro && pontos === null ? MENSAGEM_DE_PONTOS : undefined
  const erroDoEnvio = salvar.isError ? (lerErroDaApi(salvar.error).geral ?? MENSAGEM_GENERICA) : null

  // A folha puxa o foco para o próprio painel depois de montar; o campo toma de volta em seguida.
  useEffect(() => {
    const espera = setTimeout(() => {
      campo.current?.focus()
      campo.current?.select()
    }, 0)
    return () => clearTimeout(espera)
  }, [])

  function enviar(evento: FormEvent) {
    evento.preventDefault()
    setVerErro(true)
    if (pontos === null) {
      campo.current?.focus()
      return
    }
    salvar.mutate({ gatilho: regra.gatilho, pontos, ativo: ativa }, { onSuccess: aoSalvar })
  }

  return (
    <form noValidate onSubmit={enviar} className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-base font-bold uppercase tracking-wide text-texto-2">Lançado por {lancadoPor}</p>
        <p className="text-base text-texto-2">{definicao.descricao}</p>
      </div>
      <CampoComPasso
        rotulo={`Pontos por ${definicao.rotulo.toLowerCase()}`}
        valor={texto}
        aoMudar={setTexto}
        aoSair={() => setVerErro(true)}
        minimo={0}
        maximo={1000}
        sufixo="pontos"
        unidade="ponto"
        ajuda="Digite um número de 0 a 1000."
        erro={erroDoCampo}
        refCampo={campo}
      />
      <label htmlFor={idLiga} className="flex min-h-[var(--touch-min)] cursor-pointer items-start gap-3">
        <input
          id={idLiga}
          type="checkbox"
          checked={ativa}
          onChange={(evento) => setAtiva(evento.target.checked)}
          aria-labelledby={`${idLiga}-rotulo`}
          aria-describedby={`${idLiga}-ajuda`}
          className="mt-0.5 size-6 shrink-0 accent-marca"
        />
        <span>
          <b id={`${idLiga}-rotulo`} className="block text-base">
            Esta regra dá ponto
          </b>
          <span id={`${idLiga}-ajuda`} className="text-base text-texto-2">
            {regra.ativo ? 'Desligue para parar de dar ponto. O valor fica guardado.' : 'Ligue para voltar a dar ponto. Está desligada agora.'}
          </span>
        </span>
      </label>
      <p aria-live="polite" className="rounded-botao bg-fundo px-4 py-3 text-base tabular-nums">
        {textoDoEfeito(definicao, regra, regras, pontos, ativa)}
      </p>
      <div className="flex flex-col gap-3 border-t border-divisor pt-4">
        <p className="text-base font-semibold text-texto">Vale a partir de agora. Os pontos que já foram lançados não mudam.</p>
        {erroDoEnvio && (
          <p role="alert" className="text-base font-semibold text-perigo">
            {erroDoEnvio}
          </p>
        )}
        <Botao type="submit" largura="total" carregando={salvar.isPending}>
          Salvar pontos
        </Botao>
        <Botao variante="texto" largura="total" onClick={aoFechar}>
          Cancelar
        </Botao>
      </div>
    </form>
  )
}
