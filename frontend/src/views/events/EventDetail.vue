<template>
  <section>
    <h2>Event Detail</h2>
    <p v-if="eventId">Viewing event ID: {{ eventId }}</p>
    <p v-else>Pick an event to view details.</p>
  </section>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router';

const route = useRoute();
const eventId = route.params.eventId as string | undefined;
</script>
