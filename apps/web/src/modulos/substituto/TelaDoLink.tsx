import { CABECALHO_DO_SEGREDO_DO_APARELHO, Entrada, EstadoDoLink, LinkPublico } from '@desbravadores/shared'
import type { EntrarNoLink, IdentidadeDaSubstituicao } from '@desbravadores/shared'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet, useParams } from 'react-router-dom'
import { z } from 'zod'
import { ErroDaApi, requisitar } from '../../api/cliente'
import { useConexao } from '../../offline'
import { baixarPacoteSeVelho } from '../../offline/pacote'
import { ProvedorSessaoSubstituto, useSubstituicao } from '../../sessao/ProvedorSessaoSubstituto'
import { ProvedorDeAlvoFixo, ProvedorDeDestinos } from '../../substituicao/contextos'
import type { AlvoFixo, Destinos } from '../../substituicao/contextos'
import { registrarAgoraDoServidor } from '../../substituicao/relogio'
import { Botao } from '../../ui/Botao'
import { ErroDeCarga } from '../../ui/EstadosDeCarga'
import { EstadoVazio } from '../../ui/EstadoVazio'
import {
  AbrindoOLink,
  AntesDoHorario,
  DepoisDoFim,
  EmOutroAparelho,
  LinkCancelado,
  LinkInexistente,
  MolduraDoLink,
  useInstantePassou,
} from './EstadosDoLink'
import type { SobreOLink } from './EstadosDoLink'
import { FaixaDeSubstituicao } from './FaixaDeSubstituicao'
import { IdentificarSubstituto } from './IdentificarSubstituto'

type Link = z.infer<typeof LinkPublico>
type EntradaDoLink = z.infer<typeof Entrada>
type Identidade = z.infer<typeof IdentidadeDaSubstituicao>
type Corpo = z.infer<typeof EntrarNoLink>

/** O que este aparelho guarda do link: o segredo que o prende a ele e até quando o salvo ainda sobe. */
const AparelhoDoLink = z.object({ substituicaoId: z.string(), segredo: z.string(), fimEnvioEm: z.string() })
type Aparelho = z.infer<typeof AparelhoDoLink>

export const chaveDoLink = (token: string): string => `substituicao:${token}`

function lerAparelho(token: string): Aparelho | null {
  try {
    const lido = AparelhoDoLink.safeParse(JSON.parse(localStorage.getItem(chaveDoLink(token)) ?? 'null'))
    return lido.success ? lido.data : null
  } catch {
    return null
  }
}

function gravarAparelho(token: string, aparelho: Aparelho): void {
  try {
    localStorage.setItem(chaveDoLink(token), JSON.stringify(aparelho))
  } catch {
    // Sem localStorage (aba anônima cheia): reabrir cai em S7, que já diz para abrir pelo navegador de antes.
  }
}

/** Recusa do `entrar` traz o estado do link em `campos.estado`: a tela troca sem outra leitura. */
function estadoDaRecusa(erro: unknown): z.infer<typeof EstadoDoLink> | null {
  if (!(erro instanceof ErroDaApi) || erro.classe !== 'RECUSA') return null
  const lido = EstadoDoLink.safeParse(erro.erro.campos?.estado)
  return lido.success ? lido.data : null
}

function sobreOLink(link: Link): SobreOLink {
  return { tipo: link.tipo ?? 'CHAMADA', alvoNome: link.alvo?.nome ?? '', data: link.data ?? '', inicioEm: link.inicioEm, fimEm: link.fimEm ?? link.agora }
}

const sobreAIdentidade = (identidade: Identidade): SobreOLink => ({
  tipo: identidade.tipo,
  alvoNome: identidade.alvoNome,
  data: identidade.data,
  inicioEm: null,
  fimEm: identidade.fimEm,
})

type Fase =
  | { tipo: 'carregando' }
  | { tipo: 'falhou'; erro: Error }
  | { tipo: 'link'; link: Link }
  | { tipo: 'dentro'; entrada: EntradaDoLink; segredo: string | null }

/**
 * `/substituto/:token`: lê o link, decide S1/S2/S3/S5/S6/S7 ou entra direto quando este aparelho já se
 * identificou, e monta a sessão do link sobre as telas do titular (rotas aninhadas).
 */
export function TelaDoLink() {
  const { token = '' } = useParams()
  const [fase, setFase] = useState<Fase>({ tipo: 'carregando' })
  const [leitura, setLeitura] = useState(0)
  const reler = useCallback(() => setLeitura((n) => n + 1), [])
  const caminho = `/api/auth/substituicao/${encodeURIComponent(token)}`

  const entrar = useCallback(
    async (corpo: Corpo, link: Link) => {
      try {
        const entrada = await requisitar(`${caminho}/entrar`, Entrada, { metodo: 'POST', corpo })
        registrarAgoraDoServidor(entrada.agora)
        const { substituicaoId, fimEnvioEm } = entrada.identidade
        const segredo = entrada.segredo ?? lerAparelho(token)?.segredo ?? null
        if (segredo) gravarAparelho(token, { substituicaoId, segredo, fimEnvioEm })
        setFase({ tipo: 'dentro', entrada, segredo })
      } catch (erro) {
        const estado = estadoDaRecusa(erro)
        if (estado === null) throw erro
        setFase({ tipo: 'link', link: { ...link, estado, identificado: false } })
      }
    },
    [caminho, token],
  )

  useEffect(() => {
    let vivo = true
    setFase({ tipo: 'carregando' })
    const segredo = lerAparelho(token)?.segredo
    void (async () => {
      try {
        const cabecalhos = segredo ? { [CABECALHO_DO_SEGREDO_DO_APARELHO]: segredo } : undefined
        const link = await requisitar(caminho, LinkPublico, { cabecalhos })
        registrarAgoraDoServidor(link.agora)
        if (!vivo) return
        if (link.estado === 'ABERTO' && link.identificado && segredo) await entrar({ segredo }, link)
        else setFase({ tipo: 'link', link })
      } catch (erro) {
        if (vivo) setFase({ tipo: 'falhou', erro: erro instanceof Error ? erro : new Error(String(erro)) })
      }
    })()
    return () => {
      vivo = false
    }
  }, [token, caminho, leitura, entrar])

  if (fase.tipo === 'carregando') return <AbrindoOLink />
  if (fase.tipo === 'falhou') return <FalhaAoAbrir erro={fase.erro} aoTentarDeNovo={reler} />
  if (fase.tipo === 'dentro') {
    return (
      <ProvedorSessaoSubstituto entrada={fase.entrada} token={token} segredo={fase.segredo}>
        <SessaoDoLink aoEncerrar={reler} />
      </ProvedorSessaoSubstituto>
    )
  }

  const { link } = fase
  const aparelho = lerAparelho(token)
  const sobre = sobreOLink(link)
  switch (link.estado) {
    case 'INEXISTENTE':
      return <LinkInexistente />
    case 'CANCELADO':
      return <LinkCancelado substituicaoId={aparelho?.substituicaoId ?? null} chaveDoAparelho={chaveDoLink(token)} />
    case 'ENCERRADO':
      return <DepoisDoFim sobre={sobre} substituicaoId={aparelho?.substituicaoId ?? null} fimEnvioEm={link.fimEnvioEm} chaveDoAparelho={chaveDoLink(token)} />
    case 'ANTES':
      return <AntesDoHorario sobre={sobre} aoAbrir={reler} />
    case 'EM_OUTRO_APARELHO':
      return <EmOutroAparelho />
    case 'ABERTO':
      return <IdentificarSubstituto sobre={sobre} conta={link.conta} aoEntrar={(corpo) => entrar(corpo, link)} />
  }
}

/** Sem internet ao abrir o link, ou a API fora: diz o que houve e deixa tentar de novo. */
function FalhaAoAbrir({ erro, aoTentarDeNovo }: { erro: Error; aoTentarDeNovo: () => void }) {
  const semRede = erro instanceof ErroDaApi && erro.classe === 'REDE'
  return (
    <MolduraDoLink titulo="App do Desbravador">
      {semRede ? (
        <EstadoVazio
          titulo="Disponível quando houver internet"
          descricao="Para abrir o link pela primeira vez, o celular precisa estar com internet."
          acao={
            <Botao variante="secundario" onClick={aoTentarDeNovo}>
              Tentar de novo
            </Botao>
          }
        />
      ) : (
        <ErroDeCarga erro={erro} aoTentarDeNovo={aoTentarDeNovo} />
      )}
    </MolduraDoLink>
  )
}

/**
 * Dentro da sessão do link: a faixa e a tela do titular enquanto a janela está aberta; no fim pelo relógio
 * do servidor, S5 ou S6 no lugar delas, sem recarregar. A API dizer que o link encerrou relê o link (cancelado
 * ou fora do prazo).
 */
function SessaoDoLink({ aoEncerrar }: { aoEncerrar: () => void }) {
  const substituicao = useSubstituicao()
  const { modo } = useConexao()
  const identidade = substituicao?.identidade
  const encerrada = substituicao?.encerrada ?? false
  const token = substituicao?.token ?? ''
  const fechou = useInstantePassou(identidade?.fimEm ?? null)
  const substituicaoId = identidade?.substituicaoId

  useEffect(() => {
    if (encerrada) aoEncerrar()
  }, [encerrada, aoEncerrar])

  // A tela de chamada só lê o pacote guardado: quem o baixa para a identidade do link é esta sessão.
  useEffect(() => {
    if (substituicaoId && modo === 'ONLINE') void baixarPacoteSeVelho(substituicaoId, substituicaoId)
  }, [substituicaoId, modo])

  const base = `/substituto/${encodeURIComponent(token)}`
  const destinos = useMemo<Partial<Destinos>>(
    () => ({
      depoisDeSalvarChamada: `${base}/salvo`,
      depoisDeSalvarRegistroDaClasse: `${base}/salvo`,
      voltarDaChamada: { caminho: `${base}/chamada`, rotulo: 'Abrir a chamada de novo' },
      voltarDoRegistroDaClasse: { caminho: `${base}/classe`, rotulo: 'Abrir o registro da classe de novo' },
      registroDaClasse: () => `${base}/classe`,
    }),
    [base],
  )
  const alvo = useMemo<AlvoFixo | null>(() => {
    if (!identidade) return null
    return identidade.tipo === 'CHAMADA' ? { data: identidade.data, unidadeId: identidade.alvoId } : { data: identidade.data, classeId: identidade.alvoId }
  }, [identidade])

  if (!identidade || !alvo || encerrada) return <AbrindoOLink />
  if (fechou) {
    return <DepoisDoFim sobre={sobreAIdentidade(identidade)} substituicaoId={identidade.substituicaoId} fimEnvioEm={identidade.fimEnvioEm} chaveDoAparelho={chaveDoLink(token)} />
  }
  return (
    <div className="flex min-h-dvh flex-col bg-fundo">
      <FaixaDeSubstituicao identidade={identidade} />
      <ProvedorDeDestinos destinos={destinos}>
        <ProvedorDeAlvoFixo alvo={alvo}>
          <div className="mx-auto w-full max-w-xl flex-1">
            <Outlet />
          </div>
        </ProvedorDeAlvoFixo>
      </ProvedorDeDestinos>
    </div>
  )
}
