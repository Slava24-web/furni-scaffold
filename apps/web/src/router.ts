import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/planner' },
  {
    path: '/planner',
    name: 'planner',
    // Ленивый чанк: движок не должен попадать в основной бандл (ТЗ 7.3)
    component: () => import('./pages/PlannerPage.vue'),
  },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});
