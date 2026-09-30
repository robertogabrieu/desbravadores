import { ChevronRight } from 'lucide-react'
import { useId, useState } from 'react'
import { useAjustarRequisito, useClasseDetalhe, useEditarClasse } from '../../../api/classes-adm'
import type { ClasseDetalhe, RequisitoDetalhe } from '../../../api/classes-adm'
import type { Classe } from '../../../api/leitura'
import { Botao } from '../../../ui/Botao'
import { CaixaMarcacao } from '../../../ui/CaixaMarcacao'
import { Cartao } from '../../../ui/Cartao'
import { cn } from '../../../ui/cn'
import { lerErroDaApi } from '../desbravadores/erros'
import { CorpoDaConsulta } from './CorpoDaConsulta'

const plural = (n: number, singular: string, muitos: string): string =>
  `${n} ${n === 1 ? singular : muitos}`
const ajustadosEm = (requisitos: RequisitoDetalhe[]): number =>
  requisitos.filter((r) => r.ajustado).length

/** Colunas da linha do requisito: texto e as duas marcações, com o título das colunas uma vez só. */
const COLUNAS = 'grid grid-cols-[1fr_3rem_4.5rem] items-center gap-x-1 sm:grid-cols-[1fr_5rem_5rem] sm:gap-x-2'

function Marcacao({
  rotulo,
  marcado,
  desabilitado,
  aoMudar,
}: {
  rotulo: string
  marcado: boolean
  desabilitado: boolean
  aoMudar: (valor: boolean) => void
}) {
  // A linha inteira da coluna é o alvo de toque (≥ 44 px), não só o quadrado.
  return (
    <label className="flex min-h-[var(--touch-min)] cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        aria-label={rotulo}
        checked={marcado}
        disabled={desabilitado}
        onChange={(e) => aoMudar(e.target.checked)}
        className="size-5 accent-marca"
      />
    </label>
  )
}

function Requisito({ requisito }: { requisito: RequisitoDetalhe }) {
  const ajustar = useAjustarRequisito()
  const { oficial } = requisito

  // Igual ao oficial: manda null, que apaga o ajuste em vez de gravar um valor igual.
  const gravar = (campo: 'ativo' | 'campo', valor: boolean) =>
    ajustar.mutate({
      id: requisito.id,
      entrada: { [campo]: oficial?.[campo] === valor ? null : valor },
    })

  return (
    <li
      aria-label={`Requisito ${requisito.codigo}`}
      className={cn(COLUNAS, 'border-t border-divisor py-1')}
    >
      <div className={cn('py-2', !requisito.ativo && 'text-texto-3')}>
        <p className="text-base">
          <strong>{requisito.codigo}</strong> · {requisito.texto}
        </p>
        {requisito.ajustado && (
          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm">
            <span className="font-semibold text-texto-2">Ajustado pelo clube</span>
            <Botao
              variante="texto"
              disabled={ajustar.isPending}
              onClick={() =>
                ajustar.mutate({ id: requisito.id, entrada: { ativo: null, campo: null } })
              }
            >
              Voltar ao oficial
            </Botao>
          </p>
        )}
        {ajustar.isError && (
          <p role="alert" className="mt-1 text-sm font-medium text-perigo">
            {lerErroDaApi(ajustar.error).geral}
          </p>
        )}
      </div>
      <Marcacao
        rotulo="Ativo"
        marcado={requisito.ativo}
        desabilitado={ajustar.isPending}
        aoMudar={(valor) => gravar('ativo', valor)}
      />
      <Marcacao
        rotulo="Campo"
        marcado={requisito.campo}
        desabilitado={ajustar.isPending}
        aoMudar={(valor) => gravar('campo', valor)}
      />
    </li>
  )
}

function Secao({ secao }: { secao: ClasseDetalhe['secoes'][number] }) {
  const [aberta, setAberta] = useState(false)
  const idLista = useId()
  const ativos = secao.requisitos.filter((r) => r.ativo).length
  const ajustados = ajustadosEm(secao.requisitos)

  return (
    <section aria-label={secao.nome} className="border-t border-divisor first:border-t-0">
      <button
        type="button"
        aria-expanded={aberta}
        aria-controls={idLista}
        onClick={() => setAberta(!aberta)}
        className="flex min-h-[var(--touch-min)] w-full items-center gap-3 px-1 py-3 text-left hover:bg-superficie-suave"
      >
        <ChevronRight
          aria-hidden
          className={cn('size-5 shrink-0 text-texto-2 transition-transform', aberta && 'rotate-90')}
        />
        <span className="flex-1 font-titulo text-lg font-bold text-texto">
          {secao.codigo} · {secao.nome}
        </span>
        <span className="text-sm text-texto-2">
          {plural(ativos, 'requisito', 'requisitos')}
          {ajustados > 0 && ` · ${plural(ajustados, 'ajustado', 'ajustados')}`}
        </span>
      </button>
      {aberta && (
        <div id={idLista} className="pb-3 sm:pl-9">
          <div className={cn(COLUNAS, 'text-sm font-semibold text-texto-2')} aria-hidden>
            <span>Requisito</span>
            <span className="text-center">Ativo</span>
            <span className="text-center">De campo</span>
          </div>
          <ul>
            {secao.requisitos.map((requisito) => (
              <Requisito key={requisito.id} requisito={requisito} />
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function QuemMonta({ detalhe }: { detalhe: ClasseDetalhe }) {
  const editar = useEditarClasse()
  const opcoes = [
    { valor: 'ADM', rotulo: 'Adm' },
    { valor: 'INSTRUTOR', rotulo: 'Instrutores da classe' },
  ] as const
  return (
    <div role="radiogroup" aria-label="Quem monta o cronograma" className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-texto">Quem monta o cronograma</span>
      <div className="flex flex-wrap gap-2">
        {opcoes.map((opcao) => (
          <label
            key={opcao.valor}
            className={cn(
              'flex min-h-[var(--touch-min)] cursor-pointer items-center gap-2 rounded-botao border px-4 text-base',
              detalhe.quemMontaCronograma === opcao.valor
                ? 'border-marca bg-marca-suave font-semibold text-texto'
                : 'border-borda text-texto-2',
            )}
          >
            <input
              type="radio"
              name={`quem-monta-${detalhe.id}`}
              checked={detalhe.quemMontaCronograma === opcao.valor}
              disabled={editar.isPending}
              onChange={() =>
                editar.mutate({ id: detalhe.id, entrada: { quemMontaCronograma: opcao.valor } })
              }
              className="size-4 accent-marca"
            />
            {opcao.rotulo}
          </label>
        ))}
      </div>
      {editar.isError && (
        <p role="alert" className="text-sm font-medium text-perigo">
          {lerErroDaApi(editar.error).geral}
        </p>
      )}
    </div>
  )
}

function Corpo({ detalhe }: { detalhe: ClasseDetalhe }) {
  const editar = useEditarClasse()
  const todos = detalhe.secoes.flatMap((secao) => secao.requisitos)
  const ativos = todos.filter((r) => r.ativo).length
  const ajustados = ajustadosEm(todos)
  const tipo = detalhe.tipo === 'REGULAR' ? 'Classe regular' : 'Classe avançada'
  const idade =
    detalhe.idade === null
      ? ''
      : ` · ${detalhe.idade} anos${detalhe.trilha === 'AGRUPADAS' ? ' ou mais' : ''}`

  return (
    <div className="flex flex-col gap-6">
      <Cartao className="flex flex-col gap-5">
        <div>
          <p className="text-sm font-semibold text-texto-2">
            {tipo}
            {idade}
          </p>
          <h2 className="font-titulo text-2xl font-bold text-texto">{detalhe.nome}</h2>
          <p className="text-base text-texto-2">
            {plural(ativos, 'requisito ativo', 'requisitos ativos')}
            {ajustados > 0 && ` · ${plural(ajustados, 'ajustado', 'ajustados')} pelo clube`}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-x-10 gap-y-4">
          <div className="flex flex-col gap-1">
            <CaixaMarcacao
              rotulo="Ativa"
              checked={detalhe.ativa}
              disabled={editar.isPending}
              onChange={(e) =>
                editar.mutate({ id: detalhe.id, entrada: { ativa: e.target.checked } })
              }
            />
            {editar.isError && (
              <p role="alert" className="text-sm font-medium text-perigo">
                {lerErroDaApi(editar.error).geral}
              </p>
            )}
          </div>
          <QuemMonta detalhe={detalhe} />
        </div>
      </Cartao>

      <Cartao className="flex flex-col">
        <div className="flex flex-col gap-1 pb-3">
          <h3 className="font-titulo text-lg font-bold text-texto">Requisitos</h3>
          <p className="text-sm text-texto-2">
            Abra uma seção para ajustar. Desmarque &quot;Ativo&quot; no que o clube não vai cobrar;
            &quot;De campo&quot; é sugerido para os dias de campo do calendário na montagem do
            cronograma.
          </p>
        </div>
        {detalhe.secoes.map((secao) => (
          <Secao key={secao.id} secao={secao} />
        ))}
      </Cartao>
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
