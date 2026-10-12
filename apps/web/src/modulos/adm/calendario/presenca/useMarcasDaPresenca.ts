import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo, useRef, useState } from 'react'
import { chavesPresenca, gravarPresenca, invalidarDepoisDaLista, usePresenca } from '../../../../api/presenca'
import type { LinhaDaPresenca, MarcaParaGravar, Presenca, ResumoDaPresenca } from '../../../../api/presenca'
import { useConexao } from '../../../../offline'

export type SituacaoDaMarca = 'salva' | 'salvando' | 'falhou'

/** `foi` e `comUniforme` são sempre os últimos valores que o servidor confirmou; a `situacao` diz se há algo em andamento. */
export interface MarcaDaPessoa {
  foi: boolean
  comUniforme: boolean
  situacao: SituacaoDaMarca
}

export interface Mudanca {
  foi?: boolean
  comUniforme?: boolean
}

interface Trabalho {
  id: number
  marcas: MarcaParaGravar[]
}

type Pendencias = Record<string, { situacao: 'salvando' | 'falhou'; trabalho: number }>

const SEM_MARCA: LinhaDaPresenca = { dbvId: '', nome: '', foi: false, comUniforme: false }

function totaisDe(unidades: Presenca['unidades']): ResumoDaPresenca {
  const linhas = unidades.flatMap((unidade) => unidade.linhas)
  return {
    foram: linhas.filter((linha) => linha.foi).length,
    uniformizados: linhas.filter((linha) => linha.foi && linha.comUniforme).length,
    total: linhas.length,
  }
}

/**
 * As marcas da lista "Quem foi", com a regra de que a tela só mostra como marcado o que o servidor confirmou.
 * Cada toque entra numa fila que grava uma requisição por vez; o botão em massa é uma requisição só.
 * Sem internet o toque novo não é aceito (não existe fila offline): o que já estava sem confirmação continua contado.
 */
export function useMarcasDaPresenca(eventoId: string) {
  const cliente = useQueryClient()
  const consulta = usePresenca(eventoId)
  const { modo } = useConexao()
  const semInternet = modo === 'SEM_CONEXAO'

  const [pendencias, setPendencias] = useState<Pendencias>({})
  const [salvoAs, setSalvoAs] = useState<Date | null>(null)
  const pendenciasAtuais = useRef<Pendencias>({})
  const fila = useRef<Trabalho[]>([])
  const trabalhos = useRef(new Map<number, Trabalho>())
  const proximoTrabalho = useRef(1)
  const gravando = useRef(false)

  const linhas = useMemo(() => {
    const porId = new Map<string, LinhaDaPresenca>()
    for (const unidade of consulta.data?.unidades ?? []) for (const linha of unidade.linhas) porId.set(linha.dbvId, linha)
    return porId
  }, [consulta.data])

  const mudarPendencias = useCallback((mudar: (atuais: Pendencias) => Pendencias) => {
    pendenciasAtuais.current = mudar(pendenciasAtuais.current)
    setPendencias(pendenciasAtuais.current)
  }, [])

  /** O servidor mandou as linhas autoritativas das pessoas tocadas: elas entram na leitura em cache. */
  const reconciliar = useCallback(
    (trabalho: Trabalho, resposta: Awaited<ReturnType<typeof gravarPresenca>>) => {
      const novas = new Map(resposta.linhas.map((linha) => [linha.dbvId, linha]))
      cliente.setQueryData<Presenca>(chavesPresenca.evento(eventoId), (anterior) =>
        anterior && {
          ...anterior,
          unidades: anterior.unidades.map((unidade) => ({ ...unidade, linhas: unidade.linhas.map((linha) => novas.get(linha.dbvId) ?? linha) })),
          resumo: resposta.resumo,
          listaConcluidaEm: resposta.listaConcluidaEm,
        },
      )
      const ids = new Set(trabalho.marcas.map((marca) => marca.dbvId))
      mudarPendencias((atuais) => Object.fromEntries(Object.entries(atuais).filter(([dbvId]) => !ids.has(dbvId))))
      trabalhos.current.delete(trabalho.id)
      setSalvoAs(new Date())
    },
    [cliente, eventoId, mudarPendencias],
  )

  const falhar = useCallback(
    (trabalho: Trabalho) => {
      const ids = new Set(trabalho.marcas.map((marca) => marca.dbvId))
      mudarPendencias((atuais) => Object.fromEntries(Object.entries(atuais).map(([dbvId, pendencia]) => [dbvId, ids.has(dbvId) ? { ...pendencia, situacao: 'falhou' as const } : pendencia])))
    },
    [mudarPendencias],
  )

  const esvaziarFila = useCallback(async () => {
    if (gravando.current) return
    gravando.current = true
    try {
      for (let trabalho = fila.current.shift(); trabalho; trabalho = fila.current.shift()) {
        try {
          await cliente.cancelQueries({ queryKey: chavesPresenca.evento(eventoId) })
          const resposta = await gravarPresenca(eventoId, trabalho.marcas)
          // Uma leitura que saiu durante a gravação traz a lista de antes dela: o que o servidor confirmou vale mais.
          await cliente.cancelQueries({ queryKey: chavesPresenca.evento(eventoId) })
          reconciliar(trabalho, resposta)
          void invalidarDepoisDaLista(cliente)
        } catch {
          falhar(trabalho)
        }
      }
    } finally {
      gravando.current = false
    }
  }, [cliente, eventoId, falhar, reconciliar])

  const enfileirar = useCallback(
    (trabalho: Trabalho) => {
      trabalhos.current.set(trabalho.id, trabalho)
      const ids = trabalho.marcas.map((marca) => marca.dbvId)
      mudarPendencias((atuais) => ({ ...atuais, ...Object.fromEntries(ids.map((dbvId) => [dbvId, { situacao: 'salvando' as const, trabalho: trabalho.id }])) }))
      fila.current.push(trabalho)
      void esvaziarFila()
    },
    [esvaziarFila, mudarPendencias],
  )

  const marcarEmMassa = useCallback(
    (mudancas: Array<Mudanca & { dbvId: string }>) => {
      if (semInternet) return
      const marcas = mudancas.filter((mudanca) => !pendenciasAtuais.current[mudanca.dbvId])
      if (marcas.length === 0) return
      enfileirar({ id: proximoTrabalho.current++, marcas })
    },
    [enfileirar, semInternet],
  )

  const marcar = useCallback((dbvId: string, mudanca: Mudanca) => marcarEmMassa([{ dbvId, ...mudanca }]), [marcarEmMassa])

  const tentarDeNovo = useCallback(
    (dbvId: string) => {
      const pendencia = pendenciasAtuais.current[dbvId]
      const trabalho = pendencia && trabalhos.current.get(pendencia.trabalho)
      if (!trabalho || pendencia.situacao !== 'falhou' || semInternet) return
      enfileirar(trabalho)
    },
    [enfileirar, semInternet],
  )

  const marcaDe = useCallback(
    (dbvId: string): MarcaDaPessoa => {
      const { foi, comUniforme } = linhas.get(dbvId) ?? SEM_MARCA
      return { foi, comUniforme, situacao: pendencias[dbvId]?.situacao ?? 'salva' }
    },
    [linhas, pendencias],
  )

  const idsPendentes = Object.keys(pendencias)

  return {
    consulta,
    marcaDe,
    marcar,
    marcarEmMassa,
    tentarDeNovo,
    salvoAs,
    /** Quantas pessoas têm marca ainda sem confirmação do servidor (salvando ou que falhou). */
    pendentes: idsPendentes.length,
    idsPendentes,
    /** O que o Adm está vendo: só marcas confirmadas contam. */
    totais: useMemo(() => totaisDe(consulta.data?.unidades ?? []), [consulta.data]),
  }
}
