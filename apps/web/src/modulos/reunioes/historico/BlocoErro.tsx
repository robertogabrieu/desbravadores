import { ErroDaApi } from '../../../api/cliente'
import { Botao } from '../../../ui/Botao'
import { EstadoVazio } from '../../../ui/EstadoVazio'

const MENSAGEM_GENERICA = 'Não foi possível carregar agora.'

interface Propriedades {
  erro: Error | null
  aoTentarDeNovo: () => void
}

/** Falha de leitura: sem rede vira "Disponível quando houver internet"; o resto mostra a mensagem da API. */
export function BlocoErro({ erro, aoTentarDeNovo }: Propriedades) {
  if (erro instanceof ErroDaApi && erro.classe === 'REDE') {
    return <EstadoVazio titulo="Disponível quando houver internet" descricao="Assim que a conexão voltar, esta tela carrega sozinha." />
  }
  const mensagem = erro instanceof ErroDaApi ? erro.erro.mensagem : MENSAGEM_GENERICA
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <p className="text-base font-semibold text-perigo">{mensagem}</p>
      <Botao variante="secundario" onClick={aoTentarDeNovo}>
        Tentar de novo
      </Botao>
    </div>
  )
}
