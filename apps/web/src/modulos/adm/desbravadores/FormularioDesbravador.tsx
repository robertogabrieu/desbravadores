import { DesbravadorCriarEntrada, DesbravadorEditarEntrada, TipoPessoa, anoClube, hojeNoFuso } from '@desbravadores/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ErroDaApi } from '../../../api/cliente'
import { consultaConfiguracaoClube } from '../../../api/clube'
import { hojeDoClube, useCriarDesbravador, useEditarDesbravador, useMatricular, useMoverUnidade } from '../../../api/desbravadores'
import type { Aviso, Desbravador, TipoDesbravador } from '../../../api/desbravadores'
import { useClasses, useUnidades, useUsuariosResumo } from '../../../api/leitura'
import { CaixaMarcacao } from '../../../ui/CaixaMarcacao'
import { Campo } from '../../../ui/Campo'
import { Cartao } from '../../../ui/Cartao'
import { FaixaAviso } from '../../../ui/FaixaAviso'
import { RodapeDoFormulario } from '../../../ui/RodapeDoFormulario'
import { Selecao } from '../../../ui/Selecao'
import { MENSAGEM_GENERICA, errosDoContrato, lerErroDaApi } from './erros'

interface Valores {
  tipo: TipoDesbravador
  nome: string
  nomePublico: string
  nascimento: string
  sexo: '' | 'F' | 'M'
  entradaEm: string
  unidadeId: string
  classeId: string
  incluirAvancada: boolean
  usuarioId: string
  responsavelNome: string
  responsavelTelefone: string
  responsavelEmail: string
  autorizacaoImagem: boolean
}

interface Propriedades {
  /** Ausente: cadastro novo. */
  desbravador?: Desbravador
  /** Para onde o Cancelar leva, e o estado que a navegação carrega. */
  cancelar: { para: string; estado?: object }
  aoConcluir: (resultado: { id: string; avisos: Aviso[] }) => void
}

const textoOuNulo = (texto: string): string | null => texto.trim() || null

const AVISO_SAIDA_DA_UNIDADE = 'Sai da unidade e da chamada; continua cursando a classe.'
const AVISO_ENTRA_SEM_UNIDADE = 'Entra na chamada quando tiver uma unidade: escolha abaixo.'
const AVISO_CLUBE_SEM_UNIDADES = 'Entra na chamada quando tiver uma unidade. O clube ainda não tem unidades.'

/** "Diretoria pela idade (16 anos até junho) e porque é conselheiro"; nada fora da Diretoria. */
function textoDosMotivos(motivos: Desbravador['motivosDiretoria']): string | undefined {
  if (motivos.length === 0) return undefined
  const papeis = motivos.flatMap((motivo) => (motivo === 'CONSELHEIRO' ? ['conselheiro'] : motivo === 'INSTRUTOR' ? ['instrutor'] : []))
  const partes = [
    ...(motivos.includes('IDADE') ? ['pela idade (16 anos até junho)'] : []),
    ...(papeis.length > 0 ? [`porque é ${papeis.join(' e ')}`] : []),
    ...(motivos.includes('ADM') ? ['porque foi marcado pelo Adm'] : []),
  ]
  return `Diretoria ${partes.join(' e ')}`
}

/** A ajuda do campo Tipo: o aviso a quem deixa de ser ou volta a ser Desbravador, ou por que a pessoa é Diretoria. */
function ajudaDoTipo(atual: Desbravador | undefined, escolhido: TipoDesbravador): string | undefined {
  if (!atual) return undefined
  if (atual.tipo === 'DBV' && escolhido !== 'DBV') return AVISO_SAIDA_DA_UNIDADE
  if (atual.tipo !== 'DBV' && escolhido === 'DBV') return AVISO_ENTRA_SEM_UNIDADE
  if (atual.tipo === 'DIRETORIA' && escolhido === 'DIRETORIA') return textoDosMotivos(atual.motivosDiretoria)
  return undefined
}

/** O que a conta ligada à ficha conduz no clube, ao lado do que ela cursa. */
function LinhaConduz({ instrui, aconselha }: Pick<Desbravador, 'instrui' | 'aconselha'>) {
  if (instrui.length === 0 && aconselha.length === 0) return null
  return (
    <div className="flex flex-col gap-1 text-sm text-texto">
      {instrui.length > 0 && <p>{`Instrui: ${instrui.map((classe) => classe.nome).join(', ')}`}</p>}
      {aconselha.length > 0 && <p>{`Aconselha: ${aconselha.map((unidade) => unidade.nome).join(', ')}`}</p>}
    </div>
  )
}

function valoresIniciais(desbravador: Desbravador | undefined): Valores {
  return {
    tipo: desbravador?.tipo ?? 'DBV',
    nome: desbravador?.nome ?? '',
    nomePublico: desbravador?.nomePublico ?? '',
    nascimento: desbravador?.nascimento ?? '',
    sexo: desbravador?.sexo ?? '',
    entradaEm: hojeDoClube(),
    unidadeId: desbravador?.unidade?.id ?? '',
    classeId: desbravador?.classeAtual?.id ?? '',
    incluirAvancada: true,
    usuarioId: desbravador?.usuarioId ?? '',
    responsavelNome: desbravador?.contato?.responsavelNome ?? '',
    responsavelTelefone: desbravador?.contato?.responsavelTelefone ?? '',
    responsavelEmail: desbravador?.contato?.responsavelEmail ?? '',
    autorizacaoImagem: desbravador?.autorizacaoImagem ?? false,
  }
}

function CampoContaDeUsuario({ valor, aoMudar }: { valor: string; aoMudar: (id: string) => void }) {
  const usuarios = useUsuariosResumo()
  return (
    <Selecao rotulo="Conta de usuário (opcional)" value={valor} onChange={(e) => aoMudar(e.target.value)}>
      <option value="">Sem conta de usuário</option>
      {usuarios.data?.itens.map((usuario) => (
        <option key={usuario.id} value={usuario.id}>
          {usuario.nome}
        </option>
      ))}
    </Selecao>
  )
}

export function FormularioDesbravador({ desbravador, cancelar, aoConcluir }: Propriedades) {
  const editando = desbravador !== undefined
  const [valores, setValores] = useState<Valores>(() => valoresIniciais(desbravador))
  const [erros, setErros] = useState<Record<string, string>>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [parcial, setParcial] = useState<{ mensagem: string; avisos: Aviso[] } | null>(null)
  const unidades = useUnidades()
  const classes = useClasses({ tipo: 'REGULAR' })
  const criar = useCriarDesbravador()
  const editar = useEditarDesbravador()
  const mover = useMoverUnidade()
  const matricular = useMatricular()
  const cliente = useQueryClient()

  const ehLider = valores.tipo === 'LIDER'
  const ativoOuNovo = !editando || desbravador.ativo
  // Diretoria e Líder não ficam em unidade; a Diretoria continua cursando a classe.
  const mostraUnidade = valores.tipo === 'DBV' && ativoOuNovo
  const mostraClasse = !ehLider && ativoOuNovo
  // Desbravador sem unidade (inclusive quem voltou sozinho da Diretoria) fica fora da chamada até ganhar uma.
  const semUnidadeNoClube = unidades.data?.length === 0
  const vaiFicarSemUnidade = (!editando || (desbravador.tipo === 'DBV' && !desbravador.unidade)) && valores.unidadeId === ''
  const avisoSemUnidade = semUnidadeNoClube ? AVISO_CLUBE_SEM_UNIDADES : vaiFicarSemUnidade ? AVISO_ENTRA_SEM_UNIDADE : undefined
  const mostraResponsavel = !editando || desbravador.contato !== undefined
  const salvando = criar.isPending || editar.isPending || mover.isPending || matricular.isPending
  const classeAtualId = desbravador?.classeAtual?.id ?? ''
  // A API só registra desistência da regular anterior quando a nova é da mesma trilha (individual ou
  // agrupada); de uma trilha para a outra, o desbravador passa a cursar as duas.
  const trilhaEscolhida = classes.data?.find((classe) => classe.id === valores.classeId)?.trilha
  const trocandoClasse = editando && classeAtualId !== '' && valores.classeId !== '' && valores.classeId !== classeAtualId
  const avisoDaTroca = !trocandoClasse
    ? undefined
    : trilhaEscolhida === desbravador?.classeAtual?.trilha
      ? 'A classe atual fica registrada como desistência.'
      : 'A classe atual continua: o desbravador passa a cursar as duas.'

  const definir = <K extends keyof Valores>(chave: K, valor: Valores[K]) => setValores((atual) => ({ ...atual, [chave]: valor }))

  function dataDaAutorizacao(): string | null {
    if (!valores.autorizacaoImagem) return null
    return desbravador?.autorizacaoImagemEm ?? hojeDoClube()
  }

  const camposDaPessoa = () => ({
    nome: valores.nome,
    nascimento: valores.nascimento,
    sexo: valores.sexo || undefined,
    autorizacaoImagem: valores.autorizacaoImagem,
    autorizacaoImagemEm: dataDaAutorizacao(),
    nomePublico: valores.nomePublico.trim() || undefined,
  })

  const camposDoResponsavel = () => ({
    responsavelNome: textoOuNulo(valores.responsavelNome),
    responsavelTelefone: textoOuNulo(valores.responsavelTelefone),
    responsavelEmail: textoOuNulo(valores.responsavelEmail),
  })

  async function criarNovo(): Promise<{ id: string; avisos: Aviso[] } | null> {
    const entrada = {
      ...camposDaPessoa(),
      ...camposDoResponsavel(),
      tipo: valores.tipo,
      entradaEm: valores.entradaEm,
      usuarioId: ehLider ? textoOuNulo(valores.usuarioId) : undefined,
      unidadeId: mostraUnidade ? textoOuNulo(valores.unidadeId) : undefined,
      classeId: ehLider ? undefined : textoOuNulo(valores.classeId),
      incluirAvancada: valores.incluirAvancada,
    }
    const lido = DesbravadorCriarEntrada.safeParse(entrada)
    if (!lido.success) {
      setErros(errosDoContrato(lido.error.issues))
      return null
    }
    const resposta = await criar.mutateAsync(lido.data)
    return { id: resposta.dados.id, avisos: resposta.avisos }
  }

  async function editarExistente(atual: Desbravador): Promise<{ id: string; avisos: Aviso[] } | null> {
    const entrada = {
      ...camposDaPessoa(),
      ...(mostraResponsavel ? camposDoResponsavel() : {}),
      ...(ehLider ? { usuarioId: textoOuNulo(valores.usuarioId) } : {}),
      ...(valores.tipo !== atual.tipo ? { tipo: valores.tipo } : {}),
    }
    const lido = DesbravadorEditarEntrada.safeParse(entrada)
    if (!lido.success) {
      setErros(errosDoContrato(lido.error.issues))
      return null
    }
    const voltandoADesbravador = valores.tipo === 'DBV' && atual.tipo !== 'DBV'
    const resposta = await editar.mutateAsync({ id: atual.id, entrada: lido.data }).catch((falha: unknown) => {
      // A API recusa voltar a Desbravador quem está na regra da Diretoria: a recusa é do campo Tipo.
      if (voltandoADesbravador && falha instanceof ErroDaApi && falha.status === 422) {
        setErros({ tipo: falha.erro.mensagem })
        return null
      }
      throw falha
    })
    if (!resposta) return null
    const { avisos } = resposta
    const unidadeAtual = atual.unidade?.id ?? ''
    if (mostraUnidade && valores.unidadeId !== unidadeAtual) {
      try {
        await mover.mutateAsync({ id: atual.id, unidadeId: textoOuNulo(valores.unidadeId) })
      } catch (falha) {
        const motivo = lerErroDaApi(falha).geral ?? MENSAGEM_GENERICA
        setParcial({ mensagem: `Dados salvos. A unidade não foi alterada: ${motivo}`, avisos })
        return null
      }
    }
    // A classe só é escolhida na edição para quem está ativo e não é Líder; trocar matricula de novo.
    if (mostraClasse && valores.classeId && valores.classeId !== classeAtualId) {
      try {
        // A matrícula é no ano do clube, que depende do fuso e do início do ano configurados.
        const configuracao = await cliente.fetchQuery(consultaConfiguracaoClube)
        const ano = anoClube(hojeNoFuso(configuracao.fuso, new Date()), configuracao.inicioAnoClube)
        await matricular.mutateAsync({ id: atual.id, classeId: valores.classeId, anoClube: ano, incluirAvancada: valores.incluirAvancada })
      } catch (falha) {
        const motivo = lerErroDaApi(falha).geral ?? MENSAGEM_GENERICA
        setParcial({ mensagem: `Dados salvos. A classe não foi alterada: ${motivo}`, avisos })
        return null
      }
    }
    return { id: atual.id, avisos }
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setErros({})
    setErroGeral(null)
    setParcial(null)
    try {
      const resultado = desbravador ? await editarExistente(desbravador) : await criarNovo()
      if (resultado) aoConcluir(resultado)
    } catch (falha) {
      const { campos, geral } = lerErroDaApi(falha)
      setErros(campos)
      setErroGeral(geral)
    }
  }

  const mostraNoClube = mostraUnidade || mostraClasse

  return (
    <form noValidate onSubmit={(evento) => void enviar(evento)} className="flex flex-col gap-4">
      <Cartao className="flex flex-col gap-4">
        <h2 className="font-titulo text-lg font-bold text-texto">Quem é</h2>
        {desbravador && <LinhaConduz instrui={desbravador.instrui} aconselha={desbravador.aconselha} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Selecao
            rotulo="Tipo"
            value={valores.tipo}
            erro={erros['tipo']}
            ajuda={ajudaDoTipo(desbravador, valores.tipo)}
            onChange={(e) => definir('tipo', TipoPessoa.catch('DBV').parse(e.target.value))}
          >
            <option value="DBV">Desbravador</option>
            <option value="DIRETORIA">Diretoria</option>
            <option value="LIDER">Líder em formação</option>
          </Selecao>
          <Campo rotulo="Nome completo" value={valores.nome} erro={erros['nome']} onChange={(e) => definir('nome', e.target.value)} />
          <Campo
            rotulo="Nome público"
            ajuda="Aparece nas telas dos conselheiros. Em branco, o sistema escolhe."
            value={valores.nomePublico}
            erro={erros['nomePublico']}
            onChange={(e) => definir('nomePublico', e.target.value)}
          />
          <Campo rotulo="Nascimento" type="date" value={valores.nascimento} erro={erros['nascimento']} onChange={(e) => definir('nascimento', e.target.value)} />
          <Selecao
            rotulo="Sexo"
            value={valores.sexo}
            erro={erros['sexo']}
            onChange={(e) => definir('sexo', e.target.value === 'F' ? 'F' : e.target.value === 'M' ? 'M' : '')}
          >
            <option value="">Escolha</option>
            <option value="F">Feminino</option>
            <option value="M">Masculino</option>
          </Selecao>
          {!editando && (
            <Campo rotulo="Entrada no clube" type="date" value={valores.entradaEm} erro={erros['entradaEm']} onChange={(e) => definir('entradaEm', e.target.value)} />
          )}
          {ehLider && <CampoContaDeUsuario valor={valores.usuarioId} aoMudar={(id) => definir('usuarioId', id)} />}
        </div>
      </Cartao>

      {mostraNoClube && (
        <Cartao className="flex flex-col gap-4">
          <h2 className="font-titulo text-lg font-bold text-texto">No clube</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {mostraUnidade && (
              <Selecao
                rotulo="Unidade"
                value={valores.unidadeId}
                ajuda={avisoSemUnidade}
                erro={erros['unidadeId']}
                onChange={(e) => definir('unidadeId', e.target.value)}
              >
                <option value="">Sem unidade</option>
                {unidades.data?.map((unidade) => (
                  <option key={unidade.id} value={unidade.id}>
                    {unidade.nome}
                  </option>
                ))}
              </Selecao>
            )}
            {mostraUnidade && semUnidadeNoClube && (
              <Link to="/adm/unidades" className="self-end text-base font-semibold text-marca underline">
                Cadastrar unidades
              </Link>
            )}
            {mostraClasse && (
              <>
                {/* Na edição, "Sem classe" só existe para quem ainda não tem: matrícula não se desfaz por aqui. */}
                <Selecao
                  rotulo="Classe do ano"
                  value={valores.classeId}
                  erro={erros['classeId']}
                  ajuda={avisoDaTroca}
                  onChange={(e) => definir('classeId', e.target.value)}
                >
                  {(!editando || !classeAtualId) && <option value="">Sem classe</option>}
                  {classes.data?.map((classe) => (
                    <option key={classe.id} value={classe.id}>
                      {classe.nome}
                    </option>
                  ))}
                </Selecao>
                {valores.classeId && (!editando || valores.classeId !== classeAtualId) && (
                  <CaixaMarcacao
                    rotulo="Matricular também na avançada"
                    checked={valores.incluirAvancada}
                    onChange={(e) => definir('incluirAvancada', e.target.checked)}
                  />
                )}
              </>
            )}
          </div>
        </Cartao>
      )}

      <Cartao className="flex flex-col gap-4">
        <h2 className="font-titulo text-lg font-bold text-texto">Responsável</h2>
        {mostraResponsavel && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Responsável" value={valores.responsavelNome} erro={erros['responsavelNome']} onChange={(e) => definir('responsavelNome', e.target.value)} />
            <Campo
              rotulo="Telefone do responsável"
              type="tel"
              value={valores.responsavelTelefone}
              erro={erros['responsavelTelefone']}
              onChange={(e) => definir('responsavelTelefone', e.target.value)}
            />
            <Campo
              rotulo="E-mail do responsável"
              type="email"
              value={valores.responsavelEmail}
              erro={erros['responsavelEmail']}
              onChange={(e) => definir('responsavelEmail', e.target.value)}
            />
          </div>
        )}
        <CaixaMarcacao rotulo="Autorizou o uso de imagem" checked={valores.autorizacaoImagem} onChange={(e) => definir('autorizacaoImagem', e.target.checked)} />
      </Cartao>

      {parcial && (
        <div className="flex flex-col gap-2">
          <FaixaAviso>{parcial.mensagem}</FaixaAviso>
          {parcial.avisos.map((aviso) => (
            <FaixaAviso key={`${aviso.codigo}-${aviso.mensagem}`}>{aviso.mensagem}</FaixaAviso>
          ))}
        </div>
      )}
      {erroGeral && (
        <p role="alert" className="text-sm font-medium text-perigo">
          {erroGeral}
        </p>
      )}
      <RodapeDoFormulario cancelar={cancelar} rotuloSalvar={editando ? 'Salvar alterações' : 'Salvar'} salvando={salvando} />
    </form>
  )
}
