import { CheckCircle2, CloudUpload, WifiOff } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useConexao, useFila } from '../../offline'
import type { ItemFilaNaTela } from '../../offline'
import { BarraProgresso } from '../../ui/BarraProgresso'
import { Botao } from '../../ui/Botao'
import { Cartao } from '../../ui/Cartao'
import { Confirmacao } from '../../ui/Confirmacao'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { FaixaAviso } from '../../ui/FaixaAviso'
import { cn } from '../../ui/cn'

const ESTADO_NA_LISTA: Record<ItemFilaNaTela['estado'], { texto: string; cor: string }> = {
  NA_FILA: { texto: 'na fila', cor: 'text-alerta' },
  ENVIANDO: { texto: 'enviando', cor: 'text-marca' },
  ENVIADO: { texto: 'enviado', cor: 'text-sucesso' },
  ERRO: { texto: 'erro', cor: 'text-perigo' },
}

interface ResumoGeral {
  titulo: string
  texto: string
  Icone: LucideIcon
  alerta: boolean
}

function plural(quantidade: number, singular: string, pluralizado: string): string {
  return quantidade === 1 ? `${quantidade} ${singular}` : `${quantidade} ${pluralizado}`
}

function resumir(semConexao: boolean, pendentes: number, erros: number): ResumoGeral {
  if (semConexao && pendentes + erros > 0) {
    const total = pendentes + erros
    return { titulo: 'Sem conexão', texto: `${plural(total, 'item', 'itens')} aguardando envio. Eles sobem sozinhos quando a internet voltar.`, Icone: WifiOff, alerta: true }
  }
  if (erros > 0) return { titulo: plural(erros, 'item com problema', 'itens com problema'), texto: 'O restante já está no servidor ou a caminho.', Icone: CloudUpload, alerta: true }
  if (pendentes > 0) return { titulo: 'Enviando…', texto: 'Pode continuar usando o app.', Icone: CloudUpload, alerta: false }
  return { titulo: 'Tudo enviado', texto: 'Nada pendente neste aparelho.', Icone: CheckCircle2, alerta: false }
}

interface ItemDaListaProps {
  item: ItemFilaNaTela
  aoTentarDeNovo: () => void
  aoDescartar: () => void
}

function ItemDaLista({ item, aoTentarDeNovo, aoDescartar }: ItemDaListaProps) {
  const estado = ESTADO_NA_LISTA[item.estado]
  return (
    <li className="flex flex-col gap-2 border-b border-divisor px-4 py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-base font-bold text-texto">{item.rotulo}</span>
          <span className="text-sm text-texto-2">{item.detalhe}</span>
        </div>
        <span className={cn('shrink-0 text-sm font-extrabold', estado.cor)}>{item.estado === 'ENVIANDO' ? `${item.progresso}%` : estado.texto}</span>
      </div>
      {item.estado === 'ENVIANDO' && <BarraProgresso valor={item.progresso} rotulo={`Enviando ${item.rotulo}`} />}
      {item.esperandoDependencia && <span className="text-sm font-semibold text-texto-2">Esperando a chamada ser enviada</span>}
      {item.estado === 'ERRO' && (
        <>
          {item.erro && <span className="text-sm font-medium text-perigo">{item.erro.mensagem}</span>}
          <div className="flex flex-wrap gap-2">
            <Botao variante="secundario" onClick={aoTentarDeNovo}>
              Tentar de novo
            </Botao>
            <Botao variante="secundario" className="text-perigo" onClick={aoDescartar}>
              Descartar
            </Botao>
          </div>
        </>
      )}
    </li>
  )
}

/** Tela "Aguardando envio": o que está guardado neste aparelho e o que já subiu. */
export function PaginaFila() {
  const { modo } = useConexao()
  const fila = useFila()
  const [aDescartar, definirADescartar] = useState<ItemFilaNaTela | null>(null)

  const { pendentes, erros } = fila.contagem
  const resumo = resumir(modo === 'SEM_CONEXAO', pendentes, erros)
  const { avisos } = fila
  const dependentes = aDescartar ? fila.dependentes(aDescartar.id) : []

  return (
    <div className="flex flex-col gap-4 p-4">
      <h1 className="font-titulo text-2xl font-bold text-texto">Aguardando envio</h1>

      <section role="status" className={cn('flex flex-col gap-3 rounded-cartao p-4', resumo.alerta ? 'bg-alerta-fundo text-alerta' : 'bg-marca-suave text-marca')}>
        <div className="flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-superficie">
            <resumo.Icone aria-hidden className="size-5" />
          </span>
          <div className="flex flex-col">
            <span className="font-titulo text-xl font-extrabold">{resumo.titulo}</span>
            <span className="text-sm">{resumo.texto}</span>
          </div>
        </div>
        {pendentes > 0 && <Botao onClick={() => fila.tentarAgora()}>Tentar enviar agora</Botao>}
      </section>

      {avisos.pausadaPorSessao && <FaixaAviso>Entre de novo para enviar</FaixaAviso>}
      {avisos.poucoEspaco && <FaixaAviso>Pouco espaço: envie as fotos quando houver internet</FaixaAviso>}
      {avisos.descartadosDeOutraPessoa > 0 && (
        <FaixaAviso>
          {plural(avisos.descartadosDeOutraPessoa, 'envio antigo de outra pessoa foi descartado', 'envios antigos de outra pessoa foram descartados')} deste aparelho
        </FaixaAviso>
      )}
      {avisos.instalarNaTelaInicial && <FaixaAviso>Instale o app na tela inicial para não perder chamadas guardadas</FaixaAviso>}

      {fila.itens.length === 0 ? (
        <Cartao>
          <EstadoVazio
            titulo="Nada esperando envio"
            descricao="Tudo o que você registrou já foi enviado."
            acao={
              <Link to="/inicio" className="inline-flex min-h-[var(--touch-min)] items-center rounded-botao bg-marca px-5 text-base font-semibold text-white">
                Voltar ao início
              </Link>
            }
          />
        </Cartao>
      ) : (
        <section aria-labelledby="titulo-lista-fila" className="flex flex-col gap-2">
          <h2 id="titulo-lista-fila" className="text-sm font-bold uppercase text-texto-2">
            Neste aparelho
          </h2>
          <ul className="rounded-cartao border border-borda bg-superficie">
            {fila.itens.map((item) => (
              <ItemDaLista key={item.id} item={item} aoTentarDeNovo={() => void fila.tentarDeNovo(item.id)} aoDescartar={() => definirADescartar(item)} />
            ))}
          </ul>
        </section>
      )}

      <p className="text-center text-sm text-texto-2">Mantenha o app aberto até terminar — com ele fechado, nada é enviado.</p>

      <Confirmacao
        aberta={aDescartar !== null}
        titulo="Descartar este envio?"
        rotuloConfirmar="Descartar"
        perigo
        aoCancelar={() => definirADescartar(null)}
        aoConfirmar={() => {
          if (aDescartar) void fila.descartar(aDescartar.id)
          definirADescartar(null)
        }}
      >
        <p>{aDescartar?.rotulo} será apagado deste celular e não será enviado.</p>
        {dependentes.length > 0 && (
          <>
            <p className="mt-2 font-semibold">Estes envios dependem dele e também darão erro:</p>
            <ul className="mt-1 list-disc pl-5">
              {dependentes.map((dependente) => (
                <li key={dependente.id}>{dependente.rotulo}</li>
              ))}
            </ul>
          </>
        )}
      </Confirmacao>
    </div>
  )
}
