import { describe, expect, it } from 'vitest'
import { CHAVES_PERMISSAO, permissaoSeAplica, permissoesEfetivas } from './permissoes'

describe('permissoesEfetivas', () => {
  it('o catálogo tem 23 chaves e o ADM tem todas', () => {
    expect(CHAVES_PERMISSAO).toHaveLength(23)
    expect(permissoesEfetivas('ADM', [])).toHaveLength(23)
  })

  it('ADM ignora ajuste que tentaria desligar uma permissão', () => {
    expect(permissoesEfetivas('ADM', [{ permissao: 'dbv.ver', concedida: false }])).toContain('dbv.ver')
  })

  it('CONSELHEIRO sem ajuste não tem dbv.editar', () => {
    const efetivas = permissoesEfetivas('CONSELHEIRO', [])
    expect(efetivas).not.toContain('dbv.editar')
    expect(efetivas).toContain('dbv.ver_contato')
  })

  it('CONSELHEIRO com ajuste dbv.editar=true passa a ter', () => {
    expect(permissoesEfetivas('CONSELHEIRO', [{ permissao: 'dbv.editar', concedida: true }])).toContain('dbv.editar')
  })

  it('ajuste de permissão que não se aplica ao papel é ignorado', () => {
    expect(permissoesEfetivas('CONSELHEIRO', [{ permissao: 'usuario.gerenciar', concedida: true }])).not.toContain(
      'usuario.gerenciar',
    )
  })

  it('ajuste de chave inexistente é ignorado', () => {
    expect(permissoesEfetivas('INSTRUTOR', [{ permissao: 'nao.existe', concedida: true }])).not.toContain('nao.existe')
  })

  it('ajuste concedida=false desliga uma permissão que começa ligada', () => {
    expect(permissoesEfetivas('INSTRUTOR', [{ permissao: 'aula.registrar', concedida: false }])).not.toContain(
      'aula.registrar',
    )
  })

  it('INSTRUTOR não vê contato do responsável', () => {
    expect(permissoesEfetivas('INSTRUTOR', [])).not.toContain('dbv.ver_contato')
  })
})

describe('permissaoSeAplica', () => {
  it('distingue desligada de inexistente para o papel', () => {
    expect(permissaoSeAplica('CONSELHEIRO', 'dbv.editar')).toBe(true)
    expect(permissaoSeAplica('CONSELHEIRO', 'usuario.gerenciar')).toBe(false)
    expect(permissaoSeAplica('INSTRUTOR', 'nao.existe')).toBe(false)
  })
})
