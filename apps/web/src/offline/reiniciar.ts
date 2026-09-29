import { banco } from './banco'
import { reiniciarConexao } from './conexao'
import { reiniciarEstado } from './estado'
import { reiniciarFila } from './fila'
import { pararMotor } from './motor'
import { limparRegistro } from './registro'
import { restaurarTempos } from './tempos'

/** Só para os testes: volta o módulo offline ao estado de fábrica e esvazia o banco local. */
export async function reiniciarOffline(): Promise<void> {
  await pararMotor()
  reiniciarEstado()
  reiniciarConexao()
  limparRegistro()
  restaurarTempos()
  reiniciarFila()
  await Promise.all([banco.sessoes.clear(), banco.pacotes.clear(), banco.fila.clear(), banco.rascunhos.clear()])
}
