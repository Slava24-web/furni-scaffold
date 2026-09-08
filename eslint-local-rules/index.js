/**
 * Точка входа для eslint-plugin-local-rules: плагин ищет
 * `eslint-local-rules/index.js` и ждёт карту «имя правила -> правило».
 */
module.exports = {
  'no-reactive-three': require('./no-reactive-three'),
};
