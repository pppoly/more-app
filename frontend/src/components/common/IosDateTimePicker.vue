<template>
  <div class="ios-picker">
    <div class="picker-columns">
      <label class="picker-column">
        <span>年</span>
        <select v-model.number="state.year">
          <option v-for="year in years" :key="year" :value="year">
            {{ year }}
          </option>
        </select>
      </label>
      <label class="picker-column">
        <span>月</span>
        <select v-model.number="state.month">
          <option v-for="month in months" :key="month" :value="month - 1">
            {{ month.toString().padStart(2, '0') }}
          </option>
        </select>
      </label>
      <label class="picker-column">
        <span>日</span>
        <select v-model.number="state.day">
          <option v-for="day in daysInMonth" :key="day" :value="day">
            {{ day.toString().padStart(2, '0') }}
          </option>
        </select>
      </label>
      <label class="picker-column">
        <span>时</span>
        <select v-model.number="state.hour">
          <option v-for="hour in hours" :key="hour" :value="hour">
            {{ hour.toString().padStart(2, '0') }}
          </option>
        </select>
      </label>
      <label class="picker-column">
        <span>分</span>
        <select v-model.number="state.minute">
          <option v-for="minute in minutes" :key="minute" :value="minute">
            {{ minute.toString().padStart(2, '0') }}
          </option>
        </select>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch, watchEffect } from 'vue';

interface Props {
  modelValue?: string;
  yearRange?: number;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  yearRange: 3,
});
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>();

const parseInitial = () => {
  if (props.modelValue) {
    const parsed = new Date(props.modelValue);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date();
};

const initialDate = parseInitial();

const state = reactive({
  year: initialDate.getFullYear(),
  month: initialDate.getMonth(),
  day: initialDate.getDate(),
  hour: initialDate.getHours(),
  minute: [0, 15, 30, 45].includes(initialDate.getMinutes())
    ? initialDate.getMinutes()
    : 0,
});

const years = computed(() => {
  const start = state.year - props.yearRange;
  const end = state.year + props.yearRange;
  const list: number[] = [];
  for (let y = start; y <= end; y += 1) list.push(y);
  return list;
});

const months = Array.from({ length: 12 }, (_, i) => i + 1);
const hours = Array.from({ length: 24 }, (_, i) => i);
const minutes = [0, 15, 30, 45];

const daysInMonth = computed(() => new Date(state.year, state.month + 1, 0).getDate());

watch(
  () => [state.year, state.month],
  () => {
    if (state.day > daysInMonth.value) {
      state.day = daysInMonth.value;
    }
  },
);

watch(
  () => props.modelValue,
  (value) => {
    if (!value) return;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return;
    state.year = parsed.getFullYear();
    state.month = parsed.getMonth();
    state.day = parsed.getDate();
    state.hour = parsed.getHours();
    state.minute = minutes.includes(parsed.getMinutes()) ? parsed.getMinutes() : 0;
  },
);

watchEffect(() => {
  const date = new Date(
    state.year,
    state.month,
    Math.min(state.day, daysInMonth.value),
    state.hour,
    state.minute,
  );
  const formatted = `${date.getFullYear()}-${String(state.month + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(state.minute).padStart(
    2,
    '0',
  )}`;
  emit('update:modelValue', formatted);
});
</script>

<style scoped>
.ios-picker {
  width: 100%;
  padding: 12px 0;
}

.picker-columns {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.picker-column {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: rgba(15, 23, 42, 0.6);
}

.picker-column select {
  width: 100%;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.5);
  padding: 10px;
  font-size: 15px;
  background: rgba(255, 255, 255, 0.95);
  color: #0f172a;
  appearance: none;
}
</style>
