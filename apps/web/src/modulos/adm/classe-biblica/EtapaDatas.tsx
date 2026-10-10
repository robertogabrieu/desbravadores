import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useDatasDaEdicao, usePainelDaEdicao, useTerminarEdicaoCB } from '../../../api/classe-biblica'
import type { DatasDaEdicao } from '../../../api/classe-biblica'
import { ErroDaApi } from '../../../api/cliente'
import { useConexao } from '../../../offline'
import { Botao, estiloDoBotao } from '../../../ui/Botao'
import { CabecalhoDaPagina } from '../../../ui/CabecalhoDaPagina'
import { CaixaMarcacao } from '../../../ui/CaixaMarcacao'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { IndicadorDeEtapas } from '../../../ui/IndicadorDeEtapas'
import { horaCurta } from '../formatos'
import { AVISO_SEM_INTERNET, ETAPAS_DA_EDICAO, dataCurta } from './useRascunhoDaEdicao'

type Data = DatasDaEdicao['datas'][number]

function rotuloDaData(data: Data, marcada: boolean, horario: string | null): string {
  const quando = marcada ? (horario ? horaCurta(horario) : null) : 'não terá'
  return [dataCurta(data.data), quando, data.motivo].filter(Boolean).join(' · ')
}

function paraOsGrupos(quantos: number): string {
  if (quantos === 1) return 'para o grupo'
  if (quantos === 2) return 'para os dois grupos'
  return `para os ${quantos} grupos`
}

function resumo(marcadas: number, total: number, grupos: number): string {
  const vao = marcadas === 1 ? '1 encontro vai' : `${marcadas} encontros vão`
  const fora = total - marcadas
  const ficam = fora === 0 ? '' : fora === 1 ? ' 1 data fica de fora.' : ` ${fora} datas ficam de fora.`
  return `${vao} para o calendário do clube, ${paraOsGrupos(grupos)}.${ficam}`
}

function Formulario({ id, datas, horario, grupos }: { id: string; datas: Data[]; horario: string | null; grupos: number }) {
  const navegar = useNavigate()
  const { modo } = useConexao()
  const terminar = useTerminarEdicaoCB(id)
  const [marcadas, setMarcadas] = useState(() => new Set(datas.filter((d) => d.marcada).map((d) => d.data)))
  const [erro, setErro] = useState<string | null>(null)
  // Dois cliques (ou Enter repetido) antes de o estado da mutação chegar à tela: só o primeiro envia.
  const enviando = useRef(false)

  const alternar = (data: string, marcar: boolean) => {
    setMarcadas((atual) => {
      const nova = new Set(atual)
      if (marcar) nova.add(data)
      else nova.delete(data)
      return nova
    })
  }

  const criar = () => {
    if (enviando.current || marcadas.size === 0) return
    enviando.current = true
    setErro(null)
    terminar.mutate(
      { datas: datas.filter((d) => marcadas.has(d.data)).map((d) => d.data) },
      {
        onSuccess: () => void navegar(`/adm/classe-biblica/${id}/pronta`),
        onError: (falha) => {
          enviando.current = false
          setErro(falha instanceof ErroDaApi && falha.classe !== 'REDE' ? falha.erro.mensagem : 'Não foi possível criar agora. Tente de novo.')
        },
      },
    )
  }

  const semConexao = modo === 'SEM_CONEXAO'
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 text-base text-texto-2">
        <p>Estas são as datas da edição. Desmarque as que não vão ter Classe Bíblica.</p>
        <p>Datas que caem em férias, feriado ou dia sem reunião já vêm desmarcadas, com o motivo. Se quiser, marque de novo.</p>
      </div>
      <ul className="flex flex-col">
        {datas.map((data) => {
          const marcada = marcadas.has(data.data)
          return (
            <li key={data.data}>
              <CaixaMarcacao
                rotulo={rotuloDaData(data, marcada, horario)}
                checked={marcada}
                onChange={(e) => alternar(data.data, e.target.checked)}
                className={marcada ? undefined : 'text-texto-2'}
              />
            </li>
          )
        })}
      </ul>
      <p className="text-base text-texto">
        {marcadas.size === 0 ? 'Marque ao menos uma data' : resumo(marcadas.size, datas.length, grupos)}
      </p>
      {semConexao && <p aria-live="polite" className="text-base text-texto-2">{AVISO_SEM_INTERNET}</p>}
      {erro && <p role="alert" className="text-base font-medium text-perigo">{erro}</p>}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Botao carregando={terminar.isPending} disabled={marcadas.size === 0 || semConexao} onClick={criar}>
          {`Criar ${marcadas.size} ${marcadas.size === 1 ? 'encontro' : 'encontros'}`}
        </Botao>
        <Link to={`/adm/classe-biblica/${id}/etapa/2`} className={estiloDoBotao({ variante: 'texto' })}>Voltar aos grupos</Link>
      </div>
    </div>
  )
}

export function EtapaDatas() {
  const { id = '' } = useParams()
  const datas = useDatasDaEdicao(id)
  const painel = usePainelDaEdicao(id)
  const { modo } = useConexao()
  const falha = datas.error ?? painel.error

  let conteudo
  if (falha) conteudo = <ErroDeCarga erro={falha} aoTentarDeNovo={() => { void datas.refetch(); void painel.refetch() }} />
  else if (!datas.data || !painel.data) conteudo = modo === 'SEM_CONEXAO' ? <DisponivelComInternet /> : <Carregando rotulo="Carregando as datas" />
  else conteudo = <Formulario id={id} datas={datas.data.datas} horario={painel.data.edicao.horario} grupos={painel.data.grupos.length} />

  return (
    <div className="flex flex-col gap-5 py-4">
      <CabecalhoDaPagina voltar={{ para: '/adm/classe-biblica', rotulo: 'Classe Bíblica' }} sobretitulo="Nova edição da Classe Bíblica" titulo="Datas dos encontros" />
      <IndicadorDeEtapas etapas={ETAPAS_DA_EDICAO} atual={3} />
      {conteudo}
    </div>
  )
}
