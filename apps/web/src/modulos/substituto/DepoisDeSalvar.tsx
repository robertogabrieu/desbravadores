import { Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useConexao, usePacote } from '../../offline'
import { useSubstituicao } from '../../sessao/ProvedorSessaoSubstituto'
import { estiloDoBotao } from '../../ui/Botao'
import { EstadoDoLink, hora } from './EstadosDoLink'

/**
 * S8, no lugar do histórico para onde o titular vai: fecha com o único próximo passo possível, abrir de
 * novo até o fim da janela. A chamada reabre pelo id que o pacote já tem; sem ele, pela data travada.
 */
export function DepoisDeSalvar() {
  const substituicao = useSubstituicao()
  const { modo } = useConexao()
  const { pacote } = usePacote()
  if (!substituicao) return null
  const { token, identidade } = substituicao
  const base = `/substituto/${encodeURIComponent(token)}`
  const ehChamada = identidade.tipo === 'CHAMADA'
  const semInternet = modo === 'SEM_CONEXAO'

  const reuniao = pacote?.reunioesRecentes.find((r) => r.unidadeId === identidade.alvoId && r.data === identidade.data)
  const reabrir = ehChamada ? (reuniao ? `${base}/chamada/${reuniao.id}` : `${base}/chamada`) : `${base}/classe`

  let situacao: string
  if (ehChamada) {
    situacao = semInternet
      ? 'Chamada salva neste celular. Ela vai sozinha quando a internet voltar.'
      : 'Ela já aparece para os conselheiros da unidade e para o Adm, com o seu nome.'
  } else {
    situacao = semInternet
      ? 'Registro da classe salvo neste celular. Ele vai sozinho quando a internet voltar.'
      : 'Ele já aparece para os instrutores da classe e para o Adm, com o seu nome.'
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-col p-4">
      <EstadoDoLink icone={Check} tom="sucesso" titulo={ehChamada ? 'Chamada salva' : 'Registro da classe salvo'}>
        <p>{situacao}</p>
        <p>
          Até <b>{hora(identidade.fimEm)}</b> você ainda pode corrigir.
        </p>
        <Link to={reabrir} className={estiloDoBotao({ largura: 'total' })}>
          {ehChamada ? 'Abrir a chamada de novo' : 'Abrir o registro da classe de novo'}
        </Link>
      </EstadoDoLink>
    </main>
  )
}
