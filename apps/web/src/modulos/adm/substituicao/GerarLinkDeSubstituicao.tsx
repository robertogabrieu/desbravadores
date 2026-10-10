import { Check } from 'lucide-react'
import { useId, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useClasses } from '../../../api/leitura'
import { tipoDoLink, useDatasDeSubstituicao, useGerarSubstituicao } from '../../../api/substituicao'
import type { AlvoDaSubstituicao, JanelaElegivel, SubstituicaoComLink } from '../../../api/substituicao'
import { usePacote } from '../../../offline'
import { Botao, estiloDoBotao } from '../../../ui/Botao'
import { CabecalhoDaPagina } from '../../../ui/CabecalhoDaPagina'
import { Carregando, ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { EstadoNaoEncontrado } from '../../../ui/EstadoNaoEncontrado'
import { EstadoVazio } from '../../../ui/EstadoVazio'
import { ListaDePares } from '../../../ui/ListaDePares'
import { CorpoDaConsulta } from '../classes/CorpoDaConsulta'
import { MENSAGEM_GENERICA, lerErroDaApi } from '../desbravadores/erros'
import { linkDoWhatsApp } from '../desbravadores/mensagem-convite'
import { FUSO_PADRAO_DO_CLUBE, dataPorExtenso } from '../formatos'
import { ComUnidade } from '../unidades/FichaUnidade'
import { diaCurto, diaPorExtenso, janelaEmHoras, mensagemDaSubstituicao, paraQuem } from './mensagem-substituicao'
import type { AlvoComNome } from './mensagem-substituicao'

type Alvo = AlvoDaSubstituicao & AlvoComNome

export const GerarLinkDaUnidade = () => (
  <ComUnidade
    aoCarregar={(unidade) => (
      <GerarLink alvo={{ tipo: 'unidade', id: unidade.id, nome: unidade.nome }} voltar={{ para: `/adm/unidades/${unidade.id}`, rotulo: unidade.nome }} />
    )}
  />
)

export function GerarLinkDaClasse() {
  const { id = '' } = useParams()
  const classes = useClasses()
  return (
    <div className="flex flex-col gap-5 py-4">
      <CorpoDaConsulta consulta={classes} rotuloDeCarga="Carregando a classe">
        {(lista) => {
          const classe = lista.find((c) => c.id === id)
          if (!classe) return <EstadoNaoEncontrado registro="esta classe" lista={{ para: '/adm/classes', rotulo: 'Ver as classes' }} />
          return (
            <GerarLink
              alvo={{ tipo: 'classe', id: classe.id, nome: classe.nome }}
              voltar={{ para: `/adm/classes?classe=${classe.id}`, rotulo: classe.nome }}
            />
          )
        }}
      </CorpoDaConsulta>
    </div>
  )
}

/** A2 (escolher o dia) e, depois de gerar, A3 (o link pronto para mandar). */
function GerarLink({ alvo, voltar }: { alvo: Alvo; voltar: { para: string; rotulo: string } }) {
  const [gerada, setGerada] = useState<SubstituicaoComLink | null>(null)
  return (
    <>
      <CabecalhoDaPagina voltar={voltar} sobretitulo={paraQuem(alvo)} titulo="Link de substituição" />
      {gerada ? <LinkPronto alvo={alvo} gerada={gerada} /> : <EscolhaDoDia alvo={alvo} aoGerar={setGerada} />}
    </>
  )
}

function EscolhaDoDia({ alvo, aoGerar }: { alvo: Alvo; aoGerar: (gerada: SubstituicaoComLink) => void }) {
  const idPergunta = useId()
  const datas = useDatasDeSubstituicao(tipoDoLink(alvo))
  const gerar = useGerarSubstituicao(alvo)
  const fuso = useFusoDoClube()
  const [escolhida, setEscolhida] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  if (datas.isPending) return <Carregando rotulo="Carregando os dias com reunião" />
  if (datas.isError) return <ErroDeCarga erro={datas.error} aoTentarDeNovo={() => void datas.refetch()} />
  if (datas.data.length === 0) {
    return (
      <EstadoVazio
        titulo="Não há reunião no calendário nas próximas 4 semanas"
        acao={
          <Link to="/adm/calendario" className={estiloDoBotao({ variante: 'primario' })}>
            Abrir o calendário
          </Link>
        }
      />
    )
  }

  const dia = escolhida ?? datas.data[0].data

  async function confirmar() {
    setErro(null)
    try {
      aoGerar(await gerar.mutateAsync({ data: dia }))
    } catch (falha) {
      setErro(lerErroDaApi(falha).geral ?? MENSAGEM_GENERICA)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="flex flex-col gap-1">
        <b id={idPergunta} className="text-base font-bold text-texto">
          Para qual reunião?
        </b>
        <span className="text-base text-texto-2">O link abre no horário da reunião e fecha 3 horas depois.</span>
      </p>
      <div role="radiogroup" aria-labelledby={idPergunta} className="flex flex-col gap-2">
        {datas.data.map((janela, indice) => (
          <OpcaoDoDia
            key={janela.data}
            janela={janela}
            fuso={fuso}
            proxima={indice === 0}
            marcada={janela.data === dia}
            aoMarcar={() => setEscolhida(janela.data)}
          />
        ))}
      </div>
      <p className="text-sm text-texto-2">Só aparecem dias com reunião no calendário, de hoje até 4 semanas à frente.</p>
      {erro && (
        <p role="alert" className="text-sm font-medium text-perigo">
          {erro}
        </p>
      )}
      <Botao className="self-start" carregando={gerar.isPending} onClick={() => void confirmar()}>
        {`Gerar link para ${diaPorExtenso(dia)}`}
      </Botao>
    </div>
  )
}

function OpcaoDoDia({
  janela,
  fuso,
  proxima,
  marcada,
  aoMarcar,
}: {
  janela: JanelaElegivel
  fuso: string
  proxima: boolean
  marcada: boolean
  aoMarcar: () => void
}) {
  return (
    <label className="flex min-h-[var(--touch-min)] cursor-pointer items-center gap-3 rounded-botao border border-borda-controle bg-superficie px-4 py-3 has-[:checked]:border-marca has-[:checked]:bg-marca-suave">
      <input type="radio" name="dia-da-substituicao" checked={marcada} onChange={aoMarcar} className="size-5 shrink-0 accent-marca" />
      <span className="flex flex-col">
        <span className="text-base font-bold text-texto">{dataPorExtenso(janela.data)}</span>
        <span className="text-sm text-texto-2">{`das ${janelaEmHoras(janela, fuso)}${proxima ? ' · próxima reunião' : ''}`}</span>
      </span>
    </label>
  )
}

function LinkPronto({ alvo, gerada }: { alvo: Alvo; gerada: SubstituicaoComLink }) {
  const fuso = useFusoDoClube()
  const [aviso, setAviso] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const mensagem = mensagemDaSubstituicao({ alvo, janela: gerada, link: gerada.link, fuso })

  async function copiar() {
    setErro(null)
    try {
      await navigator.clipboard.writeText(gerada.link)
      setAviso('Link copiado.')
    } catch {
      setErro('Não foi possível copiar. Selecione o link na mensagem e copie.')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-center gap-2 text-base font-bold text-sucesso">
        <Check aria-hidden className="size-5" />
        Link pronto
      </p>
      <ListaDePares
        pares={[
          { rotulo: 'Para', valor: paraQuem(alvo) },
          { rotulo: 'Quando', valor: `${diaCurto(gerada.data)}, das ${janelaEmHoras(gerada, fuso)}` },
        ]}
      />
      <div className="flex flex-col gap-1">
        <p className="text-base text-texto-2">Mensagem que vai no WhatsApp:</p>
        <p className="rounded-botao bg-superficie-suave p-3 text-base break-words text-texto">{mensagem}</p>
      </div>
      <p className="text-sm text-texto-2">O link aparece só agora. Para mandar de novo, gere outro: o anterior deixa de valer.</p>
      <div className="flex flex-wrap items-center gap-2">
        <a className={estiloDoBotao({ variante: 'primario' })} href={linkDoWhatsApp(mensagem)} target="_blank" rel="noreferrer">
          Enviar por WhatsApp
        </a>
        <Botao variante="secundario" onClick={() => void copiar()}>
          Copiar link
        </Botao>
        {aviso && (
          <p role="status" className="text-sm font-semibold text-sucesso">
            {aviso}
          </p>
        )}
      </div>
      {erro && (
        <p role="alert" className="text-sm font-medium text-perigo">
          {erro}
        </p>
      )}
    </div>
  )
}

function useFusoDoClube(): string {
  const { pacote } = usePacote()
  return pacote?.clube.fuso ?? FUSO_PADRAO_DO_CLUBE
}
