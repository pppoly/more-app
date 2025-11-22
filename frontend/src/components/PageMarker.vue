<template>
  <div class="page-marker">
    {{ label }}
  </div>
</template>

<script setup lang="ts">
defineProps<{
  label: string;
}>();
</script>

<style scoped>
.page-marker {
  text-align: center;
  font-size: 12px;
  letter-spacing: 0.1em;
  color: rgba(15, 23, 42, 0.55);
  margin: 6px 0;
}
</style>
