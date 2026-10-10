import type { TipoSubstituicao } from '@desbravadores/shared'
import { liveQuery } from 'dexie'
import { Clock, Link2Off, Lock, RefreshCw, Smartphone, TriangleAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { z } from 'zod'
import { banco } from '../../offline/banco'
import { limparDadosDaSubstituicao } from '../../offline/limpeza'
import { agoraDoServidor } from '../../substituicao/relogio'
import { cn } from '../../ui/cn'
import { Carregando } from '../../ui/EstadosDeCarga'
import { FUSO_PADRAO_DO_CLUBE, dataPorExtenso } from '../adm/formatos'
import { horaNoFuso } from '../adm/substituicao/mensagem-substituicao'

type Tipo = z.infer<typeof TipoSubstituicao>

/** O que as telas do link dizem sobre ele: de quem é, em que dia e até quando. */
export interface SobreOLink {
  tipo: Tipo
  alvoNome: string
  data: string
  inicioEm: string | null
  fimEm: string
}

// O LinkPublico não traz o fuso do clube; as horas saem no fuso padrão, o mesmo da mensagem do Adm.
export const hora = (instante: string): string => horaNoFuso(instante, FUSO_PADRAO_DO_CLUBE)

/** "Unidade Águia" | "classe Amigo" */
export const nomeDoAlvo = ({ tipo, alvoNome }: Pick<SobreOLink, 'tipo' | 'alvoNome'>): string =>
  tipo === 'CHAMADA' ? `Unidade ${alvoNome}` : `classe ${alvoNome}`

/** "Chamada da Unidade Águia" | "Registro da classe Amigo" */
export const tituloDoLink = (sobre: Pick<SobreOLink, 'tipo' | 'alvoNome'>): string =>
  sobre.tipo === 'CHAMADA' ? `Chamada da ${nomeDoAlvo(sobre)}` : `Registro da ${nomeDoAlvo(sobre)}`

/** "a chamada" | "o registro da classe" */
const tarefaCurta = (tipo: Tipo): string => (tipo === 'CHAMADA' ? 'a chamada' : 'o registro da classe')

/** "2026-10-11" → { preposicao: "no", dia: "domingo, 11 de outubro" }: sábado e domingo pedem "no". */
function diaComPreposicao(data: string): { preposicao: string; dia: string } {
  const [ano, mes, dia] = data.split('-').map(Number)
  const diaDaSemana = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()
  const extenso = dataPorExtenso(data)
  return { preposicao: diaDaSemana === 0 || diaDaSemana === 6 ? 'no' : 'na', dia: `${extenso.charAt(0).toLowerCase()}${extenso.slice(1)}` }
}

/** "no domingo, 11 de outubro" | "na quarta, 14 de outubro" */
function noDia(data: string): string {
  const { preposicao, dia } = diaComPreposicao(data)
  return `${preposicao} ${dia}`
}

/** Passa a `true` quando o relógio do servidor chega ao instante, sem recarregar a tela. */
export function useInstantePassou(instante: string | null): boolean {
  const alvo = instante === null ? Number.NaN : Date.parse(instante)
  const [passou, setPassou] = useState(() => !Number.isNaN(alvo) && agoraDoServidor() >= alvo)
  useEffect(() => {
    if (Number.isNaN(alvo)) return
    const falta = alvo - agoraDoServidor()
    if (falta <= 0) {
      setPassou(true)
      return
    }
    setPassou(false)
    const espera = setTimeout(() => setPassou(true), falta)
    return () => clearTimeout(espera)
  }, [alvo])
  return passou
}

const contarNaoEnviados = (substituicaoId: string): Promise<number> =>
  banco.fila
    .where('[usuarioId+estado]')
    .anyOf(['NA_FILA', 'ENVIANDO', 'ERRO'].map((estado) => [substituicaoId, estado]))
    .count()

/** Itens desta substituição ainda não enviados (na fila, enviando ou com erro); `null` enquanto o banco não respondeu. */
function useNaoEnviados(substituicaoId: string | null): number | null {
  const [contagem, setContagem] = useState<number | null>(substituicaoId === null ? 0 : null)
  useEffect(() => {
    if (substituicaoId === null) return
    const assinatura = liveQuery(() => contarNaoEnviados(substituicaoId)).subscribe({ next: setContagem, error: () => setContagem(0) })
    return () => assinatura.unsubscribe()
  }, [substituicaoId])
  return contagem
}

/** Esquece o segredo do aparelho guardado para o link. */
export function esquecerAparelho(chave: string): void {
  try {
    localStorage.removeItem(chave)
  } catch {
    // Sem localStorage não havia o que esquecer.
  }
}

/** Barra de título das telas do link: sem menu e sem papel, quem abre não tem conta ou não deve ver a sua. */
export function MolduraDoLink({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-fundo">
      <header className="bg-marca px-4 py-3 text-white">
        <h1 className="font-titulo text-lg font-bold">{titulo}</h1>
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 p-4">{children}</main>
    </div>
  )
}

const TONS = {
  neutro: 'bg-superficie-suave text-texto-2',
  alerta: 'bg-alerta-fundo text-alerta',
  sucesso: 'bg-marca-suave text-marca',
} as const

/** Estado de tela inteira: ícone, título e o texto que basta para saber o que fazer. */
export function EstadoDoLink({ icone: Icone, tom, titulo, children }: { icone: LucideIcon; tom: keyof typeof TONS; titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col items-center gap-3 px-2 py-10 text-center">
      <span aria-hidden className={cn('mb-1 flex size-14 items-center justify-center rounded-full', TONS[tom])}>
        <Icone className="size-7" />
      </span>
      <h2 className="font-titulo text-xl font-bold text-texto">{titulo}</h2>
      <div className="flex max-w-sm flex-col gap-3 text-base text-texto">{children}</div>
    </section>
  )
}

/** Carregando do link: o leitor de tela ouve o que está acontecendo. */
export function AbrindoOLink() {
  return (
    <MolduraDoLink titulo="App do Desbravador">
      <Carregando rotulo="Abrindo o link" />
    </MolduraDoLink>
  )
}

const Nota = ({ children }: { children: ReactNode }) => <p className="text-texto-2">{children}</p>

/** S1: só informa. Não pede nome e não prende o link ao celular; o pai relê o link quando a janela abre. */
export function AntesDoHorario({ sobre, aoAbrir }: { sobre: SobreOLink; aoAbrir: () => void }) {
  const { preposicao, dia } = diaComPreposicao(sobre.data)
  const abriu = useInstantePassou(sobre.inicioEm)
  useEffect(() => {
    if (abriu) aoAbrir()
  }, [abriu, aoAbrir])
  return (
    <MolduraDoLink titulo="App do Desbravador">
      <EstadoDoLink icone={Clock} tom="neutro" titulo={tituloDoLink(sobre)}>
        <p>
          O Adm pediu que você faça {tarefaCurta(sobre.tipo)} {preposicao} <b>{dia}</b>.
        </p>
        <p>
          Este link abre às <b>{sobre.inicioEm ? hora(sobre.inicioEm) : ''}</b> e fica aberto até <b>{hora(sobre.fimEm)}</b>. Volte por esta mesma
          mensagem do WhatsApp nesse horário.
        </p>
        <Nota>Não precisa criar conta nem senha.</Nota>
      </EstadoDoLink>
    </MolduraDoLink>
  )
}

const lancamentos = (n: number): string => (n === 1 ? '1 lançamento' : `${n} lançamentos`)

/**
 * Janela fechada. Com lançamento deste celular ainda não enviado e o fim do envio por vir: S5, que
 * acompanha a fila até zerar. Senão S6, e os dados locais da substituição saem (o pacote traz menores).
 */
export function DepoisDoFim({ sobre, substituicaoId, fimEnvioEm, chaveDoAparelho }: { sobre: SobreOLink; substituicaoId: string | null; fimEnvioEm: string | null; chaveDoAparelho: string }) {
  const naoEnviados = useNaoEnviados(substituicaoId)
  const envioAcabou = useInstantePassou(fimEnvioEm)
  const enviando = naoEnviados !== null && naoEnviados > 0 && fimEnvioEm !== null && !envioAcabou
  if (naoEnviados === null) return <AbrindoOLink />
  if (enviando) return <EnvioPendente restantes={naoEnviados} />
  return <LinkFechou sobre={sobre} substituicaoId={substituicaoId} chaveDoAparelho={chaveDoAparelho} />
}

/** S5. O total é o maior número de pendentes visto desde que a tela abriu: o progresso só anda para a frente. */
function EnvioPendente({ restantes }: { restantes: number }) {
  const total = useRef(restantes)
  total.current = Math.max(total.current, restantes)
  const emEnvio = Math.min(total.current - restantes + 1, total.current)
  return (
    <MolduraDoLink titulo="App do Desbravador">
      <EstadoDoLink icone={RefreshCw} tom="alerta" titulo="O horário acabou, mas ainda falta enviar">
        <p>
          Há <b>{lancamentos(restantes)}</b> {restantes === 1 ? 'salvo' : 'salvos'} neste celular esperando internet.
        </p>
        <p>Deixe esta página aberta. Eles vão sozinhos assim que a internet voltar.</p>
        <p role="status" aria-live="polite" className="text-texto-2">
          Enviando… {emEnvio} de {total.current}
        </p>
      </EstadoDoLink>
    </MolduraDoLink>
  )
}

/** S6: estado sem saída no app; o texto diz a quem pedir. */
function LinkFechou({ sobre, substituicaoId, chaveDoAparelho }: { sobre: SobreOLink; substituicaoId: string | null; chaveDoAparelho: string }) {
  useEffect(() => {
    esquecerAparelho(chaveDoAparelho)
    if (substituicaoId) void limparDadosDaSubstituicao(substituicaoId)
  }, [substituicaoId, chaveDoAparelho])
  const tarefa = sobre.tipo === 'CHAMADA' ? `a chamada da ${nomeDoAlvo(sobre)}` : `o registro da ${nomeDoAlvo(sobre)}`
  return (
    <MolduraDoLink titulo="App do Desbravador">
      <EstadoDoLink icone={Lock} tom="neutro" titulo={`Este link fechou às ${hora(sobre.fimEm)}`}>
        <p>
          Ele valia para {tarefa} {noDia(sobre.data)}.
        </p>
        <p>Se ainda precisa lançar alguma coisa, peça um novo link ao Adm do clube.</p>
      </EstadoDoLink>
    </MolduraDoLink>
  )
}

/** S7, cancelado: conta o que ficou sem enviar antes de apagar, e só então apaga. */
export function LinkCancelado({ substituicaoId, chaveDoAparelho }: { substituicaoId: string | null; chaveDoAparelho: string }) {
  const [perdidos, setPerdidos] = useState<number | null>(substituicaoId === null ? 0 : null)
  useEffect(() => {
    esquecerAparelho(chaveDoAparelho)
    if (substituicaoId === null) return
    let vivo = true
    void (async () => {
      const contagem = await contarNaoEnviados(substituicaoId)
      if (vivo) setPerdidos(contagem)
      await limparDadosDaSubstituicao(substituicaoId)
    })()
    return () => {
      vivo = false
    }
  }, [substituicaoId, chaveDoAparelho])
  // O aviso de perda entra junto com a tela, nunca depois dela: nada aparece empurrando o texto já lido.
  if (perdidos === null) return <AbrindoOLink />
  return (
    <MolduraDoLink titulo="App do Desbravador">
      <EstadoDoLink icone={TriangleAlert} tom="neutro" titulo="O Adm cancelou este link">
        <p>Se você ainda vai substituir, peça um novo link ao Adm.</p>
        {perdidos > 0 && (
          <p className="font-semibold">
            {perdidos === 1
              ? '1 lançamento feito aqui não foi enviado e não vai mais ser. Avise o Adm.'
              : `${perdidos} lançamentos feitos aqui não foram enviados e não vão mais ser. Avise o Adm.`}
          </p>
        )}
      </EstadoDoLink>
    </MolduraDoLink>
  )
}

/** S7, preso a outro aparelho: o texto já diz para abrir pelo navegador de antes. */
export function EmOutroAparelho() {
  return (
    <MolduraDoLink titulo="App do Desbravador">
      <EstadoDoLink icone={Smartphone} tom="neutro" titulo="Este link já está aberto em outro celular">
        <p>
          Cada link funciona em um celular só, e no mesmo navegador em que foi aberto da primeira vez. Se foi você, abra por ele. Se o celular de
          quem abriu primeiro parou, peça um novo link ao Adm.
        </p>
      </EstadoDoLink>
    </MolduraDoLink>
  )
}

/** S7, endereço que não leva a link nenhum. */
export function LinkInexistente() {
  return (
    <MolduraDoLink titulo="App do Desbravador">
      <EstadoDoLink icone={Link2Off} tom="neutro" titulo="Este link não existe">
        <p>Confira se copiou o endereço inteiro da mensagem.</p>
      </EstadoDoLink>
    </MolduraDoLink>
  )
}
