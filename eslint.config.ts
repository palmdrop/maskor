// eslint.config.ts
import { defineConfig } from 'eslint/config'
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import prettier from 'eslint-plugin-prettier'
import prettierConfig from 'eslint-config-prettier'

export default defineConfig(
  // --- ignore patterns ---
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/*.gen.ts',        // generated files
    ]
  },

  // --- base rules for all TS files ---
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    plugins: { prettier },
    rules: {
      'prettier/prettier': 'error',

      // TypeScript
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/consistent-type-imports': ['error', {
        prefer: 'type-imports',    // enforces: import type { Foo }
        fixStyle: 'inline-type-imports',
      }],
    }
  },

  // --- frontend only ---
  {
    files: ['packages/frontend/**/*.{ts,tsx}'],
    plugins: {
      react,
      // 'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    settings: {
      react: { version: 'detect' }
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',    // not needed in React 17+
      'react/prop-types': 'off',            // using TypeScript instead
    }
  },

  // --- backend services: allow node globals ---
  {
    files: [
      'packages/vault-watcher/**/*.ts',
      'packages/processor-worker/**/*.ts',
      'packages/api-service/**/*.ts',
      'packages/shared/**/*.ts',
    ],
    rules: {
      // backend-specific relaxations
      '@typescript-eslint/no-explicit-any': 'off',  // more pragmatic in service code
    }
  },
);