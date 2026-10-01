import { useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import { escopoDoVinculo, inicioDoPapel, rotuloDoPapel, vinculosDoClube } from '../modulos/acesso/papeis'
import { naoEnviadosDoVinculo, useConexao } from '../offline'
import type { ItemFila } from '../offline'
import { useSessao } from '../sessao/useSessao'
import type { Vinculo } from '../sessao/useSessao'
import { cn } from '../ui/cn'
import { MenuCabecalho } from '../ui/MenuCabecalho'
import type { ItemMenu } from '../ui/MenuCabecalho'

const DURACAO_DO_AVISO_MS = 3000

/** De que são os envios, quando todos são do mesmo tipo: "2 envios da chamada". */
const ASSUNTO_DO_ENVIO: Partial<Record<string, string>> = { REUNIAO: 'da chamada', AULA: 'da aula', FOTO: 'de fotos' }

/**
 * Confirmação da troca, guardada fora do componente: trocar para ou do Adm troca o layout inteiro
 * (e este selo junto), e o redirecionamento da guarda de rota descartaria um estado de navegação.
 */
let avisoAtual: string | null = null
let relogioDoAviso: ReturnType<typeof setTimeout> | undefined
const ouvintesDoAviso = new Set<() => void>()

function anunciar(texto: string | null): void {
  avisoAtual = texto
  clearTimeout(relogioDoAviso)
  if (texto) relogioDoAviso = setTimeout(() => anunciar(null), DURACAO_DO_AVISO_MS)
  for (const ouvinte of ouvintesDoAviso) ouvinte()
}

const assinarAviso = (ouvinte: () => void): (() => void) => {
  ouvintesDoAviso.add(ouvinte)
  return () => ouvintesDoAviso.delete(ouvinte)
}

function avisoDePendentes(pendentes: ItemFila[], papelAnterior: string): string {
  if (pendentes.length === 0) return ''
  const tipos = new Set(pendentes.map((item) => item.tipo))
  const assunto = tipos.size === 1 ? ASSUNTO_DO_ENVIO[[...tipos][0] ?? ''] : undefined
  const envios = pendentes.length === 1 ? '1 envio' : `${pendentes.length} envios`
  const verbo = pendentes.length === 1 ? 'aguarda' : 'aguardam'
  return ` ${[envios, assunto, verbo].filter(Boolean).join(' ')} você voltar a ${papelAnterior}.`
}

/**
 * Selo do papel em uso no cabeçalho, para quem tem 2+ vínculos no clube da sessão: troca em dois
 * toques e leva ao início do novo papel, anunciando a troca por 3 s.
 */
export function SeloPapel({ sobreMarca = false }: { sobreMarca?: boolean }) {
  const { eu, vinculoAtivo, vinculos, escolherPapel } = useSessao()
  const { modo } = useConexao()
  const navegar = useNavigate()
  const aviso = useSyncExternalStore(assinarAviso, () => avisoAtual)
  const [trocando, definirTrocando] = useState(false)

  const trocarPara = async (destino: Vinculo, anterior: Vinculo) => {
    if (destino.id === anterior.id || trocando) return
    if (modo === 'SEM_CONEXAO') {
      anunciar('Trocar de papel precisa de internet.')
      return
    }
    definirTrocando(true)
    try {
      const pendentes = eu ? await naoEnviadosDoVinculo(eu.usuario.id, anterior.id).catch(() => []) : []
      await escolherPapel(destino.id)
      anunciar(`Agora você está como ${rotuloDoPapel(destino.papel)}.${avisoDePendentes(pendentes, rotuloDoPapel(anterior.papel))}`)
      void navegar(inicioDoPapel(destino.papel))
    } catch {
      anunciar('Não foi possível trocar de papel. Tente de novo.')
    } finally {
      definirTrocando(false)
    }
  }

  const papelEmUso = vinculoAtivo ? rotuloDoPapel(vinculoAtivo.papel) : ''
  const itens: ItemMenu[] = vinculoAtivo
    ? vinculosDoClube(vinculos, vinculoAtivo).map((vinculo) => ({
        rotulo: rotuloDoPapel(vinculo.papel),
        descricao: escopoDoVinculo(vinculo) || undefined,
        marcado: vinculo.id === vinculoAtivo.id,
        aoEscolher: () => void trocarPara(vinculo, vinculoAtivo),
      }))
    : []

  return (
    <>
      {itens.length >= 2 && (
        <MenuCabecalho
          rotulo={papelEmUso}
          rotuloAcessivel={`Papel: ${papelEmUso}. Trocar de papel`}
          itens={itens}
          className="shrink-0"
          classeDoBotao={cn(
            'rounded-full px-3 text-sm',
            sobreMarca ? 'bg-marca-escura text-white hover:bg-black/20' : 'bg-marca-suave text-marca hover:bg-marca-suave/70',
          )}
          classeDoRotulo="max-w-none"
        />
      )}
      <p
        role="status"
        className={
          aviso
            ? 'pointer-events-none fixed inset-x-0 top-16 z-50 mx-auto w-fit max-w-[calc(100vw-2rem)] rounded-cartao bg-texto px-4 py-3 text-center text-base text-white shadow-lg'
            : 'sr-only'
        }
      >
        {aviso}
      </p>
    </>
  )
}
