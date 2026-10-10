import { Check, FileText, Link2, Upload } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { MaterialCBLinkEntrada } from '@desbravadores/shared'
import {
  LIMITE_DO_PDF_CB,
  useAnexarLinkCB,
  useEnviarMaterialCB,
  useGravarGruposCB,
  useGruposDaEdicao,
  usePainelDaEdicao,
} from '../../../api/classe-biblica'
import type { EdicaoCB, GrupoDaEdicao, GruposDaEdicao } from '../../../api/classe-biblica'
import { ErroDaApi } from '../../../api/cliente'
import { useConexao } from '../../../offline'
import { Botao, estiloDoBotao } from '../../../ui/Botao'
import { CabecalhoDaPagina } from '../../../ui/CabecalhoDaPagina'
import { CaixaMarcacao } from '../../../ui/CaixaMarcacao'
import { Campo } from '../../../ui/Campo'
import { Cartao } from '../../../ui/Cartao'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../../ui/EstadosDeCarga'
import { ResumoDosErros, useErrosAVista } from '../../../ui/ErrosDoFormulario'
import { IndicadorDeEtapas } from '../../../ui/IndicadorDeEtapas'
import { horaCurta, juntarNomes } from '../formatos'
import { LinhaDoSalvo, textoDoSalvo } from './EtapaDados'
import { ETAPAS_DA_EDICAO, diaMes, diasNoPlural, useRascunhoDaEdicao } from './useRascunhoDaEdicao'

type Material = GrupoDaEdicao['material']
type Unidade = GruposDaEdicao['unidades'][number]

interface GrupoLocal {
  chave: string
  id?: string
  nome: string
  unidadeIds: string[]
  material: Material
  temChamada: boolean
}

const MSG_ERRO = 'Não foi possível salvar agora. Tente de novo.'
const mensagemDe = (falha: unknown): string => (falha instanceof ErroDaApi && falha.classe !== 'REDE' ? falha.erro.mensagem : MSG_ERRO)
const megas = (bytes: number): string => (bytes / 1024 / 1024).toFixed(1).replace('.', ',')
const nomeDoGrupo = (grupo: GrupoLocal, indice: number): string => grupo.nome.trim() || `Grupo ${indice + 1}`

function linhaDaEdicao(edicao: EdicaoCB): string {
  const dia = diasNoPlural(edicao.diaSemana)
  const quando = edicao.horario ? `${dia[0].toUpperCase()}${dia.slice(1)}, ${horaCurta(edicao.horario)}` : `${dia[0].toUpperCase()}${dia.slice(1)}`
  const periodo = edicao.inicio && edicao.fim ? `${diaMes(edicao.inicio)} a ${diaMes(edicao.fim)}` : null
  return [quando, periodo, edicao.local].filter(Boolean).join(' · ')
}

function textoDasUnidades(grupos: GrupoLocal[], unidades: Unidade[]): string {
  const dentro = new Set(grupos.flatMap((grupo) => grupo.unidadeIds))
  const fora = unidades.filter((unidade) => !dentro.has(unidade.id))
  const conta = `${unidades.length - fora.length} de ${unidades.length} unidades estão em um grupo.`
  if (fora.length === 0) return conta
  const nomes = juntarNomes(fora.map((unidade) => `${unidade.nome} (${unidade.dbvs} DBVs)`))
  return `${conta} ${nomes} ${fora.length === 1 ? 'fica' : 'ficam'} fora da Classe Bíblica desta edição. Se for de propósito, pode seguir.`
}

function MaterialDoGrupo({ grupo, aoMudar }: { grupo: GrupoLocal; aoMudar: (material: Material) => void }) {
  const [trocando, setTrocando] = useState(false)
  const [colando, setColando] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [url, setUrl] = useState('')
  const [erroDoLink, setErroDoLink] = useState<string>()
  const [erro, setErro] = useState<string>()
  const enviar = useEnviarMaterialCB()
  const anexar = useAnexarLinkCB()
  const idEntrada = useId()

  const concluir = (salvo: GrupoDaEdicao) => {
    aoMudar(salvo.material)
    setTrocando(false)
    setColando(false)
    setErro(undefined)
  }

  const escolherArquivo = (evento: ChangeEvent<HTMLInputElement>) => {
    const arquivo = evento.target.files?.[0]
    evento.target.value = ''
    if (!arquivo || !grupo.id) return
    if (arquivo.type !== 'application/pdf' && !arquivo.name.toLowerCase().endsWith('.pdf')) return setErro('Envie um arquivo PDF')
    if (arquivo.size > LIMITE_DO_PDF_CB) return setErro('O PDF passa de 20 MB')
    setErro(undefined)
    enviar.mutate(
      { grupoId: grupo.id, arquivo, dados: { titulo: arquivo.name.replace(/\.pdf$/i, '').slice(0, 120) } },
      { onSuccess: concluir, onError: (falha) => setErro(mensagemDe(falha)) },
    )
  }

  const anexarLink = () => {
    if (!grupo.id) return
    const lido = MaterialCBLinkEntrada.safeParse({ titulo, url: url.trim() })
    const linkValido = /^https:\/\//i.test(url.trim()) && lido.success
    setErroDoLink(linkValido ? undefined : 'Use um link https://')
    if (!titulo.trim()) return setErro('Falta o nome do material')
    if (!linkValido || !lido.success) return
    anexar.mutate({ grupoId: grupo.id, ...lido.data }, { onSuccess: concluir, onError: (falha) => setErro(mensagemDe(falha)) })
  }

  const semMaterial = grupo.material === null
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-semibold text-texto">
        Material de estudo <span className="font-normal text-texto-2">(opcional)</span>
      </p>
      <p className="text-sm text-texto-2">
        {semMaterial
          ? 'O mesmo para a edição inteira. Um PDF de até 20 MB ou um link. Se ainda não tiver, pode anexar depois, na página da edição.'
          : 'O mesmo para a edição inteira. Um PDF de até 20 MB ou um link.'}
      </p>
      {grupo.material && !trocando && (
        <div className="flex items-center gap-3">
          <FileText aria-hidden className="size-6 shrink-0 text-marca" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-base font-semibold text-texto">{grupo.material.titulo}</span>
            <span className="flex items-center gap-1 text-sm text-sucesso">
              <Check aria-hidden className="size-4" />
              {grupo.material.tipo === 'PDF' && grupo.material.bytes !== null ? `PDF enviado · ${megas(grupo.material.bytes)} MB` : 'Link anexado'}
            </span>
          </div>
          <Botao variante="secundario" onClick={() => setTrocando(true)}>Trocar</Botao>
        </div>
      )}
      {(semMaterial || trocando) && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <label htmlFor={idEntrada} className={estiloDoBotao({ variante: 'secundario', className: 'cursor-pointer' })}>
              <Upload aria-hidden className="size-5" />
              Enviar PDF
              <input
                id={idEntrada}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                disabled={!grupo.id || enviar.isPending}
                onChange={escolherArquivo}
              />
            </label>
            <Botao variante="secundario" disabled={!grupo.id} onClick={() => setColando(true)}>
              <Link2 aria-hidden className="size-5" />
              Colar um link
            </Botao>
          </div>
          {enviar.isPending && <p role="status" className="text-sm text-texto-2">Enviando o PDF…</p>}
          {colando && (
            <div className="flex flex-col gap-3">
              <Campo rotulo="Nome do material" value={titulo} maxLength={120} onChange={(e) => setTitulo(e.target.value)} />
              <Campo rotulo="Link" ajuda="Ex.: https://www.exemplo.org/licoes" inputMode="url" value={url} erro={erroDoLink} onChange={(e) => setUrl(e.target.value)} />
              <Botao variante="secundario" className="w-fit" carregando={anexar.isPending} onClick={anexarLink}>Anexar o link</Botao>
            </div>
          )}
        </div>
      )}
      {erro && <p role="alert" className="text-sm font-medium text-perigo">{erro}</p>}
    </div>
  )
}

interface PropriedadesDoGrupo {
  grupo: GrupoLocal
  indice: number
  grupos: GrupoLocal[]
  unidades: Unidade[]
  erros: { nome?: string; unidades?: string }
  aoMudarNome: (nome: string) => void
  aoSairDoNome: () => void
  aoMarcar: (unidadeId: string, marcada: boolean) => void
  aoMudarMaterial: (material: Material) => void
  aoTirar?: () => void
}

function CartaoDoGrupo({ grupo, indice, grupos, unidades, erros, aoMudarNome, aoSairDoNome, aoMarcar, aoMudarMaterial, aoTirar }: PropriedadesDoGrupo) {
  const idTitulo = useId()
  const idUnidades = useId()
  const rotuloDaUnidade = (unidade: Unidade, marcada: boolean): { texto: string; desabilitada: boolean } => {
    const outro = grupos.findIndex((g, j) => j !== indice && g.unidadeIds.includes(unidade.id))
    if (!marcada && outro >= 0) return { texto: `${unidade.nome} · no ${nomeDoGrupo(grupos[outro], outro)}`, desabilitada: true }
    if (unidade.ocupadaPor?.tipo === 'EDICAO') return { texto: `${unidade.nome} · na ${unidade.ocupadaPor.nome}`, desabilitada: !marcada }
    return { texto: `${unidade.nome} · ${unidade.dbvs} DBVs`, desabilitada: false }
  }
  return (
    <Cartao>
      <section aria-labelledby={idTitulo} className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <h2 id={idTitulo} className="font-titulo text-lg font-bold text-texto">{`Grupo ${indice + 1}`}</h2>
          {aoTirar && <Botao variante="texto" onClick={aoTirar}>Tirar este grupo</Botao>}
        </div>
        <Campo
          rotulo="Nome do grupo"
          ajuda="Ex.: Grupo Daniel"
          value={grupo.nome}
          maxLength={120}
          erro={erros.nome}
          onChange={(e) => aoMudarNome(e.target.value)}
          onBlur={aoSairDoNome}
        />
        <fieldset id={idUnidades} data-com-erro={erros.unidades ? '' : undefined} className="flex flex-col">
          <legend className="mb-1 text-sm font-semibold text-texto">Unidades deste grupo</legend>
          {unidades.map((unidade) => {
            const marcada = grupo.unidadeIds.includes(unidade.id)
            const { texto, desabilitada } = rotuloDaUnidade(unidade, marcada)
            return (
              <CaixaMarcacao
                key={unidade.id}
                rotulo={texto}
                checked={marcada}
                disabled={desabilitada}
                onChange={(e) => aoMarcar(unidade.id, e.target.checked)}
                className={desabilitada ? 'cursor-not-allowed text-texto-2' : undefined}
              />
            )
          })}
          {erros.unidades && <p role="alert" className="text-sm font-medium text-perigo">{erros.unidades}</p>}
        </fieldset>
        <MaterialDoGrupo grupo={grupo} aoMudar={aoMudarMaterial} />
      </section>
    </Cartao>
  )
}

const paraLocal = (grupo: GrupoDaEdicao): GrupoLocal => ({
  chave: grupo.id, id: grupo.id, nome: grupo.nome, unidadeIds: grupo.unidadeIds, material: grupo.material, temChamada: grupo.temChamada,
})

let proximaChave = 0
const grupoNovo = (): GrupoLocal => ({ chave: `novo-${(proximaChave += 1)}`, nome: '', unidadeIds: [], material: null, temChamada: false })

type ErrosDosGrupos = Record<string, { nome?: string; unidades?: string }>

function Formulario({ edicao, inicial }: { edicao: EdicaoCB; inicial: GruposDaEdicao }) {
  const navegar = useNavigate()
  const rascunho = useRascunhoDaEdicao(edicao.id)
  const gravarGrupos = useGravarGruposCB(edicao.id)
  const [grupos, setGrupos] = useState<GrupoLocal[]>(() => (inicial.grupos.length > 0 ? inicial.grupos.map(paraLocal) : [grupoNovo()]))
  const [erros, setErros] = useState<ErrosDosGrupos>({})
  const [errosDoEnvio, setErrosDoEnvio] = useState<Record<string, string>>({})
  const [erroDaGravacao, setErroDaGravacao] = useState<string | null>(null)
  const [seguindo, setSeguindo] = useState(false)
  const atuais = useRef(grupos)
  const fila = useRef<Promise<unknown>>(Promise.resolve())
  const ultimoEnviado = useRef(JSON.stringify(inicial.grupos.map(({ id, nome, unidadeIds }) => ({ id, nome, unidadeIds }))))
  const { formulario, pendencias } = useErrosAVista(errosDoEnvio)

  const aplicar = (novos: GrupoLocal[]) => {
    atuais.current = novos
    setGrupos(novos)
  }

  const gravar = async () => {
    const corpo = { grupos: atuais.current.map(({ id, nome, unidadeIds }) => (id ? { id, nome: nome.trim(), unidadeIds } : { nome: nome.trim(), unidadeIds })) }
    const assinatura = JSON.stringify(corpo.grupos)
    if (assinatura === ultimoEnviado.current) return
    const salvos = await gravarGrupos.mutateAsync(corpo)
    ultimoEnviado.current = JSON.stringify(salvos.grupos.map(({ id, nome, unidadeIds }) => ({ id, nome, unidadeIds })))
    // O grupo novo ganha o id do servidor pela posição; o que a pessoa mudou nesse meio-tempo fica.
    aplicar(atuais.current.map((grupo, indice) => {
      const salvo = salvos.grupos[indice]
      return salvo && !grupo.id ? { ...grupo, id: salvo.id } : grupo
    }))
    rascunho.marcarSalvo(salvos.atualizadaEm)
    setErroDaGravacao(null)
  }

  const agendar = (): Promise<unknown> => {
    if (rascunho.semConexao) return Promise.resolve()
    fila.current = fila.current.then(gravar).catch((falha: unknown) => setErroDaGravacao(mensagemDe(falha)))
    return fila.current
  }

  const mudarGrupo = (indice: number, parcial: Partial<GrupoLocal>) => {
    aplicar(atuais.current.map((grupo, j) => (j === indice ? { ...grupo, ...parcial } : grupo)))
    const chave = atuais.current[indice].chave
    if (erros[chave]) setErros((atual) => ({ ...atual, [chave]: {} }))
  }

  const continuar = async (evento: FormEvent) => {
    evento.preventDefault()
    const encontrados: ErrosDosGrupos = {}
    for (const grupo of atuais.current) {
      const doGrupo = {
        nome: grupo.nome.trim() ? undefined : 'Dê um nome ao grupo',
        unidades: grupo.unidadeIds.length > 0 ? undefined : 'Marque ao menos uma unidade',
      }
      if (doGrupo.nome || doGrupo.unidades) encontrados[grupo.chave] = doGrupo
    }
    setErros(encontrados)
    setErrosDoEnvio(Object.fromEntries(Object.entries(encontrados).map(([chave, doGrupo]) => [chave, [doGrupo.nome, doGrupo.unidades].filter(Boolean).join(' ')])))
    if (Object.keys(encontrados).length > 0 || rascunho.semConexao) return
    setSeguindo(true)
    await agendar()
    const salva = await rascunho.salvar({ etapa: Math.max(3, edicao.etapa) })
    setSeguindo(false)
    if (salva) void navegar(`/adm/classe-biblica/${edicao.id}/etapa/3`)
  }

  const textoSalvo = erroDaGravacao && !rascunho.semConexao ? erroDaGravacao : textoDoSalvo(rascunho, false)

  return (
    <form ref={formulario} noValidate onSubmit={(evento) => void continuar(evento)} className="flex flex-col gap-5">
      <Cartao className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-base font-semibold text-texto">{edicao.nome ?? 'Edição sem nome'}</span>
          <span className="text-sm text-texto-2">{linhaDaEdicao(edicao)}</span>
        </div>
        <Link to={`/adm/classe-biblica/${edicao.id}/etapa/1`} className={estiloDoBotao({ variante: 'texto' })}>Alterar</Link>
      </Cartao>
      <p className="text-base text-texto-2">Cada grupo tem as suas unidades e, se quiser, um material de estudo. Uma unidade fica em um grupo só.</p>
      <ResumoDosErros pendencias={pendencias} />
      {grupos.map((grupo, indice) => (
        <CartaoDoGrupo
          key={grupo.chave}
          grupo={grupo}
          indice={indice}
          grupos={grupos}
          unidades={inicial.unidades}
          erros={erros[grupo.chave] ?? {}}
          aoMudarNome={(nome) => mudarGrupo(indice, { nome })}
          aoSairDoNome={() => void agendar()}
          aoMarcar={(unidadeId, marcada) => {
            const unidadeIds = marcada ? [...grupo.unidadeIds, unidadeId] : grupo.unidadeIds.filter((u) => u !== unidadeId)
            mudarGrupo(indice, { unidadeIds })
            void agendar()
          }}
          aoMudarMaterial={(material) => mudarGrupo(indice, { material })}
          aoTirar={indice > 0 && !grupo.temChamada ? () => {
            aplicar(atuais.current.filter((_, j) => j !== indice))
            void agendar()
          } : undefined}
        />
      ))}
      <Botao variante="secundario" className="w-fit" onClick={() => {
        aplicar([...atuais.current, grupoNovo()])
        void agendar()
      }}>
        Adicionar outro grupo
      </Botao>
      <LinhaDoSalvo texto={textoSalvo} />
      <p className="text-base text-texto-2">{textoDasUnidades(grupos, inicial.unidades)}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Botao type="submit" carregando={seguindo} disabled={rascunho.semConexao}>Continuar para as datas</Botao>
        <Link to={`/adm/classe-biblica/${edicao.id}/etapa/1`} className={estiloDoBotao({ variante: 'texto' })}>Voltar aos dados</Link>
      </div>
    </form>
  )
}

export function EtapaGrupos() {
  const { id = '' } = useParams()
  const grupos = useGruposDaEdicao(id)
  const painel = usePainelDaEdicao(id)
  const { modo } = useConexao()
  const pendente = grupos.isPending || painel.isPending
  const falha = grupos.error ?? painel.error

  let conteudo
  if (falha) conteudo = <ErroDeCarga erro={falha} aoTentarDeNovo={() => { void grupos.refetch(); void painel.refetch() }} />
  else if (pendente || !grupos.data || !painel.data) conteudo = modo === 'SEM_CONEXAO' ? <DisponivelComInternet /> : <Carregando rotulo="Carregando os grupos" />
  else conteudo = <Formulario edicao={painel.data.edicao} inicial={grupos.data} />

  return (
    <div className="flex flex-col gap-5 py-4">
      <CabecalhoDaPagina voltar={{ para: '/adm/classe-biblica', rotulo: 'Classe Bíblica' }} sobretitulo="Nova edição da Classe Bíblica" titulo="Grupos" />
      <IndicadorDeEtapas etapas={ETAPAS_DA_EDICAO} atual={2} />
      {conteudo}
    </div>
  )
}
