import { hojeNoFuso } from '@desbravadores/shared'
import type { FotoEnvioDados } from '@desbravadores/shared'
import { Camera, Image, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { z } from 'zod'
import { useAlbum, useAlbuns, useReuniaoDoEnvio, useSemAutorizacao } from '../../api/fotos'
import { useReunioes } from '../../api/reunioes'
import { enfileirar, itensDaChave, useConexao, useFila, usePacote } from '../../offline'
import { formatarTamanho } from '../../offline/tipos/foto'
import type { PayloadFoto } from '../../offline/tipos/foto'
import { useSessao } from '../../sessao/useSessao'
import { BarraProgresso } from '../../ui/BarraProgresso'
import { Botao } from '../../ui/Botao'
import { Campo, CampoRotulado, estiloControle } from '../../ui/Campo'
import { cn } from '../../ui/cn'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { FaixaAviso } from '../../ui/FaixaAviso'
import { Selecao } from '../../ui/Selecao'
import { diaMes } from './formatos'
import { estiloBotaoLink } from './Galeria'
import { ambienteDoNavegador, reduzirFoto } from './reducao'
import { EstadoDaConsulta } from './ResultadoConsulta'

type Album = z.infer<typeof FotoEnvioDados>['album']

const FUSO_PADRAO = 'America/Sao_Paulo'
const CHAVE_NOVO = 'novo'

interface Opcao {
  chave: string
  titulo: string
  subtitulo: string
}
interface OpcaoDeAlbum extends Opcao {
  /** Vazio no "Novo álbum", que só vira álbum quando o nome e a data são preenchidos. */
  album: Album | null
  /** Título que o item da fila mostra ("Foto · <álbum>"). */
  tituloNaFila: string
}

interface FotoEscolhida {
  id: string
  arquivo: File
  previa: string
}

interface AlvoDeReuniao {
  unidadeId: string
  data: string
}

const chaveDaChamada = (unidadeId: string, data: string): string => `${unidadeId}:${data}`

function opcaoDeReuniao(unidadeId: string, data: string, hoje: string): OpcaoDeAlbum {
  const ehHoje = data === hoje
  return {
    chave: `reuniao:${data}`,
    titulo: ehHoje ? 'Reunião de hoje' : `Reunião · ${diaMes(data)}`,
    subtitulo: diaMes(data),
    album: { tipo: 'REUNIAO', unidadeId, data },
    tituloNaFila: `Reunião · ${diaMes(data)}`,
  }
}

const opcaoExistente = (id: string, titulo: string, data: string): OpcaoDeAlbum => ({
  chave: `existente:${id}`,
  titulo,
  subtitulo: diaMes(data),
  album: { tipo: 'EXISTENTE', id },
  tituloNaFila: titulo,
})

/** Nomes de quem não pode aparecer em foto, em ordem alfabética. */
const ordenar = (nomes: string[]): string[] => [...nomes].sort((a, b) => a.localeCompare(b, 'pt-BR'))

interface PropriedadesFormulario {
  unidades: Array<{ id: string; nome: string }>
  unidadeId: string
  aoTrocarUnidade: (id: string) => void
  reuniaoDoLink: AlvoDeReuniao | null
  albumDoLink: string | undefined
}

function FormularioDeEnvio({ unidades, unidadeId, aoTrocarUnidade, reuniaoDoLink, albumDoLink }: PropriedadesFormulario) {
  const { modo } = useConexao()
  const { pacote } = usePacote()
  const fila = useFila()
  const online = modo === 'ONLINE'
  const hoje = hojeNoFuso(pacote?.clube.fuso ?? FUSO_PADRAO, new Date())

  const reunioesDoMes = useReunioes(unidadeId, hoje.slice(0, 7))
  const [chamadaNaFila, setChamadaNaFila] = useState(false)
  useEffect(() => {
    let vigente = true
    void itensDaChave(chaveDaChamada(unidadeId, hoje)).then((itens) => {
      if (vigente) setChamadaNaFila(itens.length > 0)
    })
    return () => {
      vigente = false
    }
  }, [unidadeId, hoje])
  const chamadaNoPacote = pacote?.reunioesRecentes.some((reuniao) => reuniao.unidadeId === unidadeId && reuniao.data === hoje) ?? false
  const chamadaDeHoje = chamadaNaFila || chamadaNoPacote || (reunioesDoMes.data?.some((reuniao) => reuniao.data === hoje) ?? false)

  const albumDoLinkNoServidor = useAlbum(albumDoLink, online)
  const semAutorizacao = useSemAutorizacao(unidadeId, online)

  // Álbuns da reunião: a de hoje (se já há chamada) e a do link, sem repetir a mesma data.
  const datasDeReuniao = [...new Set([...(reuniaoDoLink ? [reuniaoDoLink.data] : []), ...(chamadaDeHoje ? [hoje] : [])])].sort().reverse()
  const opcoesDeReuniao = datasDeReuniao.map((data) => opcaoDeReuniao(unidadeId, data, hoje))
  const existentes = (pacote?.albunsRecentes ?? [])
    .filter((album) => album.unidadeId === unidadeId && !(album.reuniaoId !== null && datasDeReuniao.includes(album.data)))
    .sort((a, b) => b.data.localeCompare(a.data))
    .map((album) => opcaoExistente(album.id, album.titulo, album.data))
  const doLink = albumDoLinkNoServidor.data
  if (doLink && !existentes.some((opcao) => opcao.chave === `existente:${doLink.id}`)) existentes.unshift(opcaoExistente(doLink.id, doLink.titulo, doLink.data))
  const novo: OpcaoDeAlbum = { chave: CHAVE_NOVO, titulo: 'Novo álbum', subtitulo: 'Dê um nome ao álbum', album: null, tituloNaFila: '' }
  const opcoes = [...opcoesDeReuniao, ...existentes, novo]

  const [escolhida, setEscolhida] = useState<string>()
  const doAlbumLink = existentes.find((opcao) => opcao.chave === `existente:${albumDoLink ?? ''}`)
  const doReuniaoLink = opcoesDeReuniao.find((opcao) => opcao.chave === `reuniao:${reuniaoDoLink?.data ?? ''}`)
  const padrao = doAlbumLink ?? doReuniaoLink ?? opcoes[0]
  const opcaoAtual = opcoes.find((opcao) => opcao.chave === escolhida) ?? padrao
  const [nomeNovo, setNomeNovo] = useState('')
  const [dataNovo, setDataNovo] = useState(hoje)

  const [fotos, setFotos] = useState<FotoEscolhida[]>([])
  const previasParaLiberar = useRef<string[]>([])
  useEffect(() => {
    previasParaLiberar.current = fotos.map((foto) => foto.previa)
  }, [fotos])
  useEffect(() => () => previasParaLiberar.current.forEach((previa) => URL.revokeObjectURL(previa)), [])
  const [legenda, setLegenda] = useState('')
  const camera = useRef<HTMLInputElement>(null)
  const galeria = useRef<HTMLInputElement>(null)

  const adicionar = (evento: ChangeEvent<HTMLInputElement>) => {
    const escolhidas = Array.from(evento.target.files ?? [])
    evento.target.value = ''
    setFotos((atuais) => [...atuais, ...escolhidas.map((arquivo) => ({ id: crypto.randomUUID(), arquivo, previa: URL.createObjectURL(arquivo) }))])
  }
  const tirar = (id: string) => {
    const foto = fotos.find((candidata) => candidata.id === id)
    if (foto) URL.revokeObjectURL(foto.previa)
    setFotos((atuais) => atuais.filter((candidata) => candidata.id !== id))
  }

  const [preparando, setPreparando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [recusadas, setRecusadas] = useState<string[]>([])
  const [enviadas, setEnviadas] = useState<{ ids: string[]; album: Album; unidadeId: string } | null>(null)

  const nomesSemAutorizacao = ordenar(
    (online ? semAutorizacao.data?.nomes : undefined) ??
      pacote?.unidades.find((unidade) => unidade.id === unidadeId)?.membros.filter((membro) => !membro.autorizacaoImagem).map((membro) => membro.nomePublico) ??
      [],
  )

  const precisaDeNome = opcaoAtual.chave === CHAVE_NOVO && nomeNovo.trim() === ''
  const tamanhoTotal = fotos.reduce((soma, foto) => soma + foto.arquivo.size, 0)

  async function enviar() {
    setErro(null)
    setRecusadas([])
    setPreparando(true)
    try {
      const reduzidas: Array<{ foto: FotoEscolhida; blob: Blob }> = []
      const recusadasAgora: FotoEscolhida[] = []
      for (const foto of fotos) {
        try {
          reduzidas.push({ foto, blob: await reduzirFoto(foto.arquivo, ambienteDoNavegador) })
        } catch {
          recusadasAgora.push(foto)
        }
      }
      if (recusadasAgora.length > 0) {
        recusadasAgora.forEach((foto) => URL.revokeObjectURL(foto.previa))
        setRecusadas(recusadasAgora.map((foto) => foto.arquivo.name))
        setFotos((atuais) => atuais.filter((foto) => !recusadasAgora.includes(foto)))
        return
      }

      const album: Album = opcaoAtual.album ?? { tipo: 'NOVO', id: crypto.randomUUID(), unidadeId, titulo: nomeNovo.trim(), data: dataNovo }
      const tituloNaFila = opcaoAtual.album ? opcaoAtual.tituloNaFila : nomeNovo.trim()
      const legendaDoLote = legenda.trim() === '' ? null : legenda.trim()
      const chaveDaReuniao = album.tipo === 'REUNIAO' ? chaveDaChamada(album.unidadeId, album.data) : null
      const chamadaPendente = chaveDaReuniao !== null && (await itensDaChave(chaveDaReuniao)).some((item) => item.estado !== 'ENVIADO')
      const ids: string[] = []
      for (const { foto, blob } of reduzidas) {
        const fotoId = crypto.randomUUID()
        const payload: PayloadFoto = { fotoId, albumTitulo: tituloNaFila, nomeArquivo: `${fotoId}.jpg`, dados: { versaoPayload: 1, album, legenda: legendaDoLote } }
        await enfileirar({ tipo: 'FOTO', chave: `foto:${fotoId}`, ...(chamadaPendente && chaveDaReuniao ? { dependeDe: chaveDaReuniao } : {}), payload, blob })
        ids.push(fotoId)
        URL.revokeObjectURL(foto.previa)
      }
      setEnviadas({ ids, album, unidadeId })
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível guardar as fotos para envio.')
    } finally {
      setPreparando(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex flex-col gap-1">
        <h1 className="font-titulo text-2xl font-bold text-texto">Enviar fotos</h1>
        <span className="text-sm font-semibold text-texto-2">Galeria da unidade {unidades.find((unidade) => unidade.id === unidadeId)?.nome}</span>
      </header>
      {unidades.length > 1 && !enviadas && (
        <Selecao rotulo="Unidade" value={unidadeId} onChange={(evento) => aoTrocarUnidade(evento.target.value)}>
          {unidades.map((unidade) => (
            <option key={unidade.id} value={unidade.id}>
              {unidade.nome}
            </option>
          ))}
        </Selecao>
      )}
      {nomesSemAutorizacao.length > 0 && <FaixaAviso>Não fotografe: {nomesSemAutorizacao.join(', ')}</FaixaAviso>}
      <fieldset disabled={enviadas !== null} className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold text-texto">Álbum</legend>
        <div role="radiogroup" aria-label="Álbum" className="flex flex-col gap-2">
          {opcoes.map((opcao) => {
            const marcada = opcao.chave === opcaoAtual.chave
            return (
              <button
                key={opcao.chave}
                type="button"
                role="radio"
                aria-checked={marcada}
                onClick={() => setEscolhida(opcao.chave)}
                className={cn('flex min-h-[var(--touch-min)] items-center gap-3 rounded-cartao border-2 px-3.5 py-2 text-left', marcada ? 'border-marca bg-marca-suave' : 'border-superficie bg-superficie')}
              >
                <span className={cn('size-5 shrink-0 rounded-full', marcada ? 'border-[6px] border-marca bg-superficie' : 'border-2 border-borda')} />
                <span className="flex flex-col">
                  <span className="text-base font-semibold text-texto">{opcao.titulo}</span>
                  <span className="text-sm text-texto-2">{opcao.subtitulo}</span>
                </span>
              </button>
            )
          })}
        </div>
      </fieldset>
      {opcaoAtual.chave === CHAVE_NOVO && !enviadas && (
        <div className="flex flex-col gap-3">
          <Campo rotulo="Nome do álbum" value={nomeNovo} maxLength={80} onChange={(evento) => setNomeNovo(evento.target.value)} />
          <Campo rotulo="Data do álbum" type="date" value={dataNovo} onChange={(evento) => setDataNovo(evento.target.value)} />
        </div>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="font-titulo text-lg font-bold text-texto">Fotos selecionadas</h2>
          <span className="text-sm text-texto-2">{fotos.length === 0 ? 'Nenhuma foto escolhida' : `${fotos.length} ${fotos.length === 1 ? 'foto' : 'fotos'} · ${formatarTamanho(tamanhoTotal)}`}</span>
        </div>
        {fotos.length > 0 && (
          <ul className="grid grid-cols-3 gap-2">
            {fotos.map((foto) => (
              <li key={foto.id} className="relative aspect-square overflow-hidden rounded-botao bg-marca-suave">
                <img src={foto.previa} alt={`Prévia de ${foto.arquivo.name}`} className="size-full object-cover" />
                {!enviadas && (
                  <button type="button" aria-label="Remover foto" onClick={() => tirar(foto.id)} className="absolute right-1 top-1 flex size-8 items-center justify-center rounded-full bg-black/60 text-white">
                    <X aria-hidden className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {!enviadas && (
          <div className="flex gap-2">
            <Botao variante="secundario" className="flex-1" onClick={() => camera.current?.click()}>
              <Camera aria-hidden className="size-4" />
              Câmera
            </Botao>
            <Botao variante="secundario" className="flex-1" onClick={() => galeria.current?.click()}>
              <Image aria-hidden className="size-4" />
              Galeria
            </Botao>
            <input ref={camera} type="file" accept="image/*" capture="environment" aria-label="Foto da câmera" className="hidden" onChange={adicionar} />
            <input ref={galeria} type="file" accept="image/*" multiple aria-label="Fotos da galeria" className="hidden" onChange={adicionar} />
          </div>
        )}
        <span className="text-sm text-texto-2">As fotos são reduzidas automaticamente antes do envio (máx. 2 MB cada).</span>
      </section>

      <CampoRotulado rotulo="Legenda (opcional)" idCampo="legenda-do-lote">
        <textarea id="legenda-do-lote" rows={2} maxLength={300} disabled={enviadas !== null} value={legenda} onChange={(evento) => setLegenda(evento.target.value)} placeholder="Ex.: ensaio do grito de guerra" className={cn(estiloControle, 'py-2')} />
      </CampoRotulado>

      {recusadas.length > 0 && (
        <div role="alert" className="flex flex-col gap-1 text-base font-medium text-perigo">
          <p>Formato de foto não aceito</p>
          <p className="text-sm">{recusadas.join(', ')}</p>
        </div>
      )}
      {erro && (
        <p role="alert" className="text-base font-medium text-perigo">
          {erro}
        </p>
      )}

      {enviadas ? (
        <AndamentoDoEnvio itens={fila.itens} enviadas={enviadas} />
      ) : (
        <Botao largura="total" disabled={fotos.length === 0 || precisaDeNome} carregando={preparando} onClick={() => void enviar()}>
          {fotos.length === 0 ? 'Selecione fotos' : `Enviar ${fotos.length} ${fotos.length === 1 ? 'foto' : 'fotos'}`}
        </Botao>
      )}
    </div>
  )
}

interface PropriedadesAndamento {
  itens: ReturnType<typeof useFila>['itens']
  enviadas: { ids: string[]; album: Album; unidadeId: string }
}

/** Progresso lido da fila: cada foto é um item, e a tela só soma o que a fila já sabe. */
function AndamentoDoEnvio({ itens, enviadas }: PropriedadesAndamento) {
  const { modo } = useConexao()
  const { ids, album, unidadeId } = enviadas
  const total = ids.length
  const daFila = ids.map((id) => itens.find((item) => item.chave === `foto:${id}`))
  const concluidas = daFila.filter((item) => item?.estado === 'ENVIADO').length
  const comErro = daFila.filter((item) => item?.estado === 'ERRO')
  const percentual = daFila.reduce((soma, item) => soma + (item?.estado === 'ENVIADO' ? 100 : (item?.progresso ?? 0)), 0) / total
  const terminou = concluidas === total

  const albunsDaUnidade = useAlbuns(unidadeId, terminou && album.tipo === 'REUNIAO' && modo === 'ONLINE')
  const reuniao = album.tipo === 'REUNIAO' ? album : null
  const albumDaReuniao = reuniao && albunsDaUnidade.data?.find((candidato) => candidato.reuniaoId !== null && candidato.data === reuniao.data)
  const destino = album.tipo === 'REUNIAO' ? (albumDaReuniao ? `/galeria/${albumDaReuniao.id}` : '/galeria') : `/galeria/${album.id}`

  return (
    <div className="flex flex-col gap-3">
      {comErro.length > 0 && (
        <FaixaAviso>
          <p>{comErro.length === 1 ? '1 foto não foi enviada.' : `${comErro.length} fotos não foram enviadas.`}</p>
          {comErro[0]?.erro && <p>{comErro[0].erro.mensagem}</p>}
        </FaixaAviso>
      )}
      {terminou ? (
        <div className="flex flex-col gap-3">
          <p className="text-lg font-semibold text-sucesso">{total === 1 ? '1 foto enviada' : `${total} fotos enviadas`}</p>
          <Link to={destino} className={estiloBotaoLink}>
            Ver álbum
          </Link>
        </div>
      ) : (
        <>
          <BarraProgresso valor={percentual} rotulo="Progresso do envio" />
          <Botao largura="total" disabled carregando>
            {`Enviando ${concluidas} de ${total}…`}
          </Botao>
          <span className="text-sm text-texto-2">Pode sair desta tela — o envio continua enquanto o app estiver aberto.</span>
        </>
      )}
    </div>
  )
}

/** Enviar fotos (C8): escolhe o álbum e as fotos, reduz no aparelho e entrega tudo à fila de envio. */
export function EnviarFotos() {
  const { vinculoAtivo } = useSessao()
  const { modo } = useConexao()
  const { pacote } = usePacote()
  const [parametros] = useSearchParams()
  const [escolhida, setEscolhida] = useState<string>()
  const unidades = vinculoAtivo?.unidades ?? []
  const reuniaoId = parametros.get('reuniao') ?? undefined
  const consultaReuniao = useReuniaoDoEnvio(reuniaoId, modo === 'ONLINE')

  if (unidades.length === 0) return <EstadoVazio titulo="Você ainda não tem unidade. Fale com o Adm do clube." />

  const doServidor = consultaReuniao.data ? { unidadeId: consultaReuniao.data.unidade.id, data: consultaReuniao.data.data } : null
  const doPacote = pacote?.reunioesRecentes.find((reuniao) => reuniao.id === reuniaoId)
  const reuniaoDoLink: AlvoDeReuniao | null = doServidor ?? (doPacote ? { unidadeId: doPacote.unidadeId, data: doPacote.data } : null)
  if (reuniaoId && !reuniaoDoLink) return <EstadoDaConsulta consulta={consultaReuniao} rotuloCarga="Carregando os álbuns" />

  const candidatas = [escolhida, reuniaoDoLink?.unidadeId, parametros.get('unidade')]
  const unidadeId = candidatas.find((id) => id !== null && id !== undefined && unidades.some((unidade) => unidade.id === id)) ?? unidades[0].id

  return (
    <FormularioDeEnvio
      key={unidadeId}
      unidades={unidades}
      unidadeId={unidadeId}
      aoTrocarUnidade={setEscolhida}
      reuniaoDoLink={reuniaoDoLink?.unidadeId === unidadeId ? reuniaoDoLink : null}
      albumDoLink={parametros.get('album') ?? undefined}
    />
  )
}
