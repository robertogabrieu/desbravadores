import { ArrowLeft, Download } from 'lucide-react'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { baixarModelo, errosDaRecusa, useConfirmarImportacao, useEnviarPlanilha } from '../../../api/importacao'
import type { LinhaParaImportar } from '../../../api/importacao'
import { useClasses, useUnidades } from '../../../api/leitura'
import { useConexao } from '../../../offline'
import { Botao } from '../../../ui/Botao'
import { Campo } from '../../../ui/Campo'
import { Cartao } from '../../../ui/Cartao'
import { EstadoVazio } from '../../../ui/EstadoVazio'
import { Carregando, DisponivelComInternet } from '../../../ui/EstadosDeCarga'
import { MENSAGEM_GENERICA, lerErroDaApi } from './erros'
import { GradeImportacao } from './GradeImportacao'
import { aplicarRecusa, contar, editarCelula, paraEnvio, paraRevisao } from './revisao-importacao'
import type { CampoEditavel, LinhaEmRevisao } from './revisao-importacao'

export const ROTA_LISTA = '/adm/desbravadores'

/** Estado de navegação com que a lista mostra o resultado da importação. */
export interface ResultadoDaImportacao {
  importados: number
}

const plural = (n: number, um: string, varios: string): string => `${n} ${n === 1 ? um : varios}`

const juntarComE = (itens: string[]): string =>
  itens.length <= 1 ? (itens[0] ?? '') : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1] ?? ''}`

function EtapaEnviar({ aoLer }: { aoLer: (linhas: LinhaEmRevisao[]) => void }) {
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [semLinhas, setSemLinhas] = useState(false)
  const enviar = useEnviarPlanilha()

  async function aoEnviar(evento: FormEvent) {
    evento.preventDefault()
    setErro(null)
    setSemLinhas(false)
    if (!arquivo) {
      setErro('Escolha a planilha no seu computador.')
      return
    }
    try {
      const previa = await enviar.mutateAsync(arquivo)
      if (previa.colunasFaltando.length > 0) {
        setErro(`Faltam as colunas ${juntarComE(previa.colunasFaltando)}. Confira o cabeçalho da planilha ou use o modelo.`)
      } else if (previa.linhas.length === 0) {
        setSemLinhas(true)
      } else {
        aoLer(paraRevisao(previa.linhas))
      }
    } catch (falha) {
      setErro(lerErroDaApi(falha).geral ?? MENSAGEM_GENERICA)
    }
  }

  async function aoBaixarModelo() {
    setErro(null)
    try {
      await baixarModelo()
    } catch (falha) {
      setErro(lerErroDaApi(falha).geral ?? MENSAGEM_GENERICA)
    }
  }

  return (
    <Cartao className="flex max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-2 text-base text-texto">
        <p>Envie um arquivo .xlsx ou .csv com uma pessoa por linha, até 500 linhas e 3 MB.</p>
        <p className="text-texto-2">
          Obrigatórias: Nome, Data de nascimento e Sexo. Opcionais: Unidade, Classe, Responsável, Telefone, E-mail e Entrada no clube.
        </p>
        <Botao variante="texto" className="self-start px-0" onClick={() => void aoBaixarModelo()}>
          <Download aria-hidden className="size-5" />
          Baixar modelo
        </Botao>
      </div>
      <form noValidate onSubmit={(evento) => void aoEnviar(evento)} className="flex flex-col gap-4">
        <Campo
          rotulo="Planilha"
          type="file"
          accept=".xlsx,.csv"
          className="py-2"
          onChange={(e) => setArquivo(e.target.files?.[0] ?? null)}
        />
        {erro && (
          <p role="alert" className="text-base font-medium text-perigo">
            {erro}
          </p>
        )}
        {enviar.isPending && (
          <Carregando rotulo="Lendo a planilha">
            <p className="text-base text-texto-2">Lendo a planilha…</p>
          </Carregando>
        )}
        <Botao type="submit" className="self-start" carregando={enviar.isPending}>
          Enviar planilha
        </Botao>
      </form>
      {semLinhas && (
        <EstadoVazio
          titulo="A planilha não tem ninguém para importar"
          descricao="Confira se os nomes estão logo abaixo do cabeçalho, na primeira aba da planilha."
        />
      )}
    </Cartao>
  )
}

function EtapaRevisar({ linhasIniciais, aoRecomecar }: { linhasIniciais: LinhaEmRevisao[]; aoRecomecar: () => void }) {
  const [linhas, setLinhas] = useState(linhasIniciais)
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const unidades = useUnidades()
  const classes = useClasses({ tipo: 'REGULAR' })
  const confirmar = useConfirmarImportacao()
  const navegar = useNavigate()

  const listaDeUnidades = unidades.data ?? []
  const classesAtivas = (classes.data ?? []).filter((classe) => classe.ativa)
  const { prontas, comAviso, comErro } = contar(linhas)
  const marcadas = linhas.filter((linha) => linha.marcada)

  function aoEditar<C extends CampoEditavel>(numero: number, campo: C, valor: LinhaParaImportar[C]) {
    setLinhas((atuais) => atuais.map((linha) => (linha.linha === numero ? editarCelula(linha, campo, valor, listaDeUnidades) : linha)))
  }

  function aoMarcar(numero: number, marcada: boolean) {
    setLinhas((atuais) => atuais.map((linha) => (linha.linha === numero ? { ...linha, marcada } : linha)))
  }

  async function aoConfirmar() {
    setErroGeral(null)
    try {
      const { importados } = await confirmar.mutateAsync(marcadas.map(paraEnvio))
      const resultado: ResultadoDaImportacao = { importados }
      void navegar(ROTA_LISTA, { state: resultado })
    } catch (falha) {
      const erros = errosDaRecusa(falha)
      if (erros) setLinhas((atuais) => aplicarRecusa(atuais, erros))
      setErroGeral(lerErroDaApi(falha).geral ?? MENSAGEM_GENERICA)
    }
  }

  return (
    <section className="flex flex-col gap-4" aria-label="Revisar a planilha">
      <div className="flex flex-col gap-1">
        <p className="text-lg font-semibold text-texto">
          {plural(prontas, 'pronta', 'prontas')} · {comAviso} com aviso · {comErro} com erro
        </p>
        <p className="text-base text-texto-2">
          Confira e corrija nas células. Linha com erro só pode ser marcada depois de corrigida; pessoa repetida chega desmarcada.
        </p>
      </div>
      <GradeImportacao linhas={linhas} unidades={listaDeUnidades} classes={classesAtivas} aoEditar={aoEditar} aoMarcar={aoMarcar} />
      <div className="flex flex-col gap-3">
        {erroGeral && (
          <p role="alert" className="text-base font-medium text-perigo">
            {erroGeral}
          </p>
        )}
        {marcadas.length === 0 && <p className="text-base text-texto-2">Marque ao menos uma linha para importar.</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Botao disabled={marcadas.length === 0} carregando={confirmar.isPending} onClick={() => void aoConfirmar()}>
            Importar {plural(marcadas.length, 'desbravador', 'desbravadores')}
          </Botao>
          <Botao variante="secundario" onClick={aoRecomecar}>
            Enviar outra planilha
          </Botao>
        </div>
      </div>
    </section>
  )
}

/** Adm → Desbravadores → Importar planilha: enviar, revisar na grade e confirmar tudo de uma vez. */
export function ImportarDesbravadores() {
  const { modo } = useConexao()
  const navegar = useNavigate()
  const [lidas, setLidas] = useState<LinhaEmRevisao[] | null>(null)

  let corpo
  if (modo === 'SEM_CONEXAO') corpo = <DisponivelComInternet />
  else if (lidas) corpo = <EtapaRevisar linhasIniciais={lidas} aoRecomecar={() => setLidas(null)} />
  else corpo = <EtapaEnviar aoLer={setLidas} />

  return (
    <div className="flex flex-col gap-5 p-4">
      <header className="flex flex-col gap-1">
        <Botao variante="texto" className="self-start px-0" onClick={() => void navegar(ROTA_LISTA)}>
          <ArrowLeft aria-hidden className="size-5" />
          Voltar para Desbravadores
        </Botao>
        <h1 className="font-titulo text-2xl font-bold text-texto">Importar planilha</h1>
        <p className="text-base text-texto-2">Traga a lista do clube de uma vez. Líderes continuam sendo cadastrados um a um.</p>
      </header>
      {corpo}
    </div>
  )
}
