import { ErroDaApi } from '../api/cliente'
import { desligarAbas, ligarAbas } from './abas'
import { banco } from './banco'
import { criarContextoEnvio, ehFalhaEnvio, ErroDeEnvio, paraFalhaEnvio } from './contexto'
import { assinarConexao, lerConexao } from './conexao'
import { acordarMotor, consumirSinal, dormir, estadoOffline } from './estado'
import type { SessaoMotor } from './estado'
import { aoAvisoDeOutraAba, naoEnviadosDoUsuario, recarregarFila } from './fila'
import { baixarPacote } from './pacote'
import { obterTipo } from './registro'
import { MAXIMO_DE_TENTATIVAS_SERVIDOR, tempos } from './tempos'
import type { ContextoAposEnvio, FalhaEnvio, ItemFila, TipoFila } from './tipos'

interface Execucao {
  parada: { valor: boolean }
  comTrava: boolean
  terminou: Promise<void>
  /** Resolve quando o motor pegou a trava e devolveu os ENVIANDO presos à fila. */
  pronto: Promise<void>
  desassinar: () => void
}

let execucao: Execucao | null = null

const MENSAGEM_ERRO_INTERNO = 'Não foi possível enviar. Avise o suporte.'
const MENSAGEM_SERVIDOR = 'O servidor não respondeu. Tente de novo mais tarde.'

/**
 * Liga o motor para a sessão dada. Idempotente: com o motor ligado só troca a sessão, tira a pausa e acorda.
 * O motor vive sob o Web Lock `fila`: uma aba por vez, as outras esperam a vez.
 */
export function iniciarMotor(sessao: SessaoMotor): void {
  estadoOffline.sessao = sessao
  estadoOffline.pausadaPorSessao = false
  void recarregarFila()
  if (execucao) {
    acordarMotor()
    return
  }

  const parada = { valor: false }
  ligarAbas(aoAvisoDeOutraAba)
  const aoFicarVisivel = () => {
    if (document.visibilityState === 'visible') acordarMotor()
  }
  document.addEventListener('visibilitychange', aoFicarVisivel)
  const desassinarConexao = assinarConexao(acordarMotor)
  let liberarPronto: () => void = () => undefined
  const pronto = new Promise<void>((resolver) => {
    liberarPronto = resolver
  })
  const nova: Execucao = {
    parada,
    comTrava: false,
    terminou: Promise.resolve(),
    pronto,
    desassinar: () => {
      desassinarConexao()
      document.removeEventListener('visibilitychange', aoFicarVisivel)
      desligarAbas()
    },
  }
  const pedido: Promise<unknown> = navigator.locks.request('fila', async () => {
    if (parada.valor) return
    nova.comTrava = true
    try {
      await banco.fila.filter((item) => item.estado === 'ENVIANDO').modify({ estado: 'NA_FILA' })
      liberarPronto()
      await rodar(parada)
    } catch (erro) {
      console.error('O motor da fila parou', erro)
    } finally {
      liberarPronto()
      nova.comTrava = false
    }
  })
  nova.terminou = pedido.then(() => undefined)
  execucao = nova
}

/** Desliga o motor (sair, fim do componente). Espera o envio em andamento terminar. */
export async function pararMotor(): Promise<void> {
  const atual = execucao
  execucao = null
  estadoOffline.sessao = null
  if (!atual) return
  atual.parada.valor = true
  atual.desassinar()
  acordarMotor()
  if (atual.comTrava) await atual.terminou
  void recarregarFila()
}

/** Resolve quando o motor atual já tem a trava (para testes e para quem precisa da fila estável). */
export const aguardarMotorPronto = async (): Promise<void> => {
  await execucao?.pronto
}

async function rodar(parada: { valor: boolean }): Promise<void> {
  while (!parada.valor) {
    consumirSinal()
    const sessao = estadoOffline.sessao
    let proximaEm: number | null = null
    if (sessao && !estadoOffline.pausadaPorSessao && (lerConexao() === 'ONLINE' || estadoOffline.forcarPassada)) {
      const escolha = await escolherProximo(sessao)
      if (escolha.item) {
        await enviarItem(escolha.item, sessao)
        continue
      }
      estadoOffline.forcarPassada = false
      proximaEm = escolha.proximaEm
    }
    await dormir(proximaEm)
  }
}

async function escolherProximo(sessao: SessaoMotor): Promise<{ item: ItemFila | null; proximaEm: number | null }> {
  const agora = Date.now()
  const pendentes = await naoEnviadosDoUsuario(sessao.usuarioId)
  let proximaEm: number | null = null
  for (const item of pendentes) {
    if (item.estado !== 'NA_FILA' || item.vinculoId !== sessao.vinculoId) continue
    const esperandoDependencia = item.dependeDe !== undefined && pendentes.some((outro) => outro.chave === item.dependeDe)
    const atrasDeOutroDaChave = pendentes.some((outro) => outro.id !== item.id && outro.chave === item.chave && outro.criadoEm < item.criadoEm)
    if (esperandoDependencia || atrasDeOutroDaChave) continue
    if (item.proximaTentativaEm !== null && item.proximaTentativaEm > agora) {
      proximaEm = proximaEm === null ? item.proximaTentativaEm : Math.min(proximaEm, item.proximaTentativaEm)
      continue
    }
    return { item, proximaEm: null }
  }
  return { item: null, proximaEm }
}

/** Marca ENVIANDO só se o item ainda está NA_FILA (outra ação pode ter mexido nele). */
function marcarEnviando(id: string): Promise<ItemFila | null> {
  return banco.transaction('rw', banco.fila, async () => {
    const atual = await banco.fila.get(id)
    if (atual?.estado !== 'NA_FILA') return null
    const marcado: ItemFila = { ...atual, estado: 'ENVIANDO', progresso: 0, atualizadoEm: Date.now() }
    await banco.fila.put(marcado)
    return marcado
  })
}

async function enviarItem(candidato: ItemFila, sessao: SessaoMotor): Promise<void> {
  const item = await marcarEnviando(candidato.id)
  if (!item) return
  void recarregarFila()

  const tipo = obterTipo(item.tipo)
  if (!tipo) {
    await marcarErro(item.id, { codigo: 'TIPO_DESCONHECIDO', mensagem: 'Este envio não é reconhecido por esta versão do app.' })
    return
  }

  try {
    let ultimoPercentual = -1
    const contexto = criarContextoEnvio(sessao.queryClient, (percentual) => {
      if (percentual === ultimoPercentual) return
      ultimoPercentual = percentual
      void banco.fila.update(item.id, { progresso: percentual }).then(() => recarregarFila())
    })
    const bruto = await tipo.enviar(item, contexto)
    const lido = tipo.saida.safeParse(bruto)
    if (!lido.success) throw new ErroDeEnvio('REDE', 200)
    await registrarSucesso(item, tipo, lido.data, sessao)
  } catch (erro) {
    await registrarFalha(item, erro)
  }
  void recarregarFila()
}

async function registrarSucesso(item: ItemFila, tipo: TipoFila, saida: unknown, sessao: SessaoMotor): Promise<void> {
  const agora = Date.now()
  await banco.fila.update(item.id, {
    estado: 'ENVIADO',
    progresso: 100,
    enviadoEm: agora,
    atualizadoEm: agora,
    proximaTentativaEm: null,
    erro: undefined,
    blob: undefined,
  })
  if (!tipo.aoEnviar) return

  const posterior: ContextoAposEnvio = {
    item: { ...item, estado: 'ENVIADO', enviadoEm: agora },
    queryClient: sessao.queryClient,
    seguintesDaChave: async () => {
      const pendentes = await naoEnviadosDoUsuario(item.usuarioId)
      return pendentes.filter((outro) => outro.chave === item.chave && outro.id !== item.id && outro.criadoEm > item.criadoEm)
    },
    atualizarPayload: async (id, payload) => {
      await banco.fila.update(id, { payload, atualizadoEm: Date.now() })
    },
    baixarPacote: () => baixarPacote(item.usuarioId, item.vinculoId),
  }
  try {
    await tipo.aoEnviar(saida, posterior)
  } catch (erro) {
    // O envio já valeu; falha aqui (ex.: baixar o pacote) não desfaz nem repete o envio.
    console.error('Falha depois de enviar', erro)
  }
}

const esperaDaTentativa = (tentativas: number): number =>
  tempos.backoffMs[Math.min(tentativas - 1, tempos.backoffMs.length - 1)] ?? 5_000

async function marcarErro(id: string, erro: { codigo: string; mensagem: string }): Promise<void> {
  await banco.fila.update(id, { estado: 'ERRO', erro, proximaTentativaEm: null, atualizadoEm: Date.now() })
}

async function registrarFalha(item: ItemFila, erro: unknown): Promise<void> {
  const falha: FalhaEnvio | null = erro instanceof ErroDaApi ? paraFalhaEnvio(erro) : ehFalhaEnvio(erro) ? erro : null
  if (!falha) {
    console.error('Falha inesperada ao enviar', erro)
    await marcarErro(item.id, { codigo: 'ERRO_INTERNO', mensagem: MENSAGEM_ERRO_INTERNO })
    return
  }

  // O cliente já tentou um refresh antes de devolver o 401: a sessão acabou, o motor pausa.
  if (falha.classe === 'RECUSA' && falha.status === 401) {
    estadoOffline.pausadaPorSessao = true
    await banco.fila.update(item.id, { estado: 'NA_FILA', progresso: 0, atualizadoEm: Date.now() })
    return
  }

  const tentativas = item.tentativas + 1
  const comLimite = falha.classe === 'SERVIDOR' || falha.status === 408 || falha.status === 429
  if (falha.classe === 'RECUSA' && !comLimite) {
    await banco.fila.update(item.id, {
      estado: 'ERRO',
      tentativas,
      proximaTentativaEm: null,
      erro: { codigo: falha.erro?.codigo ?? 'ERRO_INTERNO', mensagem: falha.erro?.mensagem ?? MENSAGEM_ERRO_INTERNO },
      atualizadoEm: Date.now(),
    })
    return
  }
  if (comLimite && tentativas >= MAXIMO_DE_TENTATIVAS_SERVIDOR) {
    await banco.fila.update(item.id, {
      estado: 'ERRO',
      tentativas,
      proximaTentativaEm: null,
      erro: { codigo: falha.erro?.codigo ?? 'ERRO_INTERNO', mensagem: falha.erro?.mensagem ?? MENSAGEM_SERVIDOR },
      atualizadoEm: Date.now(),
    })
    return
  }
  await banco.fila.update(item.id, {
    estado: 'NA_FILA',
    progresso: 0,
    tentativas,
    proximaTentativaEm: Date.now() + esperaDaTentativa(tentativas),
    atualizadoEm: Date.now(),
  })
}
