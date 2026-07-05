import config from './config.js';
import api, { ApiError } from './api.js';
import { renderDashboard } from './dashboard.js';

// Global App State
const state = {
  questions: [],      // All loaded questions
  history: [],        // All attempts history
  roundState: {       // Progress sync state
    categories: [],
    remainingQueue: [],
    lapCount: 0
  },
  
  // Active states
  currentQuestion: null,
  currentChoices: [],
  questionStartTime: 0,
  isAnsweringEnabled: false,
  
  // Single Question Review Mode
  reviewQuestionMode: false,
  reviewQuestionId: null
};

// DOM Elements
const elements = {
  // Navigation
  navLinks: document.querySelectorAll('.nav-link'),
  tabPanels: document.querySelectorAll('.tab-panel'),
  
  // Loading & Alerts
  loadingOverlay: document.getElementById('loading-overlay'),
  loadingText: document.getElementById('loading-text'),
  
  // Config Banner
  configAlertBanner: document.getElementById('config-alert-banner'),
  
  // Quiz Elements
  quizQuestionContainer: document.getElementById('quiz-question-container'),
  quizEmptyState: document.getElementById('quiz-empty-state'),
  quizLapCount: document.getElementById('quiz-lap-count'),
  quizProgressText: document.getElementById('quiz-progress-text'),
  quizProgressBar: document.getElementById('quiz-progress-bar'),
  quizCategoryBadge: document.getElementById('quiz-category-badge'),
  quizDifficultyBadge: document.getElementById('quiz-difficulty-badge'),
  quizQuestionText: document.getElementById('quiz-question-text'),
  quizChoicesContainer: document.getElementById('quiz-choices-container'),
  quizTimer: document.getElementById('quiz-timer'),
  quizFeedbackOverlay: document.getElementById('quiz-feedback-overlay'),
  quizFeedbackTitle: document.getElementById('quiz-feedback-title'),
  quizFeedbackText: document.getElementById('quiz-feedback-text'),
  quizFeedbackExplanation: document.getElementById('quiz-feedback-explanation'),
  quizBtnNext: document.getElementById('quiz-btn-next'),
  quizReviewBadge: document.getElementById('quiz-review-badge'),
  quizStartOverlay: document.getElementById('quiz-start-overlay'),
  quizBtnStart: document.getElementById('quiz-btn-start'),
  quizBtnQuit: document.getElementById('quiz-btn-quit'),
  
  // Quiz Lobby Elements
  quizLobbyContainer: document.getElementById('quiz-lobby-container'),
  lobbyResumeSection: document.getElementById('lobby-resume-section'),
  lobbyResumeText: document.getElementById('lobby-resume-text'),
  btnLobbyResume: document.getElementById('btn-lobby-resume'),
  lobbyCategoryList: document.getElementById('lobby-category-list'),
  btnLobbySelectAll: document.getElementById('btn-lobby-select-all'),
  btnLobbyDeselectAll: document.getElementById('btn-lobby-deselect-all'),
  btnLobbyStartNew: document.getElementById('btn-lobby-start-new'),
  
  // Dashboard Elements
  dashboardFilterMin3: document.getElementById('dash-filter-min3'),
  
  // Manage Elements
  questionSearch: document.getElementById('q-search'),
  questionFilterCategory: document.getElementById('q-filter-category'),
  questionFilterDifficulty: document.getElementById('q-filter-difficulty'),
  btnOpenAddModal: document.getElementById('btn-open-add-modal'),
  questionTableBody: document.getElementById('q-table-body'),
  
  // Question Modal
  questionModal: document.getElementById('question-modal'),
  questionForm: document.getElementById('question-form'),
  modalTitle: document.getElementById('modal-title'),
  modalCloseBtn: document.getElementById('modal-close'),
  modalBtnCancel: document.getElementById('modal-btn-cancel'),
  inputQId: document.getElementById('form-q-id'),
  inputQText: document.getElementById('form-q-text'),
  inputQChoice1: document.getElementById('form-choice-1'),
  inputQChoice2: document.getElementById('form-choice-2'),
  inputQChoice3: document.getElementById('form-choice-3'),
  inputQChoice4: document.getElementById('form-choice-4'),
  inputQCorrectIndex: document.getElementsByName('form-correct-index'),
  inputQExplanation: document.getElementById('form-explanation'),
  inputQCategory: document.getElementById('form-category'),
  inputQCategorySelect: document.getElementById('form-category-select'),
  inputQDifficulty: document.getElementById('form-difficulty'),
  
  // Settings Elements
  inputGasUrl: document.getElementById('settings-gas-url'),
  btnSaveSettings: document.getElementById('btn-save-settings'),
  settingsCategoryList: document.getElementById('settings-category-list'),
  btnResetRound: document.getElementById('btn-reset-round'),
  btnSelectAllCategories: document.getElementById('btn-select-all-categories'),
  btnDeselectAllCategories: document.getElementById('btn-deselect-all-categories')
};

// Timer variables
let timerInterval = null;

// Initialize Web App
document.addEventListener('DOMContentLoaded', async () => {
  initPwa();
  setupEventListeners();
  applySavedConfig();
  
  if (config.hasUrl()) {
    elements.configAlertBanner.classList.add('hidden');
    await loadInitialData();
  } else {
    elements.configAlertBanner.classList.remove('hidden');
    showTab('settings');
  }
});

// Setup PWA
function initPwa() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('ServiceWorker registration successful:', reg.scope))
        .catch(err => console.warn('ServiceWorker registration failed:', err));
    });
  }
}

// Navigation Tabs
function setupEventListeners() {
  // Tab Routing
  elements.navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const tabId = link.getAttribute('data-tab');
      showTab(tabId);
    });
  });
  
  // Settings URL save
  elements.btnSaveSettings.addEventListener('click', () => {
    const url = elements.inputGasUrl.value.trim();
    if (!url.startsWith('https://script.google.com/')) {
      alert('無効なGoogle Apps Script URLです。URLは https://script.google.com/ で始まる必要があります。');
      return;
    }
    config.setAppUrl(url);
    elements.configAlertBanner.classList.add('hidden');
    showToast('設定を保存しました。データを読み込みます。');
    loadInitialData();
  });

  // Settings: Select all / deselect all categories
  elements.btnSelectAllCategories.addEventListener('click', () => {
    const checkboxes = elements.settingsCategoryList.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = true);
  });
  elements.btnDeselectAllCategories.addEventListener('click', () => {
    const checkboxes = elements.settingsCategoryList.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = false);
  });

  // Settings Round Reset / Re-shuffle
  elements.btnResetRound.addEventListener('click', async () => {
    if (!config.hasUrl()) return;
    const checkedBoxes = elements.settingsCategoryList.querySelectorAll('input[type="checkbox"]:checked');
    const selectedCategories = Array.from(checkedBoxes).map(cb => cb.value);
    
    if (selectedCategories.length === 0) {
      alert('少なくとも1つのカテゴリを選択してください。');
      return;
    }
    if (confirm('現在の周回データをリセットし、新しく選択したカテゴリでシャッフルして出題キューを作成します。よろしいですか？')) {
      showLoading('ラウンドを初期化中...');
      try {
        const payload = {
          categories: selectedCategories,
          lapCount: 1
        };
        const newState = await api.resetRound(payload);
        state.roundState = newState;
        showToast('ラウンドを初期化しました！第一問を開始します。');
        await syncData(); // Refresh local list and metrics
        showTab('quiz');
      } catch (err) {
        showError('初期化に失敗しました: ' + err.message);
      } finally {
        hideLoading();
      }
    }
  });

  // Quiz Lobby Event Listeners
  elements.btnLobbyResume.addEventListener('click', () => {
    elements.quizLobbyContainer.classList.add('hidden');
    startOrResumeQuiz();
  });
  elements.btnLobbySelectAll.addEventListener('click', () => {
    const checkboxes = elements.lobbyCategoryList.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = true);
  });
  elements.btnLobbyDeselectAll.addEventListener('click', () => {
    const checkboxes = elements.lobbyCategoryList.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = false);
  });
  elements.btnLobbyStartNew.addEventListener('click', async () => {
    if (!config.hasUrl()) return;
    const checkedBoxes = elements.lobbyCategoryList.querySelectorAll('input[type="checkbox"]:checked');
    const selectedCategories = Array.from(checkedBoxes).map(cb => cb.value);
    
    if (selectedCategories.length === 0) {
      alert('少なくとも1つのカテゴリを選択してください。');
      return;
    }
    showLoading('ラウンドを初期化中...');
    try {
      const payload = {
        categories: selectedCategories,
        lapCount: 1
      };
      const newState = await api.resetRound(payload);
      state.roundState = newState;
      showToast('新しいラウンドを開始しました！');
      await syncData();
      elements.quizLobbyContainer.classList.add('hidden');
      startOrResumeQuiz();
    } catch (err) {
      showError('初期化に失敗しました: ' + err.message);
    } finally {
      hideLoading();
    }
  });

  // Quiz Start Button (starts timer and enables answering)
  if (elements.quizBtnStart) {
    elements.quizBtnStart.addEventListener('click', () => {
      beginQuestion();
    });
  }

  // Quiz Quit Button (interrupt current session and return to lobby)
  if (elements.quizBtnQuit) {
    elements.quizBtnQuit.addEventListener('click', () => {
      if (!confirm('出題を中断してロビーに戻りますか？（回答済みの進捗は保存されています）')) return;
      state.isAnsweringEnabled = false;
      stopQuizTimer();
      state.reviewQuestionMode = false;
      state.reviewQuestionId = null;
      elements.quizFeedbackOverlay.classList.add('hidden');
      elements.quizBtnNext.classList.add('hidden');
      elements.quizStartOverlay.classList.add('hidden');
      showQuizLobby();
    });
  }

  // Quiz Choices Select
  elements.quizChoicesContainer.addEventListener('click', (e) => {
    const button = e.target.closest('.choice-btn');
    if (!button || !state.isAnsweringEnabled) return;
    
    const selectedOriginalIndex = parseInt(button.getAttribute('data-original-index'), 10);
    handleAnswerSelection(selectedOriginalIndex, button);
  });

  // Quiz Next Button
  elements.quizBtnNext.addEventListener('click', () => {
    // Hide overlays
    elements.quizFeedbackOverlay.classList.add('hidden');
    elements.quizBtnNext.classList.add('hidden');
    elements.quizStartOverlay.classList.add('hidden');
    
    // Clear styles
    const buttons = elements.quizChoicesContainer.querySelectorAll('.choice-btn');
    buttons.forEach(btn => {
      btn.className = 'choice-btn';
    });
    elements.quizChoicesContainer.classList.remove('choices-locked');
    if (state.reviewQuestionMode) {
      // Clear review mode and go back to Dashboard
      state.reviewQuestionMode = false;
      state.reviewQuestionId = null;
      showTab('dashboard');
    } else {
      loadNextQuizQuestion(true); // 2問目以降は自動スタート
    }
  });

  // Manage Filter & Search
  elements.questionSearch.addEventListener('input', () => renderQuestionList());
  elements.questionFilterCategory.addEventListener('change', () => renderQuestionList());
  elements.questionFilterDifficulty.addEventListener('change', () => renderQuestionList());

  // Dashboard filter checkbox
  elements.dashboardFilterMin3.addEventListener('change', () => {
    renderDashboard(state.questions, state.history, elements.dashboardFilterMin3.checked, startReviewQuestion);
  });

  // Manage Modals
  elements.btnOpenAddModal.addEventListener('click', () => openQuestionModal());
  elements.modalCloseBtn.addEventListener('click', () => closeQuestionModal());
  elements.modalBtnCancel.addEventListener('click', () => closeQuestionModal());
  
  // Populate category input when category select changes
  elements.inputQCategorySelect.addEventListener('change', (e) => {
    if (e.target.value) {
      elements.inputQCategory.value = e.target.value;
    }
  });

  // Manage Question Save
  elements.questionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const id = elements.inputQId.value;
    const questionText = elements.inputQText.value.trim();
    const choice1 = elements.inputQChoice1.value.trim();
    const choice2 = elements.inputQChoice2.value.trim();
    const choice3 = elements.inputQChoice3.value.trim();
    const choice4 = elements.inputQChoice4.value.trim();
    
    let correctIndex = 1;
    for (let i = 0; i < elements.inputQCorrectIndex.length; i++) {
      if (elements.inputQCorrectIndex[i].checked) {
        correctIndex = parseInt(elements.inputQCorrectIndex[i].value, 10);
        break;
      }
    }
    
    const explanation = elements.inputQExplanation.value.trim();
    const category = elements.inputQCategory.value.trim() || 'General';
    const difficulty = elements.inputQDifficulty.value;
    if (!questionText || !choice1 || !choice2 || !choice3 || !choice4) {
      alert('すべての項目を入力してください。');
      return;
    }
    showLoading('問題データを保存中...');
    try {
      const qPayload = {
        question: questionText,
        choices: [choice1, choice2, choice3, choice4],
        correctIndex: correctIndex,
        explanation: explanation,
        category: category,
        difficulty: difficulty
      };
      if (id) {
        // Edit mode
        qPayload.id = id;
        await api.updateQuestion(qPayload);
        showToast('問題を更新しました');
      } else {
        // Add mode
        await api.addQuestion(qPayload);
        showToast('新しい問題を追加しました');
      }
      closeQuestionModal();
      await syncData();
      renderQuestionList();
    } catch (err) {
      showError('保存できませんでした: ' + err.message);
    } finally {
      hideLoading();
    }
  });
}

function applySavedConfig() {
  const url = config.getAppUrl();
  elements.inputGasUrl.value = url;
}

// Routing helper
function showTab(tabId) {
  // Update nav UI
  elements.navLinks.forEach(link => {
    if (link.getAttribute('data-tab') === tabId) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
  // Switch panels
  elements.tabPanels.forEach(panel => {
    if (panel.id === `${tabId}-tab`) {
      panel.classList.remove('hidden');
    } else {
      panel.classList.add('hidden');
    }
  });
  // Custom trigger routines per tab
  if (tabId === 'quiz') {
    showQuizLobby();
  } else if (tabId === 'dashboard') {
    renderDashboard(state.questions, state.history, elements.dashboardFilterMin3.checked, startReviewQuestion);
  } else if (tabId === 'manage') {
    renderQuestionList();
  } else if (tabId === 'settings') {
    renderSettingsCategories();
  }
}

// Initial Sync Action
async function loadInitialData() {
  showLoading('Google スプレッドシートからデータを取得中...');
  try {
    await syncData();
    
    // Automatically enter quiz tab on load if we have questions
    if (state.questions.length > 0) {
      showTab('quiz');
    } else {
      showTab('manage');
      showToast('問題がありません。まずは問題を作成してください。');
    }
  } catch (err) {
    showError('初期データの読み込みに失敗しました。URLを確認してください。\n' + err.message);
    showTab('settings');
  } finally {
    hideLoading();
  }
}

// Load spreadsheet data to local state
async function syncData() {
  state.questions = await api.getQuestions();
  state.roundState = await api.getState();
  state.history = await api.getHistory();
  
  // Populate category filter dropdowns
  populateCategoryDropdowns();
}

function populateCategoryDropdowns() {
  const categories = [...new Set(state.questions.map(q => q.category))].filter(Boolean);
  
  // Populate Manage view category filter
  const currentManageFilter = elements.questionFilterCategory.value;
  elements.questionFilterCategory.innerHTML = '<option value="all">すべてのカテゴリ</option>';
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    elements.questionFilterCategory.appendChild(opt);
  });
  elements.questionFilterCategory.value = currentManageFilter || 'all';

  // Populate Modal category quick select dropdown
  elements.inputQCategorySelect.innerHTML = '<option value="">(既存カテゴリから選択)</option>';
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    elements.inputQCategorySelect.appendChild(opt);
  });
}

// --- QUIZ LOBBY & GAME LOGIC ---
function showQuizLobby() {
  // ロビー表示時は必ずタイマー停止＆出題系オーバーレイを閉じる（被り・勝手に時間が進む問題の対策）
  stopQuizTimer();
  state.isAnsweringEnabled = false;
  elements.quizTimer.textContent = '0.0s';
  elements.quizTimer.classList.remove('warning');
  if (elements.quizStartOverlay) elements.quizStartOverlay.classList.add('hidden');
  elements.quizFeedbackOverlay.classList.add('hidden');
  elements.quizBtnNext.classList.add('hidden');
  
  if (state.questions.length === 0) {
    elements.quizQuestionContainer.classList.add('hidden');
    elements.quizLobbyContainer.classList.add('hidden');
    elements.quizEmptyState.classList.remove('hidden');
    return;
  }
  elements.quizEmptyState.classList.add('hidden');
  elements.quizQuestionContainer.classList.add('hidden');
  elements.quizLobbyContainer.classList.remove('hidden');

  // Populate categories check list in lobby
  const categories = [...new Set(state.questions.map(q => q.category))].filter(Boolean);
  elements.lobbyCategoryList.innerHTML = '';
  
  const activeCategories = state.roundState.categories || [];
  
  categories.forEach(cat => {
    const label = document.createElement('label');
    label.className = 'checkbox-label glass-card';
    
    // Checked by default if it's currently selected in round state,
    // or if the round state categories includes 'all' / is empty
    const isChecked = activeCategories.length === 0 || 
                      activeCategories.includes('all') || 
                      activeCategories.includes(cat);
    label.innerHTML = `
      <input type="checkbox" value="${escapeHtml(cat)}" ${isChecked ? 'checked' : ''}>
      <span class="checkbox-text">${escapeHtml(cat)}</span>
    `;
    elements.lobbyCategoryList.appendChild(label);
  });

  // Display Resume section if there are remaining questions
  if (state.roundState.remainingQueue && state.roundState.remainingQueue.length > 0) {
    elements.lobbyResumeSection.classList.remove('hidden');
    
    const count = state.roundState.remainingQueue.length;
    const lap = state.roundState.lapCount;
    const catsStr = activeCategories.length === 0 || activeCategories.includes('all')
      ? 'すべて'
      : activeCategories.join(', ');
      
    elements.lobbyResumeText.textContent = `進捗：第 ${lap} 周目、残り ${count} 問 (カテゴリ: ${catsStr})`;
  } else {
    elements.lobbyResumeSection.classList.add('hidden');
  }
}

function startOrResumeQuiz() {
  if (state.questions.length === 0) {
    elements.quizQuestionContainer.classList.add('hidden');
    elements.quizLobbyContainer.classList.add('hidden');
    elements.quizEmptyState.classList.remove('hidden');
    return;
  }
  
  elements.quizLobbyContainer.classList.add('hidden');
  elements.quizQuestionContainer.classList.remove('hidden');
  elements.quizEmptyState.classList.add('hidden');

  // If we are currently in review mode, show the review question
  if (state.reviewQuestionMode && state.reviewQuestionId) {
    loadReviewQuestion(state.reviewQuestionId);
    return;
  }

  // Normal quiz mode: Load next question
  loadNextQuizQuestion();
}

/**
 * Triggers review single question mode
 */
function startReviewQuestion(qId) {
  state.reviewQuestionMode = true;
  state.reviewQuestionId = qId;
  showTab('quiz');
}

function loadReviewQuestion(qId) {
  const q = state.questions.find(item => item.id === qId);
  if (!q) {
    showToast('指定された問題が見つかりません。');
    state.reviewQuestionMode = false;
    state.reviewQuestionId = null;
    loadNextQuizQuestion();
    return;
  }

  // Show review indicators
  elements.quizReviewBadge.classList.remove('hidden');
  elements.quizLapCount.textContent = '復習モード';
  elements.quizProgressText.textContent = '-';
  elements.quizProgressBar.style.width = '100%';
  elements.quizFeedbackOverlay.classList.add('hidden');
  elements.quizBtnNext.classList.add('hidden');
  displayQuestion(q);
}

async function loadNextQuizQuestion(autoStart = false) {
  elements.quizReviewBadge.classList.add('hidden');
  
  const qQueue = state.roundState.remainingQueue || [];
  const currentCategories = state.roundState.categories || [];

  // Check if round queue is empty
  if (qQueue.length === 0) {
    showLoading('次の周回(再シャッフル)の準備中...');
    try {
      // Find what categories to query. If empty, query 'all'
      const activeCats = currentCategories.length > 0 ? currentCategories : ['all'];
      const payload = {
        categories: activeCats,
        lapCount: (state.roundState.lapCount || 0) + 1
      };
      
      const newState = await api.resetRound(payload);
      state.roundState = newState;
      
      showToast(`周回数 ${state.roundState.lapCount} に入りました！`);
    } catch (err) {
      showError('ラウンドの再シャッフルに失敗しました: ' + err.message);
      hideLoading();
      return;
    } finally {
      hideLoading();
    }
  }

  const activeQueue = state.roundState.remainingQueue;
  if (activeQueue.length === 0) {
    // If it's still empty, it means there are no questions in these categories
    elements.quizQuestionContainer.classList.add('hidden');
    if (elements.quizStartOverlay) elements.quizStartOverlay.classList.add('hidden');
    elements.quizEmptyState.classList.remove('hidden');
    return;
  }

  // Load the first question ID from the queue
  const nextQId = activeQueue[0];
  const question = state.questions.find(q => q.id === nextQId);

  // If question was deleted from spreadsheet but still exists in state queue
  if (!question) {
    console.warn(`Question ID ${nextQId} in queue not found. Skipping...`);
    activeQueue.shift();
    
    // Sync state update to server
    try {
      await api.updateState({
        categories: state.roundState.categories,
        remainingQueue: activeQueue,
        lapCount: state.roundState.lapCount
      });
    } catch (e) {
      console.error("Failed to sync queue cleanup", e);
    }
    
    // Recurse to find valid question
    loadNextQuizQuestion(autoStart);
    return;
  }

  // 1. Progress display
  // Estimate total questions in round. If total is less than what's remaining (e.g. added mid-round), adjust total.
  const totalInRound = state.questions.filter(q => 
    state.roundState.categories.length === 0 || 
    state.roundState.categories.includes('all') || 
    state.roundState.categories.includes(q.category)
  ).length;
  
  const total = Math.max(totalInRound, activeQueue.length);
  const remaining = activeQueue.length;
  const answeredCount = total - remaining + 1; // 1-indexed progress
  elements.quizLapCount.textContent = `${state.roundState.lapCount}周目`;
  elements.quizProgressText.textContent = `${answeredCount} / ${total}`;
  elements.quizProgressBar.style.width = `${(answeredCount / total) * 100}%`;
  displayQuestion(question, autoStart);
}

function displayQuestion(question, autoStart = false) {
  state.currentQuestion = question;
  
  // Set meta badges
  elements.quizCategoryBadge.textContent = question.category;
  elements.quizDifficultyBadge.textContent = translateDifficulty(question.difficulty);
  elements.quizDifficultyBadge.className = `badge badge-difficulty difficulty-${question.difficulty.toLowerCase()}`;
  
  // Set question text
  elements.quizQuestionText.textContent = question.question;

  // Shuffle Choices: Fisher-Yates
  // Array format: { text: "choice text", originalIndex: 1..4 }
  const choicesArray = question.choices.map((text, i) => ({
    text: text,
    originalIndex: i + 1
  })).filter(c => c.text); // Filter out empty choice texts if any
  for (let i = choicesArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [choicesArray[i], choicesArray[j]] = [choicesArray[j], choicesArray[i]];
  }
  state.currentChoices = choicesArray;
  
  // Render choice buttons
  elements.quizChoicesContainer.innerHTML = '';
  choicesArray.forEach((choice, index) => {
    const button = document.createElement('button');
    button.className = 'choice-btn';
    button.setAttribute('data-original-index', choice.originalIndex);
    button.innerHTML = `
      <span class="choice-num">${index + 1}</span>
      <span class="choice-text">${escapeHtml(choice.text)}</span>
    `;
    elements.quizChoicesContainer.appendChild(button);
  });

  // Reset per-question UI state
  state.isAnsweringEnabled = false;
  stopQuizTimer();
  elements.quizTimer.textContent = '0.0s';
  elements.quizTimer.classList.remove('warning');
  elements.quizFeedbackOverlay.classList.add('hidden');
  elements.quizBtnNext.classList.add('hidden');

  if (autoStart) {
    // 2問目以降：「次の問題へ」からそのまま出題開始
    beginQuestion();
  } else {
    // 1問目：スタート待ち（問題文・選択肢は完全に非表示にして、開始パネルだけ表示）
    elements.quizQuestionText.classList.add('hidden');
    elements.quizChoicesContainer.classList.add('hidden');
    elements.quizChoicesContainer.classList.add('choices-locked');
    if (elements.quizStartOverlay) elements.quizStartOverlay.classList.remove('hidden');
  }
}

// Start the current question: reveal content, unlock choices, start the timer
function beginQuestion() {
  // ロビー表示中や問題未ロード時は開始しない（勝手にタイマーが進む問題の対策）
  if (!state.currentQuestion) return;
  if (elements.quizQuestionContainer.classList.contains('hidden')) return;

  if (elements.quizStartOverlay) elements.quizStartOverlay.classList.add('hidden');
  elements.quizQuestionText.classList.remove('hidden');
  elements.quizChoicesContainer.classList.remove('hidden');
  elements.quizChoicesContainer.classList.remove('choices-locked');
  state.isAnsweringEnabled = true;
  state.questionStartTime = Date.now(); // タイマー起点をここでリセット
  startQuizTimer();
}

function startQuizTimer() {
  if (timerInterval) clearInterval(timerInterval);
  
  let elapsed = 0;
  elements.quizTimer.textContent = '0.0s';
  elements.quizTimer.classList.remove('warning');
  timerInterval = setInterval(() => {
    elapsed = (Date.now() - state.questionStartTime) / 1000;
    elements.quizTimer.textContent = `${elapsed.toFixed(1)}s`;
    
    // Warning state if takes more than 15s
    if (elapsed > 15) {
      elements.quizTimer.classList.add('warning');
    }
  }, 100);
}

function stopQuizTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

async function handleAnswerSelection(selectedOriginalIndex, buttonElement) {
  state.isAnsweringEnabled = false;
  stopQuizTimer();
  const secondsTaken = (Date.now() - state.questionStartTime) / 1000;
  const correctIndex = state.currentQuestion.correctIndex;
  const isCorrect = selectedOriginalIndex === correctIndex;

  // Play micro animations by adding class
  if (isCorrect) {
    buttonElement.classList.add('correct');
    elements.quizFeedbackTitle.innerHTML = '🎉 正解！';
    elements.quizFeedbackTitle.className = 'feedback-title text-success';
  } else {
    buttonElement.classList.add('incorrect');
    // Highlight correct option as green as well
    const correctBtn = elements.quizChoicesContainer.querySelector(`[data-original-index="${correctIndex}"]`);
    if (correctBtn) {
      correctBtn.classList.add('correct');
    }
    
    elements.quizFeedbackTitle.innerHTML = '❌ 不正解...';
    elements.quizFeedbackTitle.className = 'feedback-title text-danger';
  }

  // Create explanation feedback
  elements.quizFeedbackText.textContent = `正解は「${state.currentQuestion.choices[correctIndex - 1]}」です。`;
  elements.quizFeedbackExplanation.textContent = state.currentQuestion.explanation || '解説はありません。';
  
  // Show feedback overlay and next button
  elements.quizFeedbackOverlay.classList.remove('hidden');
  elements.quizBtnNext.classList.remove('hidden');
  
  // Scroll to overlay for small screens
  elements.quizFeedbackOverlay.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Update backend (History and State) asynchronously
  try {
    // 1. Submit history log
    api.logHistory({
      questionId: state.currentQuestion.id,
      isCorrect: isCorrect,
      selectedNum: selectedOriginalIndex,
      secondsTaken: secondsTaken
    }); // run asynchronously in background to not block UI

    // 2. Adjust local state queue if in round mode
    if (!state.reviewQuestionMode) {
      const activeQueue = state.roundState.remainingQueue;
      // Remove current question ID from front of queue
      if (activeQueue[0] === state.currentQuestion.id) {
        activeQueue.shift();
      } else {
        // Fallback search removal
        const idx = activeQueue.indexOf(state.currentQuestion.id);
        if (idx !== -1) activeQueue.splice(idx, 1);
      }

      // 3. Update state to GAS
      await api.updateState({
        categories: state.roundState.categories,
        remainingQueue: activeQueue,
        lapCount: state.roundState.lapCount
      });
      
      // Update local state copy
      state.roundState.remainingQueue = activeQueue;
    }
  } catch (err) {
    console.error('Error logging answer state:', err);
    // Show a subtle warning toast, but don't disrupt the user's flow
    showToast('データの同期に失敗しました（次回同期します）');
  }
}

// --- QUESTIONS MANAGEMENT TAB ---
function renderQuestionList() {
  const query = elements.questionSearch.value.toLowerCase().trim();
  const selectedCat = elements.questionFilterCategory.value;
  const selectedDiff = elements.questionFilterDifficulty.value;

  // Filter local question array
  const filtered = state.questions.filter(q => {
    const matchesSearch = q.id.toLowerCase().includes(query) || 
                          q.question.toLowerCase().includes(query) || 
                          (q.explanation && q.explanation.toLowerCase().includes(query));
                          
    const matchesCategory = selectedCat === 'all' || q.category === selectedCat;
    const matchesDifficulty = selectedDiff === 'all' || q.difficulty === selectedDiff;
    return matchesSearch && matchesCategory && matchesDifficulty;
  });

  elements.questionTableBody.innerHTML = '';
  if (filtered.length === 0) {
    elements.questionTableBody.innerHTML = `
      <tr>
        <td colspan="5" class="no-data">問題が見つかりません。新規作成してください。</td>
      </tr>
    `;
    return;
  }

  filtered.forEach(q => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="font-bold text-muted">${q.id}</td>
      <td>
        <div class="q-cell-text font-semibold">${escapeHtml(q.question)}</div>
        <div class="q-cell-meta">
          ${q.choices.map((c, idx) => `
            <span class="choice-preview ${q.correctIndex === idx + 1 ? 'correct-preview' : ''}">
              ${idx + 1}: ${escapeHtml(c)}
            </span>
          `).join('')}
        </div>
      </td>
      <td><span class="badge badge-category">${escapeHtml(q.category)}</span></td>
      <td><span class="badge badge-difficulty difficulty-${q.difficulty.toLowerCase()}">${translateDifficulty(q.difficulty)}</span></td>
      <td>
        <div class="action-buttons">
          <button class="btn btn-sm btn-outline btn-edit" data-id="${q.id}">編集</button>
          <button class="btn btn-sm btn-outline btn-delete" data-id="${q.id}">削除</button>
        </div>
      </td>
    `;
    // Bind edit/delete handlers
    tr.querySelector('.btn-edit').addEventListener('click', () => openQuestionModal(q));
    tr.querySelector('.btn-delete').addEventListener('click', () => handleDeleteQuestion(q.id));
    elements.questionTableBody.appendChild(tr);
  });
}

async function handleDeleteQuestion(id) {
  if (confirm(`問題 ${id} を削除しますか？この操作は戻せません。`)) {
    showLoading('問題を削除中...');
    try {
      await api.deleteQuestion(id);
      showToast('問題を削除しました');
      await syncData();
      renderQuestionList();
    } catch (err) {
      showError('削除できませんでした: ' + err.message);
    } finally {
      hideLoading();
    }
  }
}

function openQuestionModal(questionObj = null) {
  elements.questionModal.classList.add('active');
  elements.questionForm.reset();
  
  // Re-populate categories list
  populateCategoryDropdowns();

  if (questionObj) {
    elements.modalTitle.textContent = '問題を編集';
    elements.inputQId.value = questionObj.id;
    elements.inputQText.value = questionObj.question;
    elements.inputQChoice1.value = questionObj.choices[0] || '';
    elements.inputQChoice2.value = questionObj.choices[1] || '';
    elements.inputQChoice3.value = questionObj.choices[2] || '';
    elements.inputQChoice4.value = questionObj.choices[3] || '';
    
    // Radio buttons correctIndex
    for (let i = 0; i < elements.inputQCorrectIndex.length; i++) {
      if (parseInt(elements.inputQCorrectIndex[i].value, 10) === questionObj.correctIndex) {
        elements.inputQCorrectIndex[i].checked = true;
      }
    }
    
    elements.inputQExplanation.value = questionObj.explanation || '';
    elements.inputQCategory.value = questionObj.category || '';
    elements.inputQCategorySelect.value = questionObj.category || '';
    elements.inputQDifficulty.value = questionObj.difficulty || 'Medium';
  } else {
    elements.modalTitle.textContent = '新規問題を作成';
    elements.inputQId.value = '';
    elements.inputQCorrectIndex[0].checked = true; // Default to Option 1 correct
    elements.inputQDifficulty.value = 'Medium';
  }
}

function closeQuestionModal() {
  elements.questionModal.classList.remove('active');
}

// --- SETTINGS VIEW ---
function renderSettingsCategories() {
  // Extract all categories from questions
  const categories = [...new Set(state.questions.map(q => q.category))].filter(Boolean);
  const activeCategories = state.roundState.categories || [];
  
  elements.settingsCategoryList.innerHTML = '';
  
  if (categories.length === 0) {
    elements.settingsCategoryList.innerHTML = '<div class="text-muted">登録済みの問題カテゴリがありません。先に問題を作成してください。</div>';
    return;
  }

  // Create checkboxes for each category
  categories.forEach(cat => {
    const label = document.createElement('label');
    label.className = 'checkbox-label glass-card';
    
    // Checkbox is checked if current active category list includes it
    // or if the active category is empty/all (meaning all categories are active)
    const isChecked = activeCategories.length === 0 || 
                      activeCategories.includes('all') || 
                      activeCategories.includes(cat);
    label.innerHTML = `
      <input type="checkbox" value="${escapeHtml(cat)}" ${isChecked ? 'checked' : ''}>
      <span class="checkbox-text">${escapeHtml(cat)}</span>
    `;
    elements.settingsCategoryList.appendChild(label);
  });
}

// --- UI UTILS & HELPERS ---
function translateDifficulty(diff) {
  const mapping = {
    'Easy': '初級',
    'Medium': '中級',
    'Hard': '上級'
  };
  return mapping[diff] || diff;
}

function showLoading(message) {
  elements.loadingText.textContent = message || 'ロード中...';
  elements.loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
  elements.loadingOverlay.classList.add('hidden');
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast glass-card';
  toast.textContent = message;
  document.body.appendChild(toast);
  
  // fade in
  setTimeout(() => toast.classList.add('active'), 10);
  
  // remove after 3s
  setTimeout(() => {
    toast.classList.remove('active');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function showError(message) {
  alert(message);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
