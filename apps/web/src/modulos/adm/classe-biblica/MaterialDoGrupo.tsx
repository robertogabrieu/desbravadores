import { MaterialCBLinkEntrada } from '@desbravadores/shared'
import { FileText, Link2, Paperclip, Upload } from 'lucide-react'
import { useId, useState } from 'react'
import type { ChangeEvent } from 'react'
import { LIMITE_DO_PDF_CB, useAnexarLinkCB, useEnviarMaterialCB } from '../../../api/classe-biblica'
import type { PainelDaEdicao } from '../../../api/classe-biblica'
import { ErroDaApi } from '../../../api/cliente'
import { useConexao } from '../../../offline'
import { Botao, estiloDoBotao } from '../../../ui/Botao'
import { Campo } from '../../../ui/Campo'

type Material = PainelDaEdicao['grupos'][number]['material']

const mensagemDe = (falha: Error): string =>
  falha instanceof ErroDaApi ? falha.erro.mensagem : 'Não deu para salvar o material agora. Tente de novo.'

interface Propriedades {
  grupoId: string
  material: Material
  podeGerenciar: boolean
}

/** Material de estudo do grupo: abrir, e — para quem gerencia — anexar ou trocar (PDF até 20 MB ou link https). */
export function MaterialDoGrupo({ grupoId, material, podeGerenciar }: Propriedades) {
  const [anexando, setAnexando] = useState(false)
  const [colando, setColando] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [url, setUrl] = useState('')
  const [erroDoLink, setErroDoLink] = useState<string>()
  const [erroDoTitulo, setErroDoTitulo] = useState<string>()
  const [erro, setErro] = useState<string>()
  const [salvo, setSalvo] = useState(false)
  const enviar = useEnviarMaterialCB()
  const anexar = useAnexarLinkCB()
  const { modo } = useConexao()
  const semConexao = modo === 'SEM_CONEXAO'
  const idEntrada = useId()

  const concluir = () => {
    setAnexando(false)
    setColando(false)
    setTitulo('')
    setUrl('')
    setErro(undefined)
    setSalvo(true)
  }

  const escolherArquivo = (evento: ChangeEvent<HTMLInputElement>) => {
    const arquivo = evento.target.files?.[0]
    evento.target.value = ''
    if (!arquivo) return
    if (arquivo.type !== 'application/pdf' && !arquivo.name.toLowerCase().endsWith('.pdf')) return setErro('Envie um arquivo PDF')
    if (arquivo.size > LIMITE_DO_PDF_CB) return setErro('O PDF passa de 20 MB')
    setErro(undefined)
    const nome = titulo.trim() || arquivo.name.replace(/\.pdf$/i, '')
    enviar.mutate(
      { grupoId, arquivo, dados: { titulo: nome.slice(0, 120) } },
      { onSuccess: concluir, onError: (falha) => setErro(mensagemDe(falha)) },
    )
  }

  const anexarLink = () => {
    const lido = MaterialCBLinkEntrada.safeParse({ titulo, url: url.trim() })
    const linkValido = /^https:\/\//i.test(url.trim()) && lido.success
    setErroDoLink(linkValido ? undefined : 'Use um link https://')
    setErroDoTitulo(titulo.trim() ? undefined : 'Falta o nome do material')
    if (!titulo.trim() || !linkValido || !lido.success) return
    anexar.mutate({ grupoId, ...lido.data }, { onSuccess: concluir, onError: (falha) => setErro(mensagemDe(falha)) })
  }

  const abrirAnexo = () => {
    setAnexando(true)
    setSalvo(false)
  }

  return (
    <div className="flex flex-col gap-3">
      {material ? (
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={material.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[var(--touch-min)] min-w-0 items-center gap-2 text-base font-semibold text-marca underline focus-visible:outline-2 focus-visible:outline-marca"
          >
            <FileText aria-hidden className="size-5 shrink-0" />
            {material.tipo === 'PDF' ? `${material.titulo} (PDF)` : material.titulo}
          </a>
          {podeGerenciar && !anexando && (
            <Botao variante="secundario" onClick={abrirAnexo}>Trocar o material</Botao>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-base text-texto-2">Ainda sem material de estudo. Os encontros e a chamada funcionam sem ele.</p>
          {podeGerenciar && !anexando && (
            <Botao variante="secundario" className="w-fit" onClick={abrirAnexo}>
              <Paperclip aria-hidden className="size-5" />
              Anexar PDF ou link
            </Botao>
          )}
        </div>
      )}

      {salvo && <p role="status" className="text-sm font-medium text-sucesso">Material salvo. Quem abre a edição já vê o novo.</p>}

      {anexando && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-texto-2">Um PDF de até 20 MB ou um link. O novo fica no lugar do anterior.</p>
          {semConexao && <p className="text-sm font-medium text-alerta">Sem internet: o material só vai com conexão.</p>}
          <div className="flex flex-wrap gap-2">
            <label htmlFor={idEntrada} className={estiloDoBotao({ variante: 'secundario', className: 'cursor-pointer' })}>
              <Upload aria-hidden className="size-5" />
              Enviar PDF
              <input
                id={idEntrada}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                disabled={enviar.isPending || semConexao}
                onChange={escolherArquivo}
              />
            </label>
            {!colando && (
              <Botao variante="secundario" onClick={() => setColando(true)}>
                <Link2 aria-hidden className="size-5" />
                Colar um link
              </Botao>
            )}
            <Botao variante="texto" onClick={() => { setAnexando(false); setColando(false); setErro(undefined) }}>
              Deixar como está
            </Botao>
          </div>
          {enviar.isPending && <p role="status" className="text-sm text-texto-2">Enviando o PDF…</p>}
          {colando && (
            <div className="flex flex-col gap-3">
              <Campo rotulo="Nome do material" value={titulo} maxLength={120} erro={erroDoTitulo} onChange={(e) => setTitulo(e.target.value)} />
              <Campo
                rotulo="Link"
                ajuda="Ex.: https://www.exemplo.org/licoes"
                inputMode="url"
                value={url}
                erro={erroDoLink}
                onChange={(e) => setUrl(e.target.value)}
              />
              <Botao variante="secundario" className="w-fit" carregando={anexar.isPending} disabled={semConexao} onClick={anexarLink}>
                Anexar o link
              </Botao>
            </div>
          )}
          {erro && <p role="alert" className="text-sm font-medium text-perigo">{erro}</p>}
        </div>
      )}
    </div>
  )
}
