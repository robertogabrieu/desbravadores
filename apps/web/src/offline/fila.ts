import { useSyncExternalStore } from 'react'
import { banco } from './banco'
import { acordarMotor, estadoOffline } from './estado'
import { obterTipo } from './registro'
import { LIMITE_DE_ESPACO_BYTES } from './tempos'
import type { Enfileirar, EstadoFila, ItemFila, ItemFilaNaTela, ItensDaChave, UseFila } from './tipos'

const FIM_DA_CHAVE = '￿'

const ativo = (item: ItemFila): boolean => item.estado !== 'ENVIADO'
const porCriacao = (a: ItemFila, b: ItemFila): number => a.criadoEm - b.criadoEm

let ultimoCriadoEm = 0
/** Instantes crescentes: a ordem de envio é a de `criadoEm`, então dois itens no mesmo milissegundo não podem empatar. */
const novoInstante = (): number => {
  ultimoCriadoEm = Math.max(Date.now(), ultimoCriadoEm + 1)
  return ultimoCriadoEm
}

let pediuPersistencia = false
async function pedirPersistencia(): Promise<void> {
  if (pediuPersistencia) return
  pediuPersistencia = true
  try {
    await navigator.storage?.persist?.()
  } catch {
    // Sem persistência o navegador pode apagar o banco sob pressão de espaço; o aviso de espaço cobre o resto.
  }
}

export const enfileirar: Enfileirar = async (entrada) => {
  const sessao = estadoOffline.sessao
  if (!sessao) throw new Error('Não há sessão para guardar o envio')
  const tipo = obterTipo(entrada.tipo)
  if (!tipo) throw new Error(`Tipo de fila não registrado: ${entrada.tipo}`)
  await pedirPersistencia()

  const id = await banco.transaction('rw', banco.fila, async () => {
    const daChave = await banco.fila.where('chave').equals(entrada.chave).toArray()
    const alvo = daChave
      .filter((item) => item.usuarioId === sessao.usuarioId && (item.estado === 'NA_FILA' || item.estado === 'ERRO'))
      .sort(porCriacao)
      .at(-1)

    if (alvo) {
      const payload = tipo.fundir(alvo.payload, entrada.payload)
      const blob = entrada.blob ?? alvo.blob
      const fundido: ItemFila = {
        ...alvo,
        payload,
        blob,
        rotulo: tipo.rotulo(payload),
        detalhe: tipo.detalhe(payload, blob),
        estado: 'NA_FILA',
        progresso: 0,
        tentativas: 0,
        proximaTentativaEm: null,
        atualizadoEm: Date.now(),
      }
      delete fundido.erro
      await banco.fila.put(fundido)
      return alvo.id
    }

    const agora = novoInstante()
    const novo: ItemFila = {
      id: crypto.randomUUID(),
      versaoPayload: 1,
      usuarioId: sessao.usuarioId,
      vinculoId: sessao.vinculoId,
      tipo: entrada.tipo,
      chave: entrada.chave,
      ...(entrada.dependeDe === undefined ? {} : { dependeDe: entrada.dependeDe }),
      rotulo: tipo.rotulo(entrada.payload),
      detalhe: tipo.detalhe(entrada.payload, entrada.blob),
      payload: entrada.payload,
      ...(entrada.blob === undefined ? {} : { blob: entrada.blob }),
      estado: 'NA_FILA',
      progresso: 0,
      tentativas: 0,
      proximaTentativaEm: null,
      criadoEm: agora,
      atualizadoEm: agora,
    }
    await banco.fila.add(novo)
    return novo.id
  })

  acordarMotor()
  void recarregarFila()
  return id
}

/** Itens da chave que ainda não foram enviados (do usuário da sessão), em `criadoEm`. */
export const itensDaChave: ItensDaChave = async (chave) => {
  const sessao = estadoOffline.sessao
  if (!sessao) return []
  const daChave = await banco.fila.where('chave').equals(chave).toArray()
  return daChave.filter((item) => item.usuarioId === sessao.usuarioId && ativo(item)).sort(porCriacao)
}

/** Não enviados do usuário, de qualquer vínculo (o motor precisa deles para as dependências). */
export async function naoEnviadosDoUsuario(usuarioId: string): Promise<ItemFila[]> {
  const itens = await banco.fila
    .where('[usuarioId+estado]')
    .anyOf(['NA_FILA', 'ENVIANDO', 'ERRO'].map((estado) => [usuarioId, estado]))
    .toArray()
  return itens.sort(porCriacao)
}

async function tentarAgora(): Promise<void> {
  const sessao = estadoOffline.sessao
  if (!sessao) return
  await banco.fila
    .where('[usuarioId+estado]')
    .equals([sessao.usuarioId, 'NA_FILA'])
    .modify({ proximaTentativaEm: null })
  estadoOffline.pausadaPorSessao = false
  estadoOffline.forcarPassada = true
  acordarMotor()
  await recarregarFila()
}

async function tentarDeNovo(id: string): Promise<void> {
  await banco.fila.update(id, {
    estado: 'NA_FILA',
    tentativas: 0,
    proximaTentativaEm: null,
    progresso: 0,
    erro: undefined,
    atualizadoEm: Date.now(),
  })
  acordarMotor()
  await recarregarFila()
}

async function descartar(id: string): Promise<void> {
  await banco.transaction('rw', banco.fila, async () => {
    const item = await banco.fila.get(id)
    if (!item) return
    await banco.fila.delete(id)
    const dependentes = await banco.fila
      .filter((outro) => outro.usuarioId === item.usuarioId && ativo(outro))
      .toArray()
    if (dependentes.some((outro) => outro.chave === item.chave)) return
    for (const dependente of dependentes.filter((outro) => outro.dependeDe === item.chave)) {
      await banco.fila.update(dependente.id, {
        estado: 'ERRO',
        erro: { codigo: 'DESCARTADO', mensagem: 'A chamada foi descartada' },
        atualizadoEm: Date.now(),
      })
    }
  })
  await recarregarFila()
}

function dependentes(id: string): ItemFilaNaTela[] {
  const item = visao.itens.find((candidato) => candidato.id === id)
  if (!item) return []
  return visao.itens.filter((outro) => outro.id !== id && outro.dependeDe === item.chave && ativo(outro))
}

const instaladoNaTelaInicial = (): boolean => {
  const ehIphone = /iPhone|iPad|iPod/.test(navigator.userAgent)
  if (!ehIphone) return true
  const standalone = 'standalone' in navigator && navigator.standalone === true
  const modoApp = typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches
  return standalone || modoApp
}

function montarVisao(itens: ItemFila[]): EstadoFila {
  const naTela: ItemFilaNaTela[] = itens.map((item) => ({
    ...item,
    esperandoDependencia: item.dependeDe !== undefined && itens.some((outro) => outro.chave === item.dependeDe && ativo(outro)),
  }))
  const bytes = itens.filter(ativo).reduce((total, item) => total + (item.blob?.size ?? 0), 0)
  return {
    itens: naTela,
    contagem: {
      pendentes: itens.filter((item) => item.estado === 'NA_FILA' || item.estado === 'ENVIANDO').length,
      erros: itens.filter((item) => item.estado === 'ERRO').length,
    },
    avisos: {
      pausadaPorSessao: estadoOffline.pausadaPorSessao,
      poucoEspaco: bytes > LIMITE_DE_ESPACO_BYTES,
      descartadosDeOutraPessoa: estadoOffline.descartadosDeOutraPessoa,
      instalarNaTelaInicial: !instaladoNaTelaInicial(),
    },
    tentarAgora: () => void tentarAgora(),
    tentarDeNovo,
    dependentes,
    descartar,
  }
}

let visao: EstadoFila = montarVisao([])
let sequencia = 0
const ouvintes = new Set<() => void>()

/** Relê a fila da sessão atual e avisa quem está escutando (`useFila`). Chamado depois de cada mudança. */
export async function recarregarFila(): Promise<void> {
  const minha = ++sequencia
  const sessao = estadoOffline.sessao
  try {
    const itens = sessao
      ? (
          await banco.fila
            .where('[usuarioId+estado]')
            .between([sessao.usuarioId, ''], [sessao.usuarioId, FIM_DA_CHAVE])
            .toArray()
        )
          .filter((item) => item.vinculoId === sessao.vinculoId)
          .sort(porCriacao)
      : []
    if (minha !== sequencia) return
    visao = montarVisao(itens)
    for (const ouvinte of ouvintes) ouvinte()
  } catch {
    // Banco fechado (troca de usuário, fim de teste): a próxima mudança relê.
  }
}

export const reiniciarFila = (): void => {
  pediuPersistencia = false
  ultimoCriadoEm = 0
  sequencia += 1
  visao = montarVisao([])
  for (const ouvinte of ouvintes) ouvinte()
}

const assinar = (ouvinte: () => void): (() => void) => {
  ouvintes.add(ouvinte)
  return () => ouvintes.delete(ouvinte)
}

export const useFila: UseFila = () => useSyncExternalStore(assinar, () => visao)
