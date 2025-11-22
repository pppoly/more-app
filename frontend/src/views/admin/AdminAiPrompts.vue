<template>
  <main class="prompt-page">
    <header class="page-head">
      <div>
        <p class="eyebrow">SOCIALMORE · AI PROMPTS</p>
        <h1>Prompt 管理</h1>
        <p class="subhead">
          查看和更新各场景的 Prompt。修改会直接影响模型调用，请谨慎保存并保持版本说明。
        </p>
      </div>
      <div class="actions">
        <button type="button" class="ghost" :disabled="loading" @click="loadPrompts">重新加载</button>
        <button type="button" class="primary" :disabled="loading" @click="save">保存全部</button>
      </div>
    </header>

    <section v-if="error" class="banner error">
      <span>{{ error }}</span>
      <button type="button" class="ghost" @click="error = null">关闭</button>
    </section>
    <section v-if="savedNotice" class="banner success">
      <span>{{ savedNotice }}</span>
    </section>

    <section class="toolbar">
      <button type="button" class="outline" @click="addPrompt">
        <span class="i-lucide-plus"></span>
        新建 Prompt
      </button>
      <p class="hint">支持语言：{{ supportedLanguages.join(', ') }}</p>
    </section>

    <section class="prompt-list" :aria-busy="loading">
      <article v-for="(prompt, idx) in prompts" :key="prompt.id" class="prompt-card">
        <div class="row">
          <label>Prompt ID</label>
          <input v-model="prompt.id" type="text" placeholder="唯一 ID" />
        </div>
        <div class="row grid2">
          <div>
            <label>名称</label>
            <input v-model="prompt.name" type="text" placeholder="显示名称" />
          </div>
          <div>
            <label>版本</label>
            <input v-model="prompt.version" type="text" placeholder="如 2024-11-22" />
          </div>
        </div>
        <div class="row">
          <label>描述</label>
          <input v-model="prompt.description" type="text" placeholder="用途说明" />
        </div>
        <div class="row grid2">
          <div>
            <label>版本</label>
            <input v-model="prompt.version" type="text" placeholder="如 2024-11-22" />
          </div>
          <div>
            <label>状态</label>
            <select v-model="prompt.status">
              <option value="draft">draft</option>
              <option value="published">published</option>
            </select>
          </div>
        </div>
        <div class="row">
          <label>System Prompt</label>
          <textarea v-model="prompt.system" rows="5" placeholder="系统提示词"></textarea>
        </div>
        <div class="row">
          <label>Instructions（可选）</label>
          <textarea v-model="prompt.instructions" rows="2" placeholder="补充指示"></textarea>
        </div>
        <div class="row">
          <label>Meta (JSON)</label>
          <textarea v-model="prompt.metaText" rows="3" placeholder='{"target":"events"}'></textarea>
        </div>
        <div class="row grid2">
          <div>
            <label>参数列表（逗号分隔）</label>
            <input v-model="prompt.paramsText" type="text" placeholder="如 source_lang,target_lang,content" />
          </div>
          <div>
            <label>标签（逗号分隔）</label>
            <input v-model="prompt.tagsText" type="text" placeholder="translation,event" />
          </div>
        </div>
        <div class="card-footer">
          <span class="muted">索引：{{ idx + 1 }}</span>
          <button type="button" class="ghost danger" @click="removePrompt(idx)">删除</button>
        </div>
      </article>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { fetchAiPrompts, fetchSupportedLanguages, saveAiPrompts } from '../../api/client';
import type { PromptDefinition } from '../../types/api';

interface PromptForm extends Omit<PromptDefinition, 'meta'> {
  metaText: string;
  meta?: Record<string, any>;
  paramsText?: string;
  tagsText?: string;
}

const loading = ref(false);
const error = ref<string | null>(null);
const savedNotice = ref<string | null>(null);
const supportedLanguages = ref<string[]>([]);
const prompts = ref<PromptForm[]>([]);

const normalize = (items: PromptDefinition[]): PromptForm[] =>
  items.map((p) => ({
    ...p,
    metaText: p.meta ? JSON.stringify(p.meta, null, 2) : '',
    paramsText: (p.params ?? []).join(','),
    tagsText: (p.tags ?? []).join(','),
  }));

const denormalize = (items: PromptForm[]): PromptDefinition[] =>
  items.map((p) => {
    let meta: Record<string, any> | undefined = undefined;
    if (p.metaText && p.metaText.trim().length) {
      meta = JSON.parse(p.metaText);
    }
    return {
      id: p.id.trim(),
      name: p.name?.trim() || p.id,
      description: p.description ?? '',
      version: p.version ?? '',
      system: p.system ?? '',
      instructions: p.instructions ?? '',
      params: p.paramsText
        ? p.paramsText
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean)
        : [],
      tags: p.tagsText
        ? p.tagsText
            .split(',')
            .map((x) => x.trim())
            .filter(Boolean)
        : [],
      meta,
    };
  });

const loadPrompts = async () => {
  loading.value = true;
  error.value = null;
  try {
    const [promptList, langs] = await Promise.all([fetchAiPrompts(), fetchSupportedLanguages()]);
    prompts.value = normalize(promptList);
    supportedLanguages.value = langs.supported ?? [];
  } catch (err) {
    console.error(err);
    error.value = '加载 Prompt 失败，请稍后重试。';
  } finally {
    loading.value = false;
  }
};

const save = async () => {
  savedNotice.value = null;
  error.value = null;
  try {
    const payload = denormalize(prompts.value);
    payload.forEach((p) => {
      if (!p.id || !p.system) {
        throw new Error('Prompt ID 和 System 不能为空');
      }
    });
    await saveAiPrompts(payload);
    savedNotice.value = '已保存 Prompt 更新';
    await loadPrompts();
  } catch (err: any) {
    console.error(err);
    error.value = err?.message || '保存失败';
  }
};

const addPrompt = () => {
  prompts.value.push({
    id: `prompt-${Date.now()}`,
    name: '',
    version: '',
    description: '',
    system: '',
    metaText: '',
    status: 'draft',
  });
};

const removePrompt = (idx: number) => {
  prompts.value.splice(idx, 1);
};

onMounted(() => {
  loadPrompts();
});
</script>

<style scoped>
.prompt-page {
  min-height: 100vh;
  padding: calc(env(safe-area-inset-top, 0px) + 16px) 16px calc(80px + env(safe-area-inset-bottom, 0px));
  background: linear-gradient(180deg, #f4f7fb 0%, #ffffff 50%, #ffffff 100%);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  padding: 18px;
  border-radius: 18px;
  background: #0f172a;
  color: #fff;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.18);
}

.page-head h1 {
  margin: 6px 0;
}

.eyebrow {
  letter-spacing: 0.18em;
  font-size: 0.8rem;
  opacity: 0.8;
}

.subhead {
  margin: 6px 0 0;
  opacity: 0.9;
}

.actions {
  display: flex;
  gap: 10px;
}

.toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
}

.hint {
  margin: 0;
  color: #475569;
  font-size: 0.95rem;
}

.prompt-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 12px;
}

.prompt-card {
  background: #fff;
  border-radius: 16px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
}

.row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.grid2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
}

label {
  font-size: 0.9rem;
  color: #475569;
}

input,
textarea {
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px;
  font-size: 0.95rem;
  background: #f8fafc;
}

textarea {
  resize: vertical;
}

.banner {
  border-radius: 12px;
  padding: 12px 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.banner.error {
  background: #fff1f2;
  color: #b91c1c;
}

.banner.success {
  background: #ecfdf3;
  color: #15803d;
}

.card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #94a3b8;
  font-size: 0.9rem;
}

.muted {
  color: #94a3b8;
}

button {
  cursor: pointer;
}

.ghost {
  border: 1px solid #cbd5e1;
  background: transparent;
  border-radius: 10px;
  padding: 8px 12px;
  color: #0f172a;
}

.ghost.danger {
  color: #b91c1c;
  border-color: #fecdd3;
}

.outline {
  border: 1px solid #0f172a;
  background: transparent;
  color: #0f172a;
  padding: 8px 12px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.primary {
  background: #0f172a;
  color: #fff;
  border: none;
  border-radius: 10px;
  padding: 10px 16px;
}

.ghost:disabled,
.primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
@media (max-width: 720px) {
  .page-head {
    flex-direction: column;
  }
  .actions {
    width: 100%;
    justify-content: flex-start;
  }
}
</style>
