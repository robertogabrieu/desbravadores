import { useRef, useState } from 'react'
import { useCriarRascunhoCB, useSalvarRascunhoCB } from '../../../api/classe-biblica'
import type { EdicaoCB, RascunhoDaEdicao } from '../../../api/classe-biblica'
import { ErroDaApi } from '../../../api/cliente'
import { useConexao } from '../../../offline'
import { FUSO_PADRAO_DO_CLUBE } from '../formatos'

export const ETAPAS_DA_EDICAO = ['Dados da edição', 'Grupos', 'Datas']

export const AVISO_SEM_INTERNET = 'Sem internet: o que você preencher agora não fica salvo.'

const horaMinuto = new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO_PADRAO_DO_CLUBE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

/** "15:42", no fuso do clube. */
export function horaDoSalvo(instante: string): string {
  return horaMinuto.format(new Date(instante))
}

/**
 * O rascunho vive no servidor (D11): cada saída de campo e cada troca de etapa grava. Edição nova
 * (`idInicial` nulo) nasce no primeiro `salvar`, com os padrões do clube; sem conexão, nada sai.
 */
export function useRascunhoDaEdicao(idInicial: string | null, padroesDaCriacao: RascunhoDaEdicao = {}) {
  const { modo } = useConexao()
  const semConexao = modo === 'SEM_CONEXAO'
  const criar = useCriarRascunhoCB()
  const salvarNoServidor = useSalvarRascunhoCB()
  const [id, setId] = useState(idInicial)
  const [salvoEm, setSalvoEm] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  // Uma gravação por vez, na ordem: a criação precisa terminar antes do primeiro PATCH.
  const fila = useRef<Promise<unknown>>(Promise.resolve())
  const idAtual = useRef(idInicial)

  const gravar = async (campos: RascunhoDaEdicao): Promise<EdicaoCB> => {
    const edicao = idAtual.current === null
      ? await criar.mutateAsync({ ...padroesDaCriacao, etapa: 1, ...campos })
      : await salvarNoServidor.mutateAsync({ id: idAtual.current, ...campos })
    idAtual.current = edicao.id
    setId(edicao.id)
    setSalvoEm(edicao.atualizadaEm)
    setErro(null)
    return edicao
  }

  /** Grava os campos; devolve a edição salva, ou nulo quando não deu (sem conexão ou recusa). */
  const salvar = (campos: RascunhoDaEdicao): Promise<EdicaoCB | null> => {
    if (semConexao) return Promise.resolve(null)
    const proxima = fila.current.then(() => gravar(campos)).catch((falha: unknown) => {
      setErro(falha instanceof ErroDaApi && falha.classe !== 'REDE' ? falha.erro.mensagem : 'Não foi possível salvar agora. Tente de novo.')
      return null
    })
    fila.current = proxima
    return proxima
  }

  return {
    id,
    salvar,
    /** Outra gravação (os grupos) também marca o "Salvo às". */
    marcarSalvo: setSalvoEm,
    semConexao,
    erro,
    salvoAs: salvoEm ? horaDoSalvo(salvoEm) : null,
  }
}

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const DIAS_NO_PLURAL = ['domingos', 'segundas', 'terças', 'quartas', 'quintas', 'sextas', 'sábados']
export const DIAS_DA_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

const diaDaSemanaDe = (data: string): number => new Date(`${data}T12:00:00Z`).getUTCDay()

/** "2027-03-07" → "07/03" */
export const diaMes = (data: string): string => `${data.slice(8, 10)}/${data.slice(5, 7)}`

/** "2027-03-07" → "domingo" */
export const diaDaSemanaDaData = (data: string): string => DIAS[diaDaSemanaDe(data)]

/** "2027-03-07" → "domingo 07/03" */
export const dataCurta = (data: string): string => `${DIAS[diaDaSemanaDe(data)]} ${diaMes(data)}`

export const diasNoPlural = (diaSemana: number): string => DIAS_NO_PLURAL[diaSemana]

/** Quantas vezes o dia da semana cai entre início e fim, inclusive. */
export function ocorrenciasDoDia(inicio: string, fim: string, diaSemana: number): number {
  const primeiro = new Date(`${inicio}T12:00:00Z`)
  const ultimo = new Date(`${fim}T12:00:00Z`)
  const ate = (diaSemana - primeiro.getUTCDay() + 7) % 7
  primeiro.setUTCDate(primeiro.getUTCDate() + ate)
  if (primeiro > ultimo) return 0
  return Math.floor((ultimo.getTime() - primeiro.getTime()) / (7 * 24 * 3600 * 1000)) + 1
}
