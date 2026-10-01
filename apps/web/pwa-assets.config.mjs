import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Fonte: o emblema oficial (marca/emblema-original.png) centrado num quadrado transparente de 1024 px,
// em public/icone-fonte.png. O emblema é um triângulo: onde o ícone precisa de fundo (tela inicial do
// iPhone e ícone adaptável do Android), o fundo é branco, que não briga com o vermelho do emblema.
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    // No Android o ícone adaptável é recortado num círculo de 80%: com 45% de margem, as pontas de cima
    // do triângulo ficam dentro dele.
    maskable: { ...minimal2023Preset.maskable, padding: 0.45, resizeOptions: { background: '#FFFFFF', fit: 'contain' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#FFFFFF', fit: 'contain' } },
  },
  images: ['public/icone-fonte.png'],
})
