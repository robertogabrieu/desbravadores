import type { Papel } from '@desbravadores/shared'
import type { Usuario, VinculoUsuario } from '../../../api/usuarios'
import { juntarNomes } from '../formatos'
import { papelNoGenero, primeiroNome } from './vinculos'

const ORDEM_DOS_PAPEIS: Papel[] = ['ADM', 'CONSELHEIRO', 'INSTRUTOR']

/** Os papéis ativos na ordem da ficha: Adm, Conselheiro, Instrutor. */
export const ativosEmOrdem = (vinculos: VinculoUsuario[]): VinculoUsuario[] =>
  vinculos.filter((v) => v.ativo).sort((a, b) => ORDEM_DOS_PAPEIS.indexOf(a.papel) - ORDEM_DOS_PAPEIS.indexOf(b.papel))

const ESCOPO_DE = {
  CONSELHEIRO: { singular: 'unidade', plural: 'unidades' },
  INSTRUTOR: { singular: 'classe', plural: 'classes' },
} as const

const nomesDoEscopo = (vinculo: VinculoUsuario): string[] =>
  vinculo.papel === 'CONSELHEIRO' ? vinculo.unidades.map((u) => u.nome) : vinculo.classes.map((c) => c.nome)

/** "a unidade Águias" / "as classes Amigo e Guia"; o pronome de volta ("dela" / "delas"). */
function escopoPorExtenso(vinculo: VinculoUsuario): { texto: string; deles: string } | null {
  if (vinculo.papel === 'ADM') return null
  const nomes = nomesDoEscopo(vinculo)
  if (nomes.length === 0) return null
  const unico = nomes.length === 1
  const palavra = ESCOPO_DE[vinculo.papel][unico ? 'singular' : 'plural']
  return { texto: `${unico ? 'a' : 'as'} ${palavra} ${juntarNomes(nomes)}`, deles: unico ? 'dela' : 'delas' }
}

/** "Adm" | "conselheira da unidade Águias" | "instrutor das classes Amigo e Guia" */
function restantePorExtenso(vinculo: VinculoUsuario, genero: Usuario['genero']): string {
  const papel = papelNoGenero(vinculo.papel, genero)
  if (vinculo.papel === 'ADM') return papel
  const nomes = nomesDoEscopo(vinculo)
  if (nomes.length === 0) return papel.toLowerCase()
  const palavra = ESCOPO_DE[vinculo.papel][nomes.length === 1 ? 'singular' : 'plural']
  return `${papel.toLowerCase()} ${nomes.length === 1 ? 'da' : 'das'} ${palavra} ${juntarNomes(nomes)}`
}

function primeiroParagrafo(vinculo: VinculoUsuario, nome: string, genero: Usuario['genero']): string {
  if (vinculo.papel === 'ADM') return `${nome} deixa de cuidar do clube: usuários, unidades, classes, calendário e ranking.`
  const escopo = escopoPorExtenso(vinculo)
  if (!escopo) return `${nome} deixa de ser ${papelNoGenero(vinculo.papel, genero).toLowerCase()} neste clube, assim que o aparelho se conectar.`
  if (vinculo.papel === 'CONSELHEIRO')
    return `${nome} deixa de acompanhar ${escopo.texto} e não vê mais os desbravadores, as reuniões nem as fotos ${escopo.deles}, assim que o aparelho se conectar.`
  return `${nome} deixa de instruir ${escopo.texto} e não vê mais as chamadas nem os requisitos ${escopo.deles}, assim que o aparelho se conectar.`
}

interface Entrada {
  usuario: Usuario
  vinculo: VinculoUsuario
  ehVoce: boolean
}

/** Título e parágrafos da confirmação de "Remover papel", para outra pessoa ou para quem está logado. */
export function textosDaRemocao({ usuario, vinculo, ehVoce }: Entrada): { titulo: string; paragrafos: string[] } {
  const nome = primeiroNome(usuario.nome)
  const pronomeNoMeio = usuario.genero === 'F' ? 'ela' : usuario.genero === 'M' ? 'ele' : nome
  const pronomeNoInicio = pronomeNoMeio.charAt(0).toUpperCase() + pronomeNoMeio.slice(1)
  const papel = papelNoGenero(vinculo.papel, usuario.genero)
  const restantes = ativosEmOrdem(usuario.vinculos).filter((v) => v.id !== vinculo.id)
  const registrouOffline = vinculo.papel !== 'ADM'

  const guardado = 'O que já chegou ao clube continua guardado.'
  const titulo = ehVoce ? `Remover o seu papel de ${papel}?` : `Remover o papel de ${papel} de ${nome}?`
  const primeiro = ehVoce ? 'Você perde esse acesso na hora.' : primeiroParagrafo(vinculo, nome, usuario.genero)
  let segundo = guardado
  if (registrouOffline) {
    segundo += ehVoce
      ? ' Se você registrou algo sem internet, abra o app com internet antes.'
      : ` Se ${nome} registrou algo sem internet, peça que abra o app com internet antes.`
  }

  let fecho: string
  if (restantes.length > 0) {
    const quais = juntarNomes(restantes.map((v) => restantePorExtenso(v, usuario.genero)))
    fecho = ehVoce ? `Você segue como ${quais}.` : `${pronomeNoInicio} segue como ${quais}.`
  } else {
    fecho = ehVoce
      ? 'Era o seu último papel neste clube: você deixa de entrar no clube.'
      : `Era o último papel de ${nome} neste clube: ${pronomeNoMeio} deixa de entrar no clube. Para voltar, acrescente um papel.`
  }
  return { titulo, paragrafos: [primeiro, segundo, fecho] }
}
