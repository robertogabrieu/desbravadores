import { CircleAlert, Info, TriangleAlert } from 'lucide-react'
import { useId, useState } from 'react'
import type { LinhaParaImportar } from '../../../api/importacao'
import { estiloControle } from '../../../ui/Campo'
import { cn } from '../../../ui/cn'
import { Selo } from '../../../ui/Selo'
import { idsDe, mensagensDaLinha, textoOuNulo } from './GradeImportacao'
import type { Mensagem } from './GradeImportacao'
import { bloqueada, todosOsErros } from './revisao-importacao'
import type { CampoEditavel, LinhaEmRevisao } from './revisao-importacao'

interface Opcao {
  id: string
  nome: string
}

interface Propriedades {
  linhas: LinhaEmRevisao[]
  unidades: Opcao[]
  classes: Opcao[]
  aoEditar: <C extends CampoEditavel>(linha: number, campo: C, valor: LinhaParaImportar[C]) => void
  aoMarcar: (linha: number, marcada: boolean) => void
}

type Filtro = 'corrigir' | 'todas'

/** Os campos na ordem da planilha; o rótulo é o mesmo da coluna da grade do computador. */
const CAMPOS: { campo: CampoEditavel; rotulo: string }[] = [
  { campo: 'nome', rotulo: 'Nome' },
  { campo: 'nascimento', rotulo: 'Nascimento' },
  { campo: 'sexo', rotulo: 'Sexo' },
  { campo: 'unidadeId', rotulo: 'Unidade' },
  { campo: 'classeId', rotulo: 'Classe' },
  { campo: 'responsavelNome', rotulo: 'Responsável' },
  { campo: 'responsavelTelefone', rotulo: 'Telefone' },
  { campo: 'responsavelEmail', rotulo: 'E-mail' },
  { campo: 'entradaEm', rotulo: 'Entrada no clube' },
]

const temErro = (linha: LinhaEmRevisao): boolean => todosOsErros(linha).length > 0

const camposComErro = (linha: LinhaEmRevisao): CampoEditavel[] =>
  todosOsErros(linha).flatMap((erro) => (erro.campo === null ? [] : [erro.campo]))

function TextoDaMensagem({ mensagem }: { mensagem: Mensagem }) {
  const erro = mensagem.tipo === 'Erro'
  const Icone = erro ? CircleAlert : Info
  return (
    <p id={mensagem.id} className={cn('flex items-start gap-1.5 text-sm font-semibold', erro ? 'text-perigo' : 'text-texto-2')}>
      <Icone aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>
        <span className="sr-only">{mensagem.tipo}:</span>{' '}
        {mensagem.texto}
      </span>
    </p>
  )
}

interface PropriedadesDoCampo {
  linha: LinhaEmRevisao
  campo: CampoEditavel
  rotulo: string
  mensagens: Mensagem[]
  unidades: Opcao[]
  classes: Opcao[]
  aoEditar: Propriedades['aoEditar']
}

/** Um campo empilhado: rótulo em cima, controle no meio, erro ou aviso embaixo. */
function CampoDaLinha({ linha, campo, rotulo, mensagens, unidades, classes, aoEditar }: PropriedadesDoCampo) {
  const n = linha.linha
  const id = useId()
  const acessivel = {
    id,
    'aria-label': `${rotulo}, linha ${n}`,
    'aria-invalid': mensagens.some((mensagem) => mensagem.tipo === 'Erro') || undefined,
    'aria-describedby': idsDe(mensagens),
    className: estiloControle,
  }
  let controle
  if (campo === 'sexo') {
    controle = (
      <select {...acessivel} value={linha.sexo} onChange={(e) => aoEditar(n, 'sexo', e.target.value === 'F' ? 'F' : e.target.value === 'M' ? 'M' : '')}>
        <option value="">Escolha</option>
        <option value="F">Feminino</option>
        <option value="M">Masculino</option>
      </select>
    )
  } else if (campo === 'unidadeId' || campo === 'classeId') {
    const opcoes = campo === 'unidadeId' ? unidades : classes
    controle = (
      <select {...acessivel} value={linha[campo] ?? ''} onChange={(e) => aoEditar(n, campo, e.target.value || null)}>
        <option value="">{campo === 'unidadeId' ? 'Sem unidade' : 'Sem classe'}</option>
        {opcoes.map((opcao) => (
          <option key={opcao.id} value={opcao.id}>
            {opcao.nome}
          </option>
        ))}
      </select>
    )
  } else if (campo === 'nome' || campo === 'nascimento' || campo === 'entradaEm') {
    controle = <input {...acessivel} type={campo === 'nome' ? 'text' : 'date'} value={linha[campo]} onChange={(e) => aoEditar(n, campo, e.target.value)} />
  } else {
    const tipo = campo === 'responsavelTelefone' ? 'tel' : campo === 'responsavelEmail' ? 'email' : 'text'
    controle = <input {...acessivel} type={tipo} value={linha[campo] ?? ''} onChange={(e) => aoEditar(n, campo, textoOuNulo(e.target.value))} />
  }
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-texto">
        {rotulo}
      </label>
      {controle}
      {mensagens.map((mensagem) => (
        <TextoDaMensagem key={mensagem.id} mensagem={mensagem} />
      ))}
    </div>
  )
}

interface PropriedadesDoCartao extends Omit<Propriedades, 'linhas'> {
  linha: LinhaEmRevisao
}

/**
 * Uma linha da planilha. Os campos que chegaram com erro ficam abertos até o fim da revisão — se
 * sumissem ao ficar certos, o campo fugiria de baixo do dedo no meio da digitação.
 */
function CartaoDaLinha({ linha, unidades, classes, aoEditar, aoMarcar }: PropriedadesDoCartao) {
  const n = linha.linha
  const idTitulo = useId()
  const idDosOutros = useId()
  const [abertosDeInicio] = useState(() => camposComErro(linha))
  const [mostrarOutros, setMostrarOutros] = useState(false)
  const comErroAgora = camposComErro(linha)
  const faltam = new Set(comErroAgora).size
  const abertos = CAMPOS.filter(({ campo }) => abertosDeInicio.includes(campo) || comErroAgora.includes(campo))
  const recolhidos = CAMPOS.filter((item) => !abertos.includes(item))
  const visiveis = mostrarOutros ? [...abertos, ...recolhidos] : abertos
  const mensagens = mensagensDaLinha(linha)
  const doCampo = (campo: CampoEditavel) => mensagens.filter((mensagem) => mensagem.campo === campo)
  const daLinha = mensagens.filter((mensagem) => !visiveis.some((item) => item.campo === mensagem.campo))
  const desabilitada = bloqueada(linha)
  const idDoBloqueio = `importacao-${n}-bloqueio-celular`
  const rotuloDosOutros =
    recolhidos.length === 1
      ? abertos.length > 0
        ? 'Ver o outro campo'
        : 'Ver o campo'
      : abertos.length > 0
        ? `Ver os outros ${recolhidos.length} campos`
        : `Ver os ${recolhidos.length} campos`

  return (
    <div role="group" aria-labelledby={idTitulo} className="flex flex-col gap-4 rounded-cartao border border-borda bg-superficie p-4">
      <div className="flex flex-col gap-1">
        <p id={idTitulo} className="text-sm text-texto-2">
          Linha {n} da planilha
        </p>
        <p className="text-lg font-semibold break-words text-texto">{linha.nome.trim() || 'Sem nome'}</p>
        {faltam > 0 && (
          <Selo tom="alerta" className="self-start">
            <TriangleAlert aria-hidden className="size-4" />
            Falta corrigir {faltam} {faltam === 1 ? 'campo' : 'campos'}
          </Selo>
        )}
      </div>
      {daLinha.length > 0 && (
        <div className="flex flex-col gap-1">
          {daLinha.map((mensagem) => (
            <TextoDaMensagem key={mensagem.id} mensagem={mensagem} />
          ))}
        </div>
      )}
      {abertos.map(({ campo, rotulo }) => (
        <CampoDaLinha key={campo} {...{ linha, campo, rotulo, unidades, classes, aoEditar }} mensagens={doCampo(campo)} />
      ))}
      {recolhidos.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={mostrarOutros}
            aria-controls={mostrarOutros ? idDosOutros : undefined}
            onClick={() => setMostrarOutros((atual) => !atual)}
            className="flex min-h-[var(--touch-min)] items-center self-start text-base font-semibold text-marca underline focus-visible:outline-2 focus-visible:outline-marca"
          >
            {mostrarOutros ? 'Esconder os outros campos' : rotuloDosOutros}
          </button>
          {mostrarOutros && (
            <div id={idDosOutros} className="flex flex-col gap-4">
              {recolhidos.map(({ campo, rotulo }) => (
                <CampoDaLinha key={campo} {...{ linha, campo, rotulo, unidades, classes, aoEditar }} mensagens={doCampo(campo)} />
              ))}
            </div>
          )}
        </>
      )}
      <div className="flex flex-col gap-1 border-t border-divisor pt-3">
        <label className="flex min-h-[var(--touch-min)] items-center gap-3 text-base font-semibold text-texto">
          <input
            type="checkbox"
            className="size-5 shrink-0 accent-marca"
            checked={linha.marcada}
            disabled={desabilitada}
            aria-describedby={desabilitada ? idDoBloqueio : undefined}
            onChange={(e) => aoMarcar(n, e.target.checked)}
          />
          Importar linha {n}
        </label>
        {desabilitada && (
          <p id={idDoBloqueio} className="text-sm text-texto-2">
            Corrija os erros desta linha para importar.
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * Revisão no celular: um cartão por linha, com o filtro "Para corrigir" / "Todas". Linha corrigida
 * continua à vista em "Para corrigir" até o Adm trocar de filtro, para não sumir debaixo do dedo.
 */
export function CartoesImportacao({ linhas, unidades, classes, aoEditar, aoMarcar }: Propriedades) {
  const [filtro, setFiltro] = useState<Filtro>(() => (linhas.some(temErro) ? 'corrigir' : 'todas'))
  const [mexidas, setMexidas] = useState<ReadonlySet<number>>(() => new Set())
  const paraCorrigir = linhas.filter(temErro).length
  const visiveis = filtro === 'todas' ? linhas : linhas.filter((linha) => temErro(linha) || mexidas.has(linha.linha))

  const lembrar = (numero: number) => setMexidas((atuais) => new Set(atuais).add(numero))
  const editar: Propriedades['aoEditar'] = (numero, campo, valor) => {
    lembrar(numero)
    aoEditar(numero, campo, valor)
  }
  const marcar = (numero: number, marcada: boolean) => {
    lembrar(numero)
    aoMarcar(numero, marcada)
  }
  const escolher = (novo: Filtro) => {
    setFiltro(novo)
    setMexidas(new Set())
  }

  const opcoes: { id: Filtro; rotulo: string }[] = [
    { id: 'corrigir', rotulo: `Para corrigir · ${paraCorrigir}` },
    { id: 'todas', rotulo: `Todas · ${linhas.length}` },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="Mostrar linhas" className="flex gap-1 rounded-botao bg-trilho p-1">
        {opcoes.map((opcao) => (
          <button
            key={opcao.id}
            type="button"
            aria-pressed={filtro === opcao.id}
            onClick={() => escolher(opcao.id)}
            className={cn(
              'min-h-[var(--touch-min)] flex-1 rounded-controle px-3 text-base font-semibold focus-visible:outline-2 focus-visible:outline-marca',
              filtro === opcao.id ? 'bg-superficie text-marca shadow-[var(--shadow-segment)]' : 'text-texto-2',
            )}
          >
            {opcao.rotulo}
          </button>
        ))}
      </div>
      {visiveis.length === 0 && <p className="text-base text-texto-2">Nenhuma linha precisa de correção.</p>}
      {visiveis.map((linha) => (
        <CartaoDaLinha key={linha.linha} linha={linha} unidades={unidades} classes={classes} aoEditar={editar} aoMarcar={marcar} />
      ))}
    </div>
  )
}
