import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/src/generated/**', '**/*.cjs', 'docs/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
    },
  },
  {
    // PrismaSistema e o client sem a guarda de clube: so sessao/, auth/ e scripts/ o importam (SPEC D22).
    files: ['apps/api/src/**/*.ts'],
    ignores: [
      'apps/api/src/{sessao,auth,scripts}/**',
      'apps/api/src/comum/prisma/**',
      'apps/api/src/**/*.spec.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/prisma-sistema', '**/prisma-sistema.js'],
              message: 'PrismaSistema (client sem a guarda de clube) so pode ser importado em sessao/, auth/ e scripts/.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  { files: ['**/*.mjs'], ...tseslint.configs.disableTypeChecked },
)
