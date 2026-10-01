import { DesbravadorCriarEntrada, DesbravadorEditarEntrada, anoClube, hojeNoFuso } from '@desbravadores/shared'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { FormEvent } from 'react'
import { consultaConfiguracaoClube } from '../../../api/clube'
import { hojeDoClube, useCriarDesbravador, useEditarDesbravador, useMatricular, useMoverUnidade } from '../../../api/desbravadores'
import type { Aviso, Desbravador } from '../../../api/desbravadores'
import { useClasses, useUnidades, useUsuariosResumo } from '../../../api/leitura'
import { Botao } from '../../../ui/Botao'
import { CaixaMarcacao } from '../../../ui/CaixaMarcacao'
import { Campo } from '../../../ui/Campo'
import { FaixaAviso } from '../../../ui/FaixaAviso'
import { Selecao } from '../../../ui/Selecao'
import { MENSAGEM_GENERICA, errosDoContrato, lerErroDaApi } from './erros'

interface Valores {
  tipo: 'DBV' | 'LIDER'
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
  aoConcluir: (avisos: Aviso[]) => void
  aoCancelar: () => void
}

const textoOuNulo = (texto: string): string | null => texto.trim() || null

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

export function FormularioDesbravador({ desbravador, aoConcluir, aoCancelar }: Propriedades) {
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
  const mostraUnidade = !ehLider && (!editando || desbravador.ativo)
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

  async function criarNovo(): Promise<Aviso[] | null> {
    const entrada = {
      ...camposDaPessoa(),
      ...camposDoResponsavel(),
      tipo: valores.tipo,
      entradaEm: valores.entradaEm,
      usuarioId: ehLider ? textoOuNulo(valores.usuarioId) : undefined,
      unidadeId: ehLider ? undefined : textoOuNulo(valores.unidadeId),
      classeId: ehLider ? undefined : textoOuNulo(valores.classeId),
      incluirAvancada: valores.incluirAvancada,
    }
    const lido = DesbravadorCriarEntrada.safeParse(entrada)
    if (!lido.success) {
      setErros(errosDoContrato(lido.error.issues))
      return null
    }
    return (await criar.mutateAsync(lido.data)).avisos
  }

  async function editarExistente(atual: Desbravador): Promise<Aviso[] | null> {
    const entrada = {
      ...camposDaPessoa(),
      ...(mostraResponsavel ? camposDoResponsavel() : {}),
      ...(ehLider ? { usuarioId: textoOuNulo(valores.usuarioId) } : {}),
    }
    const lido = DesbravadorEditarEntrada.safeParse(entrada)
    if (!lido.success) {
      setErros(errosDoContrato(lido.error.issues))
      return null
    }
    const { avisos } = await editar.mutateAsync({ id: atual.id, entrada: lido.data })
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
    // A classe só é escolhida na edição para quem está na unidade (DBV ativo); trocar matricula de novo.
    if (mostraUnidade && valores.classeId && valores.classeId !== classeAtualId) {
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
    return avisos
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    setErros({})
    setErroGeral(null)
    setParcial(null)
    try {
      const avisos = desbravador ? await editarExistente(desbravador) : await criarNovo()
      if (avisos) aoConcluir(avisos)
    } catch (falha) {
      const { campos, geral } = lerErroDaApi(falha)
      setErros(campos)
      setErroGeral(geral)
    }
  }

  return (
    <form noValidate onSubmit={(evento) => void enviar(evento)} className="flex flex-col gap-4">
      <Selecao rotulo="Tipo" value={valores.tipo} disabled={editando} onChange={(e) => definir('tipo', e.target.value === 'LIDER' ? 'LIDER' : 'DBV')}>
        <option value="DBV">Desbravador</option>
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
      {ehLider ? (
        <CampoContaDeUsuario valor={valores.usuarioId} aoMudar={(id) => definir('usuarioId', id)} />
      ) : mostraUnidade ? (
        <>
          <Selecao rotulo="Unidade" value={valores.unidadeId} erro={erros['unidadeId']} onChange={(e) => definir('unidadeId', e.target.value)}>
            <option value="">Sem unidade</option>
            {unidades.data?.map((unidade) => (
              <option key={unidade.id} value={unidade.id}>
                {unidade.nome}
              </option>
            ))}
          </Selecao>
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
      ) : null}
      {mostraResponsavel && (
        <>
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
        </>
      )}
      <CaixaMarcacao rotulo="Autorizou o uso de imagem" checked={valores.autorizacaoImagem} onChange={(e) => definir('autorizacaoImagem', e.target.checked)} />
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
      <div className="flex justify-end gap-2">
        <Botao variante="secundario" onClick={aoCancelar}>
          Cancelar
        </Botao>
        <Botao type="submit" carregando={salvando}>
          Salvar
        </Botao>
      </div>
    </form>
  )
}
