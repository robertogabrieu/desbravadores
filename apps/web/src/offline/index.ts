// Ponto de entrada do módulo offline. As assinaturas vêm de `tipos.ts`; a interface importa só daqui
// (e simula este módulo nos testes). O que é interno (banco, motor, abertura) fica nos outros arquivos.
export type * from './tipos'

export { useConexao, useModoSessao } from './conexao'
export { enfileirar, itensDaChave, useFila } from './fila'
export { limparDadosDoUsuario } from './limpeza'
export { registrarTipo } from './registro'
