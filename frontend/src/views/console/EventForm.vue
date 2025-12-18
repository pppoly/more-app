<template>
    <section
      class="console-section"
      :class="{ 'console-section--mobile': isMobileLayout, 'sheet-open': sheetOpen }"
    >
    <ConsoleTopBar v-if="isMobileLayout" title="イベント作成" @back="goBack" />
    <div v-if="reviewStatus" class="review-banner" :class="reviewStatus">
      <div class="review-badge">{{ reviewStatusLabel }}</div>
      <p class="review-text">
        {{ reviewMessage }}
        <span v-if="reviewReason">理由: {{ reviewReason }}</span>
      </p>
    </div>
    <Teleport to="body">
      <div v-if="showPastePanel" class="paste-full-overlay">
        <div class="paste-full-card">
          <header class="paste-full-head">
            <div>
              <p class="paste-full-title">下書きを貼り付ける</p>
              <p class="paste-full-subtitle">タイトル・説明・ルールを AI が読み取り、フォームに反映します</p>
            </div>
            <button type="button" class="paste-close" @click="togglePaste(false)">閉じる</button>
          </header>
          <textarea
            v-model="pastedDraft"
            class="paste-input paste-input--full"
            :placeholder="pastePlaceholder"
            ref="pasteInputRef"
            rows="10"
          ></textarea>
          <div class="paste-actions">
            <button type="button" class="ios-chip" @click="pastedDraft = ''">クリア</button>
            <button type="button" class="btn ghost small" @click="goToEventAssistant">
              AI と相談する
            </button>
            <button type="button" class="btn solid small" @click="checkPastedDraft">
              自動で反映
            </button>
          </div>
          <p v-if="draftCheckMessage" class="status muted mt-2">{{ draftCheckMessage }}</p>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="showPasteResult" class="paste-result-overlay" @click.self="closePasteResult">
        <div class="paste-review-card">
          <header class="paste-review-head">
            <p class="paste-review-title">内容をご確認ください</p>
            <p class="paste-review-subtitle">修正は AI に任せるか、フォームで調整できます。</p>
          </header>

          <div v-if="pasteResultLoading" class="paste-result-loading">
            <span class="spinner"></span>
            <p>AI が読み取り中です…</p>
          </div>
          <template v-else>
            <section class="review-checklist">
              <p class="eyebrow">確認リスト</p>
              <ul>
                <li v-for="item in checklistItems" :key="item.id" class="check-item">
                  <span :class="['status-dot', item.done ? 'done' : 'pending']"></span>
                  <div class="check-text">
                    <p class="check-label">{{ item.label }}</p>
                    <p v-if="item.note" class="check-note">{{ item.note }}</p>
                  </div>
                  <span class="check-state">{{ item.done ? '読み取り済み' : '後で確認' }}</span>
                </li>
              </ul>
            </section>

            <section v-if="firstAdvice || firstCompliance" class="review-hints">
              <p class="eyebrow">気になる点</p>
              <p v-if="firstAdvice" class="hint-text">{{ firstAdvice }}</p>
              <p v-if="firstCompliance" class="hint-text">{{ firstCompliance }}</p>
            </section>
          </template>

          <div class="paste-review-actions">
            <button type="button" class="ghost-link" @click="goToEventAssistant">AI にもう一度任せる</button>
            <button type="button" class="primary-next" @click="closePasteResult">フォームで確認する</button>
          </div>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="isMobileLayout && showMobileNotice && aiPrefillNotice" class="mobile-notice-overlay" @click.self="showMobileNotice = false">
        <div class="mobile-notice-card">
          <p class="mobile-notice-title">AI からの提案</p>
          <p class="mobile-notice-text">{{ aiPrefillNotice }}</p>
          <button type="button" class="mobile-notice-btn" @click="showMobileNotice = false">OK</button>
        </div>
      </div>
    </Teleport>

    <Teleport to="body">
      <div v-if="showLocationPicker" class="location-overlay" @click.self="closeLocationPicker">
        <section class="location-card">
          <header class="location-head">
            <h3>場所を選択</h3>
            <span class="location-placeholder" />
          </header>
          <p class="location-hint">住所を検索してピンを微調整できます（日本語推奨）</p>
          <div class="location-search">
            <input
              ref="locationSearchInputRef"
              v-model="locationSearchText"
              type="text"
              placeholder="例: 東京駅, 渋谷スクランブル, 表参道..."
              :disabled="mapLoading"
            />
          </div>
          <div class="map-frame">
            <div v-if="mapLoading" class="map-loading">
              <span class="spinner"></span>
              <p>地図を読み込み中…</p>
            </div>
            <p v-else-if="mapError" class="status error">{{ mapError }}</p>
            <div v-show="!mapLoading && !mapError" ref="mapRef" class="map-canvas"></div>
          </div>
          <footer class="location-actions">
            <button class="ios-chip" type="button" @click="closeLocationPicker">キャンセル</button>
            <button class="primary" type="button" :disabled="mapLoading" @click="applyLocationSelection">
              位置を確定
            </button>
          </footer>
        </section>
      </div>
    </Teleport>

    <section class="hero-cover-panel cover-below" ref="sectionCover">
      <div v-if="coverDisplayItems.length" class="hero-cover-strip">
        <button
          v-for="(item, index) in coverDisplayItems"
          :key="item.id"
          type="button"
          class="hero-cover-thumb"
          @click="openCoverActions(item, index)"
        >
          <img :src="item.imageUrl" alt="cover" />
          <span v-if="index === 0" class="hero-cover-main">カバー</span>
        </button>
        <button
          v-if="canAddMoreCovers"
          type="button"
          class="hero-cover-add"
          @click.stop="triggerCoverPicker"
        >
          <span>+</span>
        </button>
      </div>
      <button
        v-else
        type="button"
        class="hero-cover-placeholder"
        @click.stop="triggerCoverPicker"
      >
        <span class="hero-cover-plus">+</span>
        <p class="hero-cover-placeholder-text">写真を追加</p>
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

    <Teleport to="body">
      <div v-if="showCoverActionSheet" class="cover-action-mask" @click.self="closeCoverActions">
        <div class="cover-action-sheet">
          <p class="cover-action-title">画像を編集</p>
          <button
            v-if="activeCoverIndex !== null && activeCoverIndex > 0"
            type="button"
            class="sheet-btn"
            @click="setAsCover"
          >
            カバーにする
          </button>
          <button
            type="button"
            class="sheet-btn danger"
            @click="deleteActiveCover"
          >
            この画像を削除
          </button>
          <button type="button" class="sheet-btn" @click="closeCoverActions">キャンセル</button>
        </div>
      </div>
    </Teleport>

    <div v-if="uploadingCover" class="cover-upload-overlay">
      <div class="cover-upload-box">
        <span class="cover-upload-spinner"></span>
        <p>カバーをアップロード中...</p>
      </div>
    </div>

    <section v-else-if="aiPrefillNotice && !isMobileLayout" class="ai-prefill">
      <p>{{ aiPrefillNotice }}</p>
    </section>

    <section class="info-block ios-panel" ref="sectionBasic">
      <div class="info-group">
        <button class="info-row info-row--primary" type="button" @click="openFieldEditor('title')">
          <span class="info-label">タイトル</span>
          <span class="info-value" :class="{ 'is-placeholder': !form.title }">
            {{ form.title || 'あとで設定できます' }}
          </span>
        </button>
        <button class="info-row info-row--primary" type="button" @click="openTimeRange">
          <span class="info-label">日程</span>
          <span class="info-value" :class="{ 'is-placeholder': !timeRangeDisplay }">
            {{ timeRangeDisplay || 'あとで設定できます' }}
          </span>
        </button>
        <button class="info-row info-row--primary" type="button" @click="openLocationPickerMain">
          <span class="info-label">場所</span>
          <span class="info-value" :class="{ 'is-placeholder': !form.locationText }">
            {{ form.locationText || 'あとで設定できます' }}
          </span>
        </button>
        <p class="info-subhint">
          <button
            type="button"
            class="info-link"
            @click.prevent="openLocationPickerMain"
          >
            地図で選択
          </button>
          <span class="info-divider">｜</span>
          <button
            type="button"
            class="info-link"
            @click.prevent="openLocationTextEditor"
          >
            見つからない場合は手入力
          </button>
        </p>
      </div>

      <div class="info-group info-group--secondary" ref="sectionSchedule">
        <button class="info-row info-row--secondary" type="button" @click="openRegRange">
          <span class="info-label">受付期間</span>
          <span class="info-value" :class="{ 'is-placeholder': !regRangeDisplay }">
            {{ regRangeDisplay || 'あとで設定できます（未設定ならイベント時間と同じ）' }}
          </span>
        </button>
        <p class="info-subhint muted">未設定の場合、受付時間はイベント時間と同じです。</p>
        <button class="info-row info-row--secondary" type="button" @click="openParticipants">
          <span class="info-label">参加人数</span>
          <span class="info-value" :class="{ 'is-placeholder': !participantsDisplay }">
            {{ participantsDisplay || 'あとで設定できます' }}
          </span>
        </button>
      </div>
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

      <!-- Rich text -->
      <section class="ios-panel" ref="sectionRichText">
        <div class="ios-form">
          <button
            type="button"
            class="ios-row ios-row--action ios-row--textarea ios-row--rich-note"
            @click="openRichTextEditor"
          >
            <span class="ios-label">イベント詳細</span>
            <span class="ios-value ios-rich-text__preview" :class="{ 'ios-value--placeholder': !richTextPreview }">
              {{ richTextPreview || '編集してください' }}
            </span>
            <span v-if="richTextImageCount" class="ios-suffix ios-chip ios-chip--tight">{{ richTextImageCount }} 枚</span>
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
              placeholder="無料イベント"
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

      <div
        class="advanced-toggle"
        v-if="isMobileLayout"
        role="button"
        tabindex="0"
        @click="showAdvancedMobile = !showAdvancedMobile"
        @keydown.enter.prevent="showAdvancedMobile = !showAdvancedMobile"
      >
        <span>{{ showAdvancedMobile ? '詳細設定を閉じる' : '詳細設定（後でOK）' }}</span>
        <span class="i-lucide-chevron-down" :class="{ rotate: showAdvancedMobile }"></span>
      </div>

      <!-- Config -->
      <section class="ios-panel" v-if="!isMobileLayout || showAdvancedMobile" ref="sectionConfig">
        <div class="ios-form">
          <button type="button" class="ios-row ios-row--action ios-row--builder-line" @click="openCategorySheet">
            <span class="ios-label">カテゴリ</span>
            <span class="ios-value ios-value--secondary" :class="{ 'ios-value--placeholder': !form.category }">
              {{ categoryLabel }}
            </span>
          </button>
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
              placeholder="入力してください"
              ref="refundPolicyInputRef"
              v-model="form.config.refundPolicy"
              rows="2"
            ></textarea>
          </div>
          <div class="ios-row ios-row--builder-line ios-row--textarea">
            <span class="ios-label">注意事項 · {{ langLabel(activeContentLang) }}</span>
            <textarea
              class="ios-inline-input ios-inline-input--textarea"
              placeholder="例：安全上の注意・持ち物・集合ルール"
              v-model="form.config.riskNoticeText"
              rows="2"
            ></textarea>
          </div>
        </div>
      </section>

      <!-- Dynamic form -->
      <section class="ios-panel ios-panel--builder" v-if="!isMobileLayout || showAdvancedMobile" ref="sectionForm">
        <div class="ios-builder-head">
          <div class="builder-title">
            <p class="builder-eyebrow">申込フォーム</p>
            <p v-if="!registrationFields.length" class="builder-hint">{{ builderHintText }}</p>
          </div>
          <button type="button" class="ios-add-btn" @click="addField">＋ 項目を追加</button>
        </div>
        <div class="builder-quick">
          <span class="builder-quick__label">よく使う項目</span>
          <div class="builder-quick__chips">
            <button type="button" class="quick-chip" @click="addPresetField('name')">氏名</button>
            <button type="button" class="quick-chip" @click="addPresetField('phone')">電話</button>
            <button type="button" class="quick-chip" @click="addPresetField('email')">メール</button>
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
                placeholder="例：氏名"
                v-model="field.label"
              />
            </div>
            <div class="ios-row ios-row--builder-line">
              <span class="ios-label">タイプ</span>
              <select v-model="field.type" class="ios-inline-select">
                <option value="text">テキスト</option>
                <option value="textarea">テキスト（複数行）</option>
                <option value="number">数字</option>
                <option value="date">日付</option>
                <option value="phone">電話</option>
                <option value="email">メール</option>
                <option value="select">プルダウン</option>
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
                placeholder="例：参加の動機を記入してください"
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
          ＋ 項目を追加
        </button>
        <div v-else class="hint">項目がありません。「項目を追加」から設定してください。</div>
      </section>

      <div class="actions" v-if="!isMobileLayout">
        <button type="button" class="ghost" :disabled="submitting || sheetOpen" @click="handleSaveDraft">
          {{ actionLoading === 'draft' ? '保存中…' : '下書きを保存' }}
        </button>
        <button type="submit" class="primary" :disabled="submitting || sheetOpen">
          {{ actionLoading === 'open' ? '公開中…' : 'イベントを公開' }}
        </button>
      </div>
      <p v-if="saveStatus" class="status success">{{ saveStatus }}</p>
    </form>

    <div v-if="isMobileLayout && !sheetOpen" class="bottom-nav">
      <button type="button" class="nav-btn text" :disabled="submitting" @click="handleSaveDraft">
        {{ actionLoading === 'draft' ? '保存中…' : '下書きを保存' }}
      </button>
      <button
        type="button"
        class="nav-btn primary"
        :disabled="submitting"
        @click="handlePublish"
      >
        {{ actionLoading === 'open' ? '公開中…' : 'イベントを公開' }}
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
          <button type="button" @click="closeFieldEditor">キャンセル</button>
          <p>{{ currentFieldLabel }}</p>
          <button type="button" class="highlight" @click="confirmFieldEditor">設定する</button>
        </header>
        <div class="field-sheet-body">
          <template v-if="currentFieldType === 'text' || currentFieldType === 'number'">
            <input
              v-model="fieldDraft"
              :type="currentFieldType === 'number' ? 'number' : 'text'"
              :placeholder="currentFieldPlaceholder"
            />
            <p
              v-if="['minParticipants', 'maxParticipants'].includes(editingField as string)"
              class="field-hint"
            >
              1〜100 人まで設定できます
            </p>
          </template>
          <textarea
            v-else-if="currentFieldType === 'textarea'"
            v-model="fieldDraft"
            rows="5"
            :placeholder="currentFieldPlaceholder"
          ></textarea>
          <div
            v-else-if="currentFieldType === 'select'"
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
            v-else-if="currentFieldType === 'datetime'"
            v-model="fieldDraft"
          />
          <input
            v-else
            v-model="fieldDraft"
            type="text"
            :placeholder="currentFieldPlaceholder"
          />
        </div>
      </div>
    </div>

    <div v-if="showCategorySheet" class="field-modal" @click.self="closeCategorySheet">
      <div class="field-sheet">
        <header class="field-sheet-head">
          <button type="button" @click="closeCategorySheet">キャンセル</button>
          <p>カテゴリを選択</p>
          <button type="button" class="highlight" @click="confirmCategorySheet">設定する</button>
        </header>
        <div class="field-sheet-body">
          <div class="select-option-list">
            <button
              v-for="cat in categoryOptions"
              :key="cat.value"
              type="button"
              class="select-option"
              :class="{ active: categoryDraft === cat.value }"
              @click="categoryDraft = cat.value"
            >
              <span>{{ cat.label }}</span>
              <span v-if="categoryDraft === cat.value" class="i-lucide-check"></span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-if="showCopyOverlay" class="copy-overlay" @click.self="closeCopyOverlay">
      <div class="copy-sheet">
        <header class="copy-sheet-head">
          <button type="button" class="sheet-close" @click="closeCopyOverlay">
            <span class="i-lucide-x"></span>
          </button>
          <div>
            <p class="copy-sheet-title">コピーするイベントを選択</p>
            <p class="copy-sheet-desc">項目を引き継ぎます。公開前に確認してください。</p>
          </div>
        </header>
        <div class="copy-sheet-body">
          <p v-if="copyLoading" class="copy-status">履歴のイベントを読み込み中…</p>
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
            <p v-if="!copyEventItems.length" class="copy-status">コピーできるイベントがありません。</p>
          </template>
        </div>
      </div>
    </div>

  </section>
</template>

<script setup lang="ts">
// Google Maps types for global "google" loaded via script
declare const google: typeof import('google.maps');

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
  requestEventAssistantReply,
  extractEventDraft,
} from '../../api/client';
import { resolveAssetUrl } from '../../utils/assetUrl';
import { useToast } from '../../composables/useToast';
import IosDateTimePicker from '../../components/common/IosDateTimePicker.vue';
import ConsoleTopBar from '../../components/console/ConsoleTopBar.vue';
import type {
  RegistrationFormField,
  EventGalleryItem,
  ConsoleEventSummary,
  ConsoleEventDetail,
  GeneratedEventContent,
  EventAssistantReply,
  EventAssistantRequest,
} from '../../types/api';
import {
  CONSOLE_AI_EVENT_DRAFT_KEY,
  CONSOLE_EVENT_SCROLL_KEY,
  CONSOLE_EVENT_LANG_KEY,
  LEGACY_EVENT_LANG_KEY,
  CONSOLE_EVENT_NOTE_CONTEXT_KEY,
  CONSOLE_EVENT_NOTE_RESULT_KEY,
  CONSOLE_EVENT_FORM_DRAFT_KEY,
} from '../../constants/console';

type FieldKey =
  | 'title'
  | 'locationText'
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

const route = useRoute();
const router = useRouter();
const toast = useToast();
const goBack = () => router.back();
const showLocationPicker = ref(false);
const mapLoading = ref(false);
const mapError = ref<string | null>(null);
const mapRef = ref<HTMLDivElement | null>(null);
const locationSearchInputRef = ref<HTMLInputElement | null>(null);
const locationSearchText = ref('');
let mapInstance: google.maps.Map | null = null;
let markerInstance: google.maps.Marker | null = null;
let autocompleteInstance: google.maps.places.Autocomplete | null = null;
let googleLoaded = false;
const ENTRY_PREF_KEY = 'CONSOLE_EVENT_ENTRY';
const communityId = route.params.communityId as string | undefined;
const eventId = computed(
  () => (route.params.eventId as string | undefined) || (route.query.eventId as string | undefined),
);
const eventCommunityId = ref<string | null>(communityId ?? null);
const isEdit = computed(() => Boolean(eventId.value));
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
const builderHintText = 'フォームに欲しい項目を並べてください。順番はそのまま表示されます。';
const localCoverPreviews = ref<EventGalleryItem[]>([]);
const pendingCoverFiles = ref<Array<{ id: string; file: File }>>([]);
const showMobileNotice = ref(false);
const MAX_COVERS = 9;
const MAX_COVER_SIZE = 12 * 1024 * 1024; // 12MB（入口上限を緩和）
const MAX_COVER_UPLOAD_SIZE = 10 * 1024 * 1024; // 圧縮後の目安を緩和
const MAX_COVER_DIMENSION = 1920; // 最大長辺
// 最低サイズ制限を実質無効化（1px）
const MIN_COVER_WIDTH = 1;
const MIN_COVER_HEIGHT = 1;
const MIN_COVER_TEXT = '';
const TARGET_ASPECT = 16 / 9;
const COVER_COMPRESS_QUALITY = 0.82;
const COVER_FALLBACK_QUALITY = 0.7;
const COVER_RULES_TEXT = '16:9 推奨・最初の1枚がカバーになります';
const coverDisplayItems = computed(() =>
  eventId.value ? galleries.value : localCoverPreviews.value,
);
const currentCoverCount = computed(() => coverDisplayItems.value.length);
const canAddMoreCovers = computed(() => currentCoverCount.value < MAX_COVERS);
const showCoverActionSheet = ref(false);
const activeCoverAction = ref<EventGalleryItem | null>(null);
const activeCoverIndex = ref<number | null>(null);
const pendingEndRange = ref(false);
const pendingRegRange = ref(false);
const pendingMaxParticipants = ref(false);
const timeRangeDisplay = computed(() => {
  if (form.startTime && form.endTime) {
    return `${formatDisplayDate(form.startTime)} 〜 ${formatDisplayDate(form.endTime)}`;
  }
  return '';
});
const regRangeDisplay = computed(() => {
  if (form.regStartTime && form.regEndTime) {
    return `${formatDisplayDate(form.regStartTime)} 〜 ${formatDisplayDate(form.regEndTime)}`;
  }
  return '';
});
const participantsDisplay = computed(() => {
  const min = minParticipantsDisplay.value;
  const max = maxParticipantsDisplay.value;
  if (!min && !max) return '';
  if (min && max) return `${min}〜${max}人`;
  if (min && !max) return `${min}人〜`;
  if (!min && max) return `〜${max}人`;
  return '';
});
const editingField = ref<FieldKey | null>(null);
const fieldDraft = ref('');
const richNoteImages = ref<Array<{ id: string; src: string }>>([]);
const actionLoading = ref<'draft' | 'open' | null>(null);
const saveStatus = ref<string | null>(null);
let saveStatusTimer: number | null = null;
const uploadingCover = ref(false);
const refundPolicyInputRef = ref<HTMLTextAreaElement | null>(null);
const ticketPriceInputRef = ref<HTMLInputElement | null>(null);
const ticketPriceDisplay = computed(() =>
  form.ticketPrice != null ? String(form.ticketPrice) : '',
);
const showCopyOverlay = ref(false);
const copyEvents = ref<ConsoleEventSummary[]>([]);
const copyLoading = ref(false);
const copyError = ref<string | null>(null);
const copySelectingId = ref<string | null>(null);
const entryHandled = ref(false);
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
const pastePlaceholder = 'イベントの下書きを貼り付ければ AI がフォームに反映します';
const pasteInputRef = ref<HTMLTextAreaElement | null>(null);
const showPasteResult = ref(false);
const pasteFilledFields = ref<string[]>([]);
const pasteAdvice = ref<string[]>([]);
const pasteCompliance = ref<string[]>([]);
const pasteResultLoading = ref(false);
const storedParsedResult = ref<{ title?: string; description?: string; rules?: string; advice?: string[]; compliance?: string[] } | null>(null);
const checklistItems = computed(() => [
  { id: 'title', label: 'イベントタイトル', note: null, done: true },
  { id: 'desc', label: 'イベント説明', note: null, done: true },
  { id: 'risk', label: '注意事項・リスク', note: null, done: true },
  { id: 'place', label: '場所', note: null, done: true },
  { id: 'time', label: '開始 / 終了時間', note: null, done: true },
  { id: 'visibility', label: '公開範囲', note: null, done: true },
]);
const firstAdvice = computed(() => pasteAdvice.value[0] || '');
const firstCompliance = computed(() => pasteCompliance.value[0] || '');
const reviewStatus = ref<string | null>(null);
  const reviewReason = ref<string | null>(null);
  const reviewStatusLabel = computed(() => {
    switch (reviewStatus.value) {
      case 'approved':
        return '承認済み';
    case 'rejected':
      return '差し戻し';
    case 'pending_review':
      return '審査中';
    default:
      return '';
  }
});
  const reviewMessage = computed(() => {
    if (reviewStatus.value === 'rejected') return '修正して再度送信してください。';
    if (reviewStatus.value === 'pending_review') return '審査中です。公開までお待ちください。';
    if (reviewStatus.value === 'approved') return '審査済みです。更新しても自動で再審査されます。';
    return '';
  });
  const showAdvancedMobile = ref(false);

const detectLang = (text: string): 'ja' | 'en' | 'zh' => {
  if (/[\u4e00-\u9fff]/.test(text)) return 'zh';
  if (/[a-zA-Z]/.test(text)) return 'en';
  return 'ja';
};

const loadDraftFromStorage = () => {
  if (typeof window === 'undefined') return;
  const stored = sessionStorage.getItem('CONSOLE_EVENT_PASTE_DRAFT');
  if (stored) {
    pastedDraft.value = stored;
    sessionStorage.removeItem('CONSOLE_EVENT_PASTE_DRAFT');
    return stored;
  }
  return null;
};

const loadParsedResultFromStorage = () => {
  if (typeof window === 'undefined') return null;
  const stored = sessionStorage.getItem('CONSOLE_EVENT_PASTE_RESULT');
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored);
    storedParsedResult.value = parsed;
    sessionStorage.removeItem('CONSOLE_EVENT_PASTE_RESULT');
    return parsed;
  } catch (e) {
    console.warn('Failed to parse stored paste result', e);
    return null;
  }
};

const fetchPasteInsights = async (draft: string) => {
  pasteAdvice.value = [];
  pasteCompliance.value = [];
  const baseLanguage = detectLang(draft || form.title || form.description);
  const prompt = `あなたはイベント企画アシスタントです。ユーザーの草案を読み、JSON を出力してください。フィールド: filled（自動で補完した項目）, advice（主催者への次の一手アドバイス、簡潔に）, compliance（リスク/コンプライアンスの注意点、簡潔に）。JSON のみを返してください。他の文字は出力しないでください。草案：${draft}`;
  const payload: EventAssistantRequest = {
    baseLanguage,
    topic: 'イベント草案入力',
    audience: 'organizer',
    style: 'concise',
    details: draft,
    conversation: [{ role: 'user', content: prompt }],
  };
  pasteResultLoading.value = true;
  try {
    const res: EventAssistantReply = await requestEventAssistantReply(payload);
    const raw = res.message || '';
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      pasteFilledFields.value = parsed.filled ?? pasteFilledFields.value;
      pasteAdvice.value = parsed.advice ?? [];
      pasteCompliance.value = parsed.compliance ?? [];
    }
  } catch (err) {
    console.warn('fetchPasteInsights failed', err);
    if (!pasteAdvice.value.length) {
      pasteAdvice.value = ['時間・場所・カバー画像を確認し、参加者に必要な情報を揃えてください', '申込フォーム・料金・返金説明を設定して、やり取りの手間を減らしてください'];
    }
    if (!pasteCompliance.value.length) {
      pasteCompliance.value = ['センシティブ/制限コンテンツを避け、現地の規制や会場ルールを守ってください', '返金/リスクの注意を明示し、オフラインの場合は緊急連絡手段を用意してください'];
    }
  } finally {
    pasteResultLoading.value = false;
  }
};
type FieldMetaType = 'text' | 'textarea' | 'datetime' | 'number';

const fieldMeta: Record<FieldKey, { label: string; type: FieldMetaType; placeholder?: string }> = {
  title: { label: 'タイトル', type: 'text', placeholder: 'あとで設定できます' },
  description: { label: 'ショート説明', type: 'textarea', placeholder: 'あとで設定できます' },
  startTime: { label: '開始日時', type: 'datetime' },
  endTime: { label: '終了日時', type: 'datetime' },
  regStartTime: { label: '受付開始', type: 'datetime' },
  regEndTime: { label: '受付締切', type: 'datetime' },
  minParticipants: { label: '最低参加人数', type: 'number', placeholder: 'あとで設定できます' },
  maxParticipants: { label: '最大参加人数', type: 'number', placeholder: 'あとで設定できます' },
  ticketPrice: { label: '参加費 (円)', type: 'number', placeholder: 'あとで設定できます' },
  visibility: { label: '公開範囲', type: 'select' },
  visibleRange: { label: 'Console 可視範囲', type: 'select' },
  refundPolicy: { label: '返金ポリシー', type: 'textarea', placeholder: '例：イベント3日前まで全額返金' },
  locationText: { label: '場所', type: 'text', placeholder: 'あとで設定できます' },
};

const currentFieldMeta = computed(() => (editingField.value ? fieldMeta[editingField.value] : null));
const currentFieldLabel = computed(() => currentFieldMeta.value?.label || '');
const currentFieldType = computed<FieldMetaType>(() => currentFieldMeta.value?.type || 'text');
const currentFieldPlaceholder = computed(() => currentFieldMeta.value?.placeholder || 'あとで設定できます');

const categoryOptions = [
  { label: 'アウトドア', value: 'hiking' },
  { label: 'ランニング', value: 'running' },
  { label: 'サイクリング', value: 'cycling' },
  { label: 'キャンプ', value: 'camping' },
  { label: '水上スポーツ', value: 'water' },
  { label: '親子', value: 'kids' },
  { label: '語学交流', value: 'language' },
  { label: 'その他', value: 'other' },
];
const showCategorySheet = ref(false);
const categoryDraft = ref('');
const categoryLabel = computed(() => {
  const found = categoryOptions.find((cat) => cat.value === form.category);
  return found?.label || '選択してください';
});

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

const sheetOpen = computed(
  () =>
    Boolean(
      editingField.value ||
        showCategorySheet.value ||
        showPastePanel.value ||
        showPasteResult.value ||
        showLocationPicker.value,
    ),
);

watch(
  () => sheetOpen.value,
  (open) => {
    if (typeof document === 'undefined') return;
    const body = document.body;
    if (open) {
      body.style.overflow = 'hidden';
    } else {
      body.style.overflow = '';
    }
  },
);

const getSelectLabel = (key: 'visibility' | 'visibleRange', value?: string | null) => {
  const list = selectOptions[key] || [];
  const target = list.find((item) => item.value === value);
  return target?.label || '選択してください';
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
      return '中国語';
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
    const stored =
      sessionStorage.getItem(CONSOLE_EVENT_LANG_KEY) || sessionStorage.getItem(LEGACY_EVENT_LANG_KEY);
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
  () => activeContentLang.value,
  () => {
    persistLang();
  },
);
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
      return 'タイトル';
    case 'rules':
      return '注意事項';
    default:
      return '詳細';
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
      throw new Error('AI の応答がありませんでした。時間をおいて再試行してください。');
    }
    aiPreview.value = { target, text, lang: activeContentLang.value };
  } catch (err) {
    aiError.value = err instanceof Error ? err.message : 'AI 生成に失敗しました。時間をおいて再試行してください。';
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
  if (!value) return 'あとで設定できます';
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
  pendingEndRange.value = false;
  pendingRegRange.value = false;
  pendingMaxParticipants.value = false;
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
  if (pendingEndRange.value && editingField.value === 'startTime') {
    editingField.value = 'endTime';
    fieldDraft.value = form.endTime || '';
    pendingEndRange.value = false;
    return;
  }
  if (pendingRegRange.value && editingField.value === 'regStartTime') {
    editingField.value = 'regEndTime';
    fieldDraft.value = form.regEndTime || '';
    pendingRegRange.value = false;
    return;
  }
  if (pendingMaxParticipants.value && editingField.value === 'minParticipants') {
    editingField.value = 'maxParticipants';
    fieldDraft.value = form.maxParticipants != null ? String(form.maxParticipants) : '';
    pendingMaxParticipants.value = false;
    return;
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
  aiPrefillNotice.value = '🤖 AI が基本情報を補完しました。今すぐ公開できます（後から編集可能）';
  if (isMobileLayout) {
    showMobileNotice.value = true;
  }
};

const loadAiDraftFromSession = () => {
  if (isEdit.value) return false;
  const raw = sessionStorage.getItem(CONSOLE_AI_EVENT_DRAFT_KEY);
  if (!raw) return false;
  try {
    const parsed = JSON.parse(raw);
    applyAiDraft(parsed);
    sessionStorage.removeItem(CONSOLE_AI_EVENT_DRAFT_KEY);
    return true;
  } catch (err) {
    console.warn('Failed to parse AI draft', err);
    return false;
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
    const normalizedFromGallery = normalizeGalleryItems(event.galleries);
    if (normalizedFromGallery.length) {
      galleries.value = normalizedFromGallery;
    } else if (event.coverImageUrl) {
      galleries.value = [{ id: 'cover', imageUrl: resolveAssetUrl(event.coverImageUrl), order: 0 }];
    } else {
      galleries.value = [];
    }
  }
};

const load = async () => {
  if (communityId && !eventId.value) {
    const community = await fetchConsoleCommunity(communityId);
    subtitle.value = `コミュニティ: ${community.name}`;
  }

  if (!eventId.value) {
    loadAiDraftFromSession();
    return;
  }
  try {
    const event = await fetchConsoleEvent(eventId.value);
    reviewStatus.value = (event as any).reviewStatus || null;
    reviewReason.value = (event as any).reviewReason || null;
    applyEventDetailToForm(event, { syncCommunity: true, setSubtitle: true, includeGalleries: true });
    if (!event.galleries?.length) {
      await reloadGallery();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'イベント読み込みに失敗しました';
    error.value = message;
    toast.show(message, 'error');
  }
};

const reloadGallery = async () => {
  if (!eventId.value) return;
  try {
    const list = await fetchEventGallery(eventId.value);
    galleries.value = normalizeGalleryItems(list);
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
    const message = '開始日時を先に設定してください';
    error.value = message;
    toast.show(message, 'error');
    return;
  }
  const start = new Date(form.startTime);
  const target = new Date(start.getTime() + hours * 60 * 60 * 1000);
  form.endTime = toLocalInput(target);
};

const setRegDeadlineShortcut = (minutesBeforeStart: number) => {
  if (!form.startTime) {
    const message = '開始日時を先に設定してください';
    error.value = message;
    toast.show(message, 'error');
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
  name: { label: '氏名', type: 'text', placeholder: '氏名を入力してください' },
  phone: { label: '電話', type: 'phone', placeholder: '例：09012345678' },
  email: { label: 'メール', type: 'email', placeholder: 'example@example.com' },
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
      return '終了';
    default:
      return '下書き';
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

const checkPastedDraft = async (auto = false) => {
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
    if (!auto) {
      toast.show(draftCheckMessage.value);
      goToEventAssistant();
    }
    return;
  }
  const preview = extractFromPastedDraft(text);
  pastedPreview.value = preview;
  draftCheckMessage.value = '草案を検出しました。フォームに自動反映しました。';
  await applyPastedPreview(true);
};

const applyPastedPreview = async (auto = false) => {
  if (!pastedPreview.value) return;
  pasteFilledFields.value = [];
  const { title, description, rules } = pastedPreview.value;
  if (title) {
    form.title = title;
    setLangContent('title', activeContentLang.value, title);
    pasteFilledFields.value.push('イベントタイトル');
  }
  if (description) {
    form.description = description;
    form.descriptionHtml = `<p>${description}</p>`;
    setLangContent('description', activeContentLang.value, description);
    descriptionHtmlByLang[activeContentLang.value] = form.descriptionHtml;
    pasteFilledFields.value.push('イベント説明');
  }
  if (rules) {
    form.config.riskNoticeText = rules;
    setLangContent('rules', activeContentLang.value, rules);
    pasteFilledFields.value.push('注意事項/リスク');
  }
  pastedPreview.value = null;
  draftCheckMessage.value = 'フォームに反映しました。内容を確認してください。';
  aiPrefillNotice.value = '🤖 AI が基本情報を補完しました。今すぐ公開できます（後から編集可能）';
  showPastePanel.value = false;
  if (!auto) {
    await fetchPasteInsights(pastedDraft.value || `${title || ''}\n${description || ''}\n${rules || ''}`);
    showPasteResult.value = true;
    toast.show(draftCheckMessage.value);
  }
};

const applyParsedResult = async (result: Record<string, any>) => {
  const pick = <T>(camel: string, snake: string): T | null => {
    if (result[camel] !== undefined) return result[camel] as T;
    if (result[snake] !== undefined) return result[snake] as T;
    return null;
  };
  pasteFilledFields.value = [];
  const title = pick<string>('title', 'title');
  if (title) {
    form.title = title;
    setLangContent('title', activeContentLang.value, title);
    pasteFilledFields.value.push('イベントタイトル');
  }
  const description = pick<string>('description', 'description');
  if (description) {
    form.description = description;
    form.descriptionHtml = `<p>${description}</p>`;
    setLangContent('description', activeContentLang.value, description);
    descriptionHtmlByLang[activeContentLang.value] = form.descriptionHtml;
    pasteFilledFields.value.push('イベント説明');
  }
  const rules = pick<string>('rules', 'rules');
  if (rules) {
    form.config.riskNoticeText = rules;
    setLangContent('rules', activeContentLang.value, rules);
    pasteFilledFields.value.push('注意事項/リスク');
  }
  const category = pick<string>('category', 'category');
  if (category) {
    form.category = category;
    pasteFilledFields.value.push('カテゴリ');
  }
  const locationText = pick<string>('locationText', 'location_text');
  if (locationText) {
    form.locationText = locationText;
    pasteFilledFields.value.push('場所');
  }
  const startTime = pick<string>('startTime', 'start_time');
  if (startTime) {
    form.startTime = startTime;
    pasteFilledFields.value.push('開始時間');
  }
  const endTime = pick<string>('endTime', 'end_time');
  if (endTime) {
    form.endTime = endTime;
    pasteFilledFields.value.push('終了時間');
  }
  const regStartTime = pick<string>('regStartTime', 'reg_start_time');
  if (regStartTime) {
    form.regStartTime = regStartTime;
    pasteFilledFields.value.push('受付開始');
  }
  const regEndTime = pick<string>('regEndTime', 'reg_end_time');
  if (regEndTime) {
    form.regEndTime = regEndTime;
    pasteFilledFields.value.push('受付締切');
  }
  const minParticipants = pick<number>('minParticipants', 'min_participants');
  if (minParticipants != null) {
    form.minParticipants = minParticipants;
    pasteFilledFields.value.push('最低人数');
  }
  const maxParticipants = pick<number>('maxParticipants', 'max_participants');
  if (maxParticipants != null) {
    form.maxParticipants = maxParticipants;
    pasteFilledFields.value.push('最大人数');
  }
  const ticketPrice = pick<number>('ticketPrice', 'ticket_price');
  if (ticketPrice != null) {
    form.ticketPrice = ticketPrice;
    pasteFilledFields.value.push('参加費');
  }
  const visibility = pick<string>('visibility', 'visibility');
  if (visibility) {
    form.visibility = visibility;
    pasteFilledFields.value.push('公開範囲');
  }
  const visibleRange = pick<string>('visibleRange', 'visible_range');
  if (visibleRange) {
    form.config.visibleRange = visibleRange;
    pasteFilledFields.value.push('Console 可視範囲');
  }
  const refundPolicy = pick<string>('refundPolicy', 'refund_policy');
  if (refundPolicy) {
    form.config.refundPolicy = refundPolicy;
    pasteFilledFields.value.push('返金ポリシー');
  }
  const ticketTypes = pick<any[]>('ticketTypes', 'ticket_types');
  if (Array.isArray(ticketTypes) && ticketTypes.length) {
    form.ticketTypes = ticketTypes as any;
    pasteFilledFields.value.push('チケット設定');
  }
  const regForm = pick<any[]>('registrationForm', 'registration_form');
  if (Array.isArray(regForm) && regForm.length) {
    form.registrationForm = regForm as any;
    pasteFilledFields.value.push('申込フォーム');
  }
  pasteAdvice.value = (pick<string[]>('advice', 'advice') || []).filter(Boolean);
  pasteCompliance.value = (pick<string[]>('compliance', 'compliance') || []).filter(Boolean);
  aiPrefillNotice.value = '🤖 AI が基本情報を補完しました。今すぐ公開できます（後から編集可能）';
  showPastePanel.value = false;
  showPasteResult.value = true;
};

const togglePaste = (state?: boolean) => {
  const next = state !== undefined ? state : !showPastePanel.value;
  showPastePanel.value = next;
  if (!next) {
    draftCheckMessage.value = '';
    pastedPreview.value = null;
  } else {
    nextTick(() => pasteInputRef.value?.focus());
  }
};

const handleEntryFromQuery = async () => {
  if (entryHandled.value) return;
  aiPrefillNotice.value = null;
  const entry = route.query.entry as string | undefined;
  const copyEventId = route.query.copyEventId as string | undefined;
  const source = route.query.source as string | undefined;
  if (source === 'ai-assistant') {
    const applied = loadAiDraftFromSession();
    if (applied) {
      aiPrefillNotice.value = '🤖 AI が基本情報を補完しました。今すぐ公開できます（後から編集可能）';
    }
  }
  if (!entry) return;
  entryHandled.value = true;
  switch (entry) {
    case 'paste': {
      const parsed = loadParsedResultFromStorage();
      const stored = loadDraftFromStorage();
      if (parsed) {
        await applyParsedResult(parsed);
      } else if (stored?.trim()) {
        let applied = false;
        if (eventCommunityId.value) {
          try {
            const res = await extractEventDraft(eventCommunityId.value, { draft: stored });
            if (res) {
              await applyParsedResult(res as any);
              applied = true;
            }
          } catch (err) {
            console.warn('extractEventDraft apply failed', err);
          }
        }
        if (!applied) {
          await checkPastedDraft(true);
        }
      }
      break;
    }
    case 'basic':
      await nextTick();
      scrollToSection('basic');
      break;
    case 'copy':
      if (copyEventId) {
        await handleCopyFromEvent(copyEventId);
      } else {
        await openCopyOverlay();
      }
      break;
    default:
      break;
  }
};

const triggerCoverPicker = () => {
  if (coverInputRef.value) {
    coverInputRef.value.click();
  }
};

const closePasteResult = () => {
  showPasteResult.value = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const parseCoverUploadError = (err: unknown) => {
  const status = (err as any)?.response?.status;
  if (status === 413) {
    return '画像が大きすぎます。もう少し小さい写真やスクリーンショットでお試しください。';
  }
  const isNetwork = (err as any)?.message === 'Network Error';
  const isCors =
    (err as any)?.message?.includes?.('CORS') ||
    (err as any)?.message?.includes?.('Failed to fetch') ||
    (err as any)?.message?.includes?.('ERR_FAILED');
  if (isCors) {
    return '通信が不安定です。ネットワークを変えるか時間をおいて再試行してください。';
  }
  if (isNetwork) {
    return '通信が不安定です。ネットワークを変えるか時間をおいて再試行してください。';
  }
  return err instanceof Error ? err.message : 'カバー画像のアップロードに失敗しました。再試行してください。';
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
          reject(new Error('圧縮に失敗しました'));
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
          const sourceAspect = img.width / img.height;
          const crop: { sx: number; sy: number; sw: number; sh: number } = {
            sx: 0,
            sy: 0,
            sw: img.width,
            sh: img.height,
          };
          if (sourceAspect > TARGET_ASPECT) {
            crop.sw = img.height * TARGET_ASPECT;
            crop.sx = (img.width - crop.sw) / 2;
          } else if (sourceAspect < TARGET_ASPECT) {
            crop.sh = img.width / TARGET_ASPECT;
            crop.sy = (img.height - crop.sh) / 2;
          }

          let targetWidth = Math.min(MAX_COVER_DIMENSION, crop.sw);
          let targetHeight = Math.round(targetWidth / TARGET_ASPECT);

          const compressOnce = async (width: number, height: number, quality: number) => {
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(width);
            canvas.height = Math.round(height);
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('画像を圧縮できませんでした');
            ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
            return toJpegBlob(canvas, quality);
          };

          let blob = await compressOnce(targetWidth, targetHeight, COVER_COMPRESS_QUALITY);
          if (blob.size > MAX_COVER_UPLOAD_SIZE) {
            blob = await compressOnce(targetWidth, targetHeight, COVER_FALLBACK_QUALITY);
          }

          if (blob.size > MAX_COVER_UPLOAD_SIZE) {
            const scale = Math.max(0.7, Math.sqrt(MAX_COVER_UPLOAD_SIZE / blob.size));
            targetWidth = Math.max(1, Math.floor(targetWidth * scale));
            targetHeight = Math.round(targetWidth / TARGET_ASPECT);
            blob = await compressOnce(targetWidth, targetHeight, COVER_FALLBACK_QUALITY);
          }

          if (blob.size > MAX_COVER_UPLOAD_SIZE) {
            // 最终のフォールバック：さらに解像度を下げる
            targetWidth = Math.max(1, Math.floor(targetWidth * 0.75));
            targetHeight = Math.round(targetWidth / TARGET_ASPECT);
            blob = await compressOnce(targetWidth, targetHeight, COVER_FALLBACK_QUALITY);
          }

          if (blob.size > MAX_COVER_SIZE) {
            reject(new Error('画像がまだ大きすぎます。さらに小さい画像でお試しください。'));
            return;
          }

          const compressed = new File([blob], file.name.replace(/\.\w+$/, '.jpg'), {
            type: blob.type || 'image/jpeg',
          });
          resolve(compressed);
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = () => reject(new Error('画像を読み込めませんでした'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('画像を読み込めませんでした'));
    reader.readAsDataURL(file);
  });

const normalizeGalleryItems = (items?: EventGalleryItem[] | null) => {
  if (!Array.isArray(items)) return [];
  return items.map((item, index) => ({
    ...item,
    id: item.id || `gallery-${index}`,
    imageUrl: resolveAssetUrl(item.imageUrl),
  }));
};

const loadCopyEvents = async () => {
  if (!eventCommunityId.value) return;
  copyLoading.value = true;
  copyError.value = null;
  try {
    copyEvents.value = await fetchConsoleCommunityEvents(eventCommunityId.value);
  } catch (err) {
    copyError.value = err instanceof Error ? err.message : '過去のイベントを読み込めませんでした。時間をおいて再試行してください。';
  } finally {
    copyLoading.value = false;
  }
};

const importGalleryToPending = async (detail: ConsoleEventDetail) => {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') return;
  if (!detail.galleries?.length) return;
  revokeLocalCoverPreviews();
  const gallerySlice = detail.galleries.slice(0, MAX_COVERS);
  let successCount = 0;
  const tasks = gallerySlice.map(async (item, index) => {
    try {
      const resolvedUrl = resolveAssetUrl(item.imageUrl);
      if (!resolvedUrl) return;
      const response = await fetch(resolvedUrl, { credentials: 'include' });
      if (!response.ok) return;
      const blob = await response.blob();
      const mime = blob.type || 'image/jpeg';
      const extension = mime.includes('png') ? 'png' : 'jpg';
      const fileName = `copied-${Date.now()}-${index}.${extension}`;
      const rawFile = new File([blob], fileName, { type: mime });
      const file = await downscaleImageFile(rawFile);
      const id = `${fileName}-${Math.random().toString(36).slice(2)}`;
      pendingCoverFiles.value.push({ id, file });
      const objectUrl = URL.createObjectURL(file);
      localCoverPreviews.value.push({
        id,
        imageUrl: objectUrl,
        order: index,
      });
      successCount += 1;
    } catch (err) {
      // ignore this image, continue
    }
  });
  await Promise.all(tasks);
  if (!successCount) {
    showCoverError('過去のカバー画像を取り込めませんでした。手動でクリアな画像をアップロードしてください。');
  }
};

const openCopyOverlay = async () => {
  if (!eventCommunityId.value) {
    error.value = 'コミュニティを選択してから履歴イベントをコピーしてください。';
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
      includeGalleries: Boolean(eventId.value),
      stripParticipants: true,
    });
    if (!eventId.value) {
      await importGalleryToPending(detail);
    }
    aiPrefillNotice.value = null;
    showCopyOverlay.value = false;
  } catch (err) {
    copyError.value = err instanceof Error ? err.message : 'コピーに失敗しました。時間をおいて再試行してください。';
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

const goToEventAssistant = () => {
  if (!communityId) return;
  persistLang();
  router.push({
    name: 'ConsoleMobileEventCreate',
    params: { communityId },
    query: { lang: activeContentLang.value },
  });
};

const loadGoogleMaps = async () => {
  if (googleLoaded) return;
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    mapError.value = 'Google Maps API key が未設定です（VITE_GOOGLE_MAPS_API_KEY）。';
    throw new Error('missing maps key');
  }
  if (typeof window === 'undefined') return;
  if (window.google?.maps) {
    googleLoaded = true;
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.onload = () => {
      googleLoaded = true;
      resolve();
    };
    script.onerror = () => reject(new Error('Failed to load Google Maps'));
    document.head.appendChild(script);
  });
};

const initMap = async () => {
  if (!mapRef.value) return;
  mapLoading.value = true;
  mapError.value = null;
  try {
    await loadGoogleMaps();
    const center = form.locationLat && form.locationLng
      ? { lat: form.locationLat, lng: form.locationLng }
      : { lat: 35.6804, lng: 139.769 };
    mapInstance = new google.maps.Map(mapRef.value, {
      center,
      zoom: 15,
      disableDefaultUI: true,
    });
    markerInstance = new google.maps.Marker({
      position: center,
      map: mapInstance,
      draggable: true,
    });
    markerInstance.addListener('dragend', () => {
      const pos = markerInstance?.getPosition();
      if (pos) {
        form.locationLat = pos.lat();
        form.locationLng = pos.lng();
        form.locationText = '場所を更新しました。住所を確認してください。';
        locationSearchText.value = form.locationText;
      }
    });
    if (locationSearchInputRef.value) {
      autocompleteInstance = new google.maps.places.Autocomplete(locationSearchInputRef.value, {
        fields: ['geometry', 'formatted_address', 'name'],
        types: ['geocode', 'establishment'],
        componentRestrictions: { country: 'jp' },
      });
      autocompleteInstance.addListener('place_changed', () => {
        const place = autocompleteInstance?.getPlace();
        if (!place?.geometry?.location) return;
        const loc = place.geometry.location;
        const pos = { lat: loc.lat(), lng: loc.lng() };
        mapInstance?.panTo(pos);
        markerInstance?.setPosition(pos);
        form.locationLat = pos.lat;
        form.locationLng = pos.lng;
        const address = place.formatted_address || place.name;
        if (address) {
          form.locationText = address;
          locationSearchText.value = address;
        }
      });
    }
  } catch (err: any) {
    mapError.value = err?.message || '地図を読み込めませんでした';
  } finally {
    mapLoading.value = false;
  }
};

const openLocationPicker = async () => {
  showLocationPicker.value = true;
  locationSearchText.value = form.locationText || '';
  await nextTick();
  initMap();
};

const closeLocationPicker = () => {
  showLocationPicker.value = false;
};

const applyLocationSelection = () => {
  showLocationPicker.value = false;
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
  const payload = {
    text: form.description,
    html: form.descriptionHtml,
    images: [...richNoteImages.value],
    covers: localCoverPreviews.value.map((item) => ({ id: item.id, imageUrl: item.imageUrl, order: item.order })),
  };
  try {
    sessionStorage.setItem(CONSOLE_EVENT_FORM_DRAFT_KEY, JSON.stringify({ form }));
  } catch (err) {
    console.warn('Failed to persist form draft', err);
  }
  sessionStorage.setItem(CONSOLE_EVENT_NOTE_CONTEXT_KEY, JSON.stringify(payload));
  const paramsCommunity = eventCommunityId.value || communityId;
  if (!paramsCommunity) return;
  const query: Record<string, string> = {};
  if (eventId.value) query.eventId = eventId.value;
  router.push({
    name: 'ConsoleMobileEventNoteEditor',
    params: { communityId: paramsCommunity },
    query: Object.keys(query).length ? query : undefined,
  });
};

const applyNoteResultFromStorage = async () => {
  try {
    const raw = sessionStorage.getItem(CONSOLE_EVENT_NOTE_RESULT_KEY);
    if (!raw) return;
    sessionStorage.removeItem(CONSOLE_EVENT_NOTE_RESULT_KEY);
    const payload = JSON.parse(raw) as {
      text?: string;
      html?: string;
      images?: Array<{ id: string; src: string }>;
      covers?: Array<{ id: string; imageUrl: string; order?: number }>;
    };
    if (payload.text !== undefined) {
      form.description = payload.text;
    }
    if (payload.html !== undefined) {
      form.descriptionHtml = payload.html;
    }
    if (Array.isArray(payload.images)) {
      richNoteImages.value = payload.images;
    }
    if (Array.isArray(payload.covers) && payload.covers.length) {
      // Restore local cover previews (cannot restore File blobs; previews remain for visibility)
      revokeLocalCoverPreviews();
      const restored: EventGalleryItem[] = [];
      const restoredFiles: Array<{ id: string; file: File }> = [];
      await Promise.all(
        payload.covers.map(async (item, index) => {
          try {
            const response = await fetch(item.imageUrl);
            if (!response.ok) return;
            const blob = await response.blob();
            const id = item.id || `cover-${index}-${Date.now()}`;
            const fileName = `cover-${id}.jpg`;
            const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });
            restoredFiles.push({ id, file });
            const objectUrl = URL.createObjectURL(file);
            restored.push({
              id,
              imageUrl: objectUrl,
              order: item.order ?? index,
            });
          } catch {
            // skip restore on failure
          }
        }),
      );
      if (restored.length) {
        localCoverPreviews.value = restored;
        pendingCoverFiles.value.push(...restoredFiles);
      }
    }
  } catch (err) {
    console.warn('Failed to apply note result', err);
  }
};

const applyFormDraftFromStorage = () => {
  try {
    const raw = sessionStorage.getItem(CONSOLE_EVENT_FORM_DRAFT_KEY);
    if (!raw) return;
    sessionStorage.removeItem(CONSOLE_EVENT_FORM_DRAFT_KEY);
    const saved = JSON.parse(raw);
    const savedForm = saved?.form;
    if (!savedForm) return;
    Object.assign(form, savedForm);
    if (savedForm.config) {
      Object.assign(form.config, savedForm.config);
    }
    if (Array.isArray(savedForm.ticketTypes)) {
      form.ticketTypes = savedForm.ticketTypes;
    }
    if (Array.isArray(savedForm.registrationForm)) {
      form.registrationForm = savedForm.registrationForm;
    }
  } catch (err) {
    console.warn('Failed to restore form draft', err);
  }
};

const openCategorySheet = () => {
  categoryDraft.value = form.category || '';
  showCategorySheet.value = true;
};

const closeCategorySheet = () => {
  showCategorySheet.value = false;
};

const confirmCategorySheet = () => {
  form.category = categoryDraft.value;
  closeCategorySheet();
};

const flashSaveStatus = (text: string) => {
  saveStatus.value = text;
  toast.show(text, 'success');
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
    error.value = '開始・終了時間を先に設定してください';
    submitting.value = false;
    actionLoading.value = null;
    return;
  }

  if (start.getTime() < now.getTime() - 5 * 60 * 1000) {
    error.value = '開始時間は現在時刻より後に設定してください';
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
    error.value = '受付開始はイベント開始より前に設定してください';
    submitting.value = false;
    actionLoading.value = null;
    return;
  }

  if (regEnd) {
    if (regStart && regEnd < regStart) {
      error.value = '受付締切は受付開始より後に設定してください';
      submitting.value = false;
      actionLoading.value = null;
      return;
    }
    if (regEnd > start) {
      error.value = '受付締切はイベント開始より前に設定してください';
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
    error.value = 'イベント詳細を入力してください';
    submitting.value = false;
    actionLoading.value = null;
    return;
  }

  if (status === 'open' && reviewStatus.value && ['pending_review', 'rejected'].includes(reviewStatus.value)) {
    error.value =
      reviewStatus.value === 'rejected'
        ? '内容が承認されませんでした。修正してから再提出してください。'
        : '審査中のため公開できません。';
    submitting.value = false;
    actionLoading.value = null;
    return;
  }

  if (coverDisplayItems.value.length === 0 && status === 'open') {
    error.value = '公開前に少なくとも1枚のカバー画像（最初の1枚がメイン）を追加してください';
    submitting.value = false;
    actionLoading.value = null;
    sectionCover.value?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  const htmlSize = form.descriptionHtml?.length ?? 0;
  if (htmlSize > 400_000) {
    error.value = '本文内の画像が大きすぎます。画像を減らすか内容を短くしてください。';
    submitting.value = false;
    actionLoading.value = null;
    return;
  }

  const minPeople = form.minParticipants;
  const maxPeople = form.maxParticipants;
  if (maxPeople != null) {
    if (maxPeople < 1 || maxPeople > 100) {
      error.value = '最大参加人数は 1〜100 の間で入力してください。';
      submitting.value = false;
      actionLoading.value = null;
      return;
    }
  }
  if (minPeople != null && maxPeople != null && maxPeople < minPeople) {
    error.value = '最大参加人数は最低人数以上に設定してください。';
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
    locationText: form.locationText || '',
    locationLat: typeof form.locationLat === 'number' ? form.locationLat : null,
    locationLng: typeof form.locationLng === 'number' ? form.locationLng : null,
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
    if (isEdit.value && eventId.value) {
      await updateConsoleEvent(eventId.value, {
        ...payload,
        ticketTypes: [
          {
            name: buildContent(`${form.title} チケット`, 'title'),
            type: (form.ticketPrice ?? 0) > 0 ? 'normal' : 'free',
            price: form.ticketPrice ?? 0,
          },
        ],
      });
      flashSaveStatus(status === 'open' ? '公開しました' : '保存しました');
      if (status === 'open') {
        goToPublishSuccess(eventId.value, 'list');
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
          showCoverError('イベントは保存しましたがカバーのアップロードに失敗しました。編集ページで再度追加してください。', 'warning');
        }
      }
      // after first creation, lock to this event id for subsequent saves
      router.replace({
        name: route.name as string,
        params: route.params,
        query: { ...route.query, eventId: event.id },
      });
      if (status === 'open') {
        goToPublishSuccess(event.id, 'edit');
      }
      return;
    } else {
      throw new Error('コミュニティIDが必要です');
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : '保存に失敗しました';
    error.value = message;
    toast.show(message, 'error');
  } finally {
    submitting.value = false;
    actionLoading.value = null;
  }
};

const handleSaveDraft = () => persistEvent('draft');
const handlePublish = () => persistEvent('open');
const handleSubmit = () => handlePublish();

const handlePreview = () => {
  if (!eventId.value) {
    const message = '先に下書きを保存してからプレビューしてください';
    error.value = message;
    toast.show(message, 'error');
    return;
  }
  router.push({ name: 'event-detail', params: { eventId: eventId.value } });
};

const handleCoverUpload = async (ev: Event) => {
  const input = ev.target as HTMLInputElement;
  if (!input.files || !input.files.length) return;
  const existing = coverDisplayItems.value.length;
  if (existing >= MAX_COVERS) {
    showCoverError('アップロードは最大9枚までです');
    input.value = '';
    return;
  }
  const files = Array.from(input.files);
  const valid: File[] = [];
  for (const file of files) {
    if (!file.type?.startsWith('image/')) {
      showCoverError('対応形式は jpg/png/webp のみです');
      continue;
    }
    try {
      const processed = await downscaleImageFile(file);
      valid.push(processed);
    } catch (err) {
      showCoverError(
        err instanceof Error
          ? err.message
          : 'アップロードに失敗しました。画像が大きすぎるか不適切です。スマホ写真など別の画像でお試しください',
      );
      continue;
    }
    if (existing + valid.length >= MAX_COVERS) break;
  }
  if (!valid.length) {
    input.value = '';
    return;
  }
  if (!eventId.value) {
    pendingCoverFiles.value.push(...valid);
    setLocalCoverPreviews(valid);
    coverError.value = null;
    input.value = '';
    return;
  }
  coverError.value = null;
  uploadingCover.value = true;
  try {
    await uploadEventCovers(eventId.value, valid);
    await reloadGallery();
    input.value = '';
  } catch (err) {
    console.error('cover upload failed', err);
    showCoverError(parseCoverUploadError(err));
  } finally {
    uploadingCover.value = false;
  }
};

const handleDeleteCover = async (coverId: string) => {
  if (!eventId.value) {
    removeLocalCoverPreview(coverId);
    return;
  }
  uploadingCover.value = true;
  coverError.value = null;
  try {
    galleries.value = await deleteEventCover(eventId.value, coverId);
  } catch (err) {
    showCoverError(err instanceof Error ? err.message : 'カバー削除に失敗しました。再試行してください');
  } finally {
    uploadingCover.value = false;
  }
};

const setCoverList = (items: EventGalleryItem[]) => {
  if (eventId.value) {
    galleries.value = items;
  } else {
    localCoverPreviews.value = items;
  }
};

const openCoverActions = (item: EventGalleryItem, index: number) => {
  activeCoverAction.value = item;
  activeCoverIndex.value = index;
  showCoverActionSheet.value = true;
};

const closeCoverActions = () => {
  showCoverActionSheet.value = false;
  activeCoverAction.value = null;
  activeCoverIndex.value = null;
};

const setAsCover = () => {
  if (!activeCoverAction.value || activeCoverIndex.value === null || activeCoverIndex.value <= 0) return;
  const items = [...coverDisplayItems.value];
  items.splice(activeCoverIndex.value, 1);
  items.unshift(activeCoverAction.value);
  setCoverList(items);
  closeCoverActions();
};

const deleteActiveCover = async () => {
  if (!activeCoverAction.value) return;
  await handleDeleteCover(activeCoverAction.value.id);
  closeCoverActions();
};

const openTimeRange = () => {
  pendingEndRange.value = true;
  openFieldEditor('startTime');
};

const openRegRange = () => {
  pendingRegRange.value = true;
  openFieldEditor('regStartTime');
};

const openParticipants = () => {
  pendingMaxParticipants.value = true;
  openFieldEditor('minParticipants');
};

const openLocationPickerMain = () => {
  openLocationPicker();
};

const openLocationTextEditor = () => {
  openFieldEditor('locationText');
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
    console.error('pending cover upload failed', err);
    const message = parseCoverUploadError(err);
    showCoverError(message, 'warning');
    return false;
  } finally {
    uploadingCover.value = false;
  }
};

const applyAssistantDraftFromStorage = () => {
  if (eventId.value) return false;
  try {
    const raw = sessionStorage.getItem(CONSOLE_AI_EVENT_DRAFT_KEY);
    if (!raw) return false;
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
    aiPrefillNotice.value = '🤖 AI が基本情報を補完しました。今すぐ公開できます（後から編集可能）';
    return true;
  } catch (err) {
    console.warn('Failed to apply AI draft', err);
    return false;
  } finally {
    sessionStorage.removeItem(CONSOLE_AI_EVENT_DRAFT_KEY);
  }
};

onMounted(async () => {
  setupMobileMediaQuery();
  loadStoredLang();
  await load();
  await handleEntryFromQuery(); // handle entry after load to ensure refs ready
    if (!aiPrefillNotice.value) {
      applyAssistantDraftFromStorage();
    }
  // prevent auto scroll/restore on mobile initial load
  window.scrollTo({ top: 0 });
  applyFormDraftFromStorage();
  await applyNoteResultFromStorage();
});

watch(
  () => route.query.entry,
  async (val) => {
    if (val) {
      await handleEntryFromQuery();
    }
  },
);

watch(
  () => aiPrefillNotice.value,
  (val) => {
    if (isMobileLayout && val) {
      showMobileNotice.value = true;
    }
  },
);

watch(
  () => eventCommunityId.value,
  () => {
    copyEvents.value = [];
  },
);

watch(
  () => error.value,
  (val) => {
    if (val) {
      toast.show(val, 'error');
    }
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
  applyFormDraftFromStorage();
  void applyNoteResultFromStorage();
});

</script>

<style scoped>
.mobile-nav {
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid #e2e8f0;
  background: #fff;
  width: 100vw;
  margin-left: calc(50% - 50vw);
  box-sizing: border-box;
}
.mobile-nav__back {
  border: none;
  background: transparent;
  color: #2563eb;
  font-weight: 700;
  font-size: 15px;
  padding: 6px 4px;
}
.mobile-nav__title {
  margin: 0;
  font-size: 17px;
  font-weight: 800;
  color: #0f172a;
  text-align: center;
  flex: 1;
}
.ai-hint {
  margin: 8px 12px 4px;
  font-size: 12px;
  color: #475569;
}
.mobile-nav__placeholder {
  width: 48px;
  display: block;
}
.review-banner {
  margin: 8px 12px;
  padding: 10px 12px;
  border-radius: 12px;
  background: #fff7ed;
  color: #c2410c;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(194, 65, 12, 0.2);
}
.review-banner.pending_review {
  background: #fff7ed;
  color: #c2410c;
}
.review-banner.rejected {
  background: #fef2f2;
  color: #b91c1c;
  border-color: rgba(185, 28, 28, 0.2);
}
.review-banner.approved {
  background: #ecfdf3;
  color: #166534;
  border-color: rgba(22, 101, 52, 0.25);
}
.review-badge {
  font-weight: 800;
  font-size: 13px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.06);
}
.review-text {
  margin: 0;
  font-size: 13px;
}
.console-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0 0.75rem;
}
.console-section.sheet-open {
  position: relative;
  height: 100vh;
  overflow: hidden;
}
.console-section--mobile {
  padding: 0 0 90px;
}
.console-section--mobile .form {
  gap: 0.9rem;
  padding: 0 12px;
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 24px);
}
.console-section--mobile .ios-form {
  margin-bottom: 12px;
}
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.section-header .section-title {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: #0f172a;
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
.link-btn {
  border: none;
  background: transparent;
  color: #2563eb;
  font-size: 12px;
  font-weight: 700;
  padding: 0;
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
.builder-title {
  display: flex;
  flex-direction: column;
  gap: 4px;
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
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}

.mobile-notice-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 80;
}

.mobile-notice-card {
  width: 100%;
  max-width: 360px;
  background: #fff;
  border-radius: 16px;
  padding: 16px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.25);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mobile-notice-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  color: #0f172a;
}

.mobile-notice-text {
  margin: 0;
  font-size: 14px;
  color: #0f172a;
  line-height: 1.6;
}

.mobile-notice-btn {
  margin-top: 4px;
  border: none;
  border-radius: 12px;
  padding: 12px;
  background: linear-gradient(135deg, #2563eb, #22c55e);
  color: #fff;
  font-weight: 700;
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
  flex: 0 1 auto;
  border: none;
  background: transparent;
  font-size: 16px;
  text-align: right;
  padding: 0;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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
  text-align-last: right;
  min-width: 120px;
  max-width: 70%;
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
  padding: 0 0 72px;
  background: #f5f7fb;
  gap: 0.75rem;
  overflow-x: hidden;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.console-section--mobile .section-header {
  background: #ffffff;
  border-radius: 0;
  padding: 12px 0.6rem;
  box-shadow: none;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  align-items: center;
  width: 100%;
  margin: 0 0 8px 0;
  box-sizing: border-box;
}

.nav-text-btn {
  border: none;
  background: transparent;
  color: #0f172a;
  font-weight: 700;
  font-size: 14px;
  padding: 8px 4px;
}
.nav-text-btn.back {
  padding-left: 0;
}
.nav-text-btn.placeholder {
  opacity: 0;
  pointer-events: none;
}

.console-section--mobile .section-header h2 {
  font-size: 18px;
}

.console-section--mobile .card,
.console-section--mobile .ios-panel,
.console-section--mobile .mobile-hero-card {
  border: none;
  border-radius: 12px;
  padding: 18px;
  box-shadow: 0 18px 45px rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.98);
  width: 100%;
  max-width: none;
  margin: 0 0 12px 0;
  box-sizing: border-box;
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

.console-section--mobile .card,
.console-section--mobile .ios-panel,
.console-section--mobile .mobile-hero-card {
  margin-left: 0;
  margin-right: 0;
}

.console-section--mobile .hero-cover-panel {
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
  margin: 0 0 8px 0;
  overflow: hidden;
}

.console-section--mobile .hero-cover-strip {
  margin: 0;
  padding: 0 0 4px 0;
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
  overflow: hidden;
  width: 100%;
  box-sizing: border-box;
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

.location-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.35);
  backdrop-filter: blur(6px);
  z-index: 30;
  display: grid;
  place-items: center;
  padding: 16px;
}
.location-card {
  width: min(960px, 100%);
  background: #fff;
  border-radius: 18px;
  box-shadow: 0 20px 40px rgba(15, 23, 42, 0.2);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.location-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.location-head h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
}
.location-placeholder {
  width: 64px;
  height: 24px;
}
.location-hint {
  margin: 0;
  color: #475569;
  font-size: 13px;
}
.location-search input {
  width: 100%;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  font-size: 15px;
}
.map-frame {
  position: relative;
  height: 360px;
  border-radius: 16px;
  overflow: hidden;
  background: #e2e8f0;
}
.map-canvas {
  position: absolute;
  inset: 0;
}
.map-loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  gap: 8px;
  color: #475569;
}
.location-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.location-meta {
  font-size: 12px;
  color: #475569;
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
  box-sizing: border-box;
}

.ios-rich-text__preview {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  text-align: right;
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
  background: rgba(15, 23, 42, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 20px;
  z-index: 80;
}

.field-sheet {
  width: 100%;
  max-width: 540px;
  max-height: 90vh;
  background: #fff;
  border-radius: 28px;
  padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
  box-shadow: 0 -20px 50px rgba(15, 23, 42, 0.2);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
}

.field-sheet * {
  box-sizing: border-box;
}

.field-sheet--wide .field-sheet-body input {
  font-size: 18px;
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
  flex: 1;
  min-height: 0;
  overflow-y: auto;
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

.field-hint {
  font-size: 12px;
  color: #94a3b8;
  margin: -4px 2px 4px;
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
  border: none;
  background: transparent;
  padding: 0;
}

.hero-cover-strip {
  display: flex;
  align-items: center;
  gap: 10px;
  overflow-x: auto;
  padding: 4px 2px 8px;
  -webkit-overflow-scrolling: touch;
}

.hero-cover-strip::-webkit-scrollbar {
  display: none;
}

.hero-cover-rules {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.35;
  color: rgba(15, 23, 42, 0.6);
}

.hero-cover-thumb {
  position: relative;
  width: 92px;
  height: 92px;
  border-radius: 18px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: #fff;
  box-shadow: 0 12px 26px rgba(15, 23, 42, 0.12);
  padding: 4px;
  flex-shrink: 0;
  overflow: hidden;
}
.hero-cover-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 14px;
}
.hero-cover-main {
  position: absolute;
  top: 6px;
  left: 6px;
  background: rgba(15, 23, 42, 0.88);
  color: #fff;
  font-size: 10px;
  padding: 4px 8px;
  border-radius: 10px;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.hero-cover-add {
  width: 92px;
  height: 92px;
  border-radius: 18px;
  background: #fff;
  border: 1px solid rgba(15, 23, 42, 0.08);
  color: #0f172a;
  font-weight: 800;
  display: grid;
  place-items: center;
  box-shadow: 0 12px 26px rgba(15, 23, 42, 0.12);
  padding: 8px;
  flex-shrink: 0;
}
.hero-cover-add span {
  font-size: 26px;
  line-height: 1;
}

.hero-cover-placeholder {
  width: 100%;
  height: 150px;
  border-radius: 20px;
  border: 1px solid rgba(15, 23, 42, 0.08);
  background: linear-gradient(145deg, #f8fafc, #eef2ff);
  display: grid;
  place-items: center;
  gap: 6px;
  color: #0f172a;
  font-weight: 700;
  box-shadow: 0 16px 32px rgba(15, 23, 42, 0.08);
}
.hero-cover-plus {
  font-size: 32px;
  line-height: 1;
}
.hero-cover-placeholder-text {
  margin: 0;
  font-size: 13px;
  color: #475569;
}

.cover-action-mask {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  z-index: 70;
}
.cover-action-sheet {
  background: #fff;
  width: 100%;
  border-radius: 16px 16px 0 0;
  padding: 12px 16px 18px;
  box-shadow: 0 -16px 30px rgba(15, 23, 42, 0.16);
}
.cover-action-title {
  text-align: center;
  font-weight: 700;
  margin: 4px 0 12px;
  color: #0f172a;
}
.sheet-btn {
  width: 100%;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #0f172a;
  font-weight: 700;
  margin-top: 8px;
}
.sheet-btn.danger {
  color: #b91c1c;
  background: #fff1f2;
  border-color: #fecdd3;
}

.hero-top {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.info-block {
  border: none;
  background: transparent;
  padding: 0;
  margin-top: 12px;
}
.info-group {
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.08);
  margin-bottom: 10px;
}
.info-group--secondary {
  border-color: #eef2f7;
  box-shadow: none;
}
.info-row {
  width: 100%;
  border: none;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 14px;
  border-bottom: 1px solid #edf2f7;
}
.info-row:last-child {
  border-bottom: none;
}
.info-row--primary {
  background: #f8fafc;
}
.info-label {
  font-size: 14px;
  color: #475569;
}
.info-value {
  font-size: 15px;
  font-weight: 700;
  color: #0f172a;
}
.info-value.is-placeholder {
  color: #cbd5e1;
  font-weight: 600;
}
.info-subhint {
  margin: 6px 14px 12px;
  font-size: 12px;
  color: #94a3b8;
}
.info-link {
  border: none;
  background: transparent;
  color: #2563eb;
  font-weight: 600;
  padding: 0;
}
.info-divider {
  margin: 0 6px;
  color: #cbd5e1;
}

.hero-cover-panel {
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.25), rgba(255, 255, 255, 0.05));
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  padding: 14px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4);
  color: #ecf5ff;
  display: flex;
  flex-direction: column;
  gap: 10px;
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
.cover-below {
  margin-top: 10px;
  background: #fff;
  color: #0f172a;
  border: 1px solid rgba(15, 23, 42, 0.1);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
  backdrop-filter: none;
  width: 100%;
  margin: 0;
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
  border-radius: 12px;
  padding: 12px;
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
.paste-close {
  border: none;
  background: rgba(15, 23, 42, 0.06);
  color: #0f172a;
  padding: 8px 12px;
  border-radius: 12px;
  font-weight: 700;
}
.paste-full-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 90;
}
.paste-full-card {
  width: min(960px, 96vw);
  max-height: 92vh;
  background: #fff;
  border-radius: 20px;
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.22);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}
.paste-full-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}
.paste-full-title {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
}
.paste-full-subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: #475569;
}
.paste-input--full {
  width: 100%;
  min-height: 240px;
  font-size: 14px;
  line-height: 1.5;
}
.paste-result-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 95;
}
.paste-review-card {
  width: min(640px, 92vw);
  background: #fff;
  border-radius: 20px;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.24);
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.paste-review-head {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.paste-review-title {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: #0f172a;
}
.paste-review-subtitle {
  margin: 0;
  font-size: 13px;
  color: #475569;
}
.paste-result-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 16px 12px;
  border-radius: 12px;
  border: 1px dashed rgba(148, 163, 184, 0.5);
  background: rgba(248, 250, 252, 0.9);
  color: #475569;
}
.eyebrow {
  margin: 0;
  font-size: 12px;
  letter-spacing: 0.12em;
  color: #94a3b8;
  text-transform: uppercase;
}
.review-checklist {
  padding: 12px;
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.03);
}
.review-checklist ul {
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.check-item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
}
.status-dot {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  border: 1px solid #cbd5e1;
  background: #e2e8f0;
}
.status-dot.done {
  background: #22c55e;
  border-color: #16a34a;
  box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.1);
}
.status-dot.pending {
  background: #e2e8f0;
}
.check-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.check-label {
  margin: 0;
  font-size: 15px;
  color: #0f172a;
  font-weight: 600;
}
.check-note {
  margin: 0;
  font-size: 12px;
  color: #475569;
}
.check-state {
  font-size: 12px;
  color: #2563eb;
  font-weight: 700;
}
.review-hints {
  padding: 12px;
  border-radius: 12px;
  background: rgba(255, 247, 237, 0.9);
  border: 1px solid rgba(251, 191, 36, 0.4);
}
.hint-text {
  margin: 6px 0 0;
  font-size: 13px;
  color: #92400e;
  line-height: 1.5;
}
.paste-review-actions {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  margin-top: 6px;
}
.ghost-link,
.primary-next {
  height: 46px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 15px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  width: 100%;
}
.ghost-link {
  background: transparent;
  color: #475569;
}
.primary-next {
  background: #0ea5e9;
  color: #fff;
  box-shadow: 0 12px 30px rgba(14, 165, 233, 0.25);
}
.spinner {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid rgba(15, 23, 42, 0.15);
  border-top-color: #0ea5e9;
  animation: spin 0.9s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
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
  color: rgba(15, 23, 42, 0.6);
}

.builder-hint--inline {
  margin-top: 8px;
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
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 10px;
  padding: 10px 16px calc(env(safe-area-inset-bottom, 0px) + 14px);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 -8px 30px rgba(15, 23, 42, 0.08);
  z-index: 40;
}

.nav-btn {
  padding: 14px 10px;
  border-radius: 12px;
  border: none;
  font-size: 14px;
  font-weight: 700;
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
  cursor: pointer;
}

.nav-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.nav-btn.text {
  background: transparent;
  border: none;
  color: #475569;
  box-shadow: none;
}

.nav-btn.primary {
  background: linear-gradient(135deg, #0090d9, #0ccbaf);
  color: #fff;
}

.advanced-toggle {
  margin: 12px 12px 0;
  padding: 12px;
  border-radius: 14px;
  background: #f8fafc;
  color: #0f172a;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  cursor: pointer;
  border: 1px solid #e2e8f0;
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.06);
}
.advanced-toggle span:first-child {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.advanced-toggle .i-lucide-chevron-down {
  transition: transform 0.2s ease;
  width: 16px;
  height: 16px;
  color: #64748b;
}
.advanced-toggle .rotate {
  transform: rotate(180deg);
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
