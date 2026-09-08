module.exports = {
  root: true,
  plugins: ['local-rules'],
  rules: {
    // Главное правило проекта. Не отключать. См. CLAUDE.md.
    'local-rules/no-reactive-three': 'error',
  },
};
