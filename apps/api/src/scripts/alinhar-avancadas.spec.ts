import { classeOficial, criarClube, criarUsuario, criarVinculo, desconectarPrismaDeTeste, prismaDeTeste } from '../../test/fabricas'
import { alinharAvancadas } from './alinhar-avancadas'

describe('avancadas:alinhar', () => {
  const prisma = prismaDeTeste()
  afterAll(async () => desconectarPrismaDeTeste())

  async function cenarioDivergente() {
    const clube = await criarClube()
    const regular = await classeOficial('Amigo')
    const guia = await classeOficial('Guia')
    const avancada = await prisma.classe.findFirstOrThrow({ where: { tipo: 'AVANCADA', classeBaseId: regular.id, clubeId: null }, select: { id: true } })
    const avancadaDoGuia = await prisma.classe.findFirstOrThrow({ where: { tipo: 'AVANCADA', classeBaseId: guia.id, clubeId: null }, select: { id: true } })
    const comRegular = await criarVinculo({ usuarioId: (await criarUsuario()).id, clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [regular.id] })
    const soComAvancada = await criarVinculo({ usuarioId: (await criarUsuario()).id, clubeId: clube.id, papel: 'INSTRUTOR', classeIds: [avancada.id] })
    await prisma.classeClube.update({
      where: { clubeId_classeId: { clubeId: clube.id, classeId: regular.id } },
      data: { quemMontaCronograma: 'INSTRUTOR' },
    })
    return { clube, regular, avancada, avancadaDoGuia, comRegular, soComAvancada }
  }

  const vinculosDa = async (classeId: string, clubeId: string) =>
    (await prisma.vinculoClasse.findMany({ where: { classeId, vinculo: { clubeId } } })).map((l) => l.vinculoId).sort()

  it('alinha a avançada à regular; a segunda execução não muda nada', async () => {
    const { clube, avancada, comRegular } = await cenarioDivergente()

    const primeira = await alinharAvancadas(prisma, { seco: false, clubeId: clube.id })
    expect(primeira).toMatchObject({ vinculosCriados: 1, vinculosRemovidos: 1, quemMontaAlterado: 1 })
    expect(await vinculosDa(avancada.id, clube.id)).toEqual([comRegular.id])
    const linha = await prisma.classeClube.findUniqueOrThrow({ where: { clubeId_classeId: { clubeId: clube.id, classeId: avancada.id } } })
    expect(linha.quemMontaCronograma).toBe('INSTRUTOR')

    const segunda = await alinharAvancadas(prisma, { seco: false, clubeId: clube.id })
    expect(segunda).toMatchObject({ vinculosCriados: 0, vinculosRemovidos: 0, quemMontaAlterado: 0 })
  })

  it('--seco relata o que mudaria e não grava', async () => {
    const { clube, avancada, soComAvancada } = await cenarioDivergente()

    const relato = await alinharAvancadas(prisma, { seco: true, clubeId: clube.id })
    expect(relato).toMatchObject({ vinculosCriados: 1, vinculosRemovidos: 1, quemMontaAlterado: 1 })
    expect(await vinculosDa(avancada.id, clube.id)).toEqual([soComAvancada.id])
    const linha = await prisma.classeClube.findUniqueOrThrow({ where: { clubeId_classeId: { clubeId: clube.id, classeId: avancada.id } } })
    expect(linha.quemMontaCronograma).toBe('ADM')
  })
})
