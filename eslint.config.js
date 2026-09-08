const tsParser = require('@typescript-eslint/parser');
const vueParser = require('vue-eslint-parser');
const localRules = require('eslint-plugin-local-rules');

/**
 * Плоский конфиг ESLint 9. Заменяет .eslintrc.cjs: девятая версия
 * старый формат не читает и молча ничего не проверяет.
 *
 * Здесь живёт главное правило проекта — запрет объектов Three.js
 * в реактивности Vue (CLAUDE.md, правило 1). Не отключать.
 */
module.exports = [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      'apps/api/prisma/generated/**',
      'tools/pipeline/blender/**',
    ],
  },
  {
    files: ['**/*.{ts,mts,mjs,js}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    plugins: { 'local-rules': localRules },
    rules: { 'local-rules/no-reactive-three': 'error' },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: 'module' },
    },
    plugins: { 'local-rules': localRules },
    rules: { 'local-rules/no-reactive-three': 'error' },
  },
  {
    files: ['eslint.config.js', 'eslint-local-rules/**/*.js'],
    languageOptions: { sourceType: 'commonjs' },
  },
];
