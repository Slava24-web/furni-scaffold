/**
 * Линт-правило: запрет объектов Three.js в реактивности Vue.
 * Главное правило проекта (CLAUDE.md, правило 1). Не отключать.
 *
 * Ловит: ref(new Mesh()), reactive({ scene: new Scene() }) и подобное
 * без обёртки markRaw().
 */
const THREE_CLASSES = new Set([
  'Scene', 'Mesh', 'Group', 'Object3D', 'WebGLRenderer', 'PerspectiveCamera',
  'OrthographicCamera', 'BufferGeometry', 'Material', 'MeshStandardMaterial',
  'MeshPhysicalMaterial', 'Texture', 'Vector3', 'Box3', 'Raycaster',
  'Viewer', 'SceneRegistry', 'AssetLoader', 'GestureController', 'SnapEngine',
]);

const REACTIVE_WRAPPERS = new Set(['ref', 'reactive', 'computed']);

module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Объекты Three.js не должны попадать в реактивность Vue' },
    messages: {
      noReactive:
        'Объект {{name}} нельзя класть в {{wrapper}}(): Vue навесит Proxy и убьёт производительность ' +
        'цикла рендера. Используйте shallowRef(markRaw(...)). См. CLAUDE.md, правило 1.',
    },
    schema: [],
  },
  create(context) {
    function isThreeConstruction(node) {
      return (
        node?.type === 'NewExpression' &&
        node.callee.type === 'Identifier' &&
        THREE_CLASSES.has(node.callee.name)
      );
    }
    function isWrappedInMarkRaw(node) {
      return (
        node?.type === 'CallExpression' &&
        node.callee.type === 'Identifier' &&
        node.callee.name === 'markRaw'
      );
    }

    return {
      CallExpression(node) {
        if (node.callee.type !== 'Identifier') return;
        if (!REACTIVE_WRAPPERS.has(node.callee.name)) return;

        const arg = node.arguments[0];
        if (!arg || isWrappedInMarkRaw(arg)) return;

        if (isThreeConstruction(arg)) {
          context.report({
            node: arg,
            messageId: 'noReactive',
            data: { name: arg.callee.name, wrapper: node.callee.name },
          });
        }

        if (arg.type === 'ObjectExpression') {
          for (const prop of arg.properties) {
            if (prop.type === 'Property' && isThreeConstruction(prop.value)) {
              context.report({
                node: prop.value,
                messageId: 'noReactive',
                data: { name: prop.value.callee.name, wrapper: node.callee.name },
              });
            }
          }
        }
      },
    };
  },
};
