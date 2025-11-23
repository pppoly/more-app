<template>
  <section class="console-section" :class="{ 'console-section--mobile': isMobileLayout }">
    <header class="section-header" v-if="!isMobileLayout">
      <div>
        <h2>{{ isEdit ? 'イベント編集' : 'イベント作成' }}</h2>
        <p>{{ subtitle }}</p>
      </div>
      <RouterLink :to="backLink">戻る</RouterLink>
    </header>

    <section class="entry-switcher">
      <article class="entry-card" @click="togglePaste(true)">
        <div class="entry-icon">🧾</div>
        <div class="entry-body">
          <p class="entry-title">貼り付けて体检</p>
          <p class="entry-desc">既に書いた案を貼り付け、AI で診断・抽出</p>
        </div>
        <span class="entry-lang pill light">{{ langLabel(activeContentLang) }}</span>
      </article>
      <article class="entry-card" @click="goToEventAssistant">
        <div class="entry-icon">🗨️</div>
        <div class="entry-body">
          <p class="entry-title">まだ未定 · 一緒に相談</p>
          <p class="entry-desc">対話しながら企画を固める</p>
        </div>
      </article>
      <article class="entry-card" @click="scrollToSection('basic')">
        <div class="entry-icon">✍️</div>
        <div class="entry-body">
          <p class="entry-title">テンプレから自分で入力</p>
          <p class="entry-desc">そのまま表单で編集・公開</p>
        </div>
      </article>
      <article class="entry-card" @click="openCopyOverlay">
        <div class="entry-icon">📄</div>
        <div class="entry-body">
          <p class="entry-title">コピーして開始</p>
          <p class="entry-desc">過去のイベントをベースに作成</p>
        </div>
      </article>
    </section>

    <div v-if="showPastePanel" class="paste-overlay" @click.self="togglePaste(false)">
      <section class="paste-card sheet">
        <header class="paste-head">
          <div>
            <p class="eyebrow">下書き貼り付け · 体检</p>
            <p class="muted">既に書いた案を貼り付けて、AI にチェック・整理させます</p>
          </div>
          <span class="pill light">{{ langLabel(activeContentLang) }}</span>
        </header>
      <textarea
        v-model="pastedDraft"
        class="paste-input"
        :placeholder="pastePlaceholder"
        rows="8"
      ></textarea>
        <div class="paste-actions">
          <button type="button" class="ios-chip" @click="pastedDraft = ''">クリア</button>
          <button type="button" class="btn ghost small" @click="goToEventAssistant">
            方向性から相談する
          </button>
          <button type="button" class="btn solid small" @click="checkPastedDraft">
            草案チェック
          </button>
        </div>
        <p v-if="draftCheckMessage" class="status muted mt-2">{{ draftCheckMessage }}</p>
        <div v-if="pastedPreview" class="paste-preview">
          <div class="paste-preview-row">
            <p class="eyebrow">抽出したタイトル</p>
            <p class="paste-preview-text">{{ pastedPreview.title || '---' }}</p>
          </div>
          <div class="paste-preview-row">
            <p class="eyebrow">概要</p>
            <p class="paste-preview-text">{{ pastedPreview.description || '---' }}</p>
          </div>
          <div class="paste-preview-row">
            <p class="eyebrow">注意事項</p>
            <p class="paste-preview-text">{{ pastedPreview.rules || '---' }}</p>
          </div>
          <div class="paste-preview-actions">
            <button type="button" class="btn ghost small" @click="pastedPreview = null">戻る</button>
            <button type="button" class="btn solid small" @click="applyPastedPreview">表单に反映</button>
          </div>
        </div>
        <button type="button" class="paste-close" @click="togglePaste(false)">閉じる</button>
      </section>
    </div>

    <section class="hero-cover-panel cover-below" ref="sectionCover">
      <div v-if="coverDisplayItems.length" class="hero-cover-strip">
        <figure v-for="(item, index) in coverDisplayItems" :key="item.id" class="hero-cover-thumb">
          <img :src="item.imageUrl" alt="cover" />
          <span v-if="index === 0" class="hero-cover-main">主图</span>
          <button type="button" class="hero-cover-delete" @click.stop="handleDeleteCover(item.id)">×</button>
        </figure>
        <button
          v-if="canAddMoreCovers"
          type="button"
          class="hero-cover-add"
          @click.stop="triggerCoverPicker"
        >
          <span>+</span>
          <p>继续添加</p>
        </button>
      </div>
      <button
        v-else
        type="button"
        class="hero-cover-add hero-cover-add--solo"
        @click.stop="triggerCoverPicker"
      >
        <span>+</span>
        <p>添加优质图片</p>
      </button>
      <p class="hero-cover-rules">{{ COVER_RULES_TEXT }}</p>
      <p v-if="coverError" class="status error">{{ coverError }}</p>
      <input
        ref="coverInputRef"
        type="file"
        multiple
        accept="image/*"
        class="hidden-input"
        @change="handleCoverUpload"
      />
    </section>

    <div v-if="uploadingCover" class="cover-upload-overlay">
      <div class="cover-upload-box">
        <span class="cover-upload-spinner"></span>
        <p>封面上传中...</p>
      </div>
    </div>

    <section v-else-if="aiPrefillNotice" class="ai-prefill">
      <p>{{ aiPrefillNotice }}</p>
    </section>

    <section
      v-if="aiChecklist.length || aiConfirmQuestions.length"
      class="card checklist-card"
      ref="sectionChecklist"
    >
      <h3>AI からの確認項目</h3>
      <div v-if="aiChecklist.length" class="checklist-section">
        <p>不足している情報</p>
        <label v-for="item in aiChecklist" :key="item.id" class="checklist-item">
          <input type="checkbox" v-model="item.checked" />
          <span>{{ item.text }}</span>
        </label>
      </div>
      <div v-if="aiConfirmQuestions.length" class="checklist-section">
        <p>承認事項</p>
        <label v-for="item in aiConfirmQuestions" :key="item.id" class="checklist-item">
          <input type="checkbox" v-model="item.checked" />
          <span>{{ item.text }}</span>
        </label>
      </div>
    </section>

    <form class="form" @submit.prevent="handleSubmit">
      <!-- Category -->
      <section class="card" ref="sectionCategory">
        <h3>カテゴリ</h3>
        <div class="category-grid">
          <button
            v-for="cat in categoryOptions"
            :key="cat.value"
            type="button"
            :class="['category-chip', { active: form.category === cat.value }]"
            @click="form.category = cat.value"
          >
            {{ cat.label }}
          </button>
        </div>
      </section>

      <!-- Basic info -->
      <section class="ios-panel" ref="sectionBasic">
        <div class="ios-form">
          <div class="ios-row ios-row--builder-line" @click="focusMainInline('title')">
            <span class="ios-label">タイトル</span>
            <input
              type="text"
              class="ios-inline-input ios-inline-input--text"
              placeholder="请输入"
              ref="titleInputRef"
              v-model="form.title"
            />
          </div>
          <div class="ios-row ios-row--builder-line" @click="focusMainInline('locationText')">
            <span class="ios-label">場所</span>
            <input
              type="text"
              class="ios-inline-input"
              placeholder="例：渋谷駅周辺"
              ref="locationInputRef"
              :value="form.locationText"
              @input="handleLocationInput"
            />
          </div>
          <button type="button" class="ios-row ios-row--action ios-row--builder-line" @click="openFieldEditor('startTime')">
            <span class="ios-label">開始日時</span>
            <span class="ios-value" :class="{ 'ios-value--placeholder': !form.startTime }">
              {{ form.startTime ? formatDisplayDate(form.startTime) : '请设置' }}
            </span>
          </button>
          <button type="button" class="ios-row ios-row--action ios-row--builder-line" @click="openFieldEditor('endTime')">
            <span class="ios-label">終了日時</span>
            <span class="ios-value" :class="{ 'ios-value--placeholder': !form.endTime }">
              {{ form.endTime ? formatDisplayDate(form.endTime) : '请设置' }}
            </span>
          </button>
          <button type="button" class="ios-row ios-row--action ios-row--builder-line" @click="openFieldEditor('regStartTime')">
            <span class="ios-label">受付開始</span>
            <span class="ios-value" :class="{ 'ios-value--placeholder': !form.regStartTime }">
              {{ form.regStartTime ? formatDisplayDate(form.regStartTime) : '请设置' }}
            </span>
          </button>
          <button type="button" class="ios-row ios-row--action ios-row--builder-line" @click="openFieldEditor('regEndTime')">
            <span class="ios-label">受付締切</span>
            <span class="ios-value" :class="{ 'ios-value--placeholder': !form.regEndTime }">
              {{ form.regEndTime ? formatDisplayDate(form.regEndTime) : '请设置' }}
            </span>
          </button>
          <div class="ios-helper-row">
            <p class="ios-helper-title">快捷设置</p>
            <div class="ios-chip-row">
              <button type="button" class="ios-chip" @click="setEndShortcut(1)">结束 +1 小时</button>
              <button type="button" class="ios-chip" @click="setEndShortcut(2)">结束 +2 小时</button>
              <button type="button" class="ios-chip" @click="setRegDeadlineShortcut(60)">截止：开始前 1 小时</button>
              <button type="button" class="ios-chip" @click="setRegDeadlineShortcut(24 * 60)">截止：开始前 1 天</button>
            </div>
          </div>
        </div>
      </section>

      <!-- Participants -->
      <section class="ios-panel" ref="sectionSchedule">
        <div class="ios-form">
          <div class="ios-row ios-row--builder-line">
            <span class="ios-label">最低参加人数</span>
            <input
              type="tel"
              class="ios-inline-input"
              placeholder="请设置"
              inputmode="numeric"
              pattern="[0-9]*"
              ref="minParticipantsInputRef"
              :value="minParticipantsDisplay"
              @input="handleParticipantsInput('min', $event)"
            />
          </div>
          <div class="ios-row ios-row--builder-line">
            <span class="ios-label">最大参加人数</span>
            <input
              type="tel"
              class="ios-inline-input"
              placeholder="请设置"
              inputmode="numeric"
              pattern="[0-9]*"
              ref="maxParticipantsInputRef"
              :value="maxParticipantsDisplay"
              @input="handleParticipantsInput('max', $event)"
            />
          </div>
        </div>
      </section>

      <!-- Config -->
      <section class="ios-panel" ref="sectionConfig">
        <div class="ios-form">
          <button type="button" class="ios-row ios-row--action" @click="form.requireApproval = !form.requireApproval">
            <span class="ios-label">参加承認</span>
            <span class="ios-value ios-value--switch">
              <input type="checkbox" v-model="form.requireApproval" class="ios-switch" @click.stop />
            </span>
          </button>
          <button
            type="button"
            class="ios-row ios-row--action"
            @click="form.config.requireCheckin = !form.config.requireCheckin"
          >
            <span class="ios-label">強制チェックイン</span>
            <span class="ios-value ios-value--switch">
              <input type="checkbox" v-model="form.config.requireCheckin" class="ios-switch" @click.stop />
            </span>
          </button>
          <button
            type="button"
            class="ios-row ios-row--action"
            @click="form.config.enableWaitlist = !form.config.enableWaitlist"
          >
            <span class="ios-label">キャンセル待ち</span>
            <span class="ios-value ios-value--switch">
              <input type="checkbox" v-model="form.config.enableWaitlist" class="ios-switch" @click.stop />
            </span>
          </button>
          <button
            type="button"
            class="ios-row ios-row--action"
            @click="form.config.riskNoticeEnabled = !form.config.riskNoticeEnabled"
          >
            <span class="ios-label">免責事項</span>
            <span class="ios-value ios-value--switch">
              <input type="checkbox" v-model="form.config.riskNoticeEnabled" class="ios-switch" @click.stop />
            </span>
          </button>
        </div>
        <div class="ios-form">
          <button type="button" class="ios-row ios-row--action" @click="openFieldEditor('visibility')">
            <span class="ios-label">公開範囲</span>
            <span class="ios-value">{{ getSelectLabel('visibility', form.visibility) }}</span>
          </button>
          <button type="button" class="ios-row ios-row--action" @click="openFieldEditor('visibleRange')">
            <span class="ios-label">Console 可視範囲</span>
            <span class="ios-value">{{ getSelectLabel('visibleRange', form.config.visibleRange) }}</span>
          </button>
          <div class="ios-row ios-row--builder-line ios-row--textarea" @click="focusRefundPolicy">
            <span class="ios-label">返金ポリシー</span>
            <textarea
              class="ios-inline-input ios-inline-input--textarea"
              placeholder="请输入"
              ref="refundPolicyInputRef"
              v-model="form.config.refundPolicy"
              rows="2"
            ></textarea>
          </div>
          <div class="ios-row ios-row--builder-line ios-row--textarea">
            <span class="ios-label">注意事項 · {{ langLabel(activeContentLang) }}</span>
            <textarea
              class="ios-inline-input ios-inline-input--textarea"
              placeholder="例：安全须知、携带物品、集合规则"
              v-model="form.config.riskNoticeText"
              rows="2"
            ></textarea>
          </div>
          <p class="ios-helper mt-2">AI 生成结果会覆盖当前语言的注意事项。</p>
        </div>
      </section>

      <!-- Rich text -->
      <section class="ios-panel" ref="sectionRichText">
        <div class="ios-form">
          <button
            type="button"
            class="ios-row ios-row--action ios-row--textarea ios-row--rich-note"
            @click="openRichTextEditor"
          >
            <div class="ios-rich-text">
              <div class="ios-rich-text__head">
                <span class="ios-label">活动详情</span>
                <span v-if="richTextImageCount" class="ios-chip">{{ richTextImageCount }} 张图</span>
              </div>
              <span
                class="ios-value ios-value--multiline ios-rich-text__preview"
                :class="{ 'ios-value--placeholder': !richTextPreview }"
              >
                {{ richTextPreview || '点击编辑笔记' }}
              </span>
              <p class="ios-helper">支持图文笔记，长按或再次点击可继续编辑</p>
            </div>
          </button>
        </div>
      </section>

      <!-- Ticket -->
      <section class="ios-panel" ref="sectionTickets">
        <div class="ios-form">
          <div class="ios-row ios-row--builder-line">
            <span class="ios-label">参加費</span>
            <input
              type="tel"
              class="ios-inline-input"
              placeholder="免费活动"
              inputmode="numeric"
              pattern="[0-9]*"
              ref="ticketPriceInputRef"
              :value="ticketPriceDisplay"
              @input="handleTicketInput"
            />
            <span v-if="form.ticketPrice != null" class="ios-suffix">円</span>
          </div>
        </div>
      </section>

      <!-- Dynamic form -->
      <section class="ios-panel ios-panel--builder" ref="sectionForm">
        <div class="ios-builder-head">
          <p class="builder-eyebrow">招募表单</p>
          <div class="builder-actions">
            <p v-if="!registrationFields.length" class="builder-hint">{{ builderHintText }}</p>
            <button type="button" class="ios-add-btn" @click="addField">＋ 新增项目</button>
          </div>
          <div class="builder-quick">
            <span class="builder-quick__label">常用字段</span>
            <div class="builder-quick__chips">
              <button type="button" class="quick-chip" @click="addPresetField('name')">姓名</button>
              <button type="button" class="quick-chip" @click="addPresetField('phone')">电话</button>
              <button type="button" class="quick-chip" @click="addPresetField('email')">邮箱</button>
            </div>
          </div>
        </div>
        <article
          v-for="(field, index) in registrationFields"
          :key="field.uuid"
          class="ios-field-set"
        >
          <div class="ios-field-set__head">
            <p>質問 {{ index + 1 }}</p>
            <button type="button" class="ios-field-card__delete" @click="removeField(field.uuid)">
              削除
            </button>
          </div>
          <div class="ios-field-set__body">
            <div class="ios-row ios-row--builder-line" @click="focusFieldInput(field.uuid, 'label')">
              <span class="ios-label">タイトル</span>
              <input
                class="ios-inline-input"
                :data-field="`label-${field.uuid}`"
                placeholder="例：参加者の氏名"
                v-model="field.label"
              />
            </div>
            <div class="ios-row ios-row--builder-line">
              <span class="ios-label">回答形式</span>
              <select v-model="field.type" class="ios-inline-select">
                <option value="text">テキスト</option>
                <option value="textarea">複数行</option>
                <option value="number">数字</option>
                <option value="date">日付</option>
                <option value="phone">電話</option>
                <option value="email">メール</option>
                <option value="select">セレクト</option>
                <option value="singleChoice">単一選択</option>
                <option value="multiChoice">複数選択</option>
                <option value="checkbox">同意チェック</option>
              </select>
            </div>
            <div class="ios-row ios-row--builder-line">
              <span class="ios-label">必須</span>
              <label class="ios-toggle">
                <input type="checkbox" v-model="field.required" />
                <span></span>
              </label>
            </div>
            <div class="ios-row ios-row--builder-line" @click="focusFieldInput(field.uuid, 'placeholder')">
              <span class="ios-label">ヒント</span>
              <input
                class="ios-inline-input"
                :data-field="`placeholder-${field.uuid}`"
                placeholder="例：参加動機を教えてください"
                v-model="field.placeholder"
              />
            </div>
            <div
              class="ios-row ios-row--builder-line"
              v-if="['select', 'singleChoice', 'multiChoice'].includes(field.type)"
              @click="focusFieldInput(field.uuid, 'options')"
            >
              <span class="ios-label">選択肢</span>
              <input
                class="ios-inline-input"
                :data-field="`options-${field.uuid}`"
                placeholder="A,B,C"
                v-model="field.optionsText"
              />
            </div>
          </div>
        </article>
        <p v-if="registrationFields.length" class="builder-hint builder-hint--inline">
          {{ builderHintText }}
        </p>
        <button
          v-if="registrationFields.length"
          type="button"
          class="ios-add-btn ios-add-btn--full"
          @click="addField"
        >
          ＋ 新增项目
        </button>
        <div v-else class="hint">
          目前还没有报名字段，点击［新增项目］开始设置。
        </div>
      </section>

      <div class="actions" v-if="!isMobileLayout">
        <button type="submit" class="primary" :disabled="submitting">
          {{ submitting ? '保存中…' : '保存' }}
        </button>
      </div>
      <p v-if="saveStatus" class="status success">{{ saveStatus }}</p>
      <p v-if="error" class="status error">{{ error }}</p>
    </form>

    <div v-if="isMobileLayout" class="bottom-nav">
      <button type="button" class="nav-btn ghost" :disabled="!eventId" @click="handlePreview">
        预览活动
      </button>
      <button
        type="button"
        class="nav-btn secondary"
        :disabled="submitting"
        @click="handleSaveDraft"
      >
        {{ actionLoading === 'draft' ? '保存中…' : '保存草稿' }}
      </button>
      <button
        type="button"
        class="nav-btn primary"
        :disabled="submitting"
        @click="handlePublish"
      >
        {{ actionLoading === 'publish' ? '发布中…' : '发布活动' }}
      </button>
    </div>

    <div v-if="editingField" class="field-modal" @click.self="closeFieldEditor">
      <div
        class="field-sheet"
        :class="{
          'field-sheet--wide': ['text', 'number'].includes(fieldMeta[editingField].type),
          'field-sheet--large': fieldMeta[editingField].type === 'textarea',
        }"
      >
        <header class="field-sheet-head">
          <button type="button" @click="closeFieldEditor">取消</button>
          <p>{{ fieldMeta[editingField].label }}</p>
          <button type="button" class="highlight" @click="confirmFieldEditor">完成</button>
        </header>
        <div class="field-sheet-body">
          <input
            v-if="['text', 'number'].includes(fieldMeta[editingField].type)"
            v-model="fieldDraft"
            :type="fieldMeta[editingField].type === 'number' ? 'number' : 'text'"
            :placeholder="fieldMeta[editingField].placeholder"
          />
          <textarea
            v-else-if="fieldMeta[editingField].type === 'textarea'"
            v-model="fieldDraft"
            rows="5"
            :placeholder="fieldMeta[editingField].placeholder"
          ></textarea>
          <div
            v-else-if="fieldMeta[editingField].type === 'select'"
            class="select-option-list"
          >
            <button
              v-for="opt in selectOptions[editingField] || []"
              :key="opt.value"
              type="button"
              class="select-option"
              :class="{ active: fieldDraft === opt.value }"
              @click="fieldDraft = opt.value"
            >
              <span>{{ opt.label }}</span>
              <span v-if="fieldDraft === opt.value" class="i-lucide-check"></span>
            </button>
          </div>
          <IosDateTimePicker
            v-else
            v-model="fieldDraft"
          />
        </div>
      </div>
    </div>

    <NoteEditorOverlay
      v-if="showNoteOverlay"
      :context="noteOverlayContext"
      @close="closeNoteOverlay"
      @save="handleNoteOverlaySave"
    />

    <div v-if="showCopyOverlay" class="copy-overlay" @click.self="closeCopyOverlay">
      <div class="copy-sheet">
        <header class="copy-sheet-head">
          <button type="button" class="sheet-close" @click="closeCopyOverlay">
            <span class="i-lucide-x"></span>
          </button>
          <div>
            <p class="copy-sheet-title">选择要复制的活动</p>
            <p class="copy-sheet-desc">会带入所有字段，发布前请再确认</p>
          </div>
        </header>
        <div class="copy-sheet-body">
          <p v-if="copyLoading" class="copy-status">加载历史活动中…</p>
          <p v-else-if="copyError" class="copy-status error">{{ copyError }}</p>
          <template v-else>
            <button
              v-for="item in copyEventItems"
              :key="item.id"
              type="button"
              class="copy-list-item"
              @click="handleCopyFromEvent(item.id)"
              :disabled="Boolean(copySelectingId) && copySelectingId !== item.id"
            >
              <div class="copy-list-text">
                <p class="copy-list-title">{{ item.title }}</p>
                <p class="copy-list-meta">{{ item.dateRange }}</p>
              </div>
              <span class="copy-list-status">{{ copyStatusLabel(item.status) }}</span>
              <span
                v-if="copySelectingId === item.id"
                class="copy-spinner"
              ></span>
            </button>
            <p v-if="!copyEventItems.length" class="copy-status">
              暂无可复制的活动。
            </p>
          </template>
        </div>
      </div>
    </div>

  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, onMounted, onUnmounted, onActivated, nextTick, watch } from 'vue';
import type { Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { RouteLocationRaw } from 'vue-router';
import {
  createConsoleEvent,
  fetchConsoleEvent,
  updateConsoleEvent,
  fetchConsoleCommunity,
  fetchConsoleCommunityEvents,
  uploadEventCovers,
  fetchEventGallery,
  deleteEventCover,
  generateEventContent,
} from '../../api/client';
import { useToast } from '../../composables/useToast';
import IosDateTimePicker from '../../components/common/IosDateTimePicker.vue';
import type {
  RegistrationFormField,
  EventGalleryItem,
  ConsoleEventSummary,
  ConsoleEventDetail,
  GeneratedEventContent,
} from '../../types/api';
import {
  CONSOLE_AI_EVENT_DRAFT_KEY,
  CONSOLE_EVENT_SCROLL_KEY,
  CONSOLE_EVENT_LANG_KEY,
} from '../../constants/console';
import NoteEditorOverlay from '../../components/console/NoteEditorOverlay.vue';

type FieldKey =
  | 'title'
  | 'description'
  | 'startTime'
  | 'endTime'
  | 'regStartTime'
  | 'regEndTime'
  | 'minParticipants'
  | 'maxParticipants'
  | 'ticketPrice'
  | 'visibility'
  | 'visibleRange'
  | 'refundPolicy';

interface BuilderField extends RegistrationFormField {
  uuid: string;
  optionsText?: string;
}

type NoteOverlayContext = {
  text: string;
  html: string;
  images: Array<{ id: string; src: string }>;
};

const route = useRoute();
const router = useRouter();
const toast = useToast();
const communityId = route.params.communityId as string | undefined;
const eventId = route.params.eventId as string | undefined;
const eventCommunityId = ref<string | null>(communityId ?? null);
const isEdit = computed(() => Boolean(eventId));
const prefersMobileLayout = ref(false);
const isMobileLayout = computed(() => {
  if (prefersMobileLayout.value) return true;
  if (route.meta?.layout === 'console-mobile') return true;
  if (String(route.name ?? '').startsWith('ConsoleMobile')) return true;
  return route.matched.some((record) => record.meta?.layout === 'console-mobile');
});
let mobileMediaQuery: MediaQueryList | null = null;
let handleMobileMediaChange: ((event: MediaQueryListEvent) => void) | null = null;

const defaultConfig = () => ({
  requireCheckin: false,
  enableWaitlist: false,
  visibleRange: 'public',
  refundPolicy: '',
  riskNoticeEnabled: true,
  notes: '',
  riskNoticeText: '',
});

type AiTargetKey = 'title' | 'description' | 'rules';
type ContentLang = 'ja' | 'en' | 'zh';
const supportedContentLangs: ContentLang[] = ['ja', 'en', 'zh'];

const form = reactive({
  title: '',
  subtitle: '',
  description: '',
  descriptionHtml: '',
  locationText: '',
  locationLat: null as number | null,
  locationLng: null as number | null,
  category: '',
  startTime: '',
  endTime: '',
  regStartTime: '',
  regEndTime: '',
  minParticipants: 5 as number | null,
  maxParticipants: 20 as number | null,
  visibility: 'public',
  requireApproval: false,
  ticketPrice: null as number | null,
  config: defaultConfig(),
});

const registrationFields = ref<BuilderField[]>([]);
const galleries = ref<EventGalleryItem[]>([]);
const coverInputRef = ref<HTMLInputElement | null>(null);
const coverError = ref<string | null>(null);
const sectionChecklist = ref<HTMLElement | null>(null);
const sectionCover = ref<HTMLElement | null>(null);
const sectionCategory = ref<HTMLElement | null>(null);
const sectionBasic = ref<HTMLElement | null>(null);
const sectionSchedule = ref<HTMLElement | null>(null);
const sectionConfig = ref<HTMLElement | null>(null);
const sectionRichText = ref<HTMLElement | null>(null);
const sectionTickets = ref<HTMLElement | null>(null);
const sectionForm = ref<HTMLElement | null>(null);
const activeContentLang = ref<ContentLang>('ja');
const contentByLang = reactive<Record<AiTargetKey, Record<string, string>>>({
  title: {},
  description: {},
  rules: {},
});
const descriptionHtmlByLang = reactive<Record<string, string>>({});
const aiLoading = reactive<Record<AiTargetKey, boolean>>({
  title: false,
  description: false,
  rules: false,
});
const aiPreview = ref<{ target: AiTargetKey; text: string; lang: ContentLang } | null>(null);
const aiError = ref('');

const submitting = ref(false);
const error = ref<string | null>(null);
const subtitle = ref('');
const backLink = computed<RouteLocationRaw>(() =>
  communityId
    ? { name: 'console-community-events', params: { communityId } }
    : { name: 'console-communities' },
);
const aiPrefillNotice = ref<string | null>(null);
const aiChecklist = ref<Array<{ id: string; text: string; checked: boolean }>>([]);
const aiConfirmQuestions = ref<Array<{ id: string; text: string; checked: boolean }>>([]);
const builderHintText = '设置报名表里需要填写的问题，顺序即为用户看到的顺序。';
const localCoverPreviews = ref<EventGalleryItem[]>([]);
const pendingCoverFiles = ref<Array<{ id: string; file: File }>>([]);
const MAX_COVERS = 9;
const MAX_COVER_SIZE = 5 * 1024 * 1024; // 5MB (server limit)
const MAX_COVER_UPLOAD_SIZE = 4 * 1024 * 1024; // 提前压缩到更安全的体积
const MAX_COVER_DIMENSION = 1200;
const COVER_COMPRESS_QUALITY = 0.72;
const COVER_FALLBACK_QUALITY = 0.6;
const COVER_RULES_TEXT = '推荐 1200px 宽，最多上传 9 张，默认第一张为主图';
const coverDisplayItems = computed(() =>
  eventId ? galleries.value : localCoverPreviews.value,
);
const currentCoverCount = computed(() => coverDisplayItems.value.length);
const canAddMoreCovers = computed(() => currentCoverCount.value < MAX_COVERS);
const editingField = ref<FieldKey | null>(null);
const fieldDraft = ref('');
const richNoteImages = ref<Array<{ id: string; src: string }>>([]);
const actionLoading = ref<'draft' | 'publish' | null>(null);
const saveStatus = ref<string | null>(null);
let saveStatusTimer: number | null = null;
const uploadingCover = ref(false);
const titleInputRef = ref<HTMLInputElement | null>(null);
const locationInputRef = ref<HTMLInputElement | null>(null);
const refundPolicyInputRef = ref<HTMLTextAreaElement | null>(null);
const ticketPriceInputRef = ref<HTMLInputElement | null>(null);
const minParticipantsInputRef = ref<HTMLInputElement | null>(null);
const maxParticipantsInputRef = ref<HTMLInputElement | null>(null);
const ticketPriceDisplay = computed(() =>
  form.ticketPrice != null ? String(form.ticketPrice) : '',
);
const showNoteOverlay = ref(false);
const noteOverlayContext = ref<NoteOverlayContext>({
  text: '',
  html: '',
  images: [],
});
const showCopyOverlay = ref(false);
const copyEvents = ref<ConsoleEventSummary[]>([]);
const copyLoading = ref(false);
const copyError = ref<string | null>(null);
const copySelectingId = ref<string | null>(null);
const copyEventItems = computed(() =>
  copyEvents.value.map((event) => ({
    id: event.id,
    title: getLocalizedText(event.title),
    status: event.status,
    dateRange: formatCopyRange(event.startTime, event.endTime),
  })),
);
const pastedDraft = ref('');
const draftCheckMessage = ref('');
const pastedPreview = ref<{ title: string; description: string; rules: string } | null>(null);
const showPastePanel = ref(false);
type FieldMetaType = 'text' | 'textarea' | 'datetime' | 'number';

const fieldMeta: Record<FieldKey, { label: string; type: FieldMetaType; placeholder?: string }> = {
  title: { label: 'タイトル', type: 'text', placeholder: '请输入 >' },
  description: { label: 'ショート説明', type: 'textarea', placeholder: '请输入 >' },
  startTime: { label: '開始日時', type: 'datetime' },
  endTime: { label: '終了日時', type: 'datetime' },
  regStartTime: { label: '受付開始', type: 'datetime' },
  regEndTime: { label: '受付締切', type: 'datetime' },
  minParticipants: { label: '最低参加人数', type: 'number', placeholder: '请输入 >' },
  maxParticipants: { label: '最大参加人数', type: 'number', placeholder: '请输入 >' },
  ticketPrice: { label: '参加費 (円)', type: 'number', placeholder: '请输入 >' },
  visibility: { label: '公開範囲', type: 'select' },
  visibleRange: { label: 'Console 可視範囲', type: 'select' },
  refundPolicy: { label: '返金ポリシー', type: 'textarea', placeholder: '例：イベント3日前まで全額返金' },
};

const categoryOptions = [
  { label: '徒步越野', value: 'hiking' },
  { label: 'ランニング', value: 'running' },
  { label: 'サイクリング', value: 'cycling' },
  { label: 'キャンプ', value: 'camping' },
  { label: '水上スポーツ', value: 'water' },
  { label: '親子', value: 'kids' },
  { label: '語学交流', value: 'language' },
  { label: 'その他', value: 'other' },
];

const selectOptions: Partial<Record<FieldKey, Array<{ label: string; value: string }>>> = {
  visibility: [
    { label: '公開 (public)', value: 'public' },
    { label: 'コミュニティのみ', value: 'community-only' },
    { label: '非公開', value: 'private' },
  ],
  visibleRange: [
    { label: '公開 (public)', value: 'public' },
    { label: 'コミュニティ', value: 'community' },
    { label: '非公開', value: 'private' },
  ],
};

const getSelectLabel = (key: 'visibility' | 'visibleRange', value?: string | null) => {
  const list = selectOptions[key] || [];
  const target = list.find((item) => item.value === value);
  return target?.label || '选择';
};

const stripHtml = (value: string) => value.replace(/<[^>]*>/g, '');
const richTextPreview = computed(() => {
  const text = stripHtml(form.descriptionHtml || '') || form.description;
  const base = text ? text.slice(0, 80) : '';
  return base;
});
const richTextImageCount = computed(() => richNoteImages.value.length);
const langLabel = (lang: ContentLang) => {
  switch (lang) {
    case 'en':
      return 'EN';
    case 'zh':
      return '中文';
    default:
      return 'JP';
  }
};

const EMPTY_HINTS: Record<ContentLang, string> = {
  ja: '下書きを入れてから AI に最適化してもらってください。',
  en: 'Add a draft first, then ask AI to improve it.',
  zh: '先写点草稿，再让 AI 优化。',
};

const getLocalizedAiHint = (key: 'empty') => {
  if (key === 'empty') {
    return EMPTY_HINTS[activeContentLang.value] ?? EMPTY_HINTS.ja;
  }
  return EMPTY_HINTS.ja;
};
const setLangContent = (field: AiTargetKey, lang: ContentLang, value: string) => {
  contentByLang[field][lang] = value ?? '';
};
const getLangContent = (field: AiTargetKey, lang: ContentLang) => contentByLang[field][lang] ?? '';
const syncContentMap = (lang: ContentLang) => {
  setLangContent('title', lang, form.title || '');
  setLangContent('description', lang, form.description || '');
  descriptionHtmlByLang[lang] = form.descriptionHtml || '';
  setLangContent('rules', lang, form.config.riskNoticeText || '');
};
const applyContentFromMap = (lang: ContentLang) => {
  form.title = getLangContent('title', lang);
  form.description = getLangContent('description', lang);
  const mappedHtml = descriptionHtmlByLang[lang];
  if (mappedHtml) {
    form.descriptionHtml = mappedHtml;
  } else if (form.description) {
    form.descriptionHtml = `<p>${form.description}</p>`;
  } else {
    form.descriptionHtml = '';
  }
  form.config.riskNoticeText = getLangContent('rules', lang);
};
const switchContentLang = (lang: ContentLang) => {
  if (lang === activeContentLang.value) return;
  syncContentMap(activeContentLang.value);
  activeContentLang.value = lang;
  applyContentFromMap(lang);
};

const loadStoredLang = () => {
  try {
    const stored = sessionStorage.getItem(CONSOLE_EVENT_LANG_KEY);
    if (!stored) return;
    if (supportedContentLangs.includes(stored as ContentLang)) {
      activeContentLang.value = stored as ContentLang;
      applyContentFromMap(activeContentLang.value);
    }
  } catch (err) {
    console.warn('Failed to load stored lang', err);
  }
};

const persistLang = () => {
  try {
    sessionStorage.setItem(CONSOLE_EVENT_LANG_KEY, activeContentLang.value);
  } catch (err) {
    console.warn('Failed to persist lang', err);
  }
};
watch(
  () => form.title,
  (val) => {
    setLangContent('title', activeContentLang.value, val || '');
  },
);
watch(
  () => form.description,
  (val) => {
    setLangContent('description', activeContentLang.value, val || '');
  },
);
watch(
  () => form.descriptionHtml,
  (val) => {
    descriptionHtmlByLang[activeContentLang.value] = val || '';
  },
);
watch(
  () => form.config.riskNoticeText,
  (val) => {
    setLangContent('rules', activeContentLang.value, val || '');
  },
);
const aiFieldLabel = (target: AiTargetKey) => {
  switch (target) {
    case 'title':
      return '标题';
    case 'rules':
      return '注意事项';
    default:
      return '详情';
  }
};
const pickLocalized = (field: any, lang: ContentLang) => {
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (typeof field.original === 'string' && field.lang === lang) {
    return field.original;
  }
  const translations = (field.translations ?? {}) as Record<string, string>;
  if (typeof translations[lang] === 'string') return translations[lang];
  if (typeof field[lang] === 'string') return field[lang];
  if (typeof field.original === 'string') return field.original;
  const fallback = Object.values(field).find((value) => typeof value === 'string');
  return typeof fallback === 'string' ? fallback : '';
};
const buildAiPayload = (lang: ContentLang) => {
  const lines = [
    form.title && `Current title: ${form.title}`,
    form.category && `Category: ${form.category}`,
    form.locationText && `Location: ${form.locationText}`,
    form.startTime && `Start: ${formatDisplayDate(form.startTime)}`,
    form.config.riskNoticeText && `Rules: ${form.config.riskNoticeText}`,
    registrationFields.value.length && `Questions: ${registrationFields.value.length} required`,
  ].filter(Boolean);
  return {
    baseLanguage: lang,
    topic: form.title || 'コミュニティイベント',
    audience: 'community members and new participants',
    style: 'friendly, concise, mobile-first',
    details: lines.join('\n') || 'Generate a concise event description and rules.',
  };
};
const requestAiSuggestion = async (target: AiTargetKey) => {
  aiError.value = '';
  aiPreview.value = null;
  aiLoading[target] = true;
  try {
    const draftText =
      target === 'title'
        ? getLangContent('title', activeContentLang.value)
        : target === 'rules'
          ? getLangContent('rules', activeContentLang.value)
          : getLangContent('description', activeContentLang.value);
    if (!draftText.trim()) {
      const emptyMessage = getLocalizedAiHint('empty');
      aiError.value = emptyMessage;
      toast.show(emptyMessage);
      return;
    }
    const basePayload = buildAiPayload(activeContentLang.value);
    const result = await generateEventContent({
      ...basePayload,
      details: `${basePayload.details}\n\nDraft to optimize (${activeContentLang.value}):\n${draftText}`,
      topic: draftText.slice(0, 60) || basePayload.topic,
    });
    const field =
      target === 'title'
        ? result.title
        : target === 'rules'
          ? result.riskNotice ?? result.notes
          : result.description;
    const text = pickLocalized(field, activeContentLang.value);
    if (!text) {
      throw new Error('AI 没有返回内容，请稍后再试');
    }
    aiPreview.value = { target, text, lang: activeContentLang.value };
  } catch (err) {
    aiError.value = err instanceof Error ? err.message : 'AI 生成失败，请稍后重试';
  } finally {
    aiLoading[target] = false;
  }
};
const applyAiSuggestion = (target: AiTargetKey) => {
  if (!aiPreview.value || aiPreview.value.target !== target) return;
  const { text, lang } = aiPreview.value;
  setLangContent(target, lang, text);
  if (lang !== activeContentLang.value) {
    switchContentLang(lang);
  }
  if (target === 'title') {
    form.title = text;
  } else if (target === 'description') {
    form.description = text;
    form.descriptionHtml = `<p>${text}</p>`;
    richNoteImages.value = [];
  } else if (target === 'rules') {
    form.config.riskNoticeEnabled = true;
    form.config.riskNoticeText = text;
  }
  aiPreview.value = null;
};

const formatDisplayDate = (value: string) => {
  if (!value) return '请设置';
  try {
    return new Date(value).toLocaleString('ja-JP', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
};

const openFieldEditor = (key: FieldKey) => {
  editingField.value = key;
  const current = (form as any)[key];
  if (current != null && current !== '') {
    fieldDraft.value = String(current);
  } else if (fieldMeta[key].type === 'select') {
    fieldDraft.value = selectOptions[key]?.[0]?.value ?? '';
  } else {
    fieldDraft.value = '';
  }
};

const closeFieldEditor = () => {
  editingField.value = null;
  fieldDraft.value = '';
};

const confirmFieldEditor = () => {
  if (!editingField.value) return;
  const meta = fieldMeta[editingField.value];
  if (meta.type === 'number') {
    const trimmed = fieldDraft.value.trim();
    if (!trimmed) {
      (form as any)[editingField.value] = null;
    } else {
      const parsed = Number(trimmed);
      (form as any)[editingField.value] = Number.isFinite(parsed) ? parsed : null;
    }
  } else if (meta.type === 'select') {
    (form as any)[editingField.value] = fieldDraft.value;
  } else {
    (form as any)[editingField.value] = fieldDraft.value;
  }
  if (editingField.value === 'startTime') {
    autoFillEndTime();
  }
  if (editingField.value === 'regStartTime') {
    autoFillRegEnd();
  }
  closeFieldEditor();
};

const toChecklistItems = (items: string[]) =>
  items.map((text, idx) => ({
    id: `${Date.now()}-${idx}-${Math.random().toString(36).slice(2)}`,
    text,
    checked: false,
  }));

const applyAiDraft = (draft: any) => {
  if (!draft) return;
  form.title = draft.title || form.title;
  if (draft.subtitle) {
    form.subtitle = draft.subtitle;
  }
  if (draft.description) {
    form.description = draft.description;
    form.descriptionHtml = `<p>${draft.description}</p>`;
    richNoteImages.value = [];
  }
  if (draft.logistics) {
    form.locationText = draft.logistics.locationText || form.locationText;
    if (draft.logistics.startTime) {
      form.startTime = toLocalInput(draft.logistics.startTime);
    }
    if (draft.logistics.endTime) {
      form.endTime = toLocalInput(draft.logistics.endTime);
    }
  }
  if (draft.visibility) {
    form.visibility = draft.visibility;
  }
  if (Array.isArray(draft.ticketTypes) && draft.ticketTypes.length) {
    const price = Number(draft.ticketTypes[0].price);
    form.ticketPrice = Number.isFinite(price) ? price : form.ticketPrice;
  }
  if (draft.minParticipants != null) {
    form.minParticipants = draft.minParticipants;
  }
  if (draft.maxParticipants != null) {
    form.maxParticipants = draft.maxParticipants;
  }
  if (Array.isArray(draft.registrationForm) && draft.registrationForm.length) {
    registrationFields.value = draft.registrationForm.map((field: any) => ({
      uuid: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      label: field.label || '質問',
      type: field.type || 'text',
      required: field.required ?? true,
      placeholder: field.placeholder ?? '',
      optionsText: Array.isArray(field.options) ? field.options.join(', ') : '',
    }));
  }
  if (Array.isArray(draft.requirements) && draft.requirements.length) {
    form.config.notes = draft.requirements.map((req: any) => req.label).join('\n');
  }
  aiChecklist.value = toChecklistItems(draft.checklist || []);
  aiConfirmQuestions.value = toChecklistItems(draft.confirmQuestions || []);
  aiPrefillNotice.value = 'AI 草稿を読み込みました。各項目を確認してください。';
};

const loadAiDraftFromSession = () => {
  if (isEdit.value) return;
  const raw = sessionStorage.getItem(CONSOLE_AI_EVENT_DRAFT_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    applyAiDraft(parsed);
    sessionStorage.removeItem(CONSOLE_AI_EVENT_DRAFT_KEY);
  } catch (err) {
    console.warn('Failed to parse AI draft', err);
  }
};

const hydrateLocalizedField = (key: AiTargetKey, field: any, html?: string | null) => {
  if (!field) return;
  const baseLang =
    typeof field.lang === 'string' && supportedContentLangs.includes(field.lang as ContentLang)
      ? (field.lang as ContentLang)
      : ('ja' as ContentLang);
  if (typeof field.original === 'string') {
    setLangContent(key, baseLang, field.original);
  }
  const translations = (field.translations ?? {}) as Record<string, string>;
  Object.entries(translations).forEach(([lang, text]) => {
    if (supportedContentLangs.includes(lang as ContentLang)) {
      setLangContent(key, lang as ContentLang, text);
    }
  });
  supportedContentLangs.forEach((lang) => {
    const direct = (field as any)[lang];
    if (typeof direct === 'string') {
      setLangContent(key, lang, direct);
    }
  });
  if (key === 'description' && html) {
    descriptionHtmlByLang[baseLang] = html;
  }
};

const applyEventDetailToForm = (
  event: ConsoleEventDetail,
  options: {
    syncCommunity?: boolean;
    setSubtitle?: boolean;
    includeGalleries?: boolean;
    stripParticipants?: boolean;
  } = {},
) => {
  const sanitizedConfig =
    options.stripParticipants && event.config
      ? {
          ...event.config,
          attendeeAvatars: [],
          participants: [],
          attendeePreview: [],
          participantCount: null,
        }
      : event.config ?? {};

  const titleText = getLocalizedText(event.title);
  form.title = titleText;
  form.description = getLocalizedText(event.description);
  form.descriptionHtml = event.descriptionHtml ?? '';
  richNoteImages.value = extractNoteImagesFromHtml(form.descriptionHtml);
  form.category = event.category ?? '';
  form.locationText = event.locationText ?? '';
  form.locationLat = event.locationLat ?? null;
  form.locationLng = event.locationLng ?? null;
  form.startTime = toLocalInput(event.startTime);
  form.endTime = toLocalInput(event.endTime ?? event.startTime);
  form.regStartTime = toLocalInput(event.regStartTime ?? event.startTime);
  form.regEndTime = toLocalInput(event.regEndTime ?? event.regDeadline ?? event.endTime ?? event.startTime);
  form.minParticipants = event.minParticipants ?? form.minParticipants;
  form.maxParticipants = event.maxParticipants ?? form.maxParticipants;
  form.visibility = event.visibility ?? form.visibility;
  form.requireApproval = event.requireApproval ?? form.requireApproval;
  const firstTicket = event.ticketTypes?.[0];
  form.ticketPrice = typeof firstTicket?.price === 'number' ? firstTicket.price : null;
  form.config = { ...defaultConfig(), ...sanitizedConfig };
  const schema = Array.isArray(event.registrationFormSchema)
    ? (event.registrationFormSchema as RegistrationFormField[])
    : [];
  registrationFields.value = buildBuilderFields(schema);

  hydrateLocalizedField('title', event.title);
  hydrateLocalizedField('description', event.description, event.descriptionHtml);
  hydrateLocalizedField('rules', sanitizedConfig?.riskNoticeText ?? sanitizedConfig?.riskNotice);
  const localizedLang =
    typeof event.title?.lang === 'string' && supportedContentLangs.includes(event.title.lang as ContentLang)
      ? (event.title.lang as ContentLang)
      : activeContentLang.value;
  activeContentLang.value = localizedLang;
  applyContentFromMap(localizedLang);

  if (options.syncCommunity && event.communityId) {
    eventCommunityId.value = event.communityId;
  }
  if (options.setSubtitle) {
    subtitle.value = titleText;
  }
  if (options.includeGalleries) {
    galleries.value = event.galleries ?? [];
  }
};

const load = async () => {
  if (communityId && !eventId) {
    const community = await fetchConsoleCommunity(communityId);
    subtitle.value = `コミュニティ: ${community.name}`;
  }

  if (!eventId) {
    loadAiDraftFromSession();
    return;
  }
  try {
    const event = await fetchConsoleEvent(eventId);
    applyEventDetailToForm(event, { syncCommunity: true, setSubtitle: true, includeGalleries: true });
    if (!event.galleries?.length) {
      await reloadGallery();
    }
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'イベント読み込みに失敗しました';
  }
};

const reloadGallery = async () => {
  if (!eventId) return;
  try {
    galleries.value = await fetchEventGallery(eventId);
  } catch (err) {
    console.error(err);
  }
};

const getLocalizedText = (field: any) => {
  if (typeof field === 'object' && field) {
    return (field.original as string) || '';
  }
  return String(field ?? '');
};

const toLocalInput = (value?: string | Date | null) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (num: number) => String(num).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const toIso = (value?: string | null) => (value ? new Date(value).toISOString() : null);

const autoFillEndTime = () => {
  if (!form.startTime) return;
  const start = new Date(form.startTime);
  const desiredEnd = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  if (!form.endTime || new Date(form.endTime) <= start) {
    form.endTime = toLocalInput(desiredEnd);
  }
  if (form.regEndTime && new Date(form.regEndTime) > start) {
    const fallback = new Date(start.getTime() - 60 * 60 * 1000);
    form.regEndTime = toLocalInput(fallback);
  }
};

const autoFillRegEnd = () => {
  if (!form.regStartTime) return;
  if (form.regEndTime && new Date(form.regEndTime) >= new Date(form.regStartTime)) return;
  const start = new Date(form.startTime || form.regStartTime);
  const fallback = new Date(start.getTime() - 60 * 60 * 1000);
  form.regEndTime = toLocalInput(fallback);
};

watch(
  () => form.startTime,
  (value) => {
    if (value) {
      autoFillEndTime();
    }
  },
);

const setEndShortcut = (hours: number) => {
  if (!form.startTime) {
    error.value = '请先设置开始时间';
    return;
  }
  const start = new Date(form.startTime);
  const target = new Date(start.getTime() + hours * 60 * 60 * 1000);
  form.endTime = toLocalInput(target);
};

const setRegDeadlineShortcut = (minutesBeforeStart: number) => {
  if (!form.startTime) {
    error.value = '请先设置开始时间';
    return;
  }
  const start = new Date(form.startTime);
  const target = new Date(start.getTime() - minutesBeforeStart * 60 * 1000);
  form.regEndTime = toLocalInput(target);
  if (!form.regStartTime || new Date(form.regStartTime) > target) {
    const safeStart = new Date(target.getTime() - 30 * 60 * 1000);
    form.regStartTime = toLocalInput(safeStart);
  }
};

const presetFields: Record<
  'name' | 'phone' | 'email',
  { label: string; type: string; placeholder: string }
> = {
  name: { label: '姓名', type: 'text', placeholder: '请填写姓名' },
  phone: { label: '电话', type: 'phone', placeholder: '例：09012345678' },
  email: { label: '邮箱', type: 'email', placeholder: 'example@example.com' },
};

const addPresetField = (key: keyof typeof presetFields) => {
  const preset = presetFields[key];
  if (!preset) return;
  registrationFields.value.push({
    uuid: Math.random().toString(36).slice(2),
    label: preset.label,
    type: preset.type,
    required: true,
    placeholder: preset.placeholder,
    optionsText: '',
  });
};

const scrollToSection = (section: string) => {
  const map: Record<string, HTMLElement | null> = {
    checklist: sectionChecklist.value,
    cover: sectionCover.value,
    category: sectionCategory.value,
    basic: sectionBasic.value,
    schedule: sectionSchedule.value,
    config: sectionConfig.value,
    rich: sectionRichText.value,
    tickets: sectionTickets.value,
    form: sectionForm.value,
  };
  const el = map[section];
  if (el) {
    window.scrollTo({
      top: el.getBoundingClientRect().top + window.scrollY - 80,
      behavior: 'smooth',
    });
  }
};

const formatCopyRange = (start: string, end?: string) => {
  const startText = new Date(start).toLocaleString('ja-JP', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
  if (!end) return startText;
  const endText = new Date(end).toLocaleString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${startText}〜${endText}`;
};

const copyStatusLabel = (status: string) => {
  switch (status) {
    case 'open':
      return '受付中';
    case 'closed':
      return '已结束';
    default:
      return '草稿';
  }
};

const extractFromPastedDraft = (text: string) => {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const title = lines[0] ?? '';
  const description = lines.slice(1, 4).join(' ').slice(0, 280);
  const rulesLine = lines.find((line) => /注意|規則|规则|须知|rule/i.test(line)) ?? '';
  return {
    title,
    description,
    rules: rulesLine || '',
  };
};

const checkPastedDraft = () => {
  draftCheckMessage.value = '';
  pastedPreview.value = null;
  const text = pastedDraft.value.trim();
  const length = text.length;
  if (!length) {
    draftCheckMessage.value = getLocalizedAiHint('empty');
    toast.show(draftCheckMessage.value);
    return;
  }
  if (length < 80) {
    draftCheckMessage.value = '文字が少ないため、企画相談モードでアイデアを広げてください。';
    toast.show(draftCheckMessage.value);
    goToEventAssistant();
    return;
  }
  const preview = extractFromPastedDraft(text);
  pastedPreview.value = preview;
  draftCheckMessage.value = '草案を検出しました。確認してから表单に反映できます。';
};

const applyPastedPreview = () => {
  if (!pastedPreview.value) return;
  const confirmed = window.confirm('この草案を表单に反映しますか？(タイトル/详情/注意事項)');
  if (!confirmed) return;
  const { title, description, rules } = pastedPreview.value;
  if (title) {
    form.title = title;
    setLangContent('title', activeContentLang.value, title);
  }
  if (description) {
    form.description = description;
    form.descriptionHtml = `<p>${description}</p>`;
    setLangContent('description', activeContentLang.value, description);
    descriptionHtmlByLang[activeContentLang.value] = form.descriptionHtml;
  }
  if (rules) {
    form.config.riskNoticeText = rules;
    setLangContent('rules', activeContentLang.value, rules);
  }
  pastedPreview.value = null;
  draftCheckMessage.value = '表单に反映しました。内容を確認してください。';
  toast.show(draftCheckMessage.value);
};

const togglePaste = (state?: boolean) => {
  const next = state !== undefined ? state : !showPastePanel.value;
  showPastePanel.value = next;
  try {
    if (next) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  } catch (err) {
    console.warn('Failed to toggle body overflow', err);
  }
  if (!next) {
    draftCheckMessage.value = '';
    pastedPreview.value = null;
  }
};

const triggerCoverPicker = () => {
  if (coverInputRef.value) {
    coverInputRef.value.click();
  }
};

const parseCoverUploadError = (err: unknown) => {
  const status = (err as any)?.response?.status;
  if (status === 413) {
    return '封面图片过大，请选择更小的图片或继续压缩后再试';
  }
  const isNetwork = (err as any)?.message === 'Network Error';
  const isCors =
    (err as any)?.message?.includes?.('CORS') ||
    (err as any)?.message?.includes?.('Failed to fetch') ||
    (err as any)?.message?.includes?.('ERR_FAILED');
  if (isCors) {
    return '封面上传被跨域限制拦截，请改用同域 API（或本地代理）后重试';
  }
  if (isNetwork) {
    return '封面上传失败，请检查网络或稍后重试';
  }
  return err instanceof Error ? err.message : '封面上传失败，请重试';
};

const showCoverError = (message: string, type: 'error' | 'warning' = 'error') => {
  coverError.value = message;
  toast.show(message, type);
};

const toJpegBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('压缩失败'));
          return;
        }
        resolve(blob);
      },
      'image/jpeg',
      quality,
    );
  });

const downscaleImageFile = (file: File) =>
  new Promise<File>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        try {
          const maxSide = Math.max(img.width, img.height);
          const ratio = maxSide > MAX_COVER_DIMENSION ? MAX_COVER_DIMENSION / maxSide : 1;
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * ratio);
          canvas.height = Math.round(img.height * ratio);
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('无法压缩图片'));
            return;
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          let blob = await toJpegBlob(canvas, COVER_COMPRESS_QUALITY);
          if (blob.size > MAX_COVER_UPLOAD_SIZE) {
            blob = await toJpegBlob(canvas, COVER_FALLBACK_QUALITY);
          }

          const compressed = new File([blob], file.name.replace(/\.\w+$/, '.jpg'), {
            type: blob.type || 'image/jpeg',
          });
          resolve(compressed);
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error('无法读取图片'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('无法读取图片'));
    reader.readAsDataURL(file);
  });

const loadCopyEvents = async () => {
  if (!eventCommunityId.value) return;
  copyLoading.value = true;
  copyError.value = null;
  try {
    copyEvents.value = await fetchConsoleCommunityEvents(eventCommunityId.value);
  } catch (err) {
    copyError.value = err instanceof Error ? err.message : '无法加载历史活动，请稍后再试';
  } finally {
    copyLoading.value = false;
  }
};

const importGalleryToPending = async (detail: ConsoleEventDetail) => {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
  if (!detail.galleries?.length) return;
  revokeLocalCoverPreviews();
  const gallerySlice = detail.galleries.slice(0, MAX_COVERS);
  const tasks = gallerySlice.map(async (item, index) => {
    try {
      const resolvedUrl = resolveAssetUrl(item.imageUrl);
      const response = await fetch(resolvedUrl, { credentials: 'include' });
      if (!response.ok) return;
      const blob = await response.blob();
      const extension = blob.type.includes('png') ? 'png' : 'jpg';
      const fileName = `copied-${Date.now()}-${index}.${extension}`;
      const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });
      const id = `${fileName}-${Math.random().toString(36).slice(2)}`;
      pendingCoverFiles.value.push({ id, file });
      const objectUrl = URL.createObjectURL(file);
      localCoverPreviews.value.push({
        id,
        imageUrl: objectUrl,
        order: index,
      });
    } catch (err) {
      console.warn('Failed to import gallery cover', err);
    }
  });
  await Promise.all(tasks);
};

const openCopyOverlay = async () => {
  if (!eventCommunityId.value) {
    error.value = '请选择社群后再复制历史活动';
    return;
  }
  showCopyOverlay.value = true;
  if (!copyEvents.value.length && !copyLoading.value) {
    await loadCopyEvents();
  }
};

const closeCopyOverlay = () => {
  showCopyOverlay.value = false;
};

const handleCopyFromEvent = async (sourceEventId: string) => {
  copySelectingId.value = sourceEventId;
  copyError.value = null;
  try {
    const detail = await fetchConsoleEvent(sourceEventId);
    applyEventDetailToForm(detail, {
      includeGalleries: Boolean(eventId),
      stripParticipants: true,
    });
    if (!eventId) {
      await importGalleryToPending(detail);
    }
    aiPrefillNotice.value = `已复制「${getLocalizedText(detail.title) || '历史活动'}」内容，请根据实际情况调整。`;
    showCopyOverlay.value = false;
  } catch (err) {
    copyError.value = err instanceof Error ? err.message : '复制失败，请稍后再试';
  } finally {
    copySelectingId.value = null;
  }
};

const revokeLocalCoverPreviews = () => {
  localCoverPreviews.value.forEach((item) => URL.revokeObjectURL(item.imageUrl));
  localCoverPreviews.value = [];
  pendingCoverFiles.value = [];
};

const setLocalCoverPreviews = (files: File[]) => {
  const startOrder = localCoverPreviews.value.length;
  files.forEach((file, idx) => {
    const url = URL.createObjectURL(file);
    const id = `local-${Date.now()}-${idx}`;
    localCoverPreviews.value.push({
      id,
      imageUrl: url,
      order: startOrder + idx,
    });
    pendingCoverFiles.value.push({ id, file });
  });
};

const removeLocalCoverPreview = (coverId: string) => {
  const preview = localCoverPreviews.value.find((item) => item.id === coverId);
  if (preview) {
    URL.revokeObjectURL(preview.imageUrl);
  }
  localCoverPreviews.value = localCoverPreviews.value.filter((item) => item.id !== coverId);
  pendingCoverFiles.value = pendingCoverFiles.value.filter((item) => item.id !== coverId);
};

const buildContent = (text: string, field: AiTargetKey) => {
  syncContentMap(activeContentLang.value);
  const translations = { ...(contentByLang[field] || {}) } as Record<string, string>;
  const baseLang: ContentLang = translations.ja ? 'ja' : activeContentLang.value;
  const original = translations[baseLang] ?? text;
  delete translations[baseLang];
  Object.keys(translations).forEach((lang) => {
    if (!translations[lang]) {
      delete translations[lang];
    }
  });
  return {
    original,
    lang: baseLang,
    translations,
  };
};

function buildRegistrationSchema() {
  return registrationFields.value
    .filter((field) => field.label.trim().length > 0)
    .map((field) => ({
      label: field.label,
      type: field.type,
      required: field.required ?? false,
      placeholder: field.placeholder,
      options: field.optionsText
        ? field.optionsText
            .split(',')
            .map((opt) => opt.trim())
            .filter(Boolean)
        : undefined,
    }));
}

const buildBuilderFields = (schema: RegistrationFormField[]): BuilderField[] =>
  schema.map((field, index) => ({
    uuid: `${field.label ?? 'field'}-${index}-${Date.now()}`,
    label: field.label ?? '',
    type: field.type ?? 'text',
    required: Boolean(field.required),
    placeholder: field.placeholder ?? '',
    optionsText: Array.isArray(field.options) ? field.options.join(', ') : '',
  }));

const addField = () => {
  registrationFields.value.push({
    uuid: Math.random().toString(36).slice(2),
    label: '',
    type: 'text',
    required: true,
    placeholder: '',
    optionsText: '',
  });
};

const removeField = (uuid: string) => {
  registrationFields.value = registrationFields.value.filter((field) => field.uuid !== uuid);
};

const setCaretToEnd = (target: HTMLElement) => {
  const range = document.createRange();
  range.selectNodeContents(target);
  range.collapse(false);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
};

const focusFieldInput = (fieldId: string, key: string) => {
  nextTick(() => {
    const selector = `[data-field="${key}-${fieldId}"]`;
    const target = document.querySelector<HTMLElement>(selector);
    if (target) {
      target.focus();
      if (target instanceof HTMLInputElement) {
        const length = target.value.length;
        target.setSelectionRange(length, length);
      } else {
        setCaretToEnd(target);
      }
    }
  });
};

const focusMainInline = (key: 'title' | 'locationText') => {
  nextTick(() => {
    const target = key === 'title' ? titleInputRef.value : locationInputRef.value;
    if (!target) return;
    target.focus();
    target.setSelectionRange(target.value.length, target.value.length);
  });
};

const goToEventAssistant = () => {
  if (!communityId) return;
  persistLang();
  router.push({
    name: 'ConsoleMobileEventCreate',
    params: { communityId },
    query: { lang: activeContentLang.value },
  });
};

const handleLocationInput = (event: Event) => {
  const input = event.target as HTMLInputElement;
  form.locationText = input.value;
  form.locationLat = null;
  form.locationLng = null;
};

const handleInlineFocus = (event: Event) => {
  const target = event.target as HTMLElement;
  setCaretToEnd(target);
};

const focusRefundPolicy = () => {
  nextTick(() => {
    if (refundPolicyRef.value) {
      refundPolicyRef.value.focus();
      setCaretToEnd(refundPolicyRef.value);
    }
  });
};

const handleRefundPolicyInput = (event: Event) => {
  const target = event.target as HTMLElement;
  form.config.refundPolicy = target.textContent ?? '';
  setCaretToEnd(target);
};

const minParticipantsDisplay = computed(() =>
  form.minParticipants != null ? String(form.minParticipants) : '',
);
const maxParticipantsDisplay = computed(() =>
  form.maxParticipants != null ? String(form.maxParticipants) : '',
);

const handleParticipantsInput = (
  type: 'min' | 'max',
  event: Event,
) => {
  const input = event.target as HTMLInputElement;
  const raw = input.value.replace(/[^0-9]/g, '').trim();
  const value = raw ? Number(raw) : null;
  if (type === 'min') {
    form.minParticipants = value;
  } else {
    form.maxParticipants = value;
  }
  input.value = raw;
};

const handleTicketInput = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const raw = input.value.replace(/[^0-9]/g, '').trim();
  if (!raw) {
    form.ticketPrice = null;
    input.value = '';
    return;
  }
  const parsed = Number(raw);
  form.ticketPrice = Number.isFinite(parsed) ? parsed : form.ticketPrice;
  input.value = String(form.ticketPrice ?? '');
};

const extractNoteImagesFromHtml = (html?: string | null) => {
  if (!html) return [];
  const matches = Array.from(html.matchAll(/<img[^>]*src=["']([^"']+)["'][^>]*>/gi));
  return matches.map((match, index) => ({
    id: `html-note-${index}-${Date.now()}`,
    src: match[1],
  }));
};

const openRichTextEditor = () => {
  noteOverlayContext.value = {
    text: form.description,
    html: form.descriptionHtml,
    images: [...richNoteImages.value],
  };
  sessionStorage.setItem(CONSOLE_EVENT_SCROLL_KEY, String(window.scrollY ?? 0));
  showNoteOverlay.value = true;
};

const handleNoteOverlaySave = (payload: NoteOverlayContext) => {
  form.description = payload.text;
  form.descriptionHtml = payload.html;
  richNoteImages.value = payload.images;
  showNoteOverlay.value = false;
};

const closeNoteOverlay = () => {
  showNoteOverlay.value = false;
};

const flashSaveStatus = (text: string) => {
  saveStatus.value = text;
  if (saveStatusTimer) {
    window.clearTimeout(saveStatusTimer);
  }
  saveStatusTimer = window.setTimeout(() => {
    saveStatus.value = null;
    saveStatusTimer = null;
  }, 1800);
};

const restoreScrollPosition = () => {
  const raw = sessionStorage.getItem(CONSOLE_EVENT_SCROLL_KEY);
  if (!raw) return;
  sessionStorage.removeItem(CONSOLE_EVENT_SCROLL_KEY);
  const value = Number(raw);
  if (Number.isFinite(value)) {
    const scrollOnce = () => window.scrollTo(0, value);
    scrollOnce();
    requestAnimationFrame(scrollOnce);
  }
};

const setupMobileMediaQuery = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
  mobileMediaQuery = window.matchMedia('(max-width: 768px)');
  prefersMobileLayout.value = mobileMediaQuery.matches;
  handleMobileMediaChange = (event: MediaQueryListEvent) => {
    prefersMobileLayout.value = event.matches;
  };
  if (typeof mobileMediaQuery.addEventListener === 'function') {
    mobileMediaQuery.addEventListener('change', handleMobileMediaChange);
  } else if (typeof mobileMediaQuery.addListener === 'function') {
    mobileMediaQuery.addListener(handleMobileMediaChange);
  }
};

const teardownMobileMediaQuery = () => {
  if (!mobileMediaQuery || !handleMobileMediaChange) return;
  if (typeof mobileMediaQuery.removeEventListener === 'function') {
    mobileMediaQuery.removeEventListener('change', handleMobileMediaChange);
  } else if (typeof mobileMediaQuery.removeListener === 'function') {
    mobileMediaQuery.removeListener(handleMobileMediaChange);
  }
  mobileMediaQuery = null;
  handleMobileMediaChange = null;
};

const goToPublishSuccess = (targetEventId: string, fallback: 'edit' | 'list' = 'list') => {
  if (isMobileLayout.value) {
    router.replace({
      name: 'ConsoleMobileEventPublishSuccess',
      params: { eventId: targetEventId },
    });
    return;
  }
  if (fallback === 'edit') {
    router.replace({ name: 'console-event-edit', params: { eventId: targetEventId } });
  } else {
    router.replace(backLink.value);
  }
};

const persistEvent = async (status: 'draft' | 'open') => {
  submitting.value = true;
  actionLoading.value = status;
  error.value = null;

  const now = new Date();
  const start = form.startTime ? new Date(form.startTime) : null;
  const end = form.endTime ? new Date(form.endTime) : null;
  let regStart = form.regStartTime ? new Date(form.regStartTime) : null;
  let regEnd = form.regEndTime ? new Date(form.regEndTime) : null;

  if (!start || !end) {
    if (start && !end) {
      autoFillEndTime();
      if (form.endTime) {
        return persistEvent(status);
      }
    }
    error.value = '请先设置开始和结束时间';
    submitting.value = false;
    actionLoading.value = null;
    return;
  }

  if (start.getTime() < now.getTime() - 5 * 60 * 1000) {
    error.value = '开始时间需要晚于当前时间';
    submitting.value = false;
    actionLoading.value = null;
    return;
  }

  if (end <= start) {
    error.value = '終了時間は開始より後に設定してください';
    submitting.value = false;
    actionLoading.value = null;
    return;
  }

  if (!regStart) {
    regStart = new Date(Math.min(start.getTime(), now.getTime()));
    form.regStartTime = toLocalInput(regStart.toISOString());
  }

  if (!regEnd) {
    const fallback = new Date(start.getTime() - 60 * 60 * 1000);
    regEnd = fallback;
    form.regEndTime = toLocalInput(regEnd.toISOString());
  }

  if (regStart && regStart > start) {
    error.value = '报名开始时间不能晚于活动开始';
    submitting.value = false;
    actionLoading.value = null;
    return;
  }

  if (regEnd) {
    if (regStart && regEnd < regStart) {
      error.value = '报名截止需晚于报名开始时间';
      submitting.value = false;
      actionLoading.value = null;
      return;
    }
    if (regEnd > start) {
      error.value = '报名截止应早于活动开始';
      submitting.value = false;
      actionLoading.value = null;
      return;
    }
  }

  if (form.ticketPrice != null && form.ticketPrice < 0) {
    form.ticketPrice = 0;
  }

  syncContentMap(activeContentLang.value);
  const descriptionText = stripHtml(form.descriptionHtml || '').trim() || form.description.trim();
  if (!descriptionText) {
    error.value = '请填写活动详情';
    submitting.value = false;
    actionLoading.value = null;
    return;
  }

  const htmlSize = form.descriptionHtml?.length ?? 0;
  if (htmlSize > 400_000) {
    error.value = '活动详情内嵌图片过大，请删除部分图片或缩短内容后再试';
    submitting.value = false;
    actionLoading.value = null;
    return;
  }

  const payload = {
    title: buildContent(form.title, 'title'),
    description: buildContent(form.description || form.title, 'description'),
    descriptionHtml: form.descriptionHtml,
    originalLanguage: activeContentLang.value,
    category: form.category || null,
    locationText: form.locationText,
    locationLat: form.locationLat,
    locationLng: form.locationLng,
    startTime: toIso(form.startTime),
    endTime: toIso(form.endTime),
    regStartTime: toIso(form.regStartTime),
    regEndTime: toIso(form.regEndTime),
    regDeadline: toIso(form.regEndTime),
    minParticipants: form.minParticipants ?? null,
    maxParticipants: form.maxParticipants ?? null,
    visibility: form.visibility,
    requireApproval: form.requireApproval,
    config: { ...form.config },
    registrationFormSchema: buildRegistrationSchema(),
    status,
  };

  try {
    if (isEdit.value && eventId) {
      await updateConsoleEvent(eventId, {
        ...payload,
        ticketTypes: [
          {
            name: buildContent(`${form.title} チケット`, 'title'),
            type: (form.ticketPrice ?? 0) > 0 ? 'normal' : 'free',
            price: form.ticketPrice ?? 0,
          },
        ],
      });
      flashSaveStatus(status === 'open' ? '已发布' : '已保存');
      if (status === 'open') {
        goToPublishSuccess(eventId, 'list');
      }
    } else if (communityId) {
    const event = await createConsoleEvent(communityId, {
      ...payload,
      ticketTypes: [
        {
          name: buildContent(`${form.title} チケット`, 'title'),
          type: (form.ticketPrice ?? 0) > 0 ? 'normal' : 'free',
          price: form.ticketPrice ?? 0,
        },
      ],
    });
    if (pendingCoverFiles.value.length) {
      const uploaded = await uploadPendingCovers(event.id);
      if (!uploaded) {
        showCoverError('活动已保存，但封面未能上传，请稍后在编辑页重新添加。', 'warning');
      }
    }
    if (status === 'open') {
      goToPublishSuccess(event.id, 'edit');
    } else {
      router.replace({ name: 'console-event-edit', params: { eventId: event.id } });
      }
      return;
    } else {
      throw new Error('コミュニティIDが必要です');
    }

  } catch (err) {
    error.value = err instanceof Error ? err.message : '保存に失敗しました';
  } finally {
    submitting.value = false;
    actionLoading.value = null;
  }
};

const handleSaveDraft = () => persistEvent('draft');
const handlePublish = () => persistEvent('open');
const handleSubmit = () => handlePublish();

const handlePreview = () => {
  if (!eventId) {
    error.value = '请先保存草稿后再预览活动';
    return;
  }
  router.push({ name: 'event-detail', params: { eventId } });
};

const handleCoverUpload = async (ev: Event) => {
  const input = ev.target as HTMLInputElement;
  if (!input.files || !input.files.length) return;
  const existing = coverDisplayItems.value.length;
  if (existing >= MAX_COVERS) {
    showCoverError('最多可上传 9 张图片');
    input.value = '';
    return;
  }
  const files = Array.from(input.files);
  const valid: File[] = [];
  for (const file of files) {
    if (!file.type?.startsWith('image/')) {
      showCoverError('仅支持上传 jpg/png 等图片文件');
      continue;
    }
    let candidate = file;
    if (file.size > MAX_COVER_SIZE) {
      try {
        candidate = await downscaleImageFile(file);
      } catch (err) {
        showCoverError(err instanceof Error ? err.message : '图片过大，请压缩后重新上传');
        continue;
      }
    }
    if (candidate.size > MAX_COVER_SIZE) {
      showCoverError('图片过大，请压缩后重新上传');
      continue;
    }
    valid.push(candidate);
    if (existing + valid.length >= MAX_COVERS) break;
  }
  if (!valid.length) {
    input.value = '';
    return;
  }
  if (!eventId) {
    pendingCoverFiles.value.push(...valid);
    setLocalCoverPreviews(valid);
    coverError.value = null;
    input.value = '';
    return;
  }
  coverError.value = null;
  uploadingCover.value = true;
  try {
    await uploadEventCovers(eventId, valid);
    await reloadGallery();
    input.value = '';
  } catch (err) {
    showCoverError(parseCoverUploadError(err));
  } finally {
    uploadingCover.value = false;
  }
};

const handleDeleteCover = async (coverId: string) => {
  if (!eventId) {
    removeLocalCoverPreview(coverId);
    return;
  }
  uploadingCover.value = true;
  coverError.value = null;
  try {
    galleries.value = await deleteEventCover(eventId, coverId);
  } catch (err) {
    showCoverError(err instanceof Error ? err.message : '封面删除失败，请重试');
  } finally {
    uploadingCover.value = false;
  }
};

const uploadPendingCovers = async (targetEventId: string) => {
  if (!pendingCoverFiles.value.length) return true;
  uploadingCover.value = true;
  try {
    while (pendingCoverFiles.value.length) {
      const batchEntries = pendingCoverFiles.value.splice(0, MAX_COVERS);
      await uploadEventCovers(
        targetEventId,
        batchEntries.map((entry) => entry.file),
      );
    }
    await reloadGallery();
    revokeLocalCoverPreviews();
    return true;
  } catch (err) {
    const message = parseCoverUploadError(err);
    showCoverError(message, 'warning');
    return false;
  } finally {
    uploadingCover.value = false;
  }
};

const applyAssistantDraftFromStorage = () => {
  if (eventId) return;
  try {
    const raw = sessionStorage.getItem(CONSOLE_AI_EVENT_DRAFT_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw);
    if (stored?.title && !form.title) {
      form.title = stored.title;
    }
    if (stored?.description) {
      form.description = stored.description;
      form.descriptionHtml = `<p>${stored.description}</p>`;
      richNoteImages.value = [];
    }
    if (stored?.notes) {
      form.config.notes = stored.notes;
    }
    if (stored?.riskNotice) {
      form.config.riskNoticeText = stored.riskNotice;
    }
    if (stored?.ticketPrice != null) {
      const parsed = Number(stored.ticketPrice);
      form.ticketPrice = Number.isFinite(parsed) ? parsed : form.ticketPrice;
    }
    if (stored?.category && !form.category) {
      form.category = stored.category;
    }
  } catch (err) {
    console.warn('Failed to apply AI draft', err);
  } finally {
    sessionStorage.removeItem(CONSOLE_AI_EVENT_DRAFT_KEY);
  }
};

onMounted(async () => {
  setupMobileMediaQuery();
  loadStoredLang();
  await load();
  applyAssistantDraftFromStorage();
  restoreScrollPosition();
});

watch(
  () => eventCommunityId.value,
  () => {
    copyEvents.value = [];
  },
);

onUnmounted(() => {
  revokeLocalCoverPreviews();
  teardownMobileMediaQuery();
  if (saveStatusTimer) {
    window.clearTimeout(saveStatusTimer);
    saveStatusTimer = null;
  }
});

onActivated(() => {
  restoreScrollPosition();
});

</script>

<style scoped>
.console-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
label {
  display: flex;
  flex-direction: column;
  font-weight: 600;
  gap: 0.3rem;
}
input,
textarea,
select {
  padding: 0.5rem;
  border-radius: 0.5rem;
  border: 1px solid #cbd5f5;
}
.checkbox {
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
}
.ai-prefill {
  background: #ecfeff;
  border: 1px solid #67e8f9;
  border-radius: 1rem;
  padding: 0.85rem;
  font-size: 0.9rem;
  color: #0f172a;
}
.ai-helper {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.ai-helper-head {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
}
.ai-lang-switch {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.ai-lang-btn {
  border: 1px solid #cbd5f5;
  background: #fff;
  padding: 0.35rem 0.65rem;
  border-radius: 999px;
  font-weight: 600;
  font-size: 0.9rem;
  color: #334155;
}
.ai-lang-btn.active {
  background: #111827;
  color: #fff;
  border-color: #111827;
}
.ai-helper-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.ai-chip {
  border: 1px dashed #cbd5f5;
  background: #f8fafc;
  border-radius: 0.75rem;
  padding: 0.45rem 0.9rem;
  font-weight: 600;
  color: #0f172a;
}
.ai-chip:disabled {
  opacity: 0.6;
}
.ai-preview {
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 0.75rem;
  padding: 0.75rem;
}
.ai-preview-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
}
.ai-preview-text {
  white-space: pre-line;
  color: #0f172a;
  margin-top: 0.35rem;
  line-height: 1.45;
}
.checklist-card {
  gap: 0.5rem;
}
.checklist-section {
  border-top: 1px solid rgba(148, 163, 184, 0.2);
  padding-top: 0.5rem;
}
.checklist-section p {
  margin: 0 0 0.4rem;
  font-size: 0.9rem;
  color: #475569;
  font-weight: 600;
}
.checklist-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  color: #0f172a;
  padding: 0.2rem 0;
}
.checklist-item input {
  width: 16px;
  height: 16px;
}
.actions {
  display: flex;
  justify-content: flex-end;
}
.primary {
  padding: 0.6rem 1.2rem;
  border: none;
  border-radius: 0.5rem;
  background: #2563eb;
  color: white;
  cursor: pointer;
}
.primary.ghost {
  background: transparent;
  color: #2563eb;
  border: 1px solid #2563eb;
}
.secondary {
  padding: 0.6rem 1.2rem;
  border-radius: 0.5rem;
  border: 1px solid #64748b;
  background: white;
  color: #0f172a;
  cursor: pointer;
}
.ghost {
  padding: 0.5rem 1rem;
  border: 1px solid #94a3b8;
  background: white;
  border-radius: 0.5rem;
  cursor: pointer;
}
.danger {
  align-self: flex-end;
  padding: 0.4rem 0.8rem;
  border: 1px solid #b91c1c;
  background: white;
  color: #b91c1c;
  border-radius: 0.5rem;
  cursor: pointer;
}
.error {
  color: #b91c1c;
}
.card {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.75rem;
}
.gallery-item {
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.gallery-item img {
  width: 100%;
  height: 160px;
  object-fit: cover;
}
.gallery-item figcaption {
  padding: 0.4rem;
  font-size: 0.85rem;
  text-align: center;
}
.upload-btn {
  cursor: pointer;
  color: #2563eb;
  font-weight: 600;
}
.upload-btn input {
  display: none;
}
.category-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.category-chip {
  padding: 0.4rem 0.8rem;
  border-radius: 999px;
  border: 1px solid #cbd5f5;
  background: white;
  cursor: pointer;
}
.category-chip.active {
  background: #2563eb;
  color: white;
}
.grid-2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 0.75rem;
}
.ios-panel--builder {
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ios-builder-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.builder-quick {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.builder-quick__label {
  font-size: 12px;
  color: #475569;
}

.builder-quick__chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.quick-chip {
  border: 1px solid #e2e8f0;
  background: #fff;
  color: #0f172a;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
}

.builder-eyebrow {
  margin: 0;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(15, 23, 42, 0.4);
}

.ios-add-btn {
  border: none;
  border-radius: 14px;
  padding: 10px 14px;
  font-size: 14px;
  font-weight: 600;
  background: rgba(15, 23, 42, 0.05);
  color: #0f172a;
}

.ios-field-set {
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 14px 30px rgba(15, 23, 42, 0.08);
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ios-field-set__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  color: rgba(15, 23, 42, 0.5);
}

.ios-field-card__delete {
  border: none;
  border-radius: 999px;
  background: rgba(220, 38, 38, 0.1);
  color: #b91c1c;
  padding: 6px 12px;
  font-size: 13px;
}

.ios-form--stack .ios-row {
  padding: 14px 0;
}

.ios-panel--builder .ios-row {
  padding-left: 0;
  padding-right: 0;
}

.ios-panel--builder .ios-row::after {
  left: 0;
  right: 0;
}

.ios-row--builder-line {
  cursor: text;
}

.ios-row--inline-value {
  cursor: pointer;
}

.ios-row--tight {
  padding-top: 10px;
  padding-bottom: 10px;
}

.ios-inline-editor,
.ios-inline-select {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 16px;
  text-align: right;
  padding: 0;
}

.ios-inline-editor:focus,
.ios-inline-select:focus {
  outline: none;
}

.ios-inline-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 16px;
  text-align: right;
  padding: 0;
  -webkit-appearance: none;
  appearance: none;
}

.ios-inline-input:focus {
  outline: none;
  box-shadow: none;
}

.ios-inline-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 16px;
  text-align: right;
  padding: 0;
}

.ios-inline-input:focus {
  outline: none;
}

.ios-inline-editor {
  min-height: 20px;
}

.ios-inline-editor:empty::before {
  content: attr(data-placeholder);
  color: rgba(15, 23, 42, 0.35);
}

.ios-inline-editor:focus::before {
  content: '';
}

.ios-inline-select {
  appearance: none;
  background-image: none;
}

.ios-toggle {
  position: relative;
  display: inline-flex;
  width: 44px;
  height: 24px;
}

.ios-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.ios-toggle span {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.25);
  border-radius: 999px;
  transition: background 0.2s;
}

.ios-toggle span::after {
  content: '';
  position: absolute;
  width: 20px;
  height: 20px;
  border-radius: 10px;
  background: #fff;
  top: 2px;
  left: 2px;
  transition: transform 0.2s;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.2);
}

.ios-toggle input:checked + span {
  background: #0ea5e9;
}

.ios-toggle input:checked + span::after {
  transform: translateX(20px);
}
.hint {
  font-size: 0.9rem;
  color: #475569;
}
.console-section--mobile {
  padding: calc(env(safe-area-inset-top, 0px) + 12px) 12px calc(150px + env(safe-area-inset-bottom, 0px));
  background: linear-gradient(180deg, #f6fbff 0%, #eef3f8 40%, #f9f9fb 100%);
  gap: 0.75rem;
}

.console-section--mobile .section-header {
  background: #fff;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 15px 40px rgba(15, 23, 42, 0.08);
}

.console-section--mobile .section-header h2 {
  font-size: 18px;
}

.console-section--mobile .section-header p {
  font-size: 12px;
  color: var(--m-color-text-tertiary);
}

.console-section--mobile .card {
  border: none;
  border-radius: 12px;
  padding: 18px;
  box-shadow: 0 18px 45px rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.98);
}

.console-section--mobile h3 {
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 6px;
}

.console-section--mobile label {
  font-size: 13px;
  color: #0f172a;
}





.ios-form {
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  overflow: hidden;
  background: #fff;
  margin-bottom: 18px;
  position: relative;
  border: 1px solid rgba(15, 23, 42, 0.08);
}

.ios-panel .ios-form::before,
.ios-panel .ios-form::after {
  content: '';
  position: absolute;
  left: 16px;
  right: 16px;
  height: 1px;
  background: rgba(15, 23, 42, 0.06);
}

.ios-panel .ios-form::before {
  top: 0;
}

.ios-panel .ios-form::after {
  bottom: 0;
}

.ios-panel .ios-form:last-of-type {
  margin-bottom: 0;
}

.ios-row {
  display: flex;
  align-items: center;
  padding: 18px 20px;
  background: rgba(255, 255, 255, 0.98);
  gap: 16px;
  font-size: 16px;
  position: relative;
}

.ios-row::after {
  content: '';
  position: absolute;
  left: 20px;
  right: 20px;
  bottom: 0;
  height: 1px;
  background: rgba(15, 23, 42, 0.08);
  opacity: 0.5;
}

.ios-row--action {
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.ios-row:last-child {
  border-bottom: none;
}
.ios-row:last-child::after {
  opacity: 0;
}

.ios-row--borderless::after {
  opacity: 0;
}

.ios-row--field {
  align-items: center;
}

.ios-label {
  flex: 0 0 32%;
  font-size: 16px;
  color: #0f172a;
  font-weight: 600;
}

.ios-field {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.ios-field input,
.ios-field textarea {
  width: 100%;
  border: none;
  background: transparent;
  text-align: right;
  font-size: 15px;
  color: #0f172a;
}

.ios-field textarea {
  min-height: 72px;
  text-align: left;
  resize: none;
}

.ios-value {
  flex: 1;
  font-size: 16px;
  color: #0f172a;
  text-align: right;
  white-space: nowrap;
}

.ios-row--input {
  cursor: default;
}

.ios-value--inline-input {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  min-width: 140px;
}

.ios-value--inline-input input {
  border: none;
  background: transparent;
  font-size: 16px;
  width: 100%;
  text-align: right;
  padding: 0;
  -webkit-appearance: none;
  appearance: none;
}

.ios-value--inline-input input:focus {
  outline: none;
}

.ios-value--inline-input input::-webkit-outer-spin-button,
.ios-value--inline-input input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.ios-suffix {
  font-size: 14px;
  color: rgba(15, 23, 42, 0.6);
}

.ios-value--multiline {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-align: right;
  opacity: 0.9;
}

.ios-value--placeholder {
  color: rgba(15, 23, 42, 0.45);
}

.ios-value--switch {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.select-option-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.select-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-radius: 14px;
  border: 1px solid rgba(15, 23, 42, 0.1);
  background: #fff;
  font-size: 15px;
  cursor: pointer;
}

.select-option.active {
  border-color: #0090d9;
  color: #0090d9;
  box-shadow: 0 10px 25px rgba(0, 144, 217, 0.15);
}

.ios-row--toggle {
  justify-content: space-between;
}

.ios-switch {
  appearance: none;
  width: 46px;
  height: 28px;
  border-radius: 999px;
  background: rgba(15, 23, 42, 0.2);
  position: relative;
  transition: background 0.2s ease;
}

.ios-switch::after {
  content: '';
  position: absolute;
  top: 4px;
  left: 4px;
  width: 20px;
  height: 20px;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  transition: transform 0.2s ease;
}

.ios-switch:checked {
  background: linear-gradient(135deg, #00a2ff, #07c8a3);
}

.ios-switch:checked::after {
  transform: translateX(18px);
}

.ios-select {
  border: none;
  background: transparent;
  font-size: 15px;
  color: #0f172a;
  text-align: right;
  padding: 6px 0;
}

.ios-row--textarea {
  align-items: flex-start;
}

.ios-row--rich-note {
  padding-top: 14px;
  padding-bottom: 14px;
}

.ios-helper-row {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ios-helper-title {
  margin: 0;
  color: #475569;
  font-size: 12px;
}

.ios-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.ios-chip {
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #0f172a;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 600;
}

.ios-rich-text {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.ios-rich-text__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.ios-rich-text__preview {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  max-width: 100%;
}

.ios-helper {
  margin: 0;
  color: #94a3b8;
  font-size: 12px;
}

.ios-textarea {
  flex: 1;
  border: none;
  background: rgba(15, 23, 42, 0.04);
  border-radius: 16px;
  padding: 10px 12px;
  font-size: 14px;
  min-height: 80px;
  resize: none;
}

.field-modal {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(5px);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 20px;
  z-index: 60;
}

.field-sheet {
  width: 100%;
  max-width: 540px;
  background: #fff;
  border-radius: 28px;
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
  box-shadow: 0 -20px 50px rgba(15, 23, 42, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.field-sheet--wide .field-sheet-body input {
  font-size: 18px;
}

.field-sheet--large {
  max-height: 90vh;
}

.field-sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  font-size: 14px;
  font-weight: 600;
}

.field-sheet-head button {
  background: none;
  border: none;
  font-size: 14px;
  color: #64748b;
  cursor: pointer;
}

.field-sheet-head .highlight {
  color: #0090d9;
}

.field-sheet-body {
  padding: 0 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field-sheet-body input,
.field-sheet-body textarea {
  width: 100%;
  border: none;
  background: #f4f6fb;
  padding: 14px;
  border-radius: 16px;
  font-size: 16px;
}

.field-sheet-body textarea {
  min-height: 140px;
}

.field-sheet--large .field-sheet-body {
  padding-bottom: 0;
  height: 70vh;
  overflow-y: auto;
}

.ios-row--textarea {
  align-items: flex-start;
}

.ios-row--picker .ios-field {
  justify-content: flex-start;
  align-items: stretch;
}

.ios-row--picker .ios-field :deep(input) {
  text-align: left;
}

.ios-row--picker .ios-field :deep(.location-picker) {
  width: 100%;
}

.console-section--mobile .card-header {
  flex-direction: column;
  gap: 6px;
}

.console-section--mobile .form {
  gap: 1rem;
}

.mobile-hero-card {
  background: linear-gradient(135deg, #081a32, #0f3c57 55%, #0f6971);
  border-radius: 12px;
  padding: 20px;
  color: #ecf5ff;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.mobile-hero-card .hero-text h1 {
  font-size: 28px;
  margin: 6px 0;
  letter-spacing: 0.03em;
}

.mobile-hero-card .hero-eyebrow {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  color: rgba(255, 255, 255, 0.7);
}

.mobile-hero-card .hero-desc {
  font-size: 13px;
  color: rgba(236, 245, 255, 0.7);
  line-height: 1.5;
}

.mobile-hero-card .hero-status {
  padding: 12px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.12);
  font-size: 12px;
}

.mobile-hero-card .hero-nav {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.mobile-hero-card .hero-nav button {
  flex: 1;
  min-width: 72px;
  border: none;
  border-radius: 999px;
  padding: 10px 12px;
  font-size: 12px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  backdrop-filter: blur(6px);
}

.mobile-hero-card .hero-nav button:active {
  background: rgba(255, 255, 255, 0.3);
}

.copy-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.08);
  gap: 12px;
}

.copy-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
  color: #0f172a;
}

.copy-desc {
  margin: 4px 0 0;
  font-size: 12px;
  color: rgba(15, 23, 42, 0.55);
}

.copy-btn {
  border: none;
  background: linear-gradient(135deg, #0090d9, #0ccbaf);
  color: #fff;
  border-radius: 999px;
  padding: 10px 18px;
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  box-shadow: 0 12px 30px rgba(0, 144, 217, 0.25);
}

.status {
  margin: 6px 0 0;
  font-size: 13px;
  color: #475569;
}

.status.success {
  color: #16a34a;
}

.status.error {
  color: #dc2626;
}

.copy-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(6px);
  z-index: 90;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.copy-sheet {
  width: 100%;
  max-height: 70vh;
  background: #fff;
  border-radius: 24px 24px 0 0;
  padding: 18px 20px 28px;
  box-shadow: 0 -20px 60px rgba(15, 23, 42, 0.25);
  display: flex;
  flex-direction: column;
}

.copy-sheet-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.sheet-close {
  width: 36px;
  height: 36px;
  border-radius: 999px;
  border: 1px solid rgba(15, 23, 42, 0.1);
  background: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: #0f172a;
}

.copy-sheet-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #0f172a;
}

.copy-sheet-desc {
  margin: 2px 0 0;
  font-size: 12px;
  color: rgba(15, 23, 42, 0.55);
}

.copy-sheet-body {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.copy-list-item {
  width: 100%;
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 16px;
  padding: 12px 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: #f8fafc;
  text-align: left;
}

.copy-list-item:disabled {
  opacity: 0.7;
}

.copy-list-text {
  flex: 1;
  min-width: 0;
}

.copy-list-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.copy-list-meta {
  margin: 2px 0 0;
  font-size: 11px;
  color: rgba(15, 23, 42, 0.6);
}

.copy-list-status {
  font-size: 11px;
  color: rgba(15, 23, 42, 0.65);
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(15, 23, 42, 0.1);
}

.copy-status {
  text-align: center;
  font-size: 12px;
  color: rgba(15, 23, 42, 0.55);
  margin: 8px 0;
}

.copy-status.error {
  color: #dc2626;
}

.copy-spinner {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(15, 23, 42, 0.15);
  border-top-color: #0f172a;
  border-radius: 10px;
  animation: spin 1s linear infinite;
}

.cover-card {
  gap: 1rem;
}

.cover-card-uploader,
.hero-cover-uploader {
  border: 1px dashed rgba(8, 26, 50, 0.25);
  border-radius: 28px;
  background: rgba(8, 26, 50, 0.02);
  padding: 12px;
  min-height: 100px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.cover-card-uploader--filled,
.hero-cover-uploader--filled {
  border-style: solid;
  background: rgba(8, 26, 50, 0.04);
}

.cover-card-avatar,
.hero-cover-avatar {
  width: 96px;
  height: 96px;
  border-radius: 999px;
  border: 2px dashed rgba(8, 26, 50, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40px;
  color: rgba(8, 26, 50, 0.45);
  background: #fff;
  box-shadow: 0 20px 45px rgba(15, 23, 42, 0.08);
}

.cover-card-text {
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}

.cover-card-gallery,
.hero-cover-gallery {
  width: 100%;
  display: flex;
  gap: 8px;
  overflow-x: auto;
}

.cover-card-thumb,
.hero-cover-thumb {
  width: 84px;
  height: 84px;
  border-radius: 22px;
  overflow: hidden;
  box-shadow: 0 16px 30px rgba(15, 23, 42, 0.15);
  flex-shrink: 0;
}

.cover-card-thumb img,
.hero-cover-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hero-cover-strip {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 4px;
  -webkit-overflow-scrolling: touch;
}

.hero-cover-strip::-webkit-scrollbar {
  display: none;
}

.hero-cover-hint {
  margin: 0;
  font-size: 12px;
  color: rgba(236, 245, 255, 0.85);
}

.hero-cover-rules {
  margin: 4px 0 0;
  font-size: 12px;
  color: rgba(236, 245, 255, 0.7);
}

.hero-cover-add--solo {
  width: 100%;
  min-height: 96px;
}

.hero-cover-thumb {
  position: relative;
}

.hero-cover-main {
  position: absolute;
  top: 6px;
  left: 6px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 999px;
}

.hero-cover-delete {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 20px;
  height: 20px;
  border-radius: 10px;
  border: none;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 14px;
  line-height: 1;
}

.hero-cover-add {
  width: 84px;
  height: 84px;
  border-radius: 22px;
  border: 1px dashed rgba(255, 255, 255, 0.6);
  background: rgba(255, 255, 255, 0.12);
  color: #ecf5ff;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  font-size: 13px;
}

.hero-cover-add span {
  font-size: 24px;
  line-height: 1;
}

.hero-top {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hero-cover-panel {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.25), rgba(255, 255, 255, 0.05));
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  padding: 18px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4);
  color: #ecf5ff;
  display: flex;
  flex-direction: column;
  gap: 12px;
  backdrop-filter: blur(8px);
}

.hero-cover-head {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: rgba(236, 245, 255, 0.9);
}

.assistant-link {
  margin-top: 8px;
  align-self: flex-start;
  border: 1px solid rgba(0, 144, 217, 0.25);
  background: #fff;
  color: #0f172a;
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 13px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
}
.entry-switcher {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
  margin-top: 10px;
}
.entry-card {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 12px;
  padding: 10px;
  background: #fff;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);
  cursor: pointer;
}
.entry-card:active {
  transform: translateY(1px);
}
.entry-icon {
  font-size: 18px;
}
.entry-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}
.entry-desc {
  margin: 2px 0 0;
  font-size: 12px;
  color: #475569;
}
.entry-lang {
  justify-self: end;
}

.cover-below {
  margin-top: 10px;
  background: #fff;
  color: #0f172a;
  border: 1px solid rgba(15, 23, 42, 0.1);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
  backdrop-filter: none;
}
.cover-below .hero-cover-rules {
  color: #475569;
}
.cover-below .hero-cover-add {
  border-color: rgba(15, 23, 42, 0.15);
  background: #f8fafc;
  color: #0f172a;
}
.paste-card {
  margin-top: 10px;
  background: #fff;
  border: 1px solid rgba(0, 144, 217, 0.12);
  border-radius: 12px;
  padding: 12px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.paste-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.paste-input {
  width: 100%;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 10px;
  padding: 10px;
  font-size: 14px;
  resize: vertical;
  min-height: 200px;
}
.paste-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.paste-preview {
  border: 1px dashed rgba(15, 23, 42, 0.15);
  border-radius: 10px;
  padding: 10px;
  background: #f8fafc;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.paste-preview-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.paste-preview-text {
  margin: 0;
  color: #0f172a;
  line-height: 1.4;
}
.paste-preview-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  flex-wrap: wrap;
}
.paste-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(6px);
  display: flex;
  justify-content: center;
  align-items: flex-end;
  padding: 12px;
  z-index: 90;
}
.paste-card.sheet {
  width: 100%;
  max-width: 640px;
  border-radius: 18px 18px 12px 12px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  box-shadow: 0 -12px 40px rgba(15, 23, 42, 0.25);
  max-height: 80vh;
  overflow-y: auto;
}
.paste-close {
  width: 100%;
  margin-top: 6px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: #fff;
  padding: 10px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  color: #0f172a;
}

.cover-upload-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 70;
}

.cover-upload-box {
  background: rgba(18, 24, 38, 0.9);
  color: #f8fafc;
  padding: 18px 26px;
  border-radius: 18px;
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
  box-shadow: 0 15px 45px rgba(0, 0, 0, 0.4);
}

.cover-upload-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(248, 250, 252, 0.3);
  border-top-color: #f8fafc;
  border-radius: 10px;
  animation: spin 1s linear infinite;
}

.hidden-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}

.builder-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.builder-hint {
  margin: 0;
  font-size: 12px;
  color: rgba(15, 23, 42, 0.55);
}

.builder-hint--inline {
  margin-top: 4px;
  text-align: right;
}

.ios-add-btn--full {
  width: 100%;
  margin-top: 6px;
}

.ios-inline-editor--multiline {
  min-height: 36px;
  text-align: right;
  white-space: pre-wrap;
}

.console-section--mobile input,
.console-section--mobile textarea,
.console-section--mobile select {
  border-radius: 14px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  padding: 10px 12px;
}

.console-section--mobile .ios-inline-input {
  border: none;
  padding: 0;
  box-shadow: none;
  -webkit-appearance: none;
  background: transparent;
}

.console-section--mobile .actions {
  position: sticky;
  bottom: 12px;
  justify-content: center;
}

.console-section--mobile .primary {
  width: 100%;
  border-radius: 999px;
  background: linear-gradient(135deg, #0090d9, #22bbaa);
  box-shadow: 0 20px 40px rgba(0, 144, 217, 0.35);
}

.console-section--mobile .primary.ghost {
  border-color: rgba(0, 144, 217, 0.3);
  color: #0090d9;
}

.bottom-nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  gap: 10px;
  padding: 12px 16px calc(env(safe-area-inset-bottom, 0px) + 18px);
  background: linear-gradient(180deg, rgba(246, 251, 255, 0.2) 0%, rgba(246, 251, 255, 0.95) 45%, #f6fbff 100%);
  box-shadow: 0 -8px 30px rgba(15, 23, 42, 0.1);
  z-index: 40;
}

.nav-btn {
  flex: 1;
  padding: 14px 10px;
  border-radius: 999px;
  border: none;
  font-size: 14px;
  font-weight: 600;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.15);
  cursor: pointer;
}

.nav-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.nav-btn.ghost {
  background: rgba(255, 255, 255, 0.85);
  border: 1px solid rgba(15, 23, 42, 0.12);
  color: #0f172a;
  box-shadow: none;
}

.nav-btn.secondary {
  background: #fff;
  border: 1px solid rgba(15, 23, 42, 0.15);
  color: #0f172a;
}

.nav-btn.primary {
  background: linear-gradient(135deg, #0090d9, #0ccbaf);
  color: #fff;
}

@media (max-width: 768px) {
  .section-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .grid-2 {
    grid-template-columns: 1fr;
  }
}
</style>
