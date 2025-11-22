import { reactive, readonly } from 'vue';

type ToastType = 'info' | 'success' | 'error' | 'warning';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
  duration: number;
}

const state = reactive({
  items: [] as ToastItem[],
});

export function useToast() {
  const show = (message: string, type: ToastType = 'info', duration = 2200) => {
    const id = Date.now() + Math.random();
    state.items.push({ id, type, message, duration });
    window.setTimeout(() => remove(id), duration);
  };

  const remove = (id: number) => {
    state.items = state.items.filter((item) => item.id !== id);
  };

  return { show, remove, items: readonly(state).items };
}

export function useToastState() {
  return state;
}

