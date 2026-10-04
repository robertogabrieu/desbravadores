import { anoClube, hojeNoFuso } from '@desbravadores/shared'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useConfiguracaoClube } from '../../api/clube'
import { useClasses } from '../../api/leitura'
import { useMontagem } from '../../api/montagem'
import { useLarguraMenorQue } from '../../layouts/useLarguraMenorQue'
import { useConexao } from '../../offline'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../ui/EstadosDeCarga'
import { FolhaLateral } from '../../ui/FolhaLateral'
import { LARGURA_DO_CELULAR } from '../../ui/larguraDoCelular'
import { Selecao } from '../../ui/Selecao'
import { ResultadoConsulta } from '../galeria/ResultadoConsulta'
import { AlternadorDeClasse } from './AlternadorDeClasse'
import { CriarCronograma } from './CriarCronograma'
import { PainelAdm } from './PainelAdm'
import { parDaClasse } from './classes'

/** A7: o Adm escolhe a classe e o ano e monta o cronograma; no celular a escolha fica atrás de um botão de contexto. */
export function MontagemAdm() {
  const [busca, definirBusca] = useSearchParams()
  const { modo } = useConexao()
  const online = modo === 'ONLINE'
  const classes = useClasses()
  const configuracao = useConfiguracaoClube()
  const [agora] = useState(() => new Date())
  // O ano do clube de hoje (não o civil): em janeiro, antes do início do ano do clube, vale o anterior.
  const anoAtual = configuracao.data ? anoClube(hojeNoFuso(configuracao.data.fuso, agora), configuracao.data.inicioAnoClube) : undefined
  const [anoEscolhido, setAno] = useState<number>()
  const [trocandoContexto, setTrocandoContexto] = useState(false)
  const celular = useLarguraMenorQue(LARGURA_DO_CELULAR)
  const ano = anoEscolhido ?? anoAtual

  const regulares = (classes.data ?? []).filter((classe) => classe.ativa && classe.tipo === 'REGULAR')
  const classeId = busca.get('classe') ?? regulares[0]?.id
  const par = parDaClasse(classes.data ?? [], classeId)
  const classe = classes.data?.find((item) => item.id === classeId)
  const montagem = useMontagem(classeId, ano, online && ano !== undefined)
  const escolherClasse = (id: string) => definirBusca({ classe: id }, { replace: true })
  const anos = anoAtual === undefined ? [] : [anoAtual - 1, anoAtual, anoAtual + 1]

  function conteudo() {
    if (!online) return <DisponivelComInternet />
    if (classes.isError) return <ErroDeCarga erro={classes.error} aoTentarDeNovo={() => void classes.refetch()} />
    if (configuracao.isError) return <ErroDeCarga erro={configuracao.error} aoTentarDeNovo={() => void configuracao.refetch()} />
    if (classes.isPending || ano === undefined) return <Carregando rotulo="Carregando classes" />
    if (classeId === undefined) return <EstadoVazio titulo="Nenhuma classe ativa" descricao="Ative uma classe em Classes e especialidades para montar o cronograma." />
    return (
      <ResultadoConsulta consulta={montagem} rotuloCarga="Carregando cronograma">
        {(dados) =>
          dados.cronograma === null ? (
            <CriarCronograma classeId={dados.classe.id} nomeDaClasse={dados.classe.nome} ano={ano} />
          ) : (
            <PainelAdm montagem={dados} cronograma={dados.cronograma} classe={classe} ano={ano} aoAtualizar={() => void montagem.refetch()} />
          )
        }
      </ResultadoConsulta>
    )
  }

  const seletores = (
    <>
      <Selecao rotulo="Classe" value={par?.regular.id ?? classeId ?? ''} onChange={(evento) => escolherClasse(evento.target.value)}>
        {regulares.map((item) => (
          <option key={item.id} value={item.id}>
            {item.nome}
          </option>
        ))}
      </Selecao>
      <Selecao rotulo="Ano do clube" value={ano ?? ''} onChange={(evento) => setAno(Number(evento.target.value))}>
        {anos.map((valor) => (
          <option key={valor} value={valor}>
            {valor}
          </option>
        ))}
      </Selecao>
      {par && classeId && <AlternadorDeClasse par={par} atualId={classeId} aoMudar={escolherClasse} />}
    </>
  )

  const nomeDaClasse = par?.regular.nome ?? classe?.nome ?? '—'
  const tipoDaClasse = classe?.tipo === 'AVANCADA' ? 'Avançada' : 'Regular'
  const contexto = `${nomeDaClasse} · ${tipoDaClasse}`

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-titulo text-2xl font-extrabold text-texto">Montar cronograma da classe</h1>
      {celular ? (
        <button
          type="button"
          aria-label={`Trocar classe ou ano (agora: ${contexto}, ano do clube ${ano ?? '—'})`}
          onClick={() => setTrocandoContexto(true)}
          className="flex min-h-[var(--touch-min)] items-center gap-3 rounded-cartao border border-borda-controle bg-superficie px-4 py-3 text-left hover:bg-superficie-suave focus-visible:outline-2 focus-visible:outline-marca"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-base font-bold text-texto">{contexto}</span>
            <span className="text-sm text-texto-2">Ano do clube {ano ?? '—'}</span>
          </span>
          <span className="text-base font-semibold text-marca underline">Trocar</span>
        </button>
      ) : (
        <div className="flex flex-wrap items-end gap-3">{seletores}</div>
      )}
      {celular && (
        <FolhaLateral aberta={trocandoContexto} titulo="Trocar classe ou ano" aoFechar={() => setTrocandoContexto(false)}>
          <div className="flex flex-col gap-4">{seletores}</div>
        </FolhaLateral>
      )}
      {conteudo()}
    </div>
  )
}
