import { LIMITE_BYTES_CAPA_BIBLIOTECA, LIMITE_BYTES_PDF_BIBLIOTECA } from '@desbravadores/shared'
import { useRef, useState } from 'react'
import type { ItemBibliotecaEditar } from '@desbravadores/shared'
import type { ChangeEvent, FormEvent } from 'react'
import { ErroDaApi } from '../../api/cliente'
import type { CategoriaBiblioteca, ItemBiblioteca } from '../../api/biblioteca'
import {
  enviarCapa,
  enviarItem,
  useCriarCategoria,
  useEditarItem,
  useExcluirCategoria,
  useRelerBiblioteca,
  useRemoverItem,
  useRenomearCategoria,
  useTirarCapa,
} from '../../api/biblioteca'
import { BarraProgresso } from '../../ui/BarraProgresso'
import { Botao } from '../../ui/Botao'
import { Campo } from '../../ui/Campo'
import { Confirmacao } from '../../ui/Confirmacao'
import { Selecao } from '../../ui/Selecao'
import { CapaDoItem } from './CartaoDoItem'

export type Acao =
  | { tipo: 'adicionar' }
  | { tipo: 'nova-categoria' }
  | { tipo: 'renomear-categoria'; categoriaId: string }
  | { tipo: 'excluir-categoria'; categoriaId: string }
  | { tipo: 'editar-item'; itemId: string }
  | { tipo: 'remover-item'; itemId: string }

const MENSAGEM_PADRAO = 'Não foi possível concluir agora. Tente de novo.'
export const mensagemDe = (erro: unknown): string => (erro instanceof ErroDaApi ? erro.erro.mensagem : MENSAGEM_PADRAO)

const BYTES_POR_MB = 1024 * 1024
const MB_DO_PDF = LIMITE_BYTES_PDF_BIBLIOTECA / BYTES_POR_MB
const MB_DA_CAPA = LIMITE_BYTES_CAPA_BIBLIOTECA / BYTES_POR_MB
const CAPAS_ACEITAS = 'image/jpeg,image/png,image/webp'
const AJUDA_DO_NOME = 'É o nome que aparece na estante e no arquivo baixado.'
const AJUDA_DA_DESCRICAO = 'Opcional. Uma linha abaixo do nome.'
const AVISO_DO_ENVIO = 'Não feche esta janela até terminar.'

const erroDoPdf = (arquivo: File): string | null => (arquivo.size > LIMITE_BYTES_PDF_BIBLIOTECA ? `O PDF pode ter até ${MB_DO_PDF} MB.` : null)
const erroDaCapa = (arquivo: File): string | null => (arquivo.size > LIMITE_BYTES_CAPA_BIBLIOTECA ? `A capa pode ter até ${MB_DA_CAPA} MB.` : null)
const semPontoFinal = (texto: string): string => texto.replace(/\.$/, '')
const comecandoEmMinuscula = (texto: string): string => texto.charAt(0).toLowerCase() + texto.slice(1)

function Andamento({ legenda, rotulo, porcento, aviso }: { legenda: string; rotulo: string; porcento: number; aviso: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm font-semibold text-texto">
        <span>{legenda}</span>
        <span>{`${porcento}%`}</span>
      </div>
      <BarraProgresso valor={porcento} rotulo={rotulo} />
      <p className="text-sm text-texto-2">{aviso}</p>
    </div>
  )
}

function DialogoDeCategoria({ categoria, aoFechar }: { categoria?: CategoriaBiblioteca; aoFechar: () => void }) {
  const criar = useCriarCategoria()
  const renomear = useRenomearCategoria()
  const gravando = categoria ? renomear : criar
  const [nome, definirNome] = useState(categoria?.nome ?? '')
  const [tentou, definirTentou] = useState(false)
  const nomeLimpo = nome.trim()

  const confirmar = () => {
    definirTentou(true)
    if (nomeLimpo === '') return
    if (!categoria) return criar.mutate({ nome: nomeLimpo }, { onSuccess: aoFechar })
    if (nomeLimpo === categoria.nome) return aoFechar()
    renomear.mutate({ id: categoria.id, nome: nomeLimpo }, { onSuccess: aoFechar })
  }

  return (
    <Confirmacao
      aberta
      titulo={categoria ? 'Renomear categoria' : 'Nova categoria'}
      rotuloConfirmar={categoria ? 'Salvar' : 'Criar'}
      ocupada={gravando.isPending}
      erro={gravando.isError ? mensagemDe(gravando.error) : null}
      aoConfirmar={confirmar}
      aoCancelar={aoFechar}
    >
      <form
        onSubmit={(evento: FormEvent) => {
          evento.preventDefault()
          confirmar()
        }}
      >
        <Campo
          rotulo="Nome da categoria"
          value={nome}
          maxLength={60}
          ajuda={categoria ? undefined : 'Ela entra no fim da estante; mude a posição pelo menu dela.'}
          erro={tentou && nomeLimpo === '' ? 'Dê um nome à categoria.' : undefined}
          onChange={(evento) => definirNome(evento.target.value)}
        />
      </form>
    </Confirmacao>
  )
}

function DialogoExcluirCategoria({ categoria, aoFechar }: { categoria: CategoriaBiblioteca; aoFechar: () => void }) {
  const excluir = useExcluirCategoria()
  return (
    <Confirmacao
      aberta
      titulo={`Excluir a categoria “${categoria.nome}”?`}
      rotuloConfirmar="Excluir"
      perigo
      ocupada={excluir.isPending}
      erro={excluir.isError ? mensagemDe(excluir.error) : null}
      aoConfirmar={() => excluir.mutate(categoria.id, { onSuccess: aoFechar })}
      aoCancelar={aoFechar}
    >
      A categoria some da biblioteca e não dá para desfazer.
    </Confirmacao>
  )
}

function DialogoRemoverItem({ item, aoFechar }: { item: ItemBiblioteca; aoFechar: () => void }) {
  const remover = useRemoverItem()
  return (
    <Confirmacao
      aberta
      titulo={`Remover “${item.nome}” da biblioteca?`}
      rotuloConfirmar="Remover"
      perigo
      ocupada={remover.isPending}
      erro={remover.isError ? mensagemDe(remover.error) : null}
      aoConfirmar={() => remover.mutate(item.id, { onSuccess: aoFechar })}
      aoCancelar={aoFechar}
    >
      O arquivo é apagado e não dá para desfazer.
    </Confirmacao>
  )
}

function OpcoesDeCategoria({ categorias }: { categorias: CategoriaBiblioteca[] }) {
  return (
    <>
      {categorias.map((categoria) => (
        <option key={categoria.id} value={categoria.id}>
          {categoria.nome}
        </option>
      ))}
    </>
  )
}

/** O item foi criado e só a capa falhou: dá outra chance sem repetir o PDF. */
function DialogoCapaRecusada({ item, motivoInicial, aoFechar }: { item: ItemBiblioteca; motivoInicial: string; aoFechar: () => void }) {
  const reler = useRelerBiblioteca()
  const [capa, definirCapa] = useState<File | null>(null)
  const [erro, definirErro] = useState<string | null>(null)
  const [motivo, definirMotivo] = useState(motivoInicial)
  const [porcento, definirPorcento] = useState<number | null>(null)

  const escolher = (evento: ChangeEvent<HTMLInputElement>) => {
    const escolhida = evento.target.files?.[0] ?? null
    definirCapa(escolhida && erroDaCapa(escolhida) === null ? escolhida : null)
    definirErro(escolhida ? erroDaCapa(escolhida) : null)
  }

  const enviar = async () => {
    if (!capa) return definirErro('Escolha a imagem da capa.')
    definirPorcento(0)
    try {
      await enviarCapa(item.id, capa, definirPorcento)
      aoFechar()
    } catch (falha) {
      definirMotivo(mensagemDe(falha))
    } finally {
      definirPorcento(null)
      void reler()
    }
  }

  return (
    <Confirmacao aberta titulo={`${item.nome} foi adicionado`} rotuloConfirmar="Enviar capa" rotuloCancelar="Fechar" ocupada={porcento !== null} aoConfirmar={() => void enviar()} aoCancelar={aoFechar}>
      <div className="flex flex-col gap-3">
        <p>{`O item foi adicionado, mas a capa não: ${comecandoEmMinuscula(semPontoFinal(motivo))}.`}</p>
        <Campo
          rotulo="Capa"
          type="file"
          accept={CAPAS_ACEITAS}
          disabled={porcento !== null}
          ajuda="Escolha outra imagem, ou feche e coloque a capa depois em “Editar”."
          erro={erro ?? undefined}
          onChange={escolher}
        />
        {porcento !== null && <Andamento legenda="Enviando a capa…" rotulo="Envio da capa" porcento={porcento} aviso={AVISO_DO_ENVIO} />}
      </div>
    </Confirmacao>
  )
}

type Etapa = 'preenchendo' | 'pdf' | 'capa'

function DialogoAdicionar({ categorias, aoFechar }: { categorias: CategoriaBiblioteca[]; aoFechar: () => void }) {
  const reler = useRelerBiblioteca()
  const interrupcao = useRef<AbortController | null>(null)
  const [pdf, definirPdf] = useState<File | null>(null)
  const [erroPdf, definirErroPdf] = useState<string | null>(null)
  const [nome, definirNome] = useState('')
  const [descricao, definirDescricao] = useState('')
  const [categoriaId, definirCategoriaId] = useState(categorias[0]?.id ?? '')
  const [capa, definirCapa] = useState<File | null>(null)
  const [erroCapa, definirErroCapa] = useState<string | null>(null)
  const [tentou, definirTentou] = useState(false)
  const [etapa, definirEtapa] = useState<Etapa>('preenchendo')
  const [porcento, definirPorcento] = useState(0)
  const [erroDoEnvio, definirErroDoEnvio] = useState<string | null>(null)
  const [capaRecusada, definirCapaRecusada] = useState<{ item: ItemBiblioteca; motivo: string } | null>(null)
  const enviando = etapa !== 'preenchendo'
  const nomeLimpo = nome.trim()

  const escolherPdf = (evento: ChangeEvent<HTMLInputElement>) => {
    const escolhido = evento.target.files?.[0] ?? null
    const recusa = escolhido ? erroDoPdf(escolhido) : null
    definirErroPdf(recusa)
    definirPdf(recusa ? null : escolhido)
    if (escolhido && !recusa && nomeLimpo === '') definirNome(escolhido.name.replace(/\.pdf$/i, '').slice(0, 120))
  }

  const escolherCapa = (evento: ChangeEvent<HTMLInputElement>) => {
    const escolhida = evento.target.files?.[0] ?? null
    const recusa = escolhida ? erroDaCapa(escolhida) : null
    definirErroCapa(recusa)
    definirCapa(recusa ? null : escolhida)
  }

  const cancelar = () => {
    interrupcao.current?.abort()
    aoFechar()
  }

  const adicionar = async () => {
    definirTentou(true)
    if (!pdf) definirErroPdf((atual) => atual ?? 'Escolha o PDF.')
    if (!pdf || nomeLimpo === '' || categoriaId === '' || erroCapa) return
    const controle = new AbortController()
    interrupcao.current = controle
    const { signal } = controle
    definirErroDoEnvio(null)
    definirEtapa('pdf')
    let item: ItemBiblioteca
    try {
      item = await enviarItem(pdf, { nome: nomeLimpo, descricao: descricao.trim() === '' ? null : descricao.trim(), categoriaId }, definirPorcento, signal)
    } catch (falha) {
      if (!signal.aborted) definirErroDoEnvio(mensagemDe(falha))
      definirEtapa('preenchendo')
      void reler()
      return
    }
    void reler()
    if (!capa) return aoFechar()
    definirEtapa('capa')
    try {
      await enviarCapa(item.id, capa, definirPorcento, signal)
      aoFechar()
    } catch (falha) {
      if (!signal.aborted) definirCapaRecusada({ item, motivo: mensagemDe(falha) })
    } finally {
      void reler()
    }
  }

  if (capaRecusada) return <DialogoCapaRecusada item={capaRecusada.item} motivoInicial={capaRecusada.motivo} aoFechar={aoFechar} />

  return (
    <Confirmacao
      aberta
      titulo="Adicionar à biblioteca"
      rotuloConfirmar={enviando ? 'Adicionando' : 'Adicionar'}
      ocupada={enviando}
      erro={erroDoEnvio}
      aoConfirmar={() => void adicionar()}
      aoCancelar={cancelar}
    >
      <div className="flex flex-col gap-3">
        <Campo rotulo="PDF" type="file" accept="application/pdf" disabled={enviando} ajuda={`Até ${MB_DO_PDF} MB.`} erro={erroPdf ?? undefined} onChange={escolherPdf} />
        <Campo
          rotulo="Nome"
          value={nome}
          maxLength={120}
          disabled={enviando}
          ajuda={AJUDA_DO_NOME}
          erro={tentou && nomeLimpo === '' ? 'Dê um nome ao item.' : undefined}
          onChange={(evento) => definirNome(evento.target.value)}
        />
        <Campo rotulo="Descrição" value={descricao} maxLength={120} disabled={enviando} ajuda={AJUDA_DA_DESCRICAO} onChange={(evento) => definirDescricao(evento.target.value)} />
        <Selecao rotulo="Categoria" value={categoriaId} disabled={enviando} onChange={(evento) => definirCategoriaId(evento.target.value)}>
          <OpcoesDeCategoria categorias={categorias} />
        </Selecao>
        <Campo
          rotulo="Capa"
          type="file"
          accept={CAPAS_ACEITAS}
          disabled={enviando}
          ajuda={`Opcional. JPG, PNG ou WebP, até ${MB_DA_CAPA} MB.`}
          erro={erroCapa ?? undefined}
          onChange={escolherCapa}
        />
        {etapa === 'pdf' && (
          <Andamento
            legenda="Enviando o PDF…"
            rotulo="Envio do PDF"
            porcento={porcento}
            aviso={capa ? `${AVISO_DO_ENVIO} Depois do PDF vai a capa.` : AVISO_DO_ENVIO}
          />
        )}
        {etapa === 'capa' && <Andamento legenda="Enviando a capa…" rotulo="Envio da capa" porcento={porcento} aviso={AVISO_DO_ENVIO} />}
      </div>
    </Confirmacao>
  )
}

function DialogoEditar({ item, categorias, aoFechar }: { item: ItemBiblioteca; categorias: CategoriaBiblioteca[]; aoFechar: () => void }) {
  const editar = useEditarItem()
  const tirarCapa = useTirarCapa()
  const reler = useRelerBiblioteca()
  const escolhaDeCapa = useRef<HTMLInputElement>(null)
  const [nome, definirNome] = useState(item.nome)
  const [descricao, definirDescricao] = useState(item.descricao ?? '')
  const [categoriaId, definirCategoriaId] = useState(item.categoriaId)
  const [tentou, definirTentou] = useState(false)
  const [erroCapa, definirErroCapa] = useState<string | null>(null)
  const [porcento, definirPorcento] = useState<number | null>(null)
  const nomeLimpo = nome.trim()
  const trocandoCapa = porcento !== null
  const falha = editar.error ?? tirarCapa.error

  const salvar = () => {
    definirTentou(true)
    if (nomeLimpo === '') return
    const mudancas: ItemBibliotecaEditar = {}
    if (nomeLimpo !== item.nome) mudancas.nome = nomeLimpo
    if (descricao.trim() !== (item.descricao ?? '')) mudancas.descricao = descricao.trim() === '' ? null : descricao.trim()
    if (categoriaId !== item.categoriaId) mudancas.categoriaId = categoriaId
    if (Object.keys(mudancas).length === 0) return aoFechar()
    editar.mutate({ id: item.id, ...mudancas }, { onSuccess: aoFechar })
  }

  const trocar = async (evento: ChangeEvent<HTMLInputElement>) => {
    const escolhida = evento.target.files?.[0] ?? null
    evento.target.value = ''
    if (!escolhida) return
    const recusa = erroDaCapa(escolhida)
    definirErroCapa(recusa)
    if (recusa) return
    definirPorcento(0)
    try {
      await enviarCapa(item.id, escolhida, definirPorcento)
    } catch (erro) {
      definirErroCapa(mensagemDe(erro))
    } finally {
      definirPorcento(null)
      void reler()
    }
  }

  return (
    <Confirmacao
      aberta
      titulo={`Editar ${item.nome}`}
      rotuloConfirmar="Salvar"
      ocupada={editar.isPending}
      erro={falha ? mensagemDe(falha) : null}
      aoConfirmar={salvar}
      aoCancelar={aoFechar}
    >
      <div className="flex flex-col gap-3">
        <Campo
          rotulo="Nome"
          value={nome}
          maxLength={120}
          ajuda={AJUDA_DO_NOME}
          erro={tentou && nomeLimpo === '' ? 'Dê um nome ao item.' : undefined}
          onChange={(evento) => definirNome(evento.target.value)}
        />
        <Campo rotulo="Descrição" value={descricao} maxLength={120} ajuda={AJUDA_DA_DESCRICAO} onChange={(evento) => definirDescricao(evento.target.value)} />
        <Selecao rotulo="Categoria" value={categoriaId} ajuda="Ao mudar de categoria, o item vai para o fim dela." onChange={(evento) => definirCategoriaId(evento.target.value)}>
          <OpcoesDeCategoria categorias={categorias} />
        </Selecao>
        <div role="group" aria-label="Capa" className="flex flex-col gap-1.5">
          <span aria-hidden className="text-sm font-semibold text-texto">
            Capa
          </span>
          <div className="flex items-end gap-3">
            <CapaDoItem nome={item.nome} capaUrl={item.capaUrl} className="w-24 shrink-0" />
            <div className="flex flex-wrap gap-2">
              <Botao variante="secundario" disabled={trocandoCapa} onClick={() => escolhaDeCapa.current?.click()}>
                Trocar capa
              </Botao>
              {item.capaUrl && (
                <Botao variante="secundario" disabled={trocandoCapa} carregando={tirarCapa.isPending} onClick={() => tirarCapa.mutate(item.id)}>
                  Tirar capa
                </Botao>
              )}
            </div>
          </div>
          <input ref={escolhaDeCapa} type="file" aria-label="Nova capa" accept={CAPAS_ACEITAS} tabIndex={-1} className="sr-only" onChange={(evento) => void trocar(evento)} />
          {erroCapa && (
            <p role="alert" className="text-sm font-medium text-perigo">
              {erroCapa}
            </p>
          )}
          {porcento !== null && <Andamento legenda="Enviando a capa…" rotulo="Envio da capa" porcento={porcento} aviso={AVISO_DO_ENVIO} />}
        </div>
        <p className="text-sm text-texto-2">Para trocar o PDF, remova o item e adicione de novo.</p>
      </div>
    </Confirmacao>
  )
}

const encontrarItem = (categorias: CategoriaBiblioteca[], itemId: string): ItemBiblioteca | undefined =>
  categorias.flatMap((categoria) => categoria.itens).find((item) => item.id === itemId)

interface Propriedades {
  acao: Acao
  categorias: CategoriaBiblioteca[]
  aoFechar: () => void
}

/** O diálogo da ação escolhida. O item e a categoria vêm da lista de agora, não de uma cópia: a lista é relida e a capa nova aparece. */
export function DialogosDaBiblioteca({ acao, categorias, aoFechar }: Propriedades) {
  const categoria = 'categoriaId' in acao ? categorias.find((candidata) => candidata.id === acao.categoriaId) : undefined
  const item = 'itemId' in acao ? encontrarItem(categorias, acao.itemId) : undefined

  switch (acao.tipo) {
    case 'adicionar':
      return <DialogoAdicionar categorias={categorias} aoFechar={aoFechar} />
    case 'nova-categoria':
      return <DialogoDeCategoria aoFechar={aoFechar} />
    case 'renomear-categoria':
      return categoria ? <DialogoDeCategoria categoria={categoria} aoFechar={aoFechar} /> : null
    case 'excluir-categoria':
      return categoria ? <DialogoExcluirCategoria categoria={categoria} aoFechar={aoFechar} /> : null
    case 'editar-item':
      return item ? <DialogoEditar item={item} categorias={categorias} aoFechar={aoFechar} /> : null
    case 'remover-item':
      return item ? <DialogoRemoverItem item={item} aoFechar={aoFechar} /> : null
  }
}
