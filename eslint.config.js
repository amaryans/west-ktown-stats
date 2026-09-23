import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'scripts'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    // Engines stay pure: no React, no network, no ambient randomness or clock.
    files: [
      'src/features/lottery/engine/**/*.ts',
      'src/features/keepers/engine/**/*.ts',
      'src/features/predictions/engine/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react-dom',
                'zustand',
                '@supabase/*',
                '**/components/**',
                '**/pages/**',
              ],
              message: 'engine/ must stay pure (no React, state, or data imports).',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'engine/ must not perform network calls.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use a seeded rng.' },
        { object: 'Date', property: 'now', message: 'engine/ must be deterministic.' },
      ],
    },
  },
  {
    // Framework-free data modules.
    files: [
      'src/lib/**/*.ts',
      'src/features/standings/*.ts',
      'src/features/analytics/*.ts',
      'src/features/lottery/data/**/*.ts',
      'src/features/keepers/api/**/*.ts',
      'src/features/parlay/lib/**/*.ts',
      'src/features/predictions/{loader,format}.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', '**/components/**', '**/pages/**'],
              message: 'data modules must not import React or UI code.',
            },
          ],
        },
      ],
    },
  },
)
