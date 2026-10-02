import { ChevronLeft, ExternalLink, Link2, Upload } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ErroDaApi } from '../../api/cliente'
import type { Material } from '../../api/materiais'
import {
  EXTENSOES_ACEITAS,
  useAdicionarLinkMaterial,
  useApagarMaterial,
  useEditarMaterial,
  useEnviarArquivoMaterial,
  useMateriais,
  useSecoesDaClasse,
} from '../../api/materiais'
import { useConexao } from '../../offline'
import { useSessao } from '../../sessao/useSessao'
import { Botao } from '../../ui/Botao'
import { Campo } from '../../ui/Campo'
import { Confirmacao } from '../../ui/Confirmacao'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../ui/EstadosDeCarga'
import { MenuCabecalho } from '../../ui/MenuCabecalho'
import { Selecao } from '../../ui/Selecao'
import { diaEMesCurto } from '../progresso/formatos'

const MENSAGEM_PADRAO = 'Não foi possível concluir agora. Tente de novo.'
const mensagemDe = (erro: Error | null): string => (erro instanceof ErroDaApi ? erro.erro.mensagem : MENSAGEM_PADRAO)
const FORMATOS_NO_TEXTO = `${EXTENSOES_ACEITAS.slice(0, -1).map((e) => e.slice(1).toUpperCase()).join(', ')} ou ${EXTENSOES_ACEITAS.slice(-1)[0]?.slice(1).toUpperCase() ?? ''}`
const SEM_SECAO = 'Sem seção'

const SELOS: Record<Material['tipo'], string> = { PDF: 'PDF', APRESENTACAO: 'PPT', DOCUMENTO: 'DOC', LINK: 'LINK' }

type Secao = { id: string; nome: string }
type Acao = { tipo: 'renomear' | 'mover' | 'apagar'; material: Material }

function tamanho(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1).replace('.', ',')} MB`
  return `${Math.max(1, Math.round(bytes / 1000))} KB`
}

function metaDoMaterial(material: Material): string {
  const data = diaEMesCurto(material.criadoEm.slice(0, 10))
  if (material.bytes !== null) return `${tamanho(material.bytes)} · ${data}`
  try {
    return `${new URL(material.url).hostname} · ${data}`
  } catch {
    return data
  }
}

function agruparPorSecao(materiais: Material[]): Array<{ chave: string; titulo: string; itens: Material[] }> {
  const grupos = new Map<string, { chave: string; titulo: string; itens: Material[] }>()
  for (const material of materiais) {
    const chave = material.secao?.id ?? ''
    const grupo = grupos.get(chave) ?? { chave, titulo: material.secao?.nome ?? SEM_SECAO, itens: [] }
    grupo.itens.push(material)
    grupos.set(chave, grupo)
  }
  return [...grupos.values()].sort((a, b) => Number(a.chave === '') - Number(b.chave === ''))
}

function OpcoesDeSecao({ secoes }: { secoes: Secao[] }) {
  return (
    <>
      <option value="">{SEM_SECAO}</option>
      {secoes.map((secao) => (
        <option key={secao.id} value={secao.id}>{secao.nome}</option>
      ))}
    </>
  )
}

function Erro({ children }: { children: ReactNode }) {
  return <p role="alert" className="text-sm font-medium text-perigo">{children}</p>
}

function DialogoEnvio({ classeId, secoes, aoFechar }: { classeId: string; secoes: Secao[]; aoFechar: () => void }) {
  const enviar = useEnviarArquivoMaterial()
  const [arquivo, definirArquivo] = useState<File | null>(null)
  const [titulo, definirTitulo] = useState('')
  const [secaoId, definirSecaoId] = useState('')
  const [tentou, definirTentou] = useState(false)
  const faltaArquivo = tentou && arquivo === null
  const faltaTitulo = tentou && titulo.trim() === ''

  const confirmar = () => {
    definirTentou(true)
    if (arquivo === null || titulo.trim() === '') return
    enviar.mutate({ arquivo, dados: { classeId, secaoId: secaoId === '' ? null : secaoId, titulo: titulo.trim() } }, { onSuccess: aoFechar })
  }

  return (
    <Confirmacao aberta titulo="Enviar arquivo" rotuloConfirmar="Enviar" aoConfirmar={confirmar} aoCancelar={aoFechar}>
      <div className="flex flex-col gap-3">
        <p className="text-sm">{`Formatos aceitos: ${FORMATOS_NO_TEXTO}, até 20 MB.`}</p>
        <Campo rotulo="Arquivo" type="file" accept={EXTENSOES_ACEITAS.join(',')} erro={faltaArquivo ? 'Escolha o arquivo.' : undefined} onChange={(e) => definirArquivo(e.target.files?.[0] ?? null)} />
        <Campo rotulo="Título" value={titulo} maxLength={120} erro={faltaTitulo ? 'Escreva o título.' : undefined} onChange={(e) => definirTitulo(e.target.value)} />
        <Selecao rotulo="Seção" value={secaoId} onChange={(e) => definirSecaoId(e.target.value)}>
          <OpcoesDeSecao secoes={secoes} />
        </Selecao>
        {enviar.isError && <Erro>{mensagemDe(enviar.error)}</Erro>}
      </div>
    </Confirmacao>
  )
}

function DialogoLink({ classeId, secoes, aoFechar }: { classeId: string; secoes: Secao[]; aoFechar: () => void }) {
  const adicionar = useAdicionarLinkMaterial()
  const [endereco, definirEndereco] = useState('')
  const [titulo, definirTitulo] = useState('')
  const [secaoId, definirSecaoId] = useState('')
  const [tentou, definirTentou] = useState(false)
  const enderecoInvalido = tentou && !endereco.trim().startsWith('https://')
  const faltaTitulo = tentou && titulo.trim() === ''

  const confirmar = () => {
    definirTentou(true)
    if (!endereco.trim().startsWith('https://') || titulo.trim() === '') return
    adicionar.mutate({ classeId, secaoId: secaoId === '' ? null : secaoId, titulo: titulo.trim(), url: endereco.trim() }, { onSuccess: aoFechar })
  }

  return (
    <Confirmacao aberta titulo="Adicionar link" rotuloConfirmar="Adicionar" aoConfirmar={confirmar} aoCancelar={aoFechar}>
      <div className="flex flex-col gap-3">
        <Campo rotulo="Endereço" type="url" value={endereco} placeholder="https://" erro={enderecoInvalido ? 'Use um link https://' : undefined} onChange={(e) => definirEndereco(e.target.value)} />
        <Campo rotulo="Título" value={titulo} maxLength={120} erro={faltaTitulo ? 'Escreva o título.' : undefined} onChange={(e) => definirTitulo(e.target.value)} />
        <Selecao rotulo="Seção" value={secaoId} onChange={(e) => definirSecaoId(e.target.value)}>
          <OpcoesDeSecao secoes={secoes} />
        </Selecao>
        {adicionar.isError && <Erro>{mensagemDe(adicionar.error)}</Erro>}
      </div>
    </Confirmacao>
  )
}

function DialogosDoMaterial({ acao, secoes, aoFechar }: { acao: Acao; secoes: Secao[]; aoFechar: () => void }) {
  const editar = useEditarMaterial()
  const apagar = useApagarMaterial()
  const [titulo, definirTitulo] = useState(acao.material.titulo)
  const [secaoId, definirSecaoId] = useState(acao.material.secao?.id ?? '')

  if (acao.tipo === 'apagar') {
    return (
      <Confirmacao
        aberta
        titulo="Apagar material?"
        rotuloConfirmar="Apagar"
        perigo
        erro={apagar.isError ? mensagemDe(apagar.error) : null}
        aoCancelar={aoFechar}
        aoConfirmar={() => apagar.mutate(acao.material.id, { onSuccess: aoFechar })}
      >
        {`“${acao.material.titulo}” some para todos os instrutores da classe.`}
      </Confirmacao>
    )
  }
  if (acao.tipo === 'renomear') {
    return (
      <Confirmacao
        aberta
        titulo="Renomear material"
        rotuloConfirmar="Salvar"
        aoCancelar={aoFechar}
        aoConfirmar={() => titulo.trim() !== '' && editar.mutate({ id: acao.material.id, titulo: titulo.trim() }, { onSuccess: aoFechar })}
      >
        <div className="flex flex-col gap-3">
          <Campo rotulo="Título" value={titulo} maxLength={120} onChange={(e) => definirTitulo(e.target.value)} />
          {editar.isError && <Erro>{mensagemDe(editar.error)}</Erro>}
        </div>
      </Confirmacao>
    )
  }
  return (
    <Confirmacao
      aberta
      titulo="Mover de seção"
      rotuloConfirmar="Mover"
      aoCancelar={aoFechar}
      aoConfirmar={() => editar.mutate({ id: acao.material.id, secaoId: secaoId === '' ? null : secaoId }, { onSuccess: aoFechar })}
    >
      <div className="flex flex-col gap-3">
        <Selecao rotulo="Seção" value={secaoId} onChange={(e) => definirSecaoId(e.target.value)}>
          <OpcoesDeSecao secoes={secoes} />
        </Selecao>
        {editar.isError && <Erro>{mensagemDe(editar.error)}</Erro>}
      </div>
    </Confirmacao>
  )
}

function LinhaDoMaterial({ material, aoEscolher }: { material: Material; aoEscolher: (tipo: Acao['tipo']) => void }) {
  const edicoes = [
    { rotulo: 'Renomear', aoEscolher: () => aoEscolher('renomear') },
    { rotulo: 'Mover de seção', aoEscolher: () => aoEscolher('mover') },
    { rotulo: 'Apagar', aoEscolher: () => aoEscolher('apagar') },
  ]
  return (
    <li className="flex items-center gap-3 rounded-cartao border border-borda bg-superficie p-3">
      <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-botao bg-marca-suave text-xs font-extrabold text-marca">{SELOS[material.tipo]}</span>
      <span className="flex min-w-0 flex-1 flex-col">
        <a href={material.url} target="_blank" rel="noopener noreferrer" className="truncate text-base font-semibold text-texto underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-marca">
          {material.titulo}
        </a>
        <span className="text-sm text-texto-2">{metaDoMaterial(material)}</span>
      </span>
      <a
        href={material.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Abrir ${material.titulo}`}
        className="flex min-h-[var(--touch-min)] shrink-0 items-center gap-1 rounded-botao border border-marca px-3 text-base font-semibold text-marca hover:bg-marca-suave focus-visible:outline-2 focus-visible:outline-marca"
      >
        <ExternalLink aria-hidden className="size-4" />
        Abrir
      </a>
      {material.podeEditar && <MenuCabecalho rotulo="Opções" rotuloAcessivel={`Opções de ${material.titulo}`} itens={edicoes} />}
    </li>
  )
}

function Conteudo({ classeId, secoes }: { classeId: string; secoes: Secao[] }) {
  const materiais = useMateriais(classeId)
  const [acao, definirAcao] = useState<Acao | null>(null)

  if (materiais.isPending) return <Carregando rotulo="Carregando materiais" />
  if (materiais.isError) return <ErroDeCarga erro={materiais.error} aoTentarDeNovo={() => void materiais.refetch()} />
  if (materiais.data.length === 0) return <EstadoVazio titulo="Nenhum material ainda." descricao="Envie um arquivo ou adicione um link para os instrutores da classe." />

  return (
    <>
      {agruparPorSecao(materiais.data).map((grupo) => (
        <section key={grupo.chave} className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-titulo text-lg font-bold text-texto">{grupo.titulo}</h2>
            <span className="text-sm text-texto-2">{`${grupo.itens.length} ${grupo.itens.length === 1 ? 'item' : 'itens'}`}</span>
          </div>
          <ul className="flex flex-col gap-2">
            {grupo.itens.map((material) => (
              <LinhaDoMaterial key={material.id} material={material} aoEscolher={(tipo) => definirAcao({ tipo, material })} />
            ))}
          </ul>
        </section>
      ))}
      {acao && <DialogosDoMaterial acao={acao} secoes={secoes} aoFechar={() => definirAcao(null)} />}
    </>
  )
}

export function TelaMateriais() {
  const { id = '' } = useParams()
  const { modo } = useConexao()
  const { vinculoAtivo } = useSessao()
  const online = modo === 'ONLINE'
  const secoes = useSecoesDaClasse(id, online)
  const total = useMateriais(id, online).data?.length
  const [dialogo, definirDialogo] = useState<'arquivo' | 'link' | null>(null)
  const nomeDaClasse = vinculoAtivo?.classes.find((classe) => classe.id === id)?.nome ?? 'Classe'
  const listaDeSecoes: Secao[] = secoes.data ?? []

  return (
    <main className="flex flex-col gap-4 p-4">
      <header className="flex items-center gap-2">
        <Link to="/classes" aria-label="Voltar" className="flex min-h-[var(--touch-min)] min-w-[var(--touch-min)] items-center justify-center rounded-botao text-marca">
          <ChevronLeft aria-hidden className="size-6" />
        </Link>
        <div className="flex flex-col">
          <h1 className="font-titulo text-2xl font-extrabold text-texto">Materiais de apoio</h1>
          {total !== undefined && <span className="text-sm text-texto-2">{`${nomeDaClasse} · ${total} ${total === 1 ? 'item' : 'itens'}`}</span>}
        </div>
      </header>
      {!online ? (
        <DisponivelComInternet />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Botao onClick={() => definirDialogo('arquivo')}>
              <Upload aria-hidden className="size-5" />
              Enviar arquivo
            </Botao>
            <Botao variante="secundario" onClick={() => definirDialogo('link')}>
              <Link2 aria-hidden className="size-5" />
              Adicionar link
            </Botao>
          </div>
          <Conteudo classeId={id} secoes={listaDeSecoes} />
          {dialogo === 'arquivo' && <DialogoEnvio classeId={id} secoes={listaDeSecoes} aoFechar={() => definirDialogo(null)} />}
          {dialogo === 'link' && <DialogoLink classeId={id} secoes={listaDeSecoes} aoFechar={() => definirDialogo(null)} />}
        </>
      )}
    </main>
  )
}
