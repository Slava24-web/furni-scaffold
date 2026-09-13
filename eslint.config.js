const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const vueParser = require('vue-eslint-parser');
const vuePlugin = require('eslint-plugin-vue');
const localRules = require('eslint-plugin-local-rules');

/**
 * Базовые правила без типовой информации.
 *
 * Типозависимые правила намеренно не включены: они требуют прогрева
 * программы TypeScript и удваивают время линта в CI, а проверку типов
 * и так делает tsc отдельным шагом.
 */
const baseRules = {
  'local-rules/no-reactive-three': 'error',
  '@typescript-eslint/no-unused-vars': [
    'error',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
  ],
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-non-null-asserted-optional-chain': 'error',
  eqeqeq: ['error', 'smart'],
  'no-var': 'error',
  'prefer-const': 'error',
  'no-debugger': 'error',
};

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
    plugins: { 'local-rules': localRules, '@typescript-eslint': tsPlugin },
    rules: baseRules,
  },
  // Базовый набор vue целиком, вместе с процессором: без него правила
  // не понимают комментарии в шаблоне и ругаются на каждый
  ...vuePlugin.configs['flat/essential'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: 'module' },
    },
    plugins: { 'local-rules': localRules, '@typescript-eslint': tsPlugin },
    rules: baseRules,
  },
  {
    files: ['eslint.config.js', 'eslint-local-rules/**/*.js'],
    languageOptions: { sourceType: 'commonjs' },
  },
];
