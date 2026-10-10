import { createHash } from 'node:crypto'
import { JwtService } from '@nestjs/jwt'
import { ErroApp } from '../comum/erros'
import { PrismaSistema } from '../comum/prisma/prisma-sistema'
import { criarClube, criarSubstituicao, criarUnidade, criarUsuario, criarVinculo, prismaDeTeste } from '../../test/fabricas'
import { ServicoAccessToken } from './access-token.service'
import { ServicoRefresh } from './refresh.service'
import { ServicoSessao } from './sessao.service'
import { hashDoToken } from './tokens'
import { ServicoTokenUsoUnico } from './token-uso-unico.service'

const SEGUNDO = 1000
const MINUTO = 60 * SEGUNDO
const HORA = 60 * MINUTO
const DIA = 24 * HORA

async function codigoDoErro(promessa: Promise<unknown>): Promise<string> {
  try {
    await promessa
  } catch (erro) {
    if (erro instanceof ErroApp) return erro.codigo
    throw erro
  }
  throw new Error('nao lancou')
}

describe('sessao', () => {
  let prisma: PrismaSistema
  let access: ServicoAccessToken
  let tokens: ServicoTokenUsoUnico
  let refresh: ServicoRefresh
  let sessao: ServicoSessao

  beforeAll(() => {
    prisma = prismaDeTeste()
    access = new ServicoAccessToken(new JwtService({ secret: process.env['JWT_SEGREDO'] }))
    tokens = new ServicoTokenUsoUnico(prisma)
    sessao = new ServicoSessao(prisma)
    refresh = new ServicoRefresh(prisma, sessao)
  })

  describe('access token', () => {
    it('leva so sub e vinculoId, e vale 15 minutos', () => {
      const jwt = access.emitir({ usuarioId: 'u1', vinculoId: 'v1' })
      const carga = JSON.parse(Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString()) as Record<
        string,
        number | string
      >
      expect(Object.keys(carga).sort()).toEqual(['exp', 'iat', 'sub', 'vinculoId'])
      expect(Number(carga['exp']) - Number(carga['iat'])).toBe(900)
      expect(access.verificar(jwt)).toEqual({ usuarioId: 'u1', vinculoId: 'v1' })
    })

    it('aceita vinculoId nulo', () => {
      const jwt = access.emitir({ usuarioId: 'u1', vinculoId: null })
      expect(access.verificar(jwt)).toEqual({ usuarioId: 'u1', vinculoId: null })
    })

    it('recusa token expirado, adulterado ou assinado com outro segredo', () => {
      const antigo = access.emitir({ usuarioId: 'u1', vinculoId: null }, new Date(Date.now() - 20 * MINUTO))
      const alheio = new ServicoAccessToken(new JwtService({ secret: 'outro-segredo' })).emitir({
        usuarioId: 'u1',
        vinculoId: null,
      })
      const bom = access.emitir({ usuarioId: 'u1', vinculoId: null })
      for (const ruim of [antigo, alheio, `${bom}x`, 'lixo', '']) {
        expect(() => access.verificar(ruim)).toThrow(ErroApp)
        try {
          access.verificar(ruim)
        } catch (erro) {
          expect((erro as ErroApp).codigo).toBe('NAO_AUTENTICADO')
        }
      }
    })
  })

  describe('credencial de substituicao', () => {
    it('leva sub e tipo, e vale ate o fim do envio', () => {
      const validadeAte = new Date(Date.now() + 5 * HORA)
      const jwt = access.emitirSubstituicao('s1', validadeAte)
      const carga = JSON.parse(Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString()) as Record<
        string,
        number | string
      >
      expect(Object.keys(carga).sort()).toEqual(['exp', 'iat', 'sub', 'tipo'])
      expect(carga['tipo']).toBe('substituicao')
      expect(carga['exp']).toBe(Math.floor(validadeAte.getTime() / 1000))
      expect(access.verificarSubstituicao(jwt)).toEqual({ substituicaoId: 's1' })
    })

    it('verificar() recusa qualquer carga com tipo, inclusive a de substituicao', () => {
      const jwt = new JwtService({ secret: process.env['JWT_SEGREDO'] })
      const comTipo = jwt.sign({ sub: 'u1', vinculoId: 'v1', tipo: 'outro' }, { expiresIn: 60 })
      const deSubstituicao = access.emitirSubstituicao('s1', new Date(Date.now() + HORA))
      for (const token of [comTipo, deSubstituicao]) {
        expect(() => access.verificar(token)).toThrow(ErroApp)
      }
    })

    it('verificarSubstituicao() recusa a sessao normal e outro tipo; expirada vira SUBSTITUICAO_ENCERRADA', () => {
      const jwt = new JwtService({ secret: process.env['JWT_SEGREDO'] })
      const normal = access.emitir({ usuarioId: 'u1', vinculoId: 'v1' })
      const outroTipo = jwt.sign({ sub: 's1', tipo: 'outro' }, { expiresIn: 60 })
      for (const token of [normal, outroTipo, 'lixo']) {
        try {
          access.verificarSubstituicao(token)
          throw new Error('nao lancou')
        } catch (erro) {
          expect((erro as ErroApp).codigo).toBe('NAO_AUTENTICADO')
        }
      }
      const vencida = access.emitirSubstituicao('s1', new Date(Date.now() - MINUTO), new Date(Date.now() - HORA))
      try {
        access.verificarSubstituicao(vencida)
        throw new Error('nao lancou')
      } catch (erro) {
        expect((erro as ErroApp).codigo).toBe('SUBSTITUICAO_ENCERRADA')
      }
    })
  })

  describe('carregarSubstituicao', () => {
    it('prazo de leitura e o fim; de gravacao, o fim do envio; antes do inicio, nada', async () => {
      const clube = await criarClube()
      const unidade = await criarUnidade({ clubeId: clube.id })
      const substituicao = await criarSubstituicao({ clubeId: clube.id, tipo: 'CHAMADA', unidadeId: unidade.id })
      const em = (deslocamento: number, base: Date): Date => new Date(base.getTime() + deslocamento)

      const aberta = await sessao.carregarSubstituicao(substituicao.id, 'LEITURA', em(-SEGUNDO, substituicao.fimEm))
      expect(aberta).toEqual({
        substituicaoId: substituicao.id,
        usuarioId: substituicao.substitutoId,
        clubeId: clube.id,
        papel: 'CONSELHEIRO',
        unidadeId: unidade.id,
        classeId: null,
        data: substituicao.data.toISOString().slice(0, 10),
      })
      expect(await codigoDoErro(sessao.carregarSubstituicao(substituicao.id, 'LEITURA', substituicao.fimEm))).toBe(
        'SUBSTITUICAO_ENCERRADA',
      )
      await sessao.carregarSubstituicao(substituicao.id, 'GRAVACAO', em(-SEGUNDO, substituicao.fimEnvioEm))
      expect(
        await codigoDoErro(sessao.carregarSubstituicao(substituicao.id, 'GRAVACAO', substituicao.fimEnvioEm)),
      ).toBe('SUBSTITUICAO_ENCERRADA')
      expect(
        await codigoDoErro(sessao.carregarSubstituicao(substituicao.id, 'GRAVACAO', em(-SEGUNDO, substituicao.inicioEm))),
      ).toBe('SUBSTITUICAO_ENCERRADA')
    })

    it('inexistente, cancelada, sem aparelho ou sem autor: SUBSTITUICAO_ENCERRADA', async () => {
      const clube = await criarClube()
      const unidade = await criarUnidade({ clubeId: clube.id })
      const base = { clubeId: clube.id, tipo: 'CHAMADA' as const, unidadeId: unidade.id }
      const ids = [
        '01900000-0000-7000-8000-000000000000',
        (await criarSubstituicao({ ...base, cancelada: true })).id,
        (await criarSubstituicao({ ...base, aparelhoHash: null })).id,
        (await criarSubstituicao({ ...base, substitutoId: null })).id,
      ]
      for (const id of ids) {
        expect(await codigoDoErro(sessao.carregarSubstituicao(id, 'LEITURA'))).toBe('SUBSTITUICAO_ENCERRADA')
      }
    })
  })

  describe('token de uso unico', () => {
    it('gera 32 bytes em base64url e guarda so o SHA-256', async () => {
      const usuario = await criarUsuario()
      const token = await tokens.gerar(usuario.id, 'CONVITE')
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
      const linha = await prisma.tokenUsoUnico.findFirstOrThrow({ where: { usuarioId: usuario.id } })
      expect(linha.tokenHash).toBe(createHash('sha256').update(token).digest('hex'))
      expect(linha.tokenHash).toBe(hashDoToken(token))
      expect(linha.tokenHash).not.toContain(token)
    })

    it('consome uma vez so', async () => {
      const usuario = await criarUsuario()
      const token = await tokens.gerar(usuario.id, 'SENHA')
      expect(await tokens.consumir(token, 'SENHA')).toBe(usuario.id)
      expect(await codigoDoErro(tokens.consumir(token, 'SENHA'))).toBe('TOKEN_INVALIDO')
    })

    it('recusa token inexistente e finalidade errada', async () => {
      const usuario = await criarUsuario()
      const token = await tokens.gerar(usuario.id, 'CONVITE')
      expect(await codigoDoErro(tokens.consumir('nao-existe', 'CONVITE'))).toBe('TOKEN_INVALIDO')
      expect(await codigoDoErro(tokens.consumir(token, 'SENHA'))).toBe('TOKEN_INVALIDO')
      expect(await tokens.consumir(token, 'CONVITE')).toBe(usuario.id)
    })

    it('convite vale 7 dias', async () => {
      const usuario = await criarUsuario()
      const agora = new Date()
      const valido = await tokens.gerar(usuario.id, 'CONVITE', agora)
      expect(await tokens.consumir(valido, 'CONVITE', new Date(agora.getTime() + 7 * DIA - SEGUNDO))).toBe(
        usuario.id,
      )
      const vencido = await tokens.gerar(usuario.id, 'CONVITE', agora)
      expect(
        await codigoDoErro(tokens.consumir(vencido, 'CONVITE', new Date(agora.getTime() + 7 * DIA + SEGUNDO))),
      ).toBe('TOKEN_INVALIDO')
    })

    it('redefinicao vale 1 hora', async () => {
      const usuario = await criarUsuario()
      const agora = new Date()
      const valido = await tokens.gerar(usuario.id, 'SENHA', agora)
      expect(await tokens.consumir(valido, 'SENHA', new Date(agora.getTime() + HORA - SEGUNDO))).toBe(
        usuario.id,
      )
      const vencido = await tokens.gerar(usuario.id, 'SENHA', agora)
      expect(
        await codigoDoErro(tokens.consumir(vencido, 'SENHA', new Date(agora.getTime() + HORA + SEGUNDO))),
      ).toBe('TOKEN_INVALIDO')
    })

    it('gerar um novo invalida os anteriores da mesma finalidade, e so deles', async () => {
      const usuario = await criarUsuario()
      const outro = await criarUsuario()
      const primeiro = await tokens.gerar(usuario.id, 'CONVITE')
      const senha = await tokens.gerar(usuario.id, 'SENHA')
      const doOutro = await tokens.gerar(outro.id, 'CONVITE')
      const segundo = await tokens.gerar(usuario.id, 'CONVITE')
      expect(await codigoDoErro(tokens.consumir(primeiro, 'CONVITE'))).toBe('TOKEN_INVALIDO')
      expect(await tokens.consumir(segundo, 'CONVITE')).toBe(usuario.id)
      expect(await tokens.consumir(senha, 'SENHA')).toBe(usuario.id)
      expect(await tokens.consumir(doOutro, 'CONVITE')).toBe(outro.id)
    })
  })

  describe('refresh', () => {
    async function usuarioComVinculo(): Promise<{ usuarioId: string; vinculoId: string; clubeId: string }> {
      const clube = await criarClube()
      const usuario = await criarUsuario()
      const vinculo = await criarVinculo({ usuarioId: usuario.id, clubeId: clube.id, papel: 'ADM' })
      return { usuarioId: usuario.id, vinculoId: vinculo.id, clubeId: clube.id }
    }

    it('cria a familia com o vinculo unico ativo, guarda so o hash e vale 30 dias', async () => {
      const { usuarioId, vinculoId } = await usuarioComVinculo()
      const agora = new Date()
      const criado = await refresh.criarFamilia(usuarioId, { agora })
      expect(criado.vinculoId).toBe(vinculoId)
      const linha = await prisma.refreshToken.findFirstOrThrow({ where: { usuarioId } })
      expect(linha.tokenHash).toBe(hashDoToken(criado.token))
      expect(linha.familia).toBe(criado.familia)
      expect(linha.familiaExpiraEm.getTime()).toBe(agora.getTime() + 30 * DIA)
      expect(linha.expiraEm.getTime()).toBe(linha.familiaExpiraEm.getTime())
    })

    it('rotaciona: marca o antigo como usado e emite um sucessor da mesma familia', async () => {
      const { usuarioId, vinculoId } = await usuarioComVinculo()
      const primeiro = await refresh.criarFamilia(usuarioId)
      const segundo = await refresh.rotacionar(primeiro.token)
      expect(segundo.token).not.toBe(primeiro.token)
      expect(segundo.familia).toBe(primeiro.familia)
      expect(segundo.usuarioId).toBe(usuarioId)
      expect(segundo.vinculoId).toBe(vinculoId)
      const antigo = await prisma.refreshToken.findFirstOrThrow({ where: { tokenHash: hashDoToken(primeiro.token) } })
      expect(antigo.usadoEm).not.toBeNull()
      expect(antigo.revogadoEm).toBeNull()
    })

    it('reuso em ate 30 s emite outro sucessor sem revogar a familia', async () => {
      const { usuarioId } = await usuarioComVinculo()
      const agora = new Date()
      const primeiro = await refresh.criarFamilia(usuarioId, { agora })
      const segundo = await refresh.rotacionar(primeiro.token, { agora })
      const terceiro = await refresh.rotacionar(primeiro.token, { agora: new Date(agora.getTime() + 30 * SEGUNDO) })
      expect(terceiro.token).not.toBe(segundo.token)
      expect(terceiro.familia).toBe(primeiro.familia)
      const revogados = await prisma.refreshToken.count({ where: { familia: primeiro.familia, revogadoEm: { not: null } } })
      expect(revogados).toBe(0)
      await refresh.rotacionar(segundo.token, { agora: new Date(agora.getTime() + 31 * SEGUNDO) })
    })

    it('reuso depois de 30 s revoga a familia inteira', async () => {
      const { usuarioId } = await usuarioComVinculo()
      const agora = new Date()
      const primeiro = await refresh.criarFamilia(usuarioId, { agora })
      const segundo = await refresh.rotacionar(primeiro.token, { agora })
      const depois = new Date(agora.getTime() + 31 * SEGUNDO)
      expect(await codigoDoErro(refresh.rotacionar(primeiro.token, { agora: depois }))).toBe('NAO_AUTENTICADO')
      const vivos = await prisma.refreshToken.count({ where: { familia: primeiro.familia, revogadoEm: null } })
      expect(vivos).toBe(0)
      expect(await codigoDoErro(refresh.rotacionar(segundo.token, { agora: depois }))).toBe('NAO_AUTENTICADO')
    })

    it('a familia expira 30 dias depois do login, mesmo com rotacao no meio', async () => {
      const { usuarioId } = await usuarioComVinculo()
      const agora = new Date()
      let atual = await refresh.criarFamilia(usuarioId, { agora })
      for (const dia of [10, 20, 29]) {
        atual = await refresh.rotacionar(atual.token, { agora: new Date(agora.getTime() + dia * DIA) })
      }
      expect(
        await codigoDoErro(refresh.rotacionar(atual.token, { agora: new Date(agora.getTime() + 30 * DIA + SEGUNDO) })),
      ).toBe('NAO_AUTENTICADO')
    })

    it('recusa token desconhecido', async () => {
      expect(await codigoDoErro(refresh.rotacionar('nao-existe'))).toBe('NAO_AUTENTICADO')
    })

    it('escolha do vinculo: o da familia se ativo; senao o unico ativo; senao nulo', async () => {
      const clubeA = await criarClube()
      const clubeB = await criarClube()
      const usuario = await criarUsuario()
      const va = await criarVinculo({ usuarioId: usuario.id, clubeId: clubeA.id, papel: 'ADM' })
      const vb = await criarVinculo({ usuarioId: usuario.id, clubeId: clubeB.id, papel: 'ADM' })

      const semPreferencia = await refresh.criarFamilia(usuario.id)
      expect(semPreferencia.vinculoId).toBeNull()

      const escolhido = await refresh.rotacionar(semPreferencia.token, { vinculoId: vb.id })
      expect(escolhido.vinculoId).toBe(vb.id)
      const mantido = await refresh.rotacionar(escolhido.token)
      expect(mantido.vinculoId).toBe(vb.id)

      await prisma.vinculo.update({ where: { id: vb.id }, data: { ativo: false } })
      const unicoAtivo = await refresh.rotacionar(mantido.token)
      expect(unicoAtivo.vinculoId).toBe(va.id)

      const outroUsuario = await criarUsuario()
      const alheio = await criarVinculo({ usuarioId: outroUsuario.id, clubeId: clubeA.id, papel: 'CONSELHEIRO' })
      expect(await codigoDoErro(refresh.rotacionar(unicoAtivo.token, { vinculoId: alheio.id }))).toBe(
        'VINCULO_INATIVO',
      )
    })

    it('zero vinculos ativos: login e refresh respondem VINCULO_INATIVO', async () => {
      const sem = await criarUsuario()
      expect(await codigoDoErro(refresh.criarFamilia(sem.id))).toBe('VINCULO_INATIVO')

      const { usuarioId, vinculoId } = await usuarioComVinculo()
      const familia = await refresh.criarFamilia(usuarioId)
      await prisma.vinculo.update({ where: { id: vinculoId }, data: { ativo: false } })
      expect(await codigoDoErro(refresh.rotacionar(familia.token))).toBe('VINCULO_INATIVO')
    })

    it('revoga a familia pelo token (logout) e todas as do usuario', async () => {
      const { usuarioId } = await usuarioComVinculo()
      const a = await refresh.criarFamilia(usuarioId)
      const b = await refresh.criarFamilia(usuarioId)
      const c = await refresh.criarFamilia(usuarioId)
      await refresh.revogarFamiliaDoToken(a.token)
      expect(await codigoDoErro(refresh.rotacionar(a.token))).toBe('NAO_AUTENTICADO')
      await refresh.rotacionar(b.token)
      await refresh.revogarFamilias(usuarioId)
      expect(await codigoDoErro(refresh.rotacionar(c.token))).toBe('NAO_AUTENTICADO')
    })
  })

  describe('carregarVinculoAtivo', () => {
    it('devolve clube e papel do banco, e nada para vinculo inativo ou de outro usuario', async () => {
      const clube = await criarClube()
      const usuario = await criarUsuario()
      const outro = await criarUsuario()
      const vinculo = await criarVinculo({ usuarioId: usuario.id, clubeId: clube.id, papel: 'INSTRUTOR' })
      expect(await sessao.carregarVinculoAtivo(usuario.id, vinculo.id)).toEqual({
        vinculoId: vinculo.id,
        clubeId: clube.id,
        papel: 'INSTRUTOR',
      })
      expect(await sessao.carregarVinculoAtivo(outro.id, vinculo.id)).toBeNull()
      await prisma.vinculo.update({ where: { id: vinculo.id }, data: { ativo: false } })
      expect(await sessao.carregarVinculoAtivo(usuario.id, vinculo.id)).toBeNull()
    })
  })
})
