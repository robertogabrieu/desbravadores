import type { INestApplication } from '@nestjs/common'
import type { Aviso, DesbravadorSaida } from '@desbravadores/shared'
import type { z } from 'zod'
import { criarAppDeTeste } from '../../test/app'
import {
  classeOficial,
  criarAcesso,
  criarClube,
  criarDbv,
  criarMatricula,
  criarMembro,
  criarUnidade,
  criarUsuario,
  criarVinculo,
  desconectarPrismaDeTeste,
  prismaDeTeste,
} from '../../test/fabricas'
import { anoCorrente, clienteHttp, corpo, hoje } from '../../test/p6'

type Dbv = z.infer<typeof DesbravadorSaida>
type Pagina = { itens: Dbv[]; total: number; pagina: number; porPagina: number }
type ComAvisos = { dados: Dbv; avisos: z.infer<typeof Aviso>[] }
type Papel = 'ADM' | 'CONSELHEIRO' | 'INSTRUTOR'

const anoDeHoje = (): number => Number(hoje().slice(0, 4))
/** Faz 16 em 30/06 do ano corrente: o último nascimento que entra pela idade. */
const nasceuNoLimite = (): string => `${anoDeHoje() - 16}-06-30`
const crianca = (): string => `${anoDeHoje() - 11}-03-10`
const dataCivil = (civil: string): Date => new Date(`${civil}T00:00:00Z`)
const base = { nome: 'Maria da Silva', sexo: 'F' as const, entradaEm: '2026-02-01' }

describe('Tipo DIRETORIA: motivos, filtro, regras do Adm e gatilhos', () => {
  let app: INestApplication
  const api = clienteHttp(() => app)

  beforeAll(async () => {
    app = await criarAppDeTeste()
  })

  afterAll(async () => {
    await app.close()
    await desconectarPrismaDeTeste()
  })

  async function cenario() {
    const clube = await criarClube()
    const adm = await criarAcesso({ clubeId: clube.id, papel: 'ADM' })
    const unidade = await criarUnidade({ clubeId: clube.id })
    return { clube, adm, unidade }
  }

  async function comConta(
    clubeId: string,
    papeis: { papel: Papel; clubeId?: string; ativo?: boolean }[],
    dados: { tipo?: 'DBV' | 'DIRETORIA' | 'LIDER' } = {},
  ) {
    const usuario = await criarUsuario()
    for (const p of papeis) await criarVinculo({ usuarioId: usuario.id, clubeId: p.clubeId ?? clubeId, papel: p.papel, ativo: p.ativo })
    const dbv = await criarDbv({ clubeId, usuarioId: usuario.id, nascimento: crianca(), tipo: dados.tipo })
    return { usuario, dbv }
  }

  async function naUnidade(clubeId: string, unidadeId: string, nascimento = crianca()) {
    const dbv = await criarDbv({ clubeId, nascimento })
    await criarMembro({ dbvId: dbv.id, unidadeId, inicio: '2026-02-01' })
    return dbv
  }

  const lerFicha = (id: string) =>
    prismaDeTeste().desbravador.findUniqueOrThrow({
      where: { id },
      select: { tipo: true, diretoriaPeloAdm: true, diretoriaDesde: true, membros: { select: { fim: true } } },
    })

  const detalhe = async (id: string, autorizacao: string): Promise<Dbv> =>
    corpo<Dbv>(await api.get(`/api/desbravadores/${id}`, autorizacao).expect(200))

  describe('saída e filtro', () => {
    it('motivos: idade, papel e Adm; vazios para DBV e para o Líder conselheiro', async () => {
      const { clube, adm } = await cenario()
      const pelaIdade = await criarDbv({ clubeId: clube.id, tipo: 'DIRETORIA', nascimento: nasceuNoLimite() })
      const conselheiro = (await comConta(clube.id, [{ papel: 'CONSELHEIRO' }, { papel: 'INSTRUTOR' }], { tipo: 'DIRETORIA' })).dbv
      const peloAdm = await criarDbv({ clubeId: clube.id, tipo: 'DIRETORIA', nascimento: crianca() })
      await prismaDeTeste().desbravador.update({ where: { id: peloAdm.id }, data: { diretoriaPeloAdm: true } })
      const lider = (await comConta(clube.id, [{ papel: 'CONSELHEIRO' }], { tipo: 'LIDER' })).dbv
      const dbv = await criarDbv({ clubeId: clube.id })

      expect((await detalhe(pelaIdade.id, adm.autorizacao)).motivosDiretoria).toEqual(['IDADE'])
      expect((await detalhe(conselheiro.id, adm.autorizacao)).motivosDiretoria).toEqual(['CONSELHEIRO', 'INSTRUTOR'])
      expect((await detalhe(peloAdm.id, adm.autorizacao)).motivosDiretoria).toEqual(['ADM'])
      expect((await detalhe(lider.id, adm.autorizacao)).motivosDiretoria).toEqual([])
      const lista = corpo<Pagina>(await api.get('/api/desbravadores', adm.autorizacao).expect(200))
      expect(lista.itens.find((i) => i.id === dbv.id)?.motivosDiretoria).toEqual([])
      expect(lista.itens.find((i) => i.id === pelaIdade.id)).toMatchObject({ tipo: 'DIRETORIA', motivosDiretoria: ['IDADE'] })
    })

    it('vínculo inativo, papel ADM e vínculo de outro clube não são motivo', async () => {
      const { clube, adm } = await cenario()
      const outro = await criarClube()
      const { dbv } = await comConta(
        clube.id,
        [{ papel: 'CONSELHEIRO', ativo: false }, { papel: 'ADM' }, { papel: 'INSTRUTOR', clubeId: outro.id }],
        { tipo: 'DIRETORIA' },
      )
      expect((await detalhe(dbv.id, adm.autorizacao)).motivosDiretoria).toEqual([])
    })

    it('filtro tipo=DIRETORIA pagina sobre o resultado e não traz outro clube', async () => {
      const { clube, adm } = await cenario()
      const outro = await criarClube()
      const diretoria = [
        await criarDbv({ clubeId: clube.id, tipo: 'DIRETORIA' }),
        await criarDbv({ clubeId: clube.id, tipo: 'DIRETORIA' }),
        await criarDbv({ clubeId: clube.id, tipo: 'DIRETORIA' }),
      ]
      await criarDbv({ clubeId: clube.id })
      await criarDbv({ clubeId: clube.id, tipo: 'LIDER' })
      await criarDbv({ clubeId: outro.id, tipo: 'DIRETORIA' })

      const p1 = corpo<Pagina>(await api.get('/api/desbravadores?tipo=DIRETORIA&porPagina=2&pagina=1', adm.autorizacao).expect(200))
      const p2 = corpo<Pagina>(await api.get('/api/desbravadores?tipo=DIRETORIA&porPagina=2&pagina=2', adm.autorizacao).expect(200))
      expect(p1.total).toBe(3)
      expect([...p1.itens, ...p2.itens].map((i) => i.id).sort()).toEqual(diretoria.map((d) => d.id).sort())
    })
  })

  describe('cadastro', () => {
    it('16 até junho entra como Diretoria desde a entrada, sem unidade e com aviso; menor fica DBV na unidade', async () => {
      const { clube, adm, unidade } = await cenario()
      const maior = corpo<ComAvisos>(
        await api
          .post('/api/desbravadores', adm.autorizacao, { ...base, nascimento: nasceuNoLimite(), unidadeId: unidade.id })
          .expect(201),
      )
      expect(maior.dados).toMatchObject({ tipo: 'DIRETORIA', unidade: null, motivosDiretoria: ['IDADE'] })
      expect(maior.avisos).toContainEqual({ codigo: 'AVISO_DIRETORIA_SEM_UNIDADE', mensagem: 'Diretoria não entra em unidade.' })
      expect(await lerFicha(maior.dados.id)).toEqual({
        tipo: 'DIRETORIA',
        diretoriaPeloAdm: false,
        diretoriaDesde: dataCivil('2026-02-01'),
        membros: [],
      })

      const menor = corpo<ComAvisos>(
        await api.post('/api/desbravadores', adm.autorizacao, { ...base, nascimento: crianca(), unidadeId: unidade.id }).expect(201),
      )
      expect(menor.dados).toMatchObject({ tipo: 'DBV', unidade: { id: unidade.id } })
      expect(await prismaDeTeste().membroUnidade.count({ where: { clubeId: clube.id } })).toBe(1)
    })

    it('conta de conselheiro ligada no cadastro já entra como Diretoria', async () => {
      const { clube, adm } = await cenario()
      const usuario = await criarUsuario()
      await criarVinculo({ usuarioId: usuario.id, clubeId: clube.id, papel: 'CONSELHEIRO' })
      const criado = corpo<ComAvisos>(
        await api.post('/api/desbravadores', adm.autorizacao, { ...base, nascimento: crianca(), usuarioId: usuario.id }).expect(201),
      )
      expect(criado.dados).toMatchObject({ tipo: 'DIRETORIA', motivosDiretoria: ['CONSELHEIRO'] })
    })

    it('Adm marca Diretoria em quem não tem a regra (motivo ADM); Diretoria com unidade é recusada', async () => {
      const { clube, adm, unidade } = await cenario()
      const criado = corpo<ComAvisos>(
        await api.post('/api/desbravadores', adm.autorizacao, { ...base, nascimento: crianca(), tipo: 'DIRETORIA' }).expect(201),
      )
      expect(criado.dados).toMatchObject({ tipo: 'DIRETORIA', motivosDiretoria: ['ADM'] })
      expect((await lerFicha(criado.dados.id)).diretoriaPeloAdm).toBe(true)

      const comUnidade = { ...base, nome: 'Outra Pessoa', nascimento: crianca(), tipo: 'DIRETORIA', unidadeId: unidade.id }
      await api.post('/api/desbravadores', adm.autorizacao, comUnidade).expect(422)
      expect(await prismaDeTeste().desbravador.count({ where: { clubeId: clube.id } })).toBe(1)
    })
  })

  describe('edição pelo Adm', () => {
    it('trocar para Diretoria encerra a unidade hoje, grava a data e mantém a matrícula', async () => {
      const { clube, adm, unidade } = await cenario()
      const dbv = await naUnidade(clube.id, unidade.id)
      const amigo = await classeOficial('Amigo')
      await criarMatricula({ clubeId: clube.id, dbvId: dbv.id, classeId: amigo.id, anoClube: anoCorrente() })

      const saida = corpo<ComAvisos>(await api.patch(`/api/desbravadores/${dbv.id}`, adm.autorizacao, { tipo: 'DIRETORIA' }).expect(200))

      expect(saida.dados).toMatchObject({ tipo: 'DIRETORIA', unidade: null, motivosDiretoria: ['ADM'], classeAtual: { id: amigo.id } })
      expect(await lerFicha(dbv.id)).toEqual({
        tipo: 'DIRETORIA',
        diretoriaPeloAdm: true,
        diretoriaDesde: dataCivil(hoje()),
        membros: [{ fim: dataCivil(hoje()) }],
      })
    })

    it('voltar a Desbravador com a regra valendo: 422 com o motivo; sem a regra, volta sem unidade e sem as colunas', async () => {
      const { clube, adm } = await cenario()
      const pelaIdade = await criarDbv({ clubeId: clube.id, tipo: 'DIRETORIA', nascimento: nasceuNoLimite() })
      const conselheiro = (await comConta(clube.id, [{ papel: 'CONSELHEIRO' }], { tipo: 'DIRETORIA' })).dbv
      const peloAdm = await criarDbv({ clubeId: clube.id, tipo: 'DIRETORIA', nascimento: crianca() })
      await prismaDeTeste().desbravador.update({
        where: { id: peloAdm.id },
        data: { diretoriaPeloAdm: true, diretoriaDesde: dataCivil('2026-03-01') },
      })

      const idade = await api.patch(`/api/desbravadores/${pelaIdade.id}`, adm.autorizacao, { tipo: 'DBV' }).expect(422)
      expect(idade.body).toMatchObject({ mensagem: 'Tem 16 anos até junho: é Diretoria automaticamente.' })
      const papel = await api.patch(`/api/desbravadores/${conselheiro.id}`, adm.autorizacao, { tipo: 'DBV' }).expect(422)
      expect(papel.body).toMatchObject({ mensagem: 'É conselheiro ou instrutor: é Diretoria obrigatoriamente.' })
      expect((await lerFicha(pelaIdade.id)).tipo).toBe('DIRETORIA')

      await api.patch(`/api/desbravadores/${peloAdm.id}`, adm.autorizacao, { tipo: 'DBV' }).expect(200)
      expect(await lerFicha(peloAdm.id)).toEqual({ tipo: 'DBV', diretoriaPeloAdm: false, diretoriaDesde: null, membros: [] })
    })

    it('Líder para quem tem a regra: zera as colunas e encerra a unidade', async () => {
      const { clube, adm, unidade } = await cenario()
      const dbv = await naUnidade(clube.id, unidade.id, nasceuNoLimite())

      const saida = corpo<ComAvisos>(await api.patch(`/api/desbravadores/${dbv.id}`, adm.autorizacao, { tipo: 'LIDER' }).expect(200))

      expect(saida.dados).toMatchObject({ tipo: 'LIDER', unidade: null, motivosDiretoria: [] })
      expect(await lerFicha(dbv.id)).toEqual({
        tipo: 'LIDER',
        diretoriaPeloAdm: false,
        diretoriaDesde: null,
        membros: [{ fim: dataCivil(hoje()) }],
      })
    })

    it('nascimento editado decide o Tipo: passa a 16 até junho vira Diretoria; corrigido para menor volta a DBV', async () => {
      const { clube, adm, unidade } = await cenario()
      const dbv = await naUnidade(clube.id, unidade.id)

      await api.patch(`/api/desbravadores/${dbv.id}`, adm.autorizacao, { nascimento: nasceuNoLimite() }).expect(200)
      expect(await lerFicha(dbv.id)).toMatchObject({ tipo: 'DIRETORIA', diretoriaPeloAdm: false, membros: [{ fim: dataCivil(hoje()) }] })

      const saida = corpo<ComAvisos>(
        await api.patch(`/api/desbravadores/${dbv.id}`, adm.autorizacao, { nascimento: crianca(), tipo: 'DIRETORIA' }).expect(200),
      )
      expect(saida.dados).toMatchObject({ tipo: 'DBV', unidade: null })
    })

    it('Diretoria não entra em unidade pela troca de unidade', async () => {
      const { clube, adm, unidade } = await cenario()
      const dbv = await criarDbv({ clubeId: clube.id, tipo: 'DIRETORIA' })
      await api.put(`/api/desbravadores/${dbv.id}/unidade`, adm.autorizacao, { unidadeId: unidade.id, desde: hoje() }).expect(422)
    })

    it('ficha de outro clube: 404 e nada muda', async () => {
      const { adm } = await cenario()
      const outro = await criarClube()
      const alheia = await criarDbv({ clubeId: outro.id })
      await api.patch(`/api/desbravadores/${alheia.id}`, adm.autorizacao, { tipo: 'DIRETORIA' }).expect(404)
      expect((await lerFicha(alheia.id)).tipo).toBe('DBV')
    })
  })

  describe('papel dado, alterado ou desativado', () => {
    it('papel de conselheiro dado à conta faz a ficha Diretoria e encerra a unidade; desativar o vínculo a devolve a DBV', async () => {
      const { clube, adm, unidade } = await cenario()
      const usuario = await criarUsuario()
      const dbv = await criarDbv({ clubeId: clube.id, usuarioId: usuario.id, nascimento: crianca() })
      await criarMembro({ dbvId: dbv.id, unidadeId: unidade.id, inicio: '2026-02-01' })
      await criarVinculo({ usuarioId: usuario.id, clubeId: clube.id, papel: 'ADM' })

      const novo = { papel: 'CONSELHEIRO', unidadeIds: [unidade.id] }
      await api.post(`/api/usuarios/${usuario.id}/vinculos`, adm.autorizacao, novo).expect(201)
      expect(await lerFicha(dbv.id)).toMatchObject({ tipo: 'DIRETORIA', membros: [{ fim: dataCivil(hoje()) }] })

      const vinculo = await prismaDeTeste().vinculo.findFirstOrThrow({ where: { usuarioId: usuario.id, papel: 'CONSELHEIRO' } })
      await api.put(`/api/vinculos/${vinculo.id}`, adm.autorizacao, { ativo: false }).expect(200)
      expect(await lerFicha(dbv.id)).toMatchObject({ tipo: 'DBV', diretoriaDesde: null })
    })

    it('desativar o usuário devolve a DBV a Diretoria que era só pelo papel', async () => {
      const { clube, adm } = await cenario()
      const { usuario, dbv } = await comConta(clube.id, [{ papel: 'INSTRUTOR' }], { tipo: 'DIRETORIA' })
      await api.post(`/api/usuarios/${usuario.id}/desativar`, adm.autorizacao).expect(200)
      expect((await lerFicha(dbv.id)).tipo).toBe('DBV')
    })

    it('e-mail existente cadastrado como instrutor: a ficha ligada vira Diretoria', async () => {
      const { clube, adm } = await cenario()
      const { usuario, dbv } = await comConta(clube.id, [{ papel: 'ADM' }])
      const corpoDoPedido = { nome: usuario.nome, email: usuario.email, vinculos: [{ papel: 'INSTRUTOR' }] }
      await api.post('/api/usuarios', adm.autorizacao, corpoDoPedido).expect(201)
      expect((await lerFicha(dbv.id)).tipo).toBe('DIRETORIA')
    })

    it('papel em outro clube não mexe na ficha deste clube', async () => {
      const { clube } = await cenario()
      const outro = await criarClube()
      const admDoOutro = await criarAcesso({ clubeId: outro.id, papel: 'ADM' })
      const { usuario, dbv } = await comConta(clube.id, [{ papel: 'ADM' }])
      await criarVinculo({ usuarioId: usuario.id, clubeId: outro.id, papel: 'ADM' })

      await api.post(`/api/usuarios/${usuario.id}/vinculos`, admDoOutro.autorizacao, { papel: 'CONSELHEIRO' }).expect(201)
      expect((await lerFicha(dbv.id)).tipo).toBe('DBV')
    })
  })
  describe('véspera da entrada gravada na troca de Tipo', () => {
    const lerVespera = (id: string) =>
      prismaDeTeste().desbravador.findUniqueOrThrow({
        where: { id },
        select: { diretoriaVeioDeDbv: true, diretoriaUnidadeAnteriorId: true },
      })
    const trocar = (id: string, autorizacao: string, tipo: 'DBV' | 'DIRETORIA' | 'LIDER') =>
      api.patch(`/api/desbravadores/${id}`, autorizacao, { tipo }).expect(200)

    it('DBV na unidade grava que veio de DBV e a unidade aberta; sem unidade, grava só que veio de DBV', async () => {
      const { clube, adm, unidade } = await cenario()
      const naUnidadeHoje = await naUnidade(clube.id, unidade.id)
      const semUnidade = await criarDbv({ clubeId: clube.id, nascimento: crianca() })

      await trocar(naUnidadeHoje.id, adm.autorizacao, 'DIRETORIA')
      await trocar(semUnidade.id, adm.autorizacao, 'DIRETORIA')

      expect(await lerVespera(naUnidadeHoje.id)).toEqual({ diretoriaVeioDeDbv: true, diretoriaUnidadeAnteriorId: unidade.id })
      expect(await lerVespera(semUnidade.id)).toEqual({ diretoriaVeioDeDbv: true, diretoriaUnidadeAnteriorId: null })
    })

    it('a unidade gravada é a da passagem aberta na troca, mesmo que comece no futuro', async () => {
      const { clube, adm, unidade } = await cenario()
      const futura = await criarUnidade({ clubeId: clube.id })
      const dbv = await naUnidade(clube.id, unidade.id)
      const depois = `${anoDeHoje() + 1}-01-10`
      await api.put(`/api/desbravadores/${dbv.id}/unidade`, adm.autorizacao, { unidadeId: futura.id, desde: depois }).expect(200)

      await trocar(dbv.id, adm.autorizacao, 'DIRETORIA')

      expect(await lerVespera(dbv.id)).toEqual({ diretoriaVeioDeDbv: true, diretoriaUnidadeAnteriorId: futura.id })
    })

    it('Líder que passa a Diretoria grava que não veio de DBV', async () => {
      const { clube, adm, unidade } = await cenario()
      const dbv = await naUnidade(clube.id, unidade.id)
      await trocar(dbv.id, adm.autorizacao, 'LIDER')
      await trocar(dbv.id, adm.autorizacao, 'DIRETORIA')
      expect(await lerVespera(dbv.id)).toEqual({ diretoriaVeioDeDbv: false, diretoriaUnidadeAnteriorId: null })
    })

    it('sair da Diretoria zera os dois campos, para Desbravador ou para Líder', async () => {
      const { clube, adm, unidade } = await cenario()
      const voltaADbv = await naUnidade(clube.id, unidade.id)
      const viraLider = await naUnidade(clube.id, unidade.id)
      for (const dbv of [voltaADbv, viraLider]) await trocar(dbv.id, adm.autorizacao, 'DIRETORIA')

      await trocar(voltaADbv.id, adm.autorizacao, 'DBV')
      await trocar(viraLider.id, adm.autorizacao, 'LIDER')

      const zerada = { diretoriaVeioDeDbv: false, diretoriaUnidadeAnteriorId: null }
      expect(await lerVespera(voltaADbv.id)).toEqual(zerada)
      expect(await lerVespera(viraLider.id)).toEqual(zerada)
    })

    it('a regra também grava: papel de conselheiro dado à conta; papel tirado zera', async () => {
      const { clube, adm, unidade } = await cenario()
      const usuario = await criarUsuario()
      const dbv = await criarDbv({ clubeId: clube.id, usuarioId: usuario.id, nascimento: crianca() })
      await criarMembro({ dbvId: dbv.id, unidadeId: unidade.id, inicio: '2026-02-01' })
      await criarVinculo({ usuarioId: usuario.id, clubeId: clube.id, papel: 'ADM' })

      await api.post(`/api/usuarios/${usuario.id}/vinculos`, adm.autorizacao, { papel: 'CONSELHEIRO', unidadeIds: [unidade.id] }).expect(201)
      expect(await lerVespera(dbv.id)).toEqual({ diretoriaVeioDeDbv: true, diretoriaUnidadeAnteriorId: unidade.id })

      const vinculo = await prismaDeTeste().vinculo.findFirstOrThrow({ where: { usuarioId: usuario.id, papel: 'CONSELHEIRO' } })
      await api.put(`/api/vinculos/${vinculo.id}`, adm.autorizacao, { ativo: false }).expect(200)
      expect(await lerVespera(dbv.id)).toEqual({ diretoriaVeioDeDbv: false, diretoriaUnidadeAnteriorId: null })
    })

    it('cadastro direto como Diretoria não veio de DBV', async () => {
      const { adm, unidade } = await cenario()
      const criado = corpo<ComAvisos>(
        await api.post('/api/desbravadores', adm.autorizacao, { ...base, nascimento: nasceuNoLimite(), unidadeId: unidade.id }).expect(201),
      )
      expect(await lerVespera(criado.dados.id)).toEqual({ diretoriaVeioDeDbv: false, diretoriaUnidadeAnteriorId: null })
    })
  })
})
