import type { ReactNode } from 'react'
import { ErroDaApi } from '../api/cliente'
import { Botao } from './Botao'
import { EstadoVazio } from './EstadoVazio'
import { Esqueleto } from './Esqueleto'

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

/** Tela que só existe com dado do servidor, aberta sem conexão e sem nada guardado. */
export function DisponivelComInternet() {
  return <EstadoVazio titulo="Disponível quando houver internet" descricao="Conecte-se para ver esta tela." />
}

/** Falha de leitura: sem rede vira "Disponível quando houver internet"; o resto mostra a mensagem da API e o botão que repete a busca. */
export function ErroDeCarga({ erro, aoTentarDeNovo }: { erro: Error | null; aoTentarDeNovo: () => void }) {
  if (erro instanceof ErroDaApi && erro.classe === 'REDE') return <DisponivelComInternet />
  const mensagem = erro instanceof ErroDaApi ? erro.erro.mensagem : MENSAGEM_PADRAO
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <p className="text-base font-semibold text-perigo">{mensagem}</p>
      <Botao variante="secundario" onClick={aoTentarDeNovo}>
        Tentar de novo
      </Botao>
    </div>
  )
}
