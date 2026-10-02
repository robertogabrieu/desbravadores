import { Link } from 'react-router-dom'
import { usePacote } from '../../offline'
import { FaixaAviso } from '../../ui/FaixaAviso'
import { DisponivelComInternet } from '../../ui/EstadosDeCarga'
import { corDaClasse } from '../classes/cores'
import { formatarDataCurta } from '../cronograma/formatos'

const LINK_PRIMARIO =
  'flex min-h-[var(--touch-min)] items-center justify-center gap-2 rounded-botao bg-marca px-5 text-base font-semibold text-white hover:bg-marca-escura focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marca'

const CAMINHO_DO_REGISTRO = (classeId: string): string => `/aulas/nova?classe=${classeId}`

/**
 * Sem conexão, as telas do instrutor que dependem da API não têm dado: o registro de aula (a única coisa offline)
 * continua a um toque, montado só com o que o pacote guardado no aparelho tem. Sem pacote, a mensagem de sempre.
 */
export function ClassesSemConexao() {
  const { pacote } = usePacote()
  const classes = pacote?.instrutor?.classes ?? []
  if (classes.length === 0) return <DisponivelComInternet />
  return (
    <div className="flex flex-col gap-3">
      <FaixaAviso>Sem conexão: dá para registrar a aula; o resto volta com a internet.</FaixaAviso>
      {classes.map(({ classe, aulasProximas }) => {
        const proxima = aulasProximas[0]
        return (
          <section key={classe.id} aria-label={`Classe ${classe.nome}`} className="flex flex-col overflow-hidden rounded-cartao border border-borda-controle bg-superficie">
            <div className="h-1.5" style={corDaClasse(classe.corToken)} />
            <div className="flex flex-col gap-3 p-4">
              <span className="w-fit rounded-full px-3 py-1 text-sm font-bold text-white" style={corDaClasse(classe.corToken)}>
                {classe.nome}
              </span>
              {proxima && (
                <span className="text-sm font-semibold text-texto-2">{`Próxima aula · ${formatarDataCurta(proxima.data)}${proxima.titulo ? ` · ${proxima.titulo}` : ''}`}</span>
              )}
              <Link to={CAMINHO_DO_REGISTRO(classe.id)} className={LINK_PRIMARIO}>
                Registrar aula
              </Link>
            </div>
          </section>
        )
      })}
    </div>
  )
}

/** Cronograma sem conexão: além da mensagem, o registro da aula de hoje da classe escolhida (se o pacote a tem). */
export function RegistrarAulaDeHoje({ classeId }: { classeId: string }) {
  const { pacote } = usePacote()
  const noPacote = pacote?.instrutor?.classes.some((item) => item.classe.id === classeId) ?? false
  if (!noPacote) return null
  return (
    <Link to={CAMINHO_DO_REGISTRO(classeId)} className={LINK_PRIMARIO}>
      Registrar aula de hoje
    </Link>
  )
}
