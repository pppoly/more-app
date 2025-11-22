import { reactive } from 'vue';

interface ConfirmRequest {
  id: number;
  message: string;
  resolve: (value: boolean) => void;
}

const state = reactive({ queue: [] as ConfirmRequest[] });

export function useConfirm() {
  const confirm = (message: string) =>
    new Promise<boolean>((resolve) => {
      const id = Date.now() + Math.random();
      state.queue.push({ id, message, resolve });
    });

  return { confirm };
}

export function useConfirmState() {
  return state;
}

export function resolveConfirm(id: number, value: boolean) {
  const index = state.queue.findIndex((item) => item.id === id);
  if (index === -1) return;
  const [item] = state.queue.splice(index, 1);
  item.resolve(value);
}

