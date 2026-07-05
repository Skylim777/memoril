/**
 * Dashboard Module
 * Handles calculations and rendering for stats, weak points, and charts using Chart.js.
 */

let categoryChartInstance = null;
let difficultyChartInstance = null;

/**
 * Calculates stats and updates the Dashboard UI.
 * @param {Array} questions 
 * @param {Array} history 
 * @param {boolean} filterMin3 - If true, filter questions that have >= 3 attempts
 * @param {Function} onReviewQuestion - Callback when user clicks 'Review' link
 */
export function renderDashboard(questions, history, filterMin3, onReviewQuestion) {
  // 1. Group history logs by question ID for easy access
  const logsByQuestion = {};
  history.forEach(log => {
    if (!logsByQuestion[log.questionId]) {
      logsByQuestion[log.questionId] = [];
    }
    logsByQuestion[log.questionId].push(log);
  });

  // 2. Pre-process each question stats
  const questionStats = questions.map(q => {
    const logs = logsByQuestion[q.id] || [];
    const total = logs.length;
    const correct = logs.filter(l => l.isCorrect).length;
    const incorrect = total - correct;
    const accuracy = total > 0 ? (correct / total) * 100 : 0;
    return {
      ...q,
      totalAttempts: total,
      correctAttempts: correct,
      incorrectAttempts: incorrect,
      accuracyRate: accuracy
    };
  });

  // Apply the ">= 3 attempts" filter if active for question-level calculations
  const filteredQuestionStats = filterMin3 
    ? questionStats.filter(q => q.totalAttempts >= 3)
    : questionStats;

  // 3. Category analysis
  const categoryStats = {};
  questionStats.forEach(q => {
    // Note: We group based on question's current category.
    // If filterMin3 is checked, we only aggregate from questions with >= 3 attempts.
    if (filterMin3 && q.totalAttempts < 3) return;

    if (!categoryStats[q.category]) {
      categoryStats[q.category] = { total: 0, correct: 0, count: 0 };
    }
    categoryStats[q.category].total += q.totalAttempts;
    categoryStats[q.category].correct += q.correctAttempts;
    categoryStats[q.category].count += 1;
  });

  const categories = Object.keys(categoryStats).map(cat => {
    const stats = categoryStats[cat];
    const accuracy = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;
    return {
      name: cat,
      total: stats.total,
      correct: stats.correct,
      accuracyRate: accuracy,
      questionCount: stats.count
    };
  });

  // 4. Difficulty analysis
  const difficultyStats = {
    'Easy': { total: 0, correct: 0 },
    'Medium': { total: 0, correct: 0 },
    'Hard': { total: 0, correct: 0 }
  };
  questionStats.forEach(q => {
    if (filterMin3 && q.totalAttempts < 3) return;
    const diff = q.difficulty || 'Medium';
    if (difficultyStats[diff]) {
      difficultyStats[diff].total += q.totalAttempts;
      difficultyStats[diff].correct += q.correctAttempts;
    }
  });

  const difficulties = Object.keys(difficultyStats).map(diff => {
    const stats = difficultyStats[diff];
    const accuracy = stats.total > 0 ? (stats.correct / stats.total) * 100 : 0;
    return {
      name: diff,
      total: stats.total,
      correct: stats.correct,
      accuracyRate: accuracy
    };
  });

  // Update UI Elements
  renderKpiCards(filteredQuestionStats, history);
  renderWeakCategories(categories);
  renderFrequentlyWrongQuestions(questionStats, filterMin3, onReviewQuestion);
  renderCharts(categories, difficulties);
}

/**
 * Renders simple KPI cards at the top of the dashboard.
 */
function renderKpiCards(filteredQuestions, history) {
  const totalSolved = history.length;
  const totalCorrect = history.filter(l => l.isCorrect).length;
  const overallAccuracy = totalSolved > 0 ? Math.round((totalCorrect / totalSolved) * 100) : 0;

  const avgSec = history.length > 0
    ? (history.reduce((sum, l) => sum + (l.secondsTaken || 0), 0) / history.length).toFixed(1)
    : 0;

  document.getElementById('kpi-total-answers').textContent = totalSolved;
  document.getElementById('kpi-accuracy-rate').textContent = `${overallAccuracy}%`;
  document.getElementById('kpi-avg-time').textContent = `${avgSec}s`;
}

/**
 * Identifies and lists top 3 weakest categories (lowest accuracy, with at least 1 attempt).
 */
function renderWeakCategories(categories) {
  const container = document.getElementById('weak-categories-list');
  container.innerHTML = '';

  // Filter categories that have at least 1 attempt, then sort ascending
  const weakCats = categories
    .filter(c => c.total > 0)
    .sort((a, b) => a.accuracyRate - b.accuracyRate)
    .slice(0, 3);

  if (weakCats.length === 0) {
    container.innerHTML = '<div class="no-data">データが不足しています（回答履歴がありません）</div>';
    return;
  }

  weakCats.forEach((cat, index) => {
    const div = document.createElement('div');
    div.className = 'weak-category-item glass-card';
    div.innerHTML = `
      <div class="weak-cat-rank">#${index + 1}</div>
      <div class="weak-cat-info">
        <div class="weak-cat-name">${escapeHtml(cat.name)}</div>
        <div class="weak-cat-meta">全 ${cat.total} 回中 ${cat.correct} 回正解</div>
      </div>
      <div class="weak-cat-percentage text-danger">${Math.round(cat.accuracyRate)}%</div>
    `;
    container.appendChild(div);
  });
}

/**
 * Renders the top list of frequently wrong questions.
 */
function renderFrequentlyWrongQuestions(questionStats, filterMin3, onReviewQuestion) {
  const container = document.getElementById('wrong-questions-list');
  container.innerHTML = '';

  // Filter: questions that have incorrect attempts > 0
  // Apply attempt filter if toggled
  let wrongList = questionStats.filter(q => q.incorrectAttempts > 0);
  if (filterMin3) {
    wrongList = wrongList.filter(q => q.totalAttempts >= 3);
  }

  // Sort descending by count of incorrect attempts
  wrongList.sort((a, b) => b.incorrectAttempts - a.incorrectAttempts);

  // Take top 5
  const topWrong = wrongList.slice(0, 5);

  if (topWrong.length === 0) {
    container.innerHTML = '<tr><td colspan="5" class="no-data">間違えた問題はありません</td></tr>';
    return;
  }

  topWrong.forEach(q => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div class="table-question-text" title="${escapeHtml(q.question)}">${escapeHtml(q.question)}</div>
      </td>
      <td><span class="badge badge-category">${escapeHtml(q.category)}</span></td>
      <td class="text-center text-danger font-bold">${q.incorrectAttempts}回</td>
      <td class="text-center">${Math.round(q.accuracyRate)}% <small class="text-muted">(${q.correctAttempts}/${q.totalAttempts})</small></td>
      <td class="text-center">
        <button class="btn btn-sm btn-outline btn-review-q" data-id="${q.id}">復習</button>
      </td>
    `;

    // Attach click handler to review button
    const reviewBtn = tr.querySelector('.btn-review-q');
    reviewBtn.addEventListener('click', () => {
      onReviewQuestion(q.id);
    });

    container.appendChild(tr);
  });
}

/**
 * Creates or updates the Chart.js visual charts.
 */
function renderCharts(categories, difficulties) {
  if (typeof window.Chart === 'undefined') {
    console.error('Chart.js is not loaded.');
    return;
  }

  // --- Category Chart (Horizontal Bar Chart) ---
  const catCanvas = document.getElementById('category-chart');
  if (catCanvas) {
    if (categoryChartInstance) {
      categoryChartInstance.destroy();
    }

    // Sort categories by name or accuracy
    const sortedCats = [...categories].sort((a, b) => b.accuracyRate - a.accuracyRate);
    const labels = sortedCats.map(c => `${c.name} (${c.correct}/${c.total})`);
    const data = sortedCats.map(c => Math.round(c.accuracyRate));
    
    // Fallback if no categories
    const chartLabels = labels.length > 0 ? labels : ['データなし'];
    const chartData = data.length > 0 ? data : [0];

    categoryChartInstance = new window.Chart(catCanvas, {
      type: 'bar',
      data: {
        labels: chartLabels,
        datasets: [{
          label: '正答率 (%)',
          data: chartData,
          backgroundColor: 'rgba(99, 102, 241, 0.75)', // Indigo
          borderColor: 'rgba(99, 102, 241, 1)',
          borderWidth: 1,
          borderRadius: 6,
          barPercentage: 0.6
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `正答率: ${ctx.raw}%`
            }
          }
        },
        scales: {
          x: {
            min: 0,
            max: 100,
            grid: { color: 'rgba(255, 255, 255, 0.08)' },
            ticks: { color: '#94a3b8' }
          },
          y: {
            grid: { display: false },
            ticks: { color: '#e2e8f0', font: { size: 12 } }
          }
        }
      }
    });
  }

  // --- Difficulty Chart (Vertical Bar Chart) ---
  const diffCanvas = document.getElementById('difficulty-chart');
  if (diffCanvas) {
    if (difficultyChartInstance) {
      difficultyChartInstance.destroy();
    }

    const labels = difficulties.map(d => `${d.name} (${d.correct}/${d.total})`);
    const data = difficulties.map(d => Math.round(d.accuracyRate));

    const backgroundColors = difficulties.map(d => {
      if (d.name === 'Easy') return 'rgba(34, 197, 94, 0.75)'; // Green
      if (d.name === 'Hard') return 'rgba(239, 68, 68, 0.75)'; // Red
      return 'rgba(234, 179, 8, 0.75)'; // Yellow for Medium
    });

    const borderColors = difficulties.map(d => {
      if (d.name === 'Easy') return 'rgba(34, 197, 94, 1)';
      if (d.name === 'Hard') return 'rgba(239, 68, 68, 1)';
      return 'rgba(234, 179, 8, 1)';
    });

    difficultyChartInstance = new window.Chart(diffCanvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: '正答率 (%)',
          data: data,
          backgroundColor: backgroundColors,
          borderColor: borderColors,
          borderWidth: 1,
          borderRadius: 6,
          barPercentage: 0.5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => `正答率: ${ctx.raw}%`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#e2e8f0' }
          },
          y: {
            min: 0,
            max: 100,
            grid: { color: 'rgba(255, 255, 255, 0.08)' },
            ticks: { color: '#94a3b8' }
          }
        }
      }
    });
  }
}

// Simple HTML escaping helper
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
