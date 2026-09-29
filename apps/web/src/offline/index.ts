// Ponto de entrada do módulo offline. As assinaturas vêm de `tipos.ts`; o motor (1a-A2) troca
// os corpos. A interface importa só daqui (e simula este módulo nos testes).
import type {
  Enfileirar,
  ItensDaChave,
  LimparDadosDoUsuario,
  RegistrarTipo,
  UseConexao,
  UseFila,
  UseModoSessao,
} from './tipos'

export type * from './tipos'

const naoImplementado = (nome: string): never => {
  throw new Error(`offline.${nome} ainda não implementado`)
}

export const registrarTipo: RegistrarTipo = () => naoImplementado('registrarTipo')
export const enfileirar: Enfileirar = () => naoImplementado('enfileirar')
export const useFila: UseFila = () => naoImplementado('useFila')
export const itensDaChave: ItensDaChave = () => naoImplementado('itensDaChave')
export const useConexao: UseConexao = () => naoImplementado('useConexao')
export const useModoSessao: UseModoSessao = () => naoImplementado('useModoSessao')
export const limparDadosDoUsuario: LimparDadosDoUsuario = () => naoImplementado('limparDadosDoUsuario')
