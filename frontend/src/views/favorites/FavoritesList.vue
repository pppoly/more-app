<template>
  <div class="favorites-page">
    <header class="favorites-hero">
      <h1>お気に入り</h1>
      <p>フォローしたイベントをここで一覧できます。</p>
    </header>

    <section class="favorites-list" v-if="favorites.length">
      <article v-for="fav in favorites" :key="fav.id" class="favorite-card">
        <div class="favorite-main">
          <figure class="favorite-thumb">
            <img :src="fav.coverUrl" alt="" />
          </figure>
          <div class="favorite-info">
            <h2 class="favorite-name">{{ fav.title }}</h2>
            <p class="favorite-time">{{ fav.timeText || '日時未定' }}</p>
          </div>
        </div>

        <div class="favorite-actions">
          <button type="button" class="secondary-btn" @click="removeFavorite(fav.id)">
            <svg class="favorite-icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 6 3.99 4 6.5 4c1.54 0 3.04.99 3.57 2.36h.86C11.46 4.99 12.96 4 14.5 4 17.01 4 19 6 19 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
                fill="currentColor"
              />
            </svg>
            取消フォロー
          </button>
        </div>
      </article>
    </section>

    <section v-else class="favorites-empty">
      <p class="empty-title">まだお気に入りがありません。</p>
      <p class="empty-message">イベント詳細で「フォロー」をタップするとここに追加されます。</p>
      <RouterLink class="primary-btn" to="/">イベントを探す</RouterLink>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useFavorites } from '../../composables/useFavorites';

const { favorites, removeFavorite } = useFavorites();
</script>

<style scoped>
.favorites-page {
  min-height: 100vh;
  padding: 20px 16px 60px;
  background: #f6f8fb;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.favorites-hero {
  background: #fff;
  border-radius: 20px;
  padding: 20px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
}

.favorites-hero h1 {
  margin: 0 0 6px;
  font-size: 24px;
}

.favorites-hero p {
  margin: 0;
  color: #475569;
}

.favorites-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.favorite-card {
  background: #fff;
  border-radius: 20px;
  padding: 16px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.favorite-main {
  display: grid;
  grid-template-columns: 118px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

.favorite-info {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.favorite-name {
  margin: 0;
  font-size: 22px;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.25;
  word-break: break-word;
}

.favorite-time {
  margin: 0;
  font-size: 13px;
  color: #64748b;
  line-height: 1.4;
}

.favorite-thumb {
  margin: 0;
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: #e2e8f0;
}

.favorite-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.favorite-actions {
  display: flex;
  justify-content: flex-end;
}

.secondary-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  border-radius: 12px;
  font-weight: 600;
  font-size: 14px;
  border: 1px solid rgba(15, 23, 42, 0.15);
  background: #fff;
  color: #ef4444;
  padding: 0 14px;
}

.secondary-btn:active {
  opacity: 0.7;
}

.favorite-icon {
  width: 18px;
  height: 18px;
}

.favorites-empty {
  margin-top: 40px;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: #475569;
}

.empty-title {
  font-size: 18px;
  font-weight: 700;
  margin: 0;
  color: #0f172a;
}

.empty-message {
  margin: 0;
  font-size: 14px;
}
</style>
