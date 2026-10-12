import { GRUPOS_DE_REGRA, REGRAS_DE_PONTUACAO } from '@desbravadores/shared'
import type { GatilhoDeRegra } from '@desbravadores/shared'
import { Check } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useRegras } from '../../../api/ranking-regras'
import type { RegraDoClube, RegrasDaTela } from '../../../api/ranking-regras'
import { useConexao } from '../../../offline'
import { useSessao } from '../../../sessao/useSessao'
import { Botao } from '../../../ui/Botao'
import { DisponivelComInternet } from '../../../ui/EstadosDeCarga'
import { Esqueleto } from '../../../ui/Esqueleto'
import { FaixaAviso } from '../../../ui/FaixaAviso'
import { GrupoDeEventos } from './GrupoDeEventos'
import { LinhaDeRegra } from './LinhaDeRegra'
import type { AcaoDaLinha } from './LinhaDeRegra'
import { PainelDaRegra } from './PainelDaRegra'
import { pontosDaReuniaoPerfeita } from './resumo'

const ESTILO_DA_LISTA = 'overflow-hidden rounded-cartao border border-borda bg-superficie'

function mensagemDeConfirmacao(salva: RegraDoClube): string {
  const { rotulo } = REGRAS_DE_PONTUACAO.find((r) => r.gatilho === salva.gatilho) ?? { rotulo: '' }
  return salva.ativo
    ? `${rotulo} agora vale ${salva.pontos} pontos. Vale a partir de agora; o que já foi lançado não mudou.`
    : `${rotulo} foi desligada. Ninguém mais ganha ponto por isso a partir de agora.`
}

export function RegrasDePontuacao() {
  const regras = useRegras()
  const { modo } = useConexao()

  let corpo
  if (regras.data) corpo = <TelaDasRegras dados={regras.data} semConexao={modo === 'SEM_CONEXAO'} />
  else if (modo === 'SEM_CONEXAO') corpo = <DisponivelComInternet />
  else if (regras.isError) {
    corpo = (
      <div role="alert" className="flex flex-col items-center gap-3 rounded-cartao border border-borda bg-superficie px-6 py-10 text-center">
        <h2 className="font-titulo text-xl font-bold">Não deu para carregar as regras</h2>
        <p className="max-w-md text-base text-texto-3">Nada foi alterado. Confira a internet e tente de novo.</p>
        <Botao onClick={() => void regras.refetch()}>Tentar de novo</Botao>
      </div>
    )
  } else {
    corpo = (
      <div role="status" aria-busy="true" aria-label="Carregando as regras" className={ESTILO_DA_LISTA}>
        {Array.from({ length: 6 }, (_, i) => (
          <Esqueleto key={i} className="h-16 rounded-none border-t border-divisor first:border-t-0" />
        ))}
      </div>
    )
  }

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <header>
        <nav aria-label="Onde você está" className="text-sm text-texto-2">
          <Link to="/ranking" className="font-semibold text-marca underline">
            Ranking
          </Link>{' '}
          › Regras de pontuação
        </nav>
        <h1 className="font-titulo text-3xl font-extrabold text-texto">Regras de pontuação</h1>
        <p className="mt-1 max-w-[62ch] text-base text-texto-3">
          Tudo que dá ponto no ranking, em um só lugar. Para mudar quanto vale cada coisa, toque em Editar.
        </p>
      </header>
      {corpo}
    </div>
  )
}

function TelaDasRegras({ dados, semConexao }: { dados: RegrasDaTela; semConexao: boolean }) {
  const { pode } = useSessao()
  const [editando, setEditando] = useState<GatilhoDeRegra | null>(null)
  const [destacada, setDestacada] = useState<GatilhoDeRegra | null>(null)
  const [confirmacao, setConfirmacao] = useState<string | null>(null)
  const podeEditar = pode('ranking.configurar')
  const acao: AcaoDaLinha = !podeEditar ? 'sem-permissao' : semConexao ? 'sem-conexao' : 'editar'
  const ligadas = dados.regras.filter((r) => r.ativo).length

  return (
    <>
      {semConexao && <FaixaAviso>Sem conexão. Você pode conferir as regras, mas só consegue editar quando a internet voltar.</FaixaAviso>}
      {confirmacao && (
        <div role="status" className="flex items-center gap-2.5 rounded-botao bg-marca-suave px-4 py-3 text-base font-bold text-marca">
          <Check aria-hidden className="size-5 shrink-0" />
          {confirmacao}
        </div>
      )}
      {!podeEditar && (
        <FaixaAviso>Você pode conferir tudo, mas não editar. Peça a quem administra o clube a permissão “Configurar o ranking”.</FaixaAviso>
      )}
      <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2 rounded-cartao border border-borda bg-superficie px-5 py-4">
        <p>
          <span className="font-titulo text-[26px] font-extrabold">{ligadas} de {REGRAS_DE_PONTUACAO.length}</span>{' '}
          <span className="text-base text-texto-3">regras fixas estão ligadas</span>
        </p>
        <p>
          <span className="font-titulo text-[26px] font-extrabold">{pontosDaReuniaoPerfeita(dados.regras)} pontos</span>{' '}
          <span className="text-base text-texto-3">é o que um desbravador ganha numa reunião perfeita</span>
        </p>
      </div>
      {GRUPOS_DE_REGRA.map((grupo) => (
        <section key={grupo.chave} aria-labelledby={`grupo-${grupo.chave}`} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 id={`grupo-${grupo.chave}`} className="font-titulo text-xl font-bold">
              {grupo.titulo}
            </h2>
            <p className="text-base text-texto-2">{grupo.quemLanca}</p>
          </div>
          <div className={ESTILO_DA_LISTA}>
            {grupo.chave === 'eventos' ? (
              <GrupoDeEventos eventos={dados.eventos} podeAbrirCalendario={pode('calendario.gerenciar')} semConexao={semConexao} />
            ) : (
              <ul>
                {REGRAS_DE_PONTUACAO.filter((definicao) => definicao.grupo === grupo.chave).map((definicao) => {
                  const regra = dados.regras.find((r) => r.gatilho === definicao.gatilho)
                  if (!regra) return null
                  return (
                    <LinhaDeRegra
                      key={definicao.gatilho}
                      definicao={definicao}
                      regra={regra}
                      acao={acao}
                      destacada={destacada === definicao.gatilho}
                      aoEditar={() => {
                        setDestacada(null)
                        setConfirmacao(null)
                        setEditando(definicao.gatilho)
                      }}
                    />
                  )
                })}
              </ul>
            )}
          </div>
        </section>
      ))}
      <PainelDaRegra
        regra={dados.regras.find((r) => r.gatilho === editando) ?? null}
        regras={dados.regras}
        aoFechar={() => setEditando(null)}
        aoSalvar={(salva) => {
          setEditando(null)
          setDestacada(salva.gatilho)
          setConfirmacao(mensagemDeConfirmacao(salva))
        }}
      />
    </>
  )
}
