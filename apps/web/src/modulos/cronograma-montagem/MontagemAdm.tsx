import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useClasses } from '../../api/leitura'
import { useMontagem } from '../../api/montagem'
import { useConexao } from '../../offline'
import { EstadoVazio } from '../../ui/EstadoVazio'
import { Carregando, DisponivelComInternet, ErroDeCarga } from '../../ui/EstadosDeCarga'
import { Selecao } from '../../ui/Selecao'
import { ResultadoConsulta } from '../galeria/ResultadoConsulta'
import { AlternadorDeClasse } from './AlternadorDeClasse'
import { CriarCronograma } from './CriarCronograma'
import { PainelAdm } from './PainelAdm'
import { parDaClasse } from './classes'

/** A7: o Adm escolhe a classe e o ano e monta o cronograma no computador. */
export function MontagemAdm() {
  const [busca, definirBusca] = useSearchParams()
  const { modo } = useConexao()
  const online = modo === 'ONLINE'
  const classes = useClasses()
  const [anoAtual] = useState(() => new Date().getFullYear())
  const [ano, setAno] = useState(anoAtual)

  const regulares = (classes.data ?? []).filter((classe) => classe.ativa && classe.tipo === 'REGULAR')
  const classeId = busca.get('classe') ?? regulares[0]?.id
  const par = parDaClasse(classes.data ?? [], classeId)
  const classe = classes.data?.find((item) => item.id === classeId)
  const montagem = useMontagem(classeId, ano, online)
  const escolherClasse = (id: string) => definirBusca({ classe: id }, { replace: true })
  const anos = [anoAtual - 1, anoAtual, anoAtual + 1]

  function conteudo() {
    if (!online) return <DisponivelComInternet />
    if (classes.isError) return <ErroDeCarga erro={classes.error} aoTentarDeNovo={() => void classes.refetch()} />
    if (classes.isPending) return <Carregando rotulo="Carregando classes" />
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

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-titulo text-2xl font-extrabold text-texto">Montar cronograma da classe</h1>
      <div className="flex flex-wrap items-end gap-3">
        <Selecao rotulo="Classe" value={par?.regular.id ?? classeId ?? ''} onChange={(evento) => escolherClasse(evento.target.value)}>
          {regulares.map((item) => (
            <option key={item.id} value={item.id}>
              {item.nome}
            </option>
          ))}
        </Selecao>
        <Selecao rotulo="Ano do clube" value={ano} onChange={(evento) => setAno(Number(evento.target.value))}>
          {anos.map((valor) => (
            <option key={valor} value={valor}>
              {valor}
            </option>
          ))}
        </Selecao>
        {par && classeId && <AlternadorDeClasse par={par} atualId={classeId} aoMudar={escolherClasse} />}
      </div>
      {conteudo()}
    </div>
  )
}
