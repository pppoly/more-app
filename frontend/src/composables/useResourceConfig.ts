import { computed, reactive } from 'vue';
import {
  RESOURCE_SLOTS,
  RESOURCE_SLOT_MAP,
  type ResourceKey,
  type ResourceSlotDefinition,
  type ResourceValue,
} from '../constants/resourceSlots';

const STORAGE_KEY = 'moreapp_resource_config';

const defaultValues = RESOURCE_SLOTS.reduce<Record<ResourceKey, ResourceValue>>((acc, slot) => {
  acc[slot.id] = slot.defaultValue;
  return acc;
}, {} as Record<ResourceKey, ResourceValue>);

const state = reactive<Record<ResourceKey, ResourceValue>>({ ...defaultValues });

let initialized = false;

function hasWindow() {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function normalizeValue(slot: ResourceSlotDefinition, value: ResourceValue | null | undefined): ResourceValue {
  if (!value && value !== '') {
    return slot.defaultValue;
  }
  if (slot.type === 'image-list') {
    if (Array.isArray(value)) {
      return value.map((item) => item.trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
      return value
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return slot.defaultValue;
  }
  if (Array.isArray(value)) {
    const flattened = value
      .map((item) => item.trim())
      .filter(Boolean)
      .join('\n');
    return flattened || (slot.defaultValue as string);
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  return slot.defaultValue;
}

function ensureInitialized() {
  if (initialized) return;
  initialized = true;
  if (!hasWindow()) return;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, ResourceValue>;
    Object.entries(parsed).forEach(([key, value]) => {
      if (!Object.prototype.hasOwnProperty.call(RESOURCE_SLOT_MAP, key)) return;
      const slot = RESOURCE_SLOT_MAP[key as ResourceKey];
      state[slot.id] = normalizeValue(slot, value);
    });
  } catch (error) {
    console.warn('[resource-config] Failed to restore config', error);
  }
}

function persist() {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('[resource-config] Failed to persist config', error);
  }
}

export function getResourceStringValue(key: ResourceKey): string {
  ensureInitialized();
  const slot = RESOURCE_SLOT_MAP[key];
  const value = state[key];
  if (slot.type === 'image-list') {
    return Array.isArray(value) ? value[0] ?? '' : '';
  }
  return typeof value === 'string' ? value : (slot.defaultValue as string);
}

export function getResourceListValue(key: ResourceKey): string[] {
  ensureInitialized();
  const value = state[key];
  return Array.isArray(value) ? value : [];
}

export function getResourceValue(key: ResourceKey): ResourceValue {
  ensureInitialized();
  return state[key];
}

export function useResourceConfig() {
  ensureInitialized();

  const resourceValues = computed(() => state);

  const setResourceValue = (key: ResourceKey, value: ResourceValue) => {
    const slot = RESOURCE_SLOT_MAP[key];
    state[key] = normalizeValue(slot, value);
    persist();
  };

  const resetResourceValue = (key: ResourceKey) => {
    const slot = RESOURCE_SLOT_MAP[key];
    state[key] = Array.isArray(slot.defaultValue) ? [...slot.defaultValue] : slot.defaultValue;
    persist();
  };

  const exportConfig = () => JSON.stringify(state, null, 2);

  const importConfig = (json: string) => {
    try {
      const parsed = JSON.parse(json) as Record<string, ResourceValue>;
      Object.entries(parsed).forEach(([key, value]) => {
        if (!Object.prototype.hasOwnProperty.call(RESOURCE_SLOT_MAP, key)) return;
        const slot = RESOURCE_SLOT_MAP[key as ResourceKey];
        state[slot.id] = normalizeValue(slot, value);
      });
      persist();
    } catch (error) {
      console.warn('[resource-config] Failed to import config', error);
      throw error;
    }
  };

  return {
    slots: RESOURCE_SLOTS,
    slotMap: RESOURCE_SLOT_MAP,
    resourceValues,
    getStringValue: getResourceStringValue,
    getListValue: getResourceListValue,
    setResourceValue,
    resetResourceValue,
    exportConfig,
    importConfig,
  };
}
