import { useAjustarRequisito, useClasseDetalhe, useEditarClasse } from '../../../api/classes-adm'
import type { ClasseDetalhe, RequisitoDetalhe } from '../../../api/classes-adm'
import type { Classe } from '../../../api/leitura'
import { Botao } from '../../../ui/Botao'
import { CaixaMarcacao } from '../../../ui/CaixaMarcacao'
import { Cartao } from '../../../ui/Cartao'
import { Selecao } from '../../../ui/Selecao'
import { lerErroDaApi } from '../desbravadores/erros'
import { CorpoDaConsulta } from './CorpoDaConsulta'

const simOuNao = (valor: boolean): string => (valor ? 'sim' : 'não')
const plural = (n: number, singular: string, muitos: string): string => `${n} ${n === 1 ? singular : muitos}`

function Requisito({ requisito }: { requisito: RequisitoDetalhe }) {
  const ajustar = useAjustarRequisito()
  const { oficial } = requisito

  // Igual ao oficial: manda null, que apaga o ajuste em vez de gravar um valor igual.
  const gravar = (campo: 'ativo' | 'campo', valor: boolean) =>
    ajustar.mutate({ id: requisito.id, entrada: { [campo]: oficial?.[campo] === valor ? null : valor } })

  return (
    <li aria-label={`Requisito ${requisito.codigo}`} className="flex flex-col gap-1 border-t border-borda py-3">
      <p className="text-base text-texto">
        <strong>{requisito.codigo}</strong> · {requisito.texto}
      </p>
      <div className="flex flex-wrap items-center gap-x-6">
        <div className="flex items-center gap-2">
          <CaixaMarcacao rotulo="Ativo" checked={requisito.ativo} disabled={ajustar.isPending} onChange={(e) => gravar('ativo', e.target.checked)} />
          {oficial && <span className="text-sm text-texto-2">Oficial: {simOuNao(oficial.ativo)}</span>}
        </div>
        <div className="flex items-center gap-2">
          <CaixaMarcacao rotulo="Campo" checked={requisito.campo} disabled={ajustar.isPending} onChange={(e) => gravar('campo', e.target.checked)} />
          {oficial && <span className="text-sm text-texto-2">Oficial: {simOuNao(oficial.campo)}</span>}
        </div>
        {requisito.ajustado && (
          <Botao variante="texto" disabled={ajustar.isPending} onClick={() => ajustar.mutate({ id: requisito.id, entrada: { ativo: null, campo: null } })}>
            Voltar ao oficial
          </Botao>
        )}
      </div>
      {ajustar.isError && (
        <p role="alert" className="text-sm font-medium text-perigo">
          {lerErroDaApi(ajustar.error).geral}
        </p>
      )}
    </li>
  )
}

function Corpo({ detalhe }: { detalhe: ClasseDetalhe }) {
  const editar = useEditarClasse()
  const ativos = detalhe.secoes.reduce((soma, secao) => soma + secao.requisitos.filter((r) => r.ativo).length, 0)

  return (
    <div className="flex flex-col gap-4">
      <Cartao className="flex flex-col gap-3">
        <div>
          <p className="text-sm font-semibold text-texto-2">{detalhe.tipo === 'REGULAR' ? 'Classe regular' : 'Classe avançada ou agrupada'}</p>
          <h2 className="font-titulo text-xl font-bold text-texto">{detalhe.nome}</h2>
          <p className="text-base text-texto-2">{plural(ativos, 'requisito ativo', 'requisitos ativos')}</p>
        </div>
        <CaixaMarcacao rotulo="Ativa" checked={detalhe.ativa} disabled={editar.isPending} onChange={(e) => editar.mutate({ id: detalhe.id, entrada: { ativa: e.target.checked } })} />
        <Selecao
          rotulo="Quem monta o cronograma"
          value={detalhe.quemMontaCronograma}
          disabled={editar.isPending}
          onChange={(e) => editar.mutate({ id: detalhe.id, entrada: { quemMontaCronograma: e.target.value === 'INSTRUTOR' ? 'INSTRUTOR' : 'ADM' } })}
        >
          <option value="ADM">Adm</option>
          <option value="INSTRUTOR">Instrutores da classe</option>
        </Selecao>
        {editar.isError && (
          <p role="alert" className="text-sm font-medium text-perigo">
            {lerErroDaApi(editar.error).geral}
          </p>
        )}
      </Cartao>

      {detalhe.secoes.map((secao) => (
        <Cartao key={secao.id} role="region" aria-label={secao.nome} className="flex flex-col">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-titulo text-lg font-bold text-texto">
              {secao.codigo} · {secao.nome}
            </h3>
            <span className="text-sm text-texto-2">{plural(secao.requisitos.filter((r) => r.ativo).length, 'requisito', 'requisitos')}</span>
          </div>
          <ul>
            {secao.requisitos.map((requisito) => (
              <Requisito key={requisito.id} requisito={requisito} />
            ))}
          </ul>
        </Cartao>
      ))}
    </div>
  )
}

export function DetalheDaClasse({ classe }: { classe: Classe }) {
  const detalhe = useClasseDetalhe(classe.id)
  return (
    <CorpoDaConsulta consulta={detalhe} rotuloDeCarga={`Carregando ${classe.nome}`}>
      {(dados) => <Corpo detalhe={dados} />}
    </CorpoDaConsulta>
  )
}
