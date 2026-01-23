import { computed, reactive } from 'vue';
import {
  RESOURCE_SLOTS,
  RESOURCE_SLOT_MAP,
  type ResourceKey,
  type ResourceSlotDefinition,
  type ResourceValue,
} from '../constants/resourceSlots';

const STORAGE_KEY = 'moreapp_resource_config';

const isStringList = (value: unknown): value is ReadonlyArray<string> => Array.isArray(value);

const cloneDefaultValue = (slot: ResourceSlotDefinition): ResourceValue =>
  typeof slot.defaultValue === 'string' ? slot.defaultValue : [...slot.defaultValue];

const defaultValues = RESOURCE_SLOTS.reduce<Record<ResourceKey, ResourceValue>>((acc, slot) => {
  acc[slot.id] = cloneDefaultValue(slot);
  return acc;
}, {} as Record<ResourceKey, ResourceValue>);

const state = reactive<Record<ResourceKey, ResourceValue>>({ ...defaultValues });

let initialized = false;

function hasWindow() {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined';
}

function normalizeValue(slot: ResourceSlotDefinition, value: ResourceValue | null | undefined): ResourceValue {
  if (!value && value !== '') {
    return cloneDefaultValue(slot);
  }
  if (slot.type === 'image-list') {
    if (isStringList(value)) {
      return value.map((item) => item.trim()).filter(Boolean);
    }
    if (typeof value === 'string') {
      return value
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return cloneDefaultValue(slot);
  }
  if (isStringList(value)) {
    const flattened = value
      .map((item) => item.trim())
      .filter(Boolean)
      .join('\n');
    return flattened || (cloneDefaultValue(slot) as string);
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  return cloneDefaultValue(slot);
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
    return isStringList(value) ? value[0] ?? '' : '';
  }
  return typeof value === 'string' ? value : (slot.defaultValue as string);
}

export function getResourceListValue(key: ResourceKey): string[] {
  ensureInitialized();
  const value = state[key];
  return isStringList(value) ? [...value] : [];
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
    state[key] = cloneDefaultValue(slot);
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
