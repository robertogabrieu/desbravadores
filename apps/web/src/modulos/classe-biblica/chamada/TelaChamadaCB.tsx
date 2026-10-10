import { Check, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ErroDaApi } from '../../../api/cliente'
import { useChamadaCB } from '../../../api/classe-biblica'
import type { ChamadaCB } from '../../../api/classe-biblica'
import { enfileirar, useConexao, usePacote } from '../../../offline'
import { chaveDaChamadaCB } from '../../../offline/tipos/classe-biblica'
import type { PayloadChamadaCB } from '../../../offline/tipos/classe-biblica'
import { useSessao } from '../../../sessao/useSessao'
import { Botao } from '../../../ui/Botao'
import { CabecalhoDaPagina } from '../../../ui/CabecalhoDaPagina'
import type { DestinoDoVoltar } from '../../../ui/CabecalhoDaPagina'
import { Cartao } from '../../../ui/Cartao'
import { Chip } from '../../../ui/Chip'
import { Carregando } from '../../../ui/EstadosDeCarga'
import { EstadoVazio } from '../../../ui/EstadoVazio'
import { FaixaAviso } from '../../../ui/FaixaAviso'
import { cn } from '../../../ui/cn'
import { alternarParticipacao, alternarPresenca, chamadaDoPacote, fraseDosTotais, marcasIniciais, montarEnvio, textoDosTotais, totais } from './estado'
import type { Marcas, Totais } from './estado'

const TITULO = 'Chamada da Classe Bíblica'
const SEM_CONEXAO = 'Sem conexão. A chamada fica guardada no aparelho e é enviada quando a internet voltar.'
const ERRO_GENERICO = 'Não conseguimos abrir a chamada agora. Confira a internet e tente de novo.'
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const ESTILO_DO_LINK = 'inline-flex min-h-[var(--touch-min)] items-center font-semibold text-marca underline'

function diaMes(data: string): string {
  const [, mes, dia] = data.split('-')
  return `${dia}/${mes}`
}

const diaDaSemana = (data: string): string => DIAS[new Date(`${data}T12:00:00Z`).getUTCDay()] ?? ''

/** "Falcões e Panteras"; "Águias, Leões e Gaviões". */
function emLista(nomes: string[]): string {
  if (nomes.length <= 1) return nomes.join('')
  return `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1) ?? ''}`
}

/** O cabeçalho mostra a edição sem o "Classe Bíblica", que já está no título. */
const nomeCurtoDaEdicao = (nome: string): string => nome.replace(/^Classe Bíblica\s*/, '') || nome

interface Destinos {
  /** O link do topo: a edição para quem gerencia, o início para os outros. */
  cabecalho: DestinoDoVoltar
  /** O link do vazio e da confirmação. */
  acao: { para: string; texto: string }
}

function useDestinos(chamada: ChamadaCB | null): Destinos {
  const { pode } = useSessao()
  if (!pode('classebiblica.gerenciar')) {
    return { cabecalho: { para: '/inicio', rotulo: 'Início' }, acao: { para: '/inicio', texto: 'Voltar ao início' } }
  }
  const para = chamada ? `/adm/classe-biblica/${chamada.encontro.edicaoId}` : '/adm/classe-biblica'
  const rotulo = chamada ? nomeCurtoDaEdicao(chamada.encontro.edicaoNome) : 'Classe Bíblica'
  return { cabecalho: { para, rotulo }, acao: { para, texto: 'Voltar à edição' } }
}

export function TelaChamadaCB() {
  const { id = '', grupoId = '' } = useParams()
  const { modo } = useConexao()
  const guardado = usePacote()
  const online = modo === 'ONLINE'
  const consulta = useChamadaCB(id, grupoId, online)
  const pacoteCB = guardado.pacote?.classeBiblica
  const doPacote = pacoteCB ? chamadaDoPacote(pacoteCB, id, grupoId) : null
  const recusa = consulta.error instanceof ErroDaApi && consulta.error.classe === 'RECUSA' ? consulta.error : null

  let conteudo
  if (consulta.data) conteudo = <Chamada key={`${id}:${grupoId}`} chamada={consulta.data} />
  else if (online && consulta.isPending) conteudo = <SemChamada carregando />
  else if (recusa) conteudo = <SemChamada erro={recusa.erro.mensagem} aoTentar={() => void consulta.refetch()} />
  else if (guardado.carregando) conteudo = <SemChamada carregando />
  // Sem resposta do servidor, vale o que o aparelho guardou.
  else if (doPacote) conteudo = <Chamada key={`${id}:${grupoId}`} chamada={doPacote} />
  else if (online) conteudo = <SemChamada erro={ERRO_GENERICO} aoTentar={() => void consulta.refetch()} />
  else conteudo = <SemChamada foraDoAparelho />

  return (
    <main className="flex flex-col gap-4 p-4">
      {!online && <FaixaAviso>{SEM_CONEXAO}</FaixaAviso>}
      {conteudo}
    </main>
  )
}

interface PropriedadesSemChamada {
  carregando?: boolean
  erro?: string
  aoTentar?: () => void
  foraDoAparelho?: boolean
}

function SemChamada({ carregando, erro, aoTentar, foraDoAparelho }: PropriedadesSemChamada) {
  const destinos = useDestinos(null)
  return (
    <>
      <CabecalhoDaPagina voltar={destinos.cabecalho} titulo={TITULO} />
      {carregando && <Carregando rotulo="Carregando a chamada" />}
      {erro && (
        <div role="alert" className="flex flex-col items-center gap-3 px-6 py-10 text-center">
          <p className="text-base font-semibold text-perigo">{erro}</p>
          <Botao variante="secundario" onClick={aoTentar}>
            Tentar de novo
          </Botao>
        </div>
      )}
      {foraDoAparelho && (
        <EstadoVazio
          titulo="Esta chamada ainda não está no aparelho"
          descricao="Abra o app uma vez com internet antes do encontro. A partir daí a chamada funciona mesmo sem sinal."
        />
      )}
    </>
  )
}

function Chamada({ chamada }: { chamada: ChamadaCB }) {
  const { modo } = useConexao()
  const navegar = useNavigate()
  const destinos = useDestinos(chamada)
  const [marcas, setMarcas] = useState<Marcas>(() => marcasIniciais(chamada))
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set(chamada.unidades.slice(0, 1).map((u) => u.id)))
  const [guardada, setGuardada] = useState<Totais | null>(null)
  const [salvando, setSalvando] = useState(false)
  const { encontro, grupo } = chamada
  const data = diaMes(encontro.data)
  const contagem = totais(marcas)
  const vazia = chamada.unidades.every((unidade) => unidade.desbravadores.length === 0)

  async function salvar() {
    const payload: PayloadChamadaCB = {
      encontroId: encontro.id,
      grupoId: grupo.id,
      grupoNome: grupo.nome,
      data: encontro.data,
      corpo: montarEnvio(chamada, marcas, crypto.randomUUID()),
    }
    setSalvando(true)
    try {
      await enfileirar({ tipo: 'CLASSE_BIBLICA', chave: chaveDaChamadaCB(encontro.id, grupo.id), payload })
    } catch {
      toast.warning('Não deu para guardar a chamada no aparelho. Tente de novo.')
      return
    } finally {
      setSalvando(false)
    }
    if (modo === 'SEM_CONEXAO') {
      setGuardada(contagem)
      return
    }
    toast.success('Chamada salva', { description: 'Enviando agora.' })
    void navegar(destinos.acao.para)
  }

  function alternarUnidade(unidadeId: string) {
    setAbertas((atual) => {
      const nova = new Set(atual)
      if (!nova.delete(unidadeId)) nova.add(unidadeId)
      return nova
    })
  }

  const voltar = (
    <Link to={destinos.acao.para} className={ESTILO_DO_LINK}>
      {destinos.acao.texto}
    </Link>
  )

  return (
    <>
      <CabecalhoDaPagina voltar={destinos.cabecalho} titulo={TITULO} apoio={<span>{`${grupo.nome} · ${diaDaSemana(encontro.data)} ${data}`}</span>} />
      {guardada && (
        <Cartao role="status" className="flex flex-col gap-2">
          <h2 className="font-titulo text-lg font-bold">Chamada guardada no aparelho</h2>
          <p className="text-base">
            {`${vazia ? '' : `${fraseDosTotais(guardada)}. `}Ela vai ser enviada sozinha quando a internet voltar — não precisa fazer de novo.`}
          </p>
          {voltar}
        </Cartao>
      )}
      {vazia ? (
        <div className="flex flex-col items-center gap-3 px-6 py-8 text-center">
          <h2 className="font-titulo text-lg font-bold text-texto">{`Nenhum desbravador no ${grupo.nome} em ${data}`}</h2>
          <p className="max-w-sm text-base text-texto-2">
            {`${chamada.unidades.length > 0 ? emLista(chamada.unidades.map((u) => u.nome)) : 'As unidades do grupo'} não tinham desbravadores nesta data. Para pôr alguém, abra a unidade e acrescente.`}
          </p>
          <p className="max-w-sm text-base text-texto-2">Se o grupo se reuniu assim mesmo, registre a chamada vazia: o encontro conta como feito.</p>
          <Botao carregando={salvando} onClick={() => void salvar()}>
            Registrar a chamada sem ninguém
          </Botao>
          {voltar}
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1 text-base text-texto-2">
            <p>Todos começam presentes. Toque no nome de quem faltou. Depois marque quem participou ativamente.</p>
            <p>{`Cada desbravador aparece na unidade em que estava em ${data}.`}</p>
          </div>
          {chamada.unidades.map((unidade) => {
            const aberta = abertas.has(unidade.id)
            return (
              <section key={unidade.id} className="flex flex-col gap-2">
                <button
                  type="button"
                  aria-expanded={aberta}
                  onClick={() => alternarUnidade(unidade.id)}
                  className="flex min-h-[var(--touch-min)] items-center justify-between gap-2 rounded-botao px-1 text-left font-titulo text-lg font-bold focus-visible:outline-2 focus-visible:outline-marca"
                >
                  <span>{`${unidade.nome} · ${unidade.desbravadores.length}`}</span>
                  <ChevronDown aria-hidden className={cn('size-5 shrink-0 transition-transform', aberta && 'rotate-180')} />
                </button>
                {aberta && (
                  <ul className="grid gap-2 md:grid-cols-2">
                    {unidade.desbravadores.map((dbv) => (
                      <LinhaDbv
                        key={dbv.dbvId}
                        nome={dbv.nome}
                        entrou={dbv.entrouEm ? `Entrou nas ${unidade.nome} em ${diaMes(dbv.entrouEm)}` : null}
                        marca={marcas[dbv.dbvId] ?? { presente: true, participou: false }}
                        aoTocarNome={() => setMarcas(alternarPresenca(marcas, dbv.dbvId))}
                        aoTocarParticipacao={() => setMarcas(alternarParticipacao(marcas, dbv.dbvId))}
                      />
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
          <div role="region" aria-label="Salvar a chamada" className="flex flex-col gap-3 border-t border-borda pt-4">
            <p role="status" aria-live="polite" className="text-base font-semibold">
              {textoDosTotais(contagem)}
            </p>
            <Botao largura="total" carregando={salvando} onClick={() => void salvar()}>
              Salvar chamada
            </Botao>
          </div>
        </>
      )}
    </>
  )
}

interface PropriedadesLinha {
  nome: string
  entrou: string | null
  marca: { presente: boolean; participou: boolean }
  aoTocarNome: () => void
  aoTocarParticipacao: () => void
}

function LinhaDbv({ nome, entrou, marca, aoTocarNome, aoTocarParticipacao }: PropriedadesLinha) {
  const { presente } = marca
  const primeiroNome = nome.split(' ')[0] ?? nome
  return (
    <li
      aria-label={nome}
      className={cn(
        'flex flex-col gap-2 rounded-cartao p-3',
        presente ? 'border border-superficie bg-superficie' : 'border border-dashed border-borda bg-superficie-suave',
      )}
    >
      <button
        type="button"
        aria-pressed={presente}
        onClick={aoTocarNome}
        className="flex min-h-[var(--touch-min)] items-center gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca"
      >
        <span
          aria-hidden
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-lg',
            presente ? 'bg-marca text-white' : 'border-2 border-borda bg-superficie',
          )}
        >
          {presente && <Check className="size-5" />}
        </span>
        <span className="flex flex-col">
          <span className="font-semibold">{nome}</span>
          <span className="text-sm text-texto-2">{presente ? 'Presente' : 'Faltou'}</span>
          {entrou && <span className="text-sm text-texto-2">{entrou}</span>}
        </span>
      </button>
      <Chip
        variante="cheia"
        selecionado={presente && marca.participou}
        disabled={!presente}
        aria-label={presente ? undefined : `Participou ativamente: indisponível porque ${primeiroNome} faltou`}
        aoAlternar={aoTocarParticipacao}
        className="w-fit disabled:cursor-not-allowed disabled:opacity-50"
      >
        Participou ativamente
      </Chip>
    </li>
  )
}
