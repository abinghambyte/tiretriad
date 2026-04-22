import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // Worktrees and tooling copies under .claude are not part of the main package
  globalIgnores(['dist', '.claude/**']),
  {
    files: ['functions/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.node,
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        __dirname: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      'no-redeclare': ['error', { builtinGlobals: false }],
    },
  },
  {
    files: ['vite.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['playwright.config.js', 'tests/e2e/**/*.{js,ts}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node },
      sourceType: 'module',
    },
  },
  {
    files: ['scripts/**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.node },
      sourceType: 'module',
    },
  },
  {
    files: ['**/*.{js,jsx}'],
    ignores: ['functions/**', 'vite.config.js', 'playwright.config.js', 'tests/e2e/**'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
])
