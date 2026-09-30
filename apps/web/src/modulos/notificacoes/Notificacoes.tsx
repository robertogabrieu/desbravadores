import { Link, useNavigate } from 'react-router-dom'
import { useMarcarLida, useMarcarTodasLidas, useNotificacoes } from '../../api/notificacoes'
import type { NotificacaoItem } from '../../api/notificacoes'
import { useConexao } from '../../offline'
import { Botao } from '../../ui/Botao'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../ui/EstadosDeCarga'
import { cn } from '../../ui/cn'
import { dataRelativa } from './dataRelativa'

function CartaoNotificacao({ item, aoAbrir }: { item: NotificacaoItem; aoAbrir: (item: NotificacaoItem) => void }) {
  return (
    <li>
      <Link
        to={item.link}
        onClick={() => aoAbrir(item)}
        className={cn(
          'flex min-h-[var(--touch-min)] flex-col gap-1 rounded-cartao border p-4',
          item.lida ? 'border-borda bg-superficie' : 'border-marca bg-marca-suave',
        )}
      >
        <span className={cn('text-base text-texto', !item.lida && 'font-bold')}>{item.titulo}</span>
        <span className="text-base text-texto-2">{item.texto}</span>
        <span className="text-sm text-texto-3">{dataRelativa(item.criadaEm)}</span>
      </Link>
    </li>
  )
}

/** Tela do sino: as últimas notificações, a mais nova primeiro. Abrir uma marca como lida. */
export function Notificacoes() {
  const { modo } = useConexao()
  const semConexao = modo === 'SEM_CONEXAO'
  const consulta = useNotificacoes(!semConexao)
  const marcarLida = useMarcarLida()
  const marcarTodas = useMarcarTodasLidas()
  const navegar = useNavigate()

  const abrir = (item: NotificacaoItem) => {
    if (!item.lida) marcarLida.mutate(item.id)
  }

  let conteudo
  if (semConexao) conteudo = <DisponivelComInternet />
  else if (consulta.isPending) conteudo = <Carregando rotulo="Carregando notificações" />
  else if (consulta.isError) conteudo = <ErroDeCarga erro={consulta.error} aoTentarDeNovo={() => void consulta.refetch()} />
  else if (consulta.data.itens.length === 0) {
    conteudo = (
      <EstadoVazio
        titulo="Nenhuma notificação por enquanto"
        descricao="Quando algo precisar da sua atenção, o aviso aparece aqui."
        acao={<Botao variante="secundario" onClick={() => void navegar('/inicio')}>Voltar ao início</Botao>}
      />
    )
  } else {
    conteudo = (
      <ul className="flex flex-col gap-2">
        {consulta.data.itens.map((item) => (
          <CartaoNotificacao key={item.id} item={item} aoAbrir={abrir} />
        ))}
      </ul>
    )
  }

  const temNaoLidas = !semConexao && (consulta.data?.naoLidas ?? 0) > 0

  return (
    <section className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-titulo text-xl font-bold text-texto">Notificações</h1>
        {temNaoLidas && (
          <Botao variante="texto" carregando={marcarTodas.isPending} onClick={() => marcarTodas.mutate()}>
            Marcar todas como lidas
          </Botao>
        )}
      </div>
      {conteudo}
    </section>
  )
}
