import { ExternalLink, FileText } from 'lucide-react'
import { useRef, useState } from 'react'
import type { ChangeEvent } from 'react'
import { useEnviarComprovante, useRemoverComprovante } from '../../api/vendas'
import type { Pedido } from '../../api/vendas'
import { useConexao } from '../../offline'
import { Botao, estiloDoBotao } from '../../ui/Botao'
import { Cartao } from '../../ui/Cartao'
import { cn } from '../../ui/cn'
import { Confirmacao } from '../../ui/Confirmacao'
import { lerErroDaApi } from '../adm/desbravadores/erros'
import { ErroDeComprovante, FORMATOS_ACEITOS_NO_COMPROVANTE, prepararComprovante } from './comprovante'

const SEM_INTERNET = 'Enviar, trocar e remover o comprovante precisam de internet. Conecte-se para continuar.'

interface Propriedades {
  vendaId: string
  pedido: Pedido
  /** Venda encerrada ou pedido cancelado: o comprovante só se abre. */
  somenteLeitura: boolean
}

/** O comprovante de pagamento no resumo do pedido: ver, abrir, anexar, trocar e remover. Nunca entra na imagem do comprador. */
export function BlocoDoComprovante({ vendaId, pedido, somenteLeitura }: Propriedades) {
  const { modo } = useConexao()
  const online = modo === 'ONLINE'
  const enviar = useEnviarComprovante()
  const remover = useRemoverComprovante()
  const entrada = useRef<HTMLInputElement>(null)
  const [preparando, setPreparando] = useState(false)
  const [removendo, setRemovendo] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const { comprovante } = pedido
  const ocupado = preparando || enviar.isPending || remover.isPending
  const desligada = !online || ocupado
  const ids = { vendaId, pedidoId: pedido.id }

  async function escolher(evento: ChangeEvent<HTMLInputElement>) {
    const escolhido = evento.target.files?.[0]
    evento.target.value = ''
    if (!escolhido) return
    setErro(null)
    setPreparando(true)
    try {
      await enviar.mutateAsync({ ...ids, arquivo: await prepararComprovante(escolhido) })
    } catch (falha) {
      setErro(falha instanceof ErroDeComprovante ? falha.message : lerErroDaApi(falha).geral)
    } finally {
      setPreparando(false)
    }
  }

  async function confirmarRemocao() {
    setErro(null)
    try {
      await remover.mutateAsync(ids)
      setRemovendo(false)
    } catch (falha) {
      setErro(lerErroDaApi(falha).geral)
    }
  }

  return (
    <Cartao className="flex flex-col gap-3 p-5">
      <h2 className="font-titulo text-lg font-bold text-texto">Comprovante</h2>
      {comprovante ? (
        <>
          {comprovante.tipo === 'FOTO' ? (
            <img src={comprovante.url} alt="Foto do comprovante de pagamento" className="max-h-56 w-full rounded-cartao border border-borda-controle bg-superficie-suave object-contain" />
          ) : (
            <div className="flex items-center gap-3 rounded-cartao border border-borda-controle bg-superficie-suave p-4 text-base text-texto">
              <FileText aria-hidden className="size-8 text-texto-2" />
              Comprovante em PDF
            </div>
          )}
          <a href={comprovante.url} target="_blank" rel="noopener noreferrer" className={cn(estiloDoBotao({ variante: 'secundario' }), 'w-full')}>
            <ExternalLink aria-hidden className="size-5" />
            Abrir em nova aba
          </a>
        </>
      ) : (
        <p className="text-base text-texto-2">Nenhum comprovante anexado.</p>
      )}
      {!somenteLeitura && (
        <div className="flex flex-wrap items-center gap-2">
          <Botao variante={comprovante ? 'texto' : 'secundario'} carregando={preparando || enviar.isPending} disabled={desligada} onClick={() => entrada.current?.click()}>
            {comprovante ? 'Trocar comprovante' : 'Anexar comprovante'}
          </Botao>
          {comprovante && (
            <Botao variante="texto" className="text-perigo" disabled={desligada} onClick={() => { setErro(null); setRemovendo(true) }}>
              Remover comprovante
            </Botao>
          )}
          <input ref={entrada} type="file" accept={FORMATOS_ACEITOS_NO_COMPROVANTE} aria-label="Escolher o arquivo do comprovante" className="sr-only" tabIndex={-1} onChange={(evento) => void escolher(evento)} />
        </div>
      )}
      {!somenteLeitura && !online && <p className="text-sm text-texto-2">{SEM_INTERNET}</p>}
      {erro && !removendo && (
        <p role="alert" className="text-sm font-medium text-perigo">
          {erro}
        </p>
      )}
      <Confirmacao
        aberta={removendo}
        titulo="Remover o comprovante?"
        rotuloConfirmar="Remover"
        rotuloCancelar="Voltar"
        perigo
        ocupada={remover.isPending}
        erro={erro}
        aoConfirmar={() => void confirmarRemocao()}
        aoCancelar={() => setRemovendo(false)}
      >
        O arquivo é apagado. Você pode anexar outro depois.
      </Confirmacao>
    </Cartao>
  )
}
