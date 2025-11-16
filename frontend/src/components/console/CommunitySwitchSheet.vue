<template>
  <div class="fixed inset-0 bg-black/40 flex items-end z-50" @click.self="$emit('close')">
    <div class="w-full bg-white rounded-t-2xl p-4">
      <div class="w-12 h-1.5 bg-slate-300 rounded-full mx-auto mb-3"></div>
      <p class="text-sm text-center text-slate-500">TODO: 社群切換面板</p>
      <button class="mt-4 w-full py-2 rounded-full border border-slate-200 text-sm" @click="$emit('close')">
        閉じる
      </button>
    </div>
  </div>
</template>
