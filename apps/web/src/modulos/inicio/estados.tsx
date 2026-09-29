import type { ReactNode } from 'react'
import { Botao } from '../../ui/Botao'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { Esqueleto } from '../../ui/Esqueleto'

const MENSAGEM_PADRAO = 'Não foi possível carregar agora.'

/** Lugar do conteúdo enquanto a tela carrega: leitores de tela ouvem o `rotulo`. */
export function Carregando({ rotulo, children }: { rotulo: string; children?: ReactNode }) {
  return (
    <div role="status" aria-label={rotulo} className="flex flex-col gap-3">
      {children ?? (
        <>
          <Esqueleto className="h-24" />
          <Esqueleto className="h-24" />
          <Esqueleto className="h-24" />
        </>
      )}
    </div>
  )
}

/** Mensagem da API (ou a padrão) e o botão que repete a busca. */
export function ErroDeCarga({ erro, aoTentarDeNovo }: { erro: Error | null; aoTentarDeNovo: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <p className="text-base text-texto">{erro?.message || MENSAGEM_PADRAO}</p>
      <Botao variante="secundario" onClick={aoTentarDeNovo}>
        Tentar de novo
      </Botao>
    </div>
  )
}

/** Tela que só existe com dado do servidor, aberta sem conexão e sem nada guardado. */
export function DisponivelComInternet() {
  return <EstadoVazio titulo="Disponível quando houver internet" descricao="Conecte-se para ver esta tela." />
}
