<template>
  <button
    :class="[baseClass, variantClasses[variant], sizeClasses[size]]"
    :disabled="disabled"
    v-bind="$attrs"
  >
    <span v-if="iconLeft" class="mr-2 inline-flex items-center text-lg">
      <component :is="iconLeft" />
    </span>
    <slot />
    <span v-if="iconRight" class="ml-2 inline-flex items-center text-lg">
      <component :is="iconRight" />
    </span>
  </button>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    variant?: 'primary' | 'outline' | 'ghost';
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
    iconLeft?: any;
    iconRight?: any;
  }>(),
  {
    variant: 'primary',
    size: 'md',
    disabled: false,
  },
);

const baseClass =
  'inline-flex items-center justify-center font-medium rounded-full transition-all duration-150 active:scale-[0.98] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed gap-2';

const variantClasses: Record<typeof props.variant, string> = {
  primary:
    'bg-gradient-to-r from-[#0090D9] via-[#22BBAA] to-[#E4C250] text-white shadow-lg shadow-cyan-500/20 hover:brightness-110 active:brightness-95',
  outline:
    'bg-white text-[#0088CC] border-[1.5px] border-[#0088CC] hover:bg-[#E8F6FF]',
  ghost: 'bg-[#F2FBFF] text-[#0088CC] border border-[#BEE3F8] hover:bg-[#E8F6FF]',
};

const sizeClasses: Record<typeof props.size, string> = {
  sm: 'h-8 px-4 text-xs',
  md: 'h-10 px-5 text-sm',
  lg: 'h-12 px-6 text-base',
};

const { variant, size } = props;
</script>
