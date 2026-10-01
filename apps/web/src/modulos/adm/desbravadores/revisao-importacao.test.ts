import { AVISOS_IMPORTACAO } from '@desbravadores/shared'
import { describe, expect, it } from 'vitest'
import { criarLinhaDaPrevia } from '../../../testes/handlers/desbravadores'
import { aplicarRecusa, contar, editarCelula, paraEnvio, paraRevisao } from './revisao-importacao'

const avisoDeRepetida = {
  codigo: AVISOS_IMPORTACAO.duplicado,
  mensagem: 'Já existe no clube um desbravador com este nome e nascimento.',
}

describe('revisão da importação · pessoa repetida', () => {
  it('editar nome ou nascimento tira a marca de repetida: o servidor volta a conferir', () => {
    for (const [campo, valor] of [
      ['nome', 'Ana Clara Souza Lima'],
      ['nascimento', '2014-03-15'],
    ] as const) {
      const [linha] = paraRevisao([
        criarLinhaDaPrevia({ duplicado: true, avisos: [avisoDeRepetida] }),
      ])
      const editada = editarCelula(linha, campo, valor, [])
      expect(editada.duplicado).toBe(false)
      expect(editada.avisos.map((aviso) => aviso.codigo)).not.toContain(AVISOS_IMPORTACAO.duplicado)
      expect(paraEnvio({ ...editada, marcada: true }).importarMesmoRepetido).toBe(false)
    }
  })

  it('editar outro campo mantém a marca de repetida', () => {
    const [linha] = paraRevisao([
      criarLinhaDaPrevia({ duplicado: true, avisos: [avisoDeRepetida] }),
    ])
    expect(editarCelula(linha, 'responsavelNome', 'Marta', []).duplicado).toBe(true)
  })

  it('a contagem só põe em "com erro" a linha que não pode ser marcada', () => {
    const linhas = aplicarRecusa(paraRevisao([criarLinhaDaPrevia({ linha: 2 })]), [
      {
        linha: 2,
        mensagens: [
          {
            campo: null,
            mensagem: 'Já existe no clube um desbravador com este nome e nascimento.',
          },
        ],
      },
    ])
    expect(contar(linhas)).toEqual({ prontas: 0, comAviso: 1, comErro: 0 })
  })
})
