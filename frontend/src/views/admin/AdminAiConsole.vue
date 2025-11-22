<template>
  <main class="ai-console">
    <header class="page-head">
      <div>
        <p class="eyebrow">SOCIALMORE · AI 控制台</p>
        <h1>Prompt 测试与日志</h1>
        <p class="subhead">可视化验证渲染/调用、翻译与评测结果，快速检查最新 Prompt。</p>
      </div>
      <div class="actions">
        <button type="button" class="outline" @click="loadPrompts" :disabled="loading.prompts">刷新列表</button>
      </div>
    </header>

    <section class="card">
      <div class="card-head">
        <h2>Prompt 渲染 & 调用</h2>
        <button type="button" class="ghost" @click="resetRenderForm">清空</button>
      </div>
      <div class="form-grid">
        <label>
          Prompt
          <select v-model="renderForm.promptId">
            <option v-for="p in prompts" :key="p.id" :value="p.id">
              {{ p.id }} ({{ p.status || 'draft' }})
            </option>
          </select>
        </label>
        <label>
          模型
          <input v-model="renderForm.model" type="text" placeholder="默认后端配置" />
        </label>
        <label>
          温度
          <input v-model.number="renderForm.temperature" type="number" step="0.1" min="0" max="1" />
        </label>
      </div>
      <label>
        Params (JSON)
        <textarea v-model="renderForm.paramsText" rows="3" placeholder='{"source_lang":"en","target_lang":"ja"}'></textarea>
      </label>
      <label>
        Messages (JSON 数组)
        <textarea
          v-model="renderForm.messagesText"
          rows="4"
          placeholder='[{"role":"user","content":"hello"}]'
        ></textarea>
      </label>
      <div class="btn-row">
        <button type="button" class="outline" @click="render" :disabled="loading.render">渲染</button>
        <button type="button" class="primary" @click="complete" :disabled="loading.complete">调用</button>
      </div>
      <div v-if="renderResult" class="result">
        <p class="muted">渲染结果</p>
        <pre>{{ renderResult }}</pre>
      </div>
      <div v-if="completeResult" class="result">
        <p class="muted">调用结果</p>
        <pre>{{ completeResult }}</pre>
      </div>
      <div v-if="error.render" class="error">{{ error.render }}</div>
      <div v-if="error.complete" class="error">{{ error.complete }}</div>
    </section>

    <section class="card">
      <div class="card-head">
        <h2>翻译测试</h2>
        <button type="button" class="ghost" @click="resetTranslate">清空</button>
      </div>
      <div class="form-grid">
        <label>
          源语言
          <select v-model="translateForm.sourceLang">
            <option v-for="lang in supportedLanguages" :key="lang" :value="lang">{{ lang }}</option>
          </select>
        </label>
        <label>
          目标语言
          <select v-model="translateForm.targetLang">
            <option v-for="lang in supportedLanguages" :key="lang" :value="lang">{{ lang }}</option>
          </select>
        </label>
      </div>
      <label>
        文本
        <textarea v-model="translateForm.text" rows="3" placeholder="待翻译文本"></textarea>
      </label>
      <div class="btn-row">
        <button type="button" class="primary" @click="translate" :disabled="loading.translate">测试翻译</button>
      </div>
      <div v-if="translateResult" class="result">
        <p class="muted">翻译结果</p>
        <pre>{{ translateResult }}</pre>
      </div>
      <div v-if="error.translate" class="error">{{ error.translate }}</div>
    </section>

    <section class="card">
      <div class="card-head">
        <h2>评测（渲染用例）</h2>
        <button type="button" class="ghost" @click="runEval" :disabled="loading.eval">运行</button>
      </div>
      <label>
        Prompt
        <select v-model="evalPromptId">
          <option v-for="p in prompts" :key="p.id" :value="p.id">
            {{ p.id }} ({{ p.status || 'draft' }})
          </option>
        </select>
      </label>
      <div v-if="evalResult" class="result">
        <p class="muted">评测结果</p>
        <pre>{{ evalResult }}</pre>
      </div>
      <div v-if="error.eval" class="error">{{ error.eval }}</div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue';
import {
  fetchAiPrompts,
  fetchSupportedLanguages,
  renderPrompt,
  completePrompt,
  translateText,
  evalPrompt,
} from '../../api/client';
import type { PromptDefinition } from '../../types/api';

const prompts = ref<PromptDefinition[]>([]);
const supportedLanguages = ref<string[]>([]);
const loading = ref({ prompts: false, render: false, complete: false, translate: false, eval: false });
const error = ref<{ render?: string | null; complete?: string | null; translate?: string | null; eval?: string | null }>({
  render: null,
  complete: null,
  translate: null,
  eval: null,
});
const renderResult = ref('');
const completeResult = ref('');
const translateResult = ref('');
const evalResult = ref('');
const evalPromptId = ref('');

const renderForm = ref({
  promptId: '',
  paramsText: '',
  messagesText: '[{"role":"user","content":"hello"}]',
  model: '',
  temperature: 0.3,
});

const translateForm = ref({
  sourceLang: 'ja',
  targetLang: 'en',
  text: '',
});

const resetRenderForm = () => {
  renderForm.value = {
    promptId: prompts.value[0]?.id ?? '',
    paramsText: '',
    messagesText: '[{"role":"user","content":"hello"}]',
    model: '',
    temperature: 0.3,
  };
  renderResult.value = '';
  completeResult.value = '';
  error.value.render = null;
  error.value.complete = null;
};

const resetTranslate = () => {
  translateForm.value = {
    sourceLang: supportedLanguages.value[0] ?? 'ja',
    targetLang: supportedLanguages.value[0] ?? 'en',
    text: '',
  };
  translateResult.value = '';
  error.value.translate = null;
};

const loadPrompts = async () => {
  loading.value.prompts = true;
  try {
    const [pList, langList] = await Promise.all([fetchAiPrompts(), fetchSupportedLanguages()]);
    prompts.value = pList;
    supportedLanguages.value = langList.supported ?? [];
    if (!renderForm.value.promptId && pList.length) {
      renderForm.value.promptId = pList[0].id;
      evalPromptId.value = pList[0].id;
    }
    resetTranslate();
  } catch (err: any) {
    console.error(err);
  } finally {
    loading.value.prompts = false;
  }
};

const parseJson = (text: string, fallback: any) => {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
};

const render = async () => {
  error.value.render = null;
  renderResult.value = '';
  loading.value.render = true;
  try {
    const params = parseJson(renderForm.value.paramsText || '{}', {});
    const messages = parseJson(renderForm.value.messagesText || '[]', []);
    const res = await renderPrompt({
      promptId: renderForm.value.promptId,
      params,
      messages,
      model: renderForm.value.model || undefined,
    });
    renderResult.value = JSON.stringify(res.messages, null, 2);
  } catch (err: any) {
    error.value.render = err?.message || '渲染失败';
  } finally {
    loading.value.render = false;
  }
};

const complete = async () => {
  error.value.complete = null;
  completeResult.value = '';
  loading.value.complete = true;
  try {
    const params = parseJson(renderForm.value.paramsText || '{}', {});
    const messages = parseJson(renderForm.value.messagesText || '[]', []);
    const res = await completePrompt({
      promptId: renderForm.value.promptId,
      params,
      messages,
      model: renderForm.value.model || undefined,
      temperature: renderForm.value.temperature || undefined,
    });
    completeResult.value = JSON.stringify(res, null, 2);
  } catch (err: any) {
    error.value.complete = err?.message || '调用失败';
  } finally {
    loading.value.complete = false;
  }
};

const translate = async () => {
  error.value.translate = null;
  translateResult.value = '';
  loading.value.translate = true;
  try {
    const res = await translateText({
      sourceLang: translateForm.value.sourceLang,
      targetLangs: [translateForm.value.targetLang],
      items: [{ key: 'text', text: translateForm.value.text }],
    });
    translateResult.value = JSON.stringify(res.translations, null, 2);
  } catch (err: any) {
    error.value.translate = err?.message || '翻译失败';
  } finally {
    loading.value.translate = false;
  }
};

const runEval = async () => {
  error.value.eval = null;
  evalResult.value = '';
  loading.value.eval = true;
  try {
    const res = await evalPrompt({ promptId: evalPromptId.value });
    evalResult.value = JSON.stringify(res, null, 2);
  } catch (err: any) {
    error.value.eval = err?.message || '评测失败';
  } finally {
    loading.value.eval = false;
  }
};

onMounted(() => {
  loadPrompts();
});
</script>

<style scoped>
.ai-console {
  min-height: 100vh;
  padding: calc(env(safe-area-inset-top, 0px) + 16px) 16px calc(80px + env(safe-area-inset-bottom, 0px));
  background: linear-gradient(180deg, #f4f7fb 0%, #ffffff 50%, #ffffff 100%);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.page-head {
  background: #0f172a;
  color: #fff;
  padding: 16px;
  border-radius: 16px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.eyebrow {
  letter-spacing: 0.18em;
  font-size: 0.8rem;
  opacity: 0.8;
}

.subhead {
  margin: 4px 0 0;
  opacity: 0.9;
}

.actions {
  display: flex;
  gap: 10px;
}

.card {
  background: #fff;
  border-radius: 16px;
  padding: 14px;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}

label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #475569;
  font-size: 0.95rem;
}

input,
select,
textarea {
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px;
  background: #f8fafc;
  font-size: 0.95rem;
}

textarea {
  resize: vertical;
}

.btn-row {
  display: flex;
  gap: 10px;
}

.outline,
.ghost,
.primary {
  cursor: pointer;
  border-radius: 10px;
  padding: 10px 12px;
}

.primary {
  background: #0f172a;
  color: #fff;
  border: none;
}

.outline {
  background: transparent;
  border: 1px solid #0f172a;
  color: #0f172a;
}

.ghost {
  background: transparent;
  border: 1px solid #cbd5e1;
  color: #0f172a;
}

.result,
.error {
  border-radius: 10px;
  padding: 10px;
  background: #f8fafc;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
  white-space: pre-wrap;
  word-break: break-word;
}

.error {
  background: #fff1f2;
  color: #b91c1c;
}

.muted {
  color: #94a3b8;
  margin: 0 0 6px;
}
@media (max-width: 720px) {
  .page-head {
    flex-direction: column;
  }
}
</style>
