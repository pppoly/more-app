import { computed, ref } from 'vue';

const maintenanceMode = ref(false);
const maintenanceError = ref<Error | null>(null);

const normalizeError = (error: unknown): Error | null => {
  if (!error) return null;
  if (error instanceof Error) return error;
  return new Error('Unknown error');
};

export const setMaintenanceMode = (enabled: boolean, error?: unknown) => {
  maintenanceMode.value = enabled;
  maintenanceError.value = enabled ? normalizeError(error) : null;
};

export const clearMaintenanceMode = () => {
  setMaintenanceMode(false);
};

export const useAppState = () => ({
  maintenanceMode: computed(() => maintenanceMode.value),
  maintenanceError: computed(() => maintenanceError.value),
});
