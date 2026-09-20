function getLocalDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const DEFAULT_STAPLES = [
  { name: "2 Scoops Whey Isolate", cal: 220, p: 44, c: 3, f: 2, fiber: 0 },
  { name: "Light+Fit Greek Yogurt", cal: 80, p: 12, c: 7, f: 0, fiber: 0 },
  { name: "BUILT Puff Protein Bar", cal: 140, p: 17, c: 13, f: 2.5, fiber: 4 },
  { name: "Chomps Beef Stick", cal: 100, p: 10, c: 0, f: 6, fiber: 0 },
  { name: "4 oz 2% Cottage Cheese", cal: 90, p: 12, c: 5, f: 2.5, fiber: 0 },
  { name: "Turkey & Cheddar Wrap", cal: 330, p: 40, c: 24, f: 8, fiber: 15 },
  { name: "10 PB Filled Pretzels", cal: 140, p: 5, c: 18, f: 6, fiber: 1 }
];

// 4-Day Strength Cycle Routines
const WORKOUT_CYCLES = {
  1: {
    name: "Push (Chest, Shoulders, Triceps)",
    exercises: [
      { name: "Flat Barbell Bench Press", defaultVolume: 1850, defaultReps: 10, targetWeight: 185 },
      { name: "Incline DB Dumbbell Press", defaultVolume: 1400, defaultReps: 10, targetWeight: 70 },
      { name: "Seated Dumbbell Shoulder Press", defaultVolume: 1100, defaultReps: 10, targetWeight: 55 },
      { name: "Standing Cable Flyes", defaultVolume: 450, defaultReps: 12, targetWeight: 37.5 },
      { name: "Triceps Rope Pushdowns", defaultVolume: 600, defaultReps: 12, targetWeight: 50 }
    ]
  },
  2: {
    name: "Pull (Back, Rear Delts, Biceps)",
    exercises: [
      { name: "Lat Pulldown (Wide Grip)", defaultVolume: 1600, defaultReps: 10, targetWeight: 160 },
      { name: "Seated Cable Rows", defaultVolume: 1500, defaultReps: 10, targetWeight: 150 },
      { name: "Face Pulls (Rear Delts)", defaultVolume: 500, defaultReps: 12, targetWeight: 42.5 },
      { name: "EZ Bar Bicep Curls", defaultVolume: 750, defaultReps: 10, targetWeight: 75 },
      { name: "Dumbbell Hammer Curls", defaultVolume: 400, defaultReps: 10, targetWeight: 40 }
    ]
  },
  3: {
    name: "Legs & Core (Quads, Hamstrings, Calves)",
    exercises: [
      { name: "Barbell Back Squats", defaultVolume: 2250, defaultReps: 10, targetWeight: 225 },
      { name: "Leg Press (Machine)", defaultVolume: 3600, defaultReps: 12, targetWeight: 300 },
      { name: "Romanian Deadlifts (Hamstrings)", defaultVolume: 1850, defaultReps: 10, targetWeight: 185 },
      { name: "Standing Calf Raises", defaultVolume: 1200, defaultReps: 15, targetWeight: 80 }
    ]
  },
  4: {
    name: "Upper Body Overload",
    exercises: [
      { name: "Incline Smith Machine Press", defaultVolume: 1700, defaultReps: 10, targetWeight: 170 },
      { name: "Weighted Dips", defaultVolume: 1200, defaultReps: 8, targetWeight: 150 },
      { name: "Dumbbell Lateral Raises", defaultVolume: 360, defaultReps: 12, targetWeight: 30 },
      { name: "Preacher Curls", defaultVolume: 650, defaultReps: 10, targetWeight: 65 }
    ]
  }
};

let appState = {
  calTarget: 2500,
  proteinFloor: 210,
  carbsTarget: 220,
  fatTarget: 65,
  fiberTarget: 30,
  todayMeals: [],
  staplesList: JSON.parse(localStorage.getItem('recomp_custom_staples')) || DEFAULT_STAPLES,
  lastMealTime: new Date(Date.now() - 3.2 * 3600 * 1000),
  webAppUrl: localStorage.getItem('recomp_webapp_url') || 'https://script.google.com/macros/s/AKfycbymx_eZpA3oTQ5giCwDhe--tUEhVTQmEl8vWGnfjqQD32Z7AQvlo-zMwVhuVd_QWLC8/exec',
  geminiApiKey: localStorage.getItem('recomp_gemini_key') || '',
  activeDay: 1,
  checkins: [
    { Date: '2026-08-27', Weight: 233.3, SMM: 104.9, BFP: 22.3, Score: 83 },
    { Date: '2026-08-31', Weight: 232.6, SMM: 105.8, BFP: 21.2, Score: 86 },
    { Date: '2026-09-08', Weight: 230.2, SMM: 104.3, BFP: 21.7, Score: 84 },
    { Date: '2026-09-13', Weight: 228.8, SMM: 104.1, BFP: 21.6, Score: 84 }
  ]
};

let inbodyChartInstance = null;
let speechRecognition = null;
let isRecording = false;
let currentAIMode = 'log'; // 'log' or 'suggest'
let selectedPhotoData = null; // { base64, mimeType, dataUrl, name }
let lastConsultedMeal = null; // { food_name, calories, protein, carbs, fat, fiber, goal_score }

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initSettingsModal();
  initStaplesModal();
  initStaplesGrid();
  initAILogger();
  initWorkoutCycle(1);
  initInBodyChart();
  
  // Register Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.log('SW Reg Failed:', err));
  }
  
  // Load saved local meals (strictly for today's date)
  const savedMeals = localStorage.getItem('recomp_today_meals');
  if (savedMeals) {
    try {
      const parsedSaved = JSON.parse(savedMeals);
      const todayStr = getLocalDateString();
      appState.todayMeals = parsedSaved.filter(m => m.date === todayStr);
    } catch(e){}
  }
  
  fetchLiveData();
  updateDashboardUI();

  // Automatic Real-Time Polling: Refresh live data every 12 seconds automatically
  setInterval(fetchLiveData, 12000);

  // Sync immediately when user switches tabs back to the PWA or focuses window
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      fetchLiveData();
    }
  });

  window.addEventListener('focus', () => {
    fetchLiveData();
  });
});

/* ==========================================================================
   VIEW NAVIGATION & SETTINGS MODALS
   ========================================================================== */
function initNavigation() {
  const navButtons = document.querySelectorAll('.bottom-nav .nav-item');
  const views = document.querySelectorAll('.view');

  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetViewId = btn.getAttribute('data-view');
      
      navButtons.forEach(b => b.classList.remove('active'));
      views.forEach(v => v.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(targetViewId).classList.add('active');
      
      if (targetViewId === 'view-trends') {
        updateInBodyUI();
        if (inbodyChartInstance) {
          setTimeout(() => inbodyChartInstance.resize(), 100);
        }
      }

      fetchLiveData();
    });
  });
}

function initSettingsModal() {
  const modal = document.getElementById('settings-modal');
  const openBtn = document.getElementById('btn-open-settings');
  const closeBtn = document.getElementById('btn-close-settings');
  const saveBtn = document.getElementById('btn-save-settings');
  
  const urlInput = document.getElementById('setting-webapp-url');
  const keyInput = document.getElementById('setting-gemini-key');

  openBtn.addEventListener('click', () => {
    urlInput.value = appState.webAppUrl;
    keyInput.value = appState.geminiApiKey;
    modal.classList.add('active');
  });

  closeBtn.addEventListener('click', () => {
    modal.classList.remove('active');
  });

  saveBtn.addEventListener('click', () => {
    appState.webAppUrl = urlInput.value.trim();
    appState.geminiApiKey = keyInput.value.trim();

    localStorage.setItem('recomp_webapp_url', appState.webAppUrl);
    localStorage.setItem('recomp_gemini_key', appState.geminiApiKey);

    modal.classList.remove('active');
    alert('Configuration Saved!');
    fetchLiveData();
  });
}

/* ==========================================================================
   DASHBOARD & MACRO RINGS CALCULATION
   ========================================================================== */
function updateDashboardUI() {
  let totalCal = 0, totalP = 0, totalC = 0, totalF = 0, totalFiber = 0;

  appState.todayMeals.forEach(meal => {
    totalCal += Number(meal.calories || 0);
    totalP += Number(meal.protein || 0);
    totalC += Number(meal.carbs || 0);
    totalF += Number(meal.fat || 0);
    totalFiber += Number(meal.fiber || 0);
  });

  // 1. Caloric Ring (Target: 2,500 kcal)
  const remainingCal = Math.max(0, appState.calTarget - totalCal);
  document.getElementById('ring-remaining-kcals').textContent = Math.round(remainingCal);
  document.getElementById('ring-consumed-kcals').textContent = Math.round(totalCal);

  const ringFill = document.getElementById('caloric-ring-fill');
  const maxDash = 565;
  const calPercent = Math.min(1, totalCal / appState.calTarget);
  const newDashOffset = maxDash - (calPercent * maxDash);
  ringFill.style.strokeDashoffset = newDashOffset;

  // 2. Linear Macro Bars
  // Protein (Floor: 210g)
  const pPercent = Math.min(100, Math.round((totalP / appState.proteinFloor) * 100));
  document.getElementById('protein-bar-fill').style.width = `${pPercent}%`;
  document.getElementById('protein-status').innerHTML = `<strong style="color:var(--clr-success);">${totalP.toFixed(1)}g</strong> / ${appState.proteinFloor}g`;

  // Carbs
  const cPercent = Math.min(100, Math.round((totalC / appState.carbsTarget) * 100));
  document.getElementById('carbs-bar-fill').style.width = `${cPercent}%`;
  document.getElementById('carbs-status').textContent = `${totalC.toFixed(1)}g / ${appState.carbsTarget}g`;

  // Fat
  const fPercent = Math.min(100, Math.round((totalF / appState.fatTarget) * 100));
  document.getElementById('fat-bar-fill').style.width = `${fPercent}%`;
  document.getElementById('fat-status').textContent = `${totalF.toFixed(1)}g / ${appState.fatTarget}g`;

  // Soluble Fiber
  const fiberPercent = Math.min(100, Math.round((totalFiber / appState.fiberTarget) * 100));
  document.getElementById('fiber-bar-fill').style.width = `${fiberPercent}%`;
  document.getElementById('fiber-status').textContent = `${totalFiber.toFixed(1)}g / ${appState.fiberTarget}g`;

  // 3. Feeding Spacing Monitor
  const hoursSinceMeal = ((Date.now() - appState.lastMealTime.getTime()) / (1000 * 3600)).toFixed(1);
  const spacingValEl = document.getElementById('guardrail-spacing-val');
  const spacingPillEl = document.getElementById('guardrail-spacing-pill');

  spacingValEl.textContent = `${hoursSinceMeal} hrs ago`;
  if (hoursSinceMeal >= 2.5 && hoursSinceMeal <= 3.5) {
    spacingPillEl.className = "alert-pill pill-success";
    spacingPillEl.textContent = "Optimal (2.5-3.5h)";
  } else if (hoursSinceMeal < 2.5) {
    spacingPillEl.className = "alert-pill pill-warning";
    spacingPillEl.textContent = "Too Soon (Stacking)";
  } else {
    spacingPillEl.className = "alert-pill pill-warning";
    spacingPillEl.textContent = "Window Open (>3.5h)";
  }

  // 4. Meals List Rendering w/ 1-Tap Save + Delete Buttons
  const mealsListEl = document.getElementById('today-meals-list');
  if (appState.todayMeals.length === 0) {
    const isUrlSet = Boolean(appState.webAppUrl);
    mealsListEl.innerHTML = `
      <div style="text-align:center; padding:16px 10px; color:var(--text-muted);">
        <p style="font-size:0.85rem; font-weight:600; color:var(--text-main);">No meals logged yet today (${getLocalDateString()}).</p>
        <p style="font-size:0.75rem; margin-top:4px;">
          ${isUrlSet ? 'Syncing live with Google Sheets...' : '⚡ Tap any item in <strong>1-Tap Grid</strong> or use <strong>AI Voice Logger</strong> to add your first meal!'}
        </p>
      </div>
    `;
  } else {
    mealsListEl.innerHTML = appState.todayMeals.map((m, idx) => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
        <div>
          <div style="font-weight:700; font-size:0.9rem;">${m.food}</div>
          <div style="font-size:0.75rem; color:var(--text-muted);">${m.time || 'Just now'} &bull; ${m.protein}g P | ${m.carbs || 0}g C | ${m.fat || 0}g F${m.fiber ? ` | ${m.fiber}g Fiber` : ''}</div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <div style="text-align:right;">
            <span style="font-weight:700; color:var(--clr-primary); font-size:0.9rem;">${m.calories} kcal</span>
            <div class="grade-badge grade-${m.goalScore ? m.goalScore.charAt(0) : 'A'}" style="margin:0; font-size:0.65rem; padding:1px 6px;">Grade ${m.goalScore || 'A'}</div>
          </div>
          <button onclick="saveMealAsStaple(${idx})" class="icon-btn" style="width:30px; height:30px; color:var(--clr-accent); border-color:rgba(0,242,254,0.3);" title="Add to 1-Tap Staples">
            <i class="fa-solid fa-bookmark" style="font-size:0.75rem;"></i>
          </button>
          <button onclick="deleteMealItem(${idx})" class="icon-btn" style="width:30px; height:30px; color:var(--clr-danger); border-color:rgba(255,82,82,0.3);" title="Delete Entry">
            <i class="fa-solid fa-trash-can" style="font-size:0.75rem;"></i>
          </button>
        </div>
      </div>
    `).join('');
  }
}

function saveMealAsStaple(idx) {
  if (idx < 0 || idx >= appState.todayMeals.length) return;
  const m = appState.todayMeals[idx];
  const newStaple = {
    name: m.food,
    portion: m.portion || '',
    cal: parseNum(m.calories),
    p: parseNum(m.protein),
    c: parseNum(m.carbs),
    f: parseNum(m.fat),
    fiber: parseNum(m.fiber)
  };
  
  appState.staplesList.unshift(newStaple);
  localStorage.setItem('recomp_custom_staples', JSON.stringify(appState.staplesList));
  initStaplesGrid();
  alert(`⚡ Saved "${m.food}" as a 1-Tap Staple!`);
}

function deleteMealItem(index) {
  if (index < 0 || index >= appState.todayMeals.length) return;
  const deletedMeal = appState.todayMeals.splice(index, 1)[0];
  
  localStorage.setItem('recomp_today_meals', JSON.stringify(appState.todayMeals));
  updateDashboardUI();

  // Send delete request to backend
  if (appState.webAppUrl && deletedMeal) {
    fetch(appState.webAppUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'deleteMeal', food: deletedMeal.food, date: getLocalDateString() })
    }).catch(err => console.log('Delete async post err:', err));
  }
}

function initStaplesModal() {
  const modal = document.getElementById('staples-modal');
  const openBtn = document.getElementById('btn-open-staples-editor');
  const closeBtn = document.getElementById('btn-close-staples');
  const saveBtn = document.getElementById('btn-save-custom-staple');

  if (openBtn) {
    openBtn.addEventListener('click', () => {
      document.getElementById('staple-edit-index').value = '-1';
      document.getElementById('staples-modal-title').innerHTML = `<i class="fa-solid fa-plus"></i> Add New 1-Tap Staple`;
      document.getElementById('staple-input-name').value = '';
      if (document.getElementById('staple-input-portion')) document.getElementById('staple-input-portion').value = '';
      document.getElementById('staple-input-cal').value = '';
      document.getElementById('staple-input-p').value = '';
      document.getElementById('staple-input-c').value = '';
      document.getElementById('staple-input-f').value = '';
      if (document.getElementById('staple-input-fiber')) document.getElementById('staple-input-fiber').value = '';
      modal.classList.add('active');
    });
  }

  if (closeBtn) closeBtn.addEventListener('click', () => modal.classList.remove('active'));

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const editIdx = parseInt(document.getElementById('staple-edit-index').value || '-1');
      const name = document.getElementById('staple-input-name').value.trim();
      const portion = document.getElementById('staple-input-portion') ? document.getElementById('staple-input-portion').value.trim() : '';
      const cal = parseNum(document.getElementById('staple-input-cal').value);
      const p = parseNum(document.getElementById('staple-input-p').value);
      const c = parseNum(document.getElementById('staple-input-c').value);
      const f = parseNum(document.getElementById('staple-input-f').value);
      const fiber = parseNum(document.getElementById('staple-input-fiber') ? document.getElementById('staple-input-fiber').value : 0);

      if (!name) return alert('Please enter a staple name');

      const newStaple = { name, portion, cal, p, c, f, fiber };

      if (editIdx >= 0 && editIdx < appState.staplesList.length) {
        appState.staplesList[editIdx] = newStaple;
      } else {
        appState.staplesList.unshift(newStaple);
      }

      localStorage.setItem('recomp_custom_staples', JSON.stringify(appState.staplesList));

      initStaplesGrid();
      modal.classList.remove('active');
    });
  }
}

/* ==========================================================================
   1-TAP QUICK-LOGGING GRID
   ========================================================================== */
function initStaplesGrid() {
  const container = document.getElementById('staples-grid-container');
  if (!container) return;

  container.innerHTML = appState.staplesList.map((item, idx) => `
    <div class="staple-card-wrapper">
      <div class="staple-action-bar">
        <button onclick="editStapleItem(event, ${idx})" class="mini-action-btn" title="Edit Staple"><i class="fa-solid fa-pen"></i></button>
        <button onclick="deleteStapleItem(event, ${idx})" class="mini-action-btn delete-btn" title="Delete Staple"><i class="fa-solid fa-trash-can"></i></button>
      </div>
      <button class="staple-btn" data-idx="${idx}">
        <span class="staple-name" style="padding-right:48px;">${item.name}</span>
        ${item.portion ? `<span style="font-size:0.7rem; color:var(--clr-primary); font-weight:600;">${item.portion}</span>` : ''}
        <div class="staple-macros">
          <span>${item.cal} kcal</span>
          <span class="staple-protein-badge">${item.p}g P</span>
        </div>
      </button>
    </div>
  `).join('');

  const buttons = container.querySelectorAll('.staple-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      if (e.target.closest('.staple-action-bar')) return;
      const idx = Number(btn.getAttribute('data-idx'));
      const item = appState.staplesList[idx];
      if (!item) return;

      const now = new Date();
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const mealEntry = {
        food: item.portion ? `${item.name} (${item.portion})` : item.name,
        calories: item.cal,
        protein: item.p,
        carbs: item.c || 0,
        fat: item.f || 0,
        fiber: item.fiber || 0,
        goalScore: 'A',
        time: timeStr,
        date: getLocalDateString()
      };

      appState.todayMeals.unshift(mealEntry);
      appState.lastMealTime = now;
      localStorage.setItem('recomp_today_meals', JSON.stringify(appState.todayMeals));

      updateDashboardUI();
      postMealToBackend(mealEntry);

      btn.style.borderColor = 'var(--clr-success)';
      setTimeout(() => { btn.style.borderColor = 'var(--border-glass)'; }, 600);
    });
  });
}

function editStapleItem(e, idx) {
  if (e) e.stopPropagation();
  const item = appState.staplesList[idx];
  if (!item) return;

  document.getElementById('staple-edit-index').value = idx;
  document.getElementById('staples-modal-title').innerHTML = `<i class="fa-solid fa-pen-to-square"></i> Edit Staple: ${item.name}`;
  document.getElementById('staple-input-name').value = item.name;
  if (document.getElementById('staple-input-portion')) document.getElementById('staple-input-portion').value = item.portion || '';
  document.getElementById('staple-input-cal').value = item.cal;
  document.getElementById('staple-input-p').value = item.p;
  document.getElementById('staple-input-c').value = item.c || 0;
  document.getElementById('staple-input-f').value = item.f || 0;
  if (document.getElementById('staple-input-fiber')) document.getElementById('staple-input-fiber').value = item.fiber || 0;

  document.getElementById('staples-modal').classList.add('active');
}

function deleteStapleItem(e, idx) {
  if (e) e.stopPropagation();
  if (idx < 0 || idx >= appState.staplesList.length) return;
  const deleted = appState.staplesList[idx];
  if (confirm(`Delete "${deleted.name}" from 1-Tap Staples?`)) {
    appState.staplesList.splice(idx, 1);
    localStorage.setItem('recomp_custom_staples', JSON.stringify(appState.staplesList));
    initStaplesGrid();
  }
}

/* ==========================================================================
   AI VOICE & NATURAL LANGUAGE LOGGER (GEMINI API)
   ========================================================================== */
/* ==========================================================================
   AI VOICE, PHOTO VISION & NATURAL LANGUAGE LOGGER (GEMINI API)
   ========================================================================== */
function initAILogger() {
  const micBtn = document.getElementById('btn-mic-toggle');
  const cameraBtn = document.getElementById('btn-camera-toggle');
  const imageInput = document.getElementById('ai-image-input');
  const previewContainer = document.getElementById('ai-image-preview-container');
  const previewImg = document.getElementById('ai-image-preview-img');
  const filenameEl = document.getElementById('ai-image-filename');
  const removePhotoBtn = document.getElementById('btn-remove-photo');
  const textInput = document.getElementById('ai-text-input');
  const submitBtn = document.getElementById('btn-submit-ai');
  const modeLogBtn = document.getElementById('btn-mode-log');
  const modeSuggestBtn = document.getElementById('btn-mode-suggest');
  const logConsultedBtn = document.getElementById('btn-log-consulted-meal');

  if (modeLogBtn) {
    modeLogBtn.addEventListener('click', () => {
      currentAIMode = 'log';
      modeLogBtn.classList.add('active');
      if (modeSuggestBtn) modeSuggestBtn.classList.remove('active');
      if (textInput) textInput.placeholder = "Type, speak, or take a photo: 'Chicken breast...' or Chipotle bowl";
      if (submitBtn) submitBtn.innerHTML = `<i class="fa-solid fa-sparkles"></i> Analyze & Log via Gemini AI`;
      if (logConsultedBtn) logConsultedBtn.style.display = 'none';
    });
  }

  if (modeSuggestBtn) {
    modeSuggestBtn.addEventListener('click', () => {
      currentAIMode = 'suggest';
      modeSuggestBtn.classList.add('active');
      if (modeLogBtn) modeLogBtn.classList.remove('active');
      if (textInput) textInput.placeholder = "Ask AI anything (e.g. 'At Texas Roadhouse, what should I order?' or 'Should I eat whey now?')";
      if (submitBtn) submitBtn.innerHTML = `<i class="fa-solid fa-comments"></i> Ask AI (Consultation Only)`;
    });
  }

  // Photo / Camera Upload Handler
  if (cameraBtn && imageInput) {
    cameraBtn.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
        selectedPhotoData = {
          base64: evt.target.result.split(',')[1],
          mimeType: file.type || 'image/jpeg',
          dataUrl: evt.target.result,
          name: file.name
        };
        if (previewImg) previewImg.src = evt.target.result;
        if (filenameEl) filenameEl.textContent = file.name || 'Photo Attached';
        if (previewContainer) previewContainer.style.display = 'flex';
      };
      reader.readAsDataURL(file);
    });
  }

  if (removePhotoBtn) {
    removePhotoBtn.addEventListener('click', () => {
      selectedPhotoData = null;
      if (imageInput) imageInput.value = '';
      if (previewContainer) previewContainer.style.display = 'none';
    });
  }

  // Web Speech API Voice Recognizer
  if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    speechRecognition = new SpeechRecognition();
    speechRecognition.continuous = false;
    speechRecognition.interimResults = false;

    speechRecognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      textInput.value = transcript;
      micBtn.classList.remove('recording');
      isRecording = false;
    };

    speechRecognition.onerror = () => {
      micBtn.classList.remove('recording');
      isRecording = false;
    };

    micBtn.addEventListener('click', () => {
      if (!isRecording) {
        speechRecognition.start();
        micBtn.classList.add('recording');
        isRecording = true;
      } else {
        speechRecognition.stop();
        micBtn.classList.remove('recording');
        isRecording = false;
      }
    });
  }

  // Log Consulted Meal Button Event
  if (logConsultedBtn) {
    logConsultedBtn.addEventListener('click', () => {
      if (!lastConsultedMeal) return;

      const now = new Date();
      const mealEntry = {
        food: lastConsultedMeal.food_name || 'Consulted Meal',
        calories: parseNum(lastConsultedMeal.calories),
        protein: parseNum(lastConsultedMeal.protein),
        carbs: parseNum(lastConsultedMeal.carbs),
        fat: parseNum(lastConsultedMeal.fat),
        fiber: parseNum(lastConsultedMeal.fiber),
        goalScore: lastConsultedMeal.goal_score || 'A',
        time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        date: getLocalDateString()
      };

      appState.todayMeals.unshift(mealEntry);
      appState.lastMealTime = now;
      localStorage.setItem('recomp_today_meals', JSON.stringify(appState.todayMeals));

      updateDashboardUI();
      postMealToBackend(mealEntry);

      logConsultedBtn.style.display = 'none';
      if (document.getElementById('ai-parsed-kcals')) {
        document.getElementById('ai-parsed-kcals').textContent = `${mealEntry.calories} kcal (Logged!)`;
      }
      alert(`⚡ Successfully logged "${mealEntry.food}" (${mealEntry.calories} kcal, ${mealEntry.protein}g P) to Today's Meals & Sheets!`);
    });
  }

  submitBtn.addEventListener('click', async () => {
    const prompt = textInput.value.trim();
    if (!prompt && !selectedPhotoData) return;

    submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Gemini 1.5 Flash Analyzing...`;
    submitBtn.disabled = true;

    try {
      if (currentAIMode === 'log') {
        const aiResult = await parseMealWithGemini(prompt, selectedPhotoData);
        displayAIResponseCard(aiResult);

        const now = new Date();
        const mealEntry = {
          food: aiResult.food_name,
          calories: parseNum(aiResult.calories),
          protein: parseNum(aiResult.protein),
          carbs: parseNum(aiResult.carbs),
          fat: parseNum(aiResult.fat),
          fiber: parseNum(aiResult.fiber),
          goalScore: aiResult.goal_score || 'A',
          time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
          date: getLocalDateString()
        };

        appState.todayMeals.unshift(mealEntry);
        appState.lastMealTime = now;
        localStorage.setItem('recomp_today_meals', JSON.stringify(appState.todayMeals));

        updateDashboardUI();
        postMealToBackend(mealEntry);

        // Reset photo attachment after successful log
        selectedPhotoData = null;
        if (imageInput) imageInput.value = '';
        if (previewContainer) previewContainer.style.display = 'none';
      } else {
        // Consultation Mode
        const consultationText = await getAIConsultationFromGemini(prompt, selectedPhotoData);
        displayAISuggestionCard(consultationText, lastConsultedMeal);
      }
      textInput.value = '';
    } catch (err) {
      console.log('AI Error:', err);
      const fallbackResult = parseMealFallback(prompt || 'Photo Meal');
      displayAIResponseCard(fallbackResult);
    } finally {
      submitBtn.innerHTML = currentAIMode === 'log' ? 
        `<i class="fa-solid fa-sparkles"></i> Analyze & Log via Gemini AI` : 
        `<i class="fa-solid fa-comments"></i> Ask AI (Consultation Only)`;
      submitBtn.disabled = false;
    }
  });
}

async function parseMealWithGemini(userText, photoData) {
  const systemInstruction = `
  You are Michael's Personal Health Tech AI (6'4", Goal Wt: 220 lbs, Caloric Target: 2,500 kcal, Protein Floor: 210g across 4-5 windows).
  MICHAEL'S HEALTH GUARDRAILS:
  1. Soluble Fiber emphasis (~25-35g/day via Mission Carb Balance wraps, oats, bananas, potatoes, Ka'Chava).
  2. Ferritin/Iron Management: Pair red meat meals with dietary calcium (cheddar, Swiss, cottage cheese) or coffee polyphenols to inhibit excess iron absorption. Avoid high-dose Vitamin C with red meat.
  3. STRICT ZERO TOLERANCE: NO salads, NO lettuce, NO pickles, NO off-plan vegetables, NO seafood.
  4. Space feeding windows 2.5-3.5 hrs apart.
  
  TASK: Analyze the user's food entry or meal photo accurately using official USDA / restaurant nutrition facts.
  Return strictly valid JSON:
  {
    "food_name": "exact brand/dish name or photo breakdown title",
    "calories": number,
    "protein": number,
    "carbs": number,
    "fat": number,
    "fiber": number,
    "goal_score": "Grade A (5/5)" | "Grade B (4/5)" | "Grade C (3/5)" | "Grade D (2/5)",
    "feedback": "detailed guardrail evaluation & recomp advice"
  }
  `;

  if (appState.geminiApiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${appState.geminiApiKey}`;
    const parts = [];
    if (photoData) {
      parts.push({
        inline_data: {
          mime_type: photoData.mimeType,
          data: photoData.base64
        }
      });
    }
    parts.push({ text: `${systemInstruction}\n\nUser Food Input / Notes: "${userText || 'Analyze this meal photo in detail.'}"` });

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] })
    });
    const data = await response.json();
    const rawText = data.candidates[0].content.parts[0].text;
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  }

  // Fallback to Apps Script server-side Gemini endpoint if available
  if (appState.webAppUrl && !photoData) {
    try {
      const res = await fetch(`${appState.webAppUrl}?action=parseGeminiAI&prompt=${encodeURIComponent(userText)}`);
      const data = await res.json();
      if (data.status === 'success' && data.result) return data.result;
    } catch(e){}
  }

  return parseMealFallback(userText);
}

async function getAIConsultationFromGemini(query, photoData) {
  const systemPrompt = `
  You are Michael's Personal Health Tech AI (6'4", Goal Wt: 220 lbs, Caloric Target: 2,500 kcal, Protein Target: 210g floor across 4-5 windows).
  MICHAEL'S HEALTH GUARDRAILS:
  1. Soluble Fiber emphasis (~25-35g/day).
  2. Ferritin/Iron Management: Pair red meat with cheddar/Swiss cheese or coffee polyphenols.
  3. STRICT ZERO TOLERANCE for salads, lettuce, pickles, off-plan veggies, seafood.
  
  User Query / Photo Notes: "${query || 'Consult on this meal option.'}"
  
  CRITICAL NUTRITION ACCURACY INSTRUCTIONS:
  - For Lone River Ranch Water Hard Seltzer: Exactly 80 kcal, 0g Protein, 3g Carbs, 0g Fat per 12 oz can (4.7% ABV). Zero protein beverage.
  - For Ka'Chava Shake: ~240 kcal, 25g Protein, 24g Carbs, 7g Fat, 6g Fiber per serving.
  - For BUILT Puff Bar: ~140 kcal, 17g Protein, 13g Carbs, 2.5g Fat, 4g Fiber.
  
  TASK: Provide concise expert advice AND extract/suggest a loggable meal object representing the recommended choice so Michael can 1-tap log it.
  Return strictly valid JSON:
  {
    "consultation_text": "expert concise consultation advice for Michael",
    "suggested_meal": {
      "food_name": "exact dish or beverage name",
      "calories": number,
      "protein": number,
      "carbs": number,
      "fat": number,
      "fiber": number,
      "goal_score": "Grade A (5/5)" | "Grade B (4/5)" | "Grade C (3/5)"
    }
  }
  `;

  if (appState.geminiApiKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${appState.geminiApiKey}`;
      const parts = [];
      if (photoData) {
        parts.push({
          inline_data: {
            mime_type: photoData.mimeType,
            data: photoData.base64
          }
        });
      }
      parts.push({ text: systemPrompt });

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }] })
      });
      const data = await response.json();
      const rawText = data.candidates[0].content.parts[0].text;
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const json = JSON.parse(jsonMatch[0]);
          if (json.suggested_meal) lastConsultedMeal = json.suggested_meal;
          return json.consultation_text || rawText;
        } catch(e){}
      }
      return rawText;
    } catch(e) { console.log('Gemini consult error:', e); }
  }

  // Apps Script server-side Gemini endpoint fallback
  if (appState.webAppUrl && !photoData) {
    try {
      const res = await fetch(`${appState.webAppUrl}?action=parseGeminiAI&prompt=${encodeURIComponent('Consultation Mode: ' + query)}`);
      const data = await res.json();
      if (data.status === 'success' && data.result) {
        lastConsultedMeal = {
          food_name: data.result.food_name || query,
          calories: parseNum(data.result.calories),
          protein: parseNum(data.result.protein),
          carbs: parseNum(data.result.carbs),
          fat: parseNum(data.result.fat),
          fiber: parseNum(data.result.fiber),
          goal_score: data.result.goal_score || 'Grade C (3/5)'
        };
        return data.result.feedback || `Advice for ${query}: ${data.result.calories} kcal, ${data.result.protein}g protein.`;
      }
    } catch(e){}
  }

  const fallbackEstimate = parseMealFallback(query || 'Consulted Meal');
  lastConsultedMeal = {
    food_name: fallbackEstimate.food_name,
    calories: fallbackEstimate.calories,
    protein: fallbackEstimate.protein,
    carbs: fallbackEstimate.carbs,
    fat: fallbackEstimate.fat,
    fiber: fallbackEstimate.fiber,
    goal_score: fallbackEstimate.goal_score || 'Grade C (3/5)'
  };

  return `💡 **AI Consultation Advice**:
For "${fallbackEstimate.food_name}":
• **Calories**: ${fallbackEstimate.calories} kcal | **Protein**: ${fallbackEstimate.protein}g P | **Carbs**: ${fallbackEstimate.carbs}g C | **Fat**: ${fallbackEstimate.fat}g F
• **Recomp Evaluation**: ${fallbackEstimate.feedback}`;
}

function displayAIResponseCard(result) {
  const card = document.getElementById('ai-response-card');
  const logBtn = document.getElementById('btn-log-consulted-meal');

  document.getElementById('ai-grade-badge').className = `grade-badge grade-${result.goal_score ? result.goal_score.charAt(0) : 'A'}`;
  document.getElementById('ai-grade-badge').textContent = `${result.goal_score || 'Grade A'}`;
  document.getElementById('ai-parsed-kcals').textContent = `${result.calories} kcal`;
  document.getElementById('ai-parsed-name').textContent = result.food_name;
  document.getElementById('ai-parsed-macros').textContent = `${result.protein}g Protein | ${result.carbs}g Carbs | ${result.fat}g Fat | ${result.fiber || 0}g Fiber`;
  document.getElementById('ai-guardrail-feedback').innerHTML = result.feedback || '';
  
  if (logBtn) logBtn.style.display = 'none';

  card.classList.add('active');
}

function displayAISuggestionCard(text, mealObj) {
  const card = document.getElementById('ai-response-card');
  const logBtn = document.getElementById('btn-log-consulted-meal');

  document.getElementById('ai-grade-badge').className = `grade-badge grade-${mealObj && mealObj.goal_score ? mealObj.goal_score.charAt(0) : 'A'}`;
  document.getElementById('ai-grade-badge').textContent = mealObj && mealObj.goal_score ? mealObj.goal_score : `AI Consultation`;
  document.getElementById('ai-parsed-kcals').textContent = mealObj ? `${mealObj.calories} kcal` : `Consultation Only`;
  document.getElementById('ai-parsed-name').textContent = mealObj ? mealObj.food_name : `Nutrition Guidance`;
  document.getElementById('ai-parsed-macros').textContent = mealObj ? `${mealObj.protein}g P | ${mealObj.carbs}g C | ${mealObj.fat}g F` : `Advice Mode`;
  document.getElementById('ai-guardrail-feedback').innerHTML = text.replace(/\n/g, '<br>');
  
  if (logBtn && mealObj) {
    logBtn.style.display = 'flex';
    logBtn.innerHTML = `<i class="fa-solid fa-plus-circle"></i> Log "${mealObj.food_name}" (${mealObj.calories} kcal, ${mealObj.protein}g P)`;
  } else if (logBtn) {
    logBtn.style.display = 'none';
  }

  card.classList.add('active');
}

function parseMealFallback(text) {
  const lower = text.toLowerCase();
  let foodName = text;

  // 1. Hard Seltzers & Lone River Ranch Water
  if (lower.includes('lone river') || lower.includes('ranch water') || lower.includes('seltzer') || lower.includes('hard seltzer') || lower.includes('high noon') || lower.includes('truly') || lower.includes('white claw')) {
    let count = 1;
    const match = lower.match(/(\d+)/);
    if (match) count = parseInt(match[1]);
    const cal = count * 80;
    const p = 0;
    const c = count * 3;
    const f = 0;
    return {
      food_name: `${count} Can Lone River Ranch Water Hard Seltzer`,
      calories: cal,
      protein: 0,
      carbs: c,
      fat: 0,
      fiber: 0,
      goal_score: 'Grade C (3/5)',
      feedback: `${count} Can Lone River Ranch Water Hard Seltzer (${cal} kcal, 0g Protein, ${c}g Carbs, 0g Fat). 100% zero protein beverage derived from 4.7% ABV alcohol. Limit during recomp windows.`
    };
  }

  // 2. Ka'Chava Meal Replacement Shake
  if (lower.includes('kachava') || lower.includes("ka'chava")) {
    return {
      food_name: "Ka'Chava Whole Body Meal Shake",
      calories: 240,
      protein: 25,
      carbs: 24,
      fat: 7,
      fiber: 6,
      goal_score: 'Grade A (5/5)',
      feedback: "Ka'Chava Whole Body Meal Shake (240 kcal, 25g Protein, 24g Carbs, 7g Fat, 6g Soluble Fiber). Excellent high-fiber recomp meal!"
    };
  }
  
  // Composite Multi-Ingredient Parser (detects chicken + cheese + bacon, etc.)
  let totalCal = 0, totalP = 0, totalC = 0, totalF = 0, totalFiber = 0;
  let detectedItems = [];

  if (lower.includes('chicken') || lower.includes('poultry')) {
    let oz = 6;
    const m = lower.match(/(\d+)\s*oz/);
    if (m) oz = parseInt(m[1]);
    const cal = Math.round(oz * 46); const p = Math.round(oz * 8.8); const f = Math.round(oz * 1.2);
    totalCal += cal; totalP += p; totalF += f;
    detectedItems.push(`${oz} oz Chicken Breast (${cal} kcal, ${p}g P)`);
  }

  if (lower.includes('steak') || lower.includes('beef')) {
    let oz = 6;
    const m = lower.match(/(\d+)\s*oz/);
    if (m) oz = parseInt(m[1]);
    const cal = Math.round(oz * 65); const p = Math.round(oz * 7.5); const f = Math.round(oz * 3.8);
    totalCal += cal; totalP += p; totalF += f;
    detectedItems.push(`${oz} oz Steak/Beef (${cal} kcal, ${p}g P)`);
  }

  if (lower.includes('cheese') || lower.includes('cheddar') || lower.includes('swiss')) {
    let slices = 1;
    const m = lower.match(/(\d+)\s*(slice|oz)/);
    if (m) slices = parseInt(m[1]);
    const cal = slices * 105; const p = slices * 7; const c = slices * 1; const f = slices * 8;
    totalCal += cal; totalP += p; totalC += c; totalF += f;
    detectedItems.push(`${slices} oz Cheese (${cal} kcal, ${p}g P)`);
  }

  if (lower.includes('bacon')) {
    let slices = 2;
    const m = lower.match(/(\d+)\s*(slice|strip|piece)/);
    if (m) slices = parseInt(m[1]);
    const cal = slices * 46; const p = Math.round(slices * 3.3); const f = Math.round(slices * 3.7);
    totalCal += cal; totalP += p; totalF += f;
    detectedItems.push(`${slices} slices Bacon (${cal} kcal, ${p}g P)`);
  }

  if (lower.includes('egg')) {
    let count = 2;
    const m = lower.match(/(\d+)/);
    if (m) count = parseInt(m[1]);
    const cal = count * 70; const p = count * 6; const f = count * 5;
    totalCal += cal; totalP += p; totalF += f;
    detectedItems.push(`${count} Eggs (${cal} kcal, ${p}g P)`);
  }

  if (detectedItems.length >= 2) {
    return {
      food_name: foodName,
      calories: totalCal,
      protein: totalP,
      carbs: totalC,
      fat: totalF,
      fiber: totalFiber,
      goal_score: 'Grade A (5/5)',
      feedback: `Composite Meal Parsed: ${detectedItems.join(' + ')}. Excellent high-protein recomp feeding window!`
    };
  }

  let cal = 100, p = 0, c = 5, f = 0, fiber = 0, score = 'B', feedback = 'Logged via smart nutrition parser.';

  if (lower.includes('bacon')) {
    let count = 3;
    const match = lower.match(/(\d+)/);
    if (match) count = parseInt(match[1]);
    cal = count * 46; p = Math.round(count * 3.3); c = 0; f = Math.round(count * 3.7);
    feedback = `${count} slices Cooked Pork Bacon (~${cal} kcal, ${p}g P, ${f}g F).`;
  }
  else if (lower.includes('pizza')) {
    let slices = 2;
    const match = lower.match(/(\d+)/);
    if (match) slices = parseInt(match[1]);
    cal = slices * 150; p = slices * 9; c = slices * 18; f = slices * 5; score = 'B';
    feedback = `${slices} slices Pizza (~${cal} kcal, ${p}g P).`;
  }
  else if (lower.includes('chicken')) {
    let oz = 6;
    const match = lower.match(/(\d+)/);
    if (match) oz = parseInt(match[1]);
    cal = Math.round(oz * 46); p = Math.round(oz * 8.8); c = 0; f = Math.round(oz * 1.2); score = 'A';
    feedback = `${oz} oz Chicken Breast (~${cal} kcal, ${p}g P).`;
  }
  else if (lower.includes('whey') || lower.includes('shake')) {
    cal = 220; p = 44; c = 3; f = 2; score = 'A';
    feedback = '2 Scoops Whey Isolate (~220 kcal, 44g P).';
  }

  return {
    food_name: foodName,
    calories: cal,
    protein: p,
    carbs: c,
    fat: f,
    fiber: fiber,
    goal_score: score,
    feedback: feedback
  };
}

/* ==========================================================================
   4-DAY WORKOUT CYCLE & PER-SET CALCULATOR
   ========================================================================== */
function initWorkoutCycle(dayNum) {
  appState.activeDay = dayNum;
  const cycleData = WORKOUT_CYCLES[dayNum];

  document.getElementById('active-day-badge').textContent = `Day ${dayNum}: ${cycleData.name.split(' ')[0]}`;
  
  const tabs = document.querySelectorAll('.cycle-tabs .tab-btn');
  tabs.forEach(t => {
    t.classList.toggle('active', Number(t.getAttribute('data-day')) === dayNum);
    t.onclick = () => initWorkoutCycle(Number(t.getAttribute('data-day')));
  });

  const container = document.getElementById('workout-exercises-container');
  container.innerHTML = cycleData.exercises.map((ex, exIdx) => {
    const setRows = [1, 2, 3].map(setNum => {
      const isWarmup = setNum === 1;
      const vol = isWarmup ? Math.round(ex.defaultVolume * 0.6) : ex.defaultVolume;
      const reps = ex.defaultReps;
      const workingWeight = (vol / reps).toFixed(1);

      return `
        <tr>
          <td><span style="font-weight:600;">Set ${setNum}</span> ${isWarmup ? '<span style="font-size:0.65rem; color:var(--clr-warning);">(Warmup)</span>' : ''}</td>
          <td>
            <input type="number" class="set-input set-vol" value="${vol}" data-ex="${exIdx}" data-set="${setNum}" onchange="recalculateSetWeight(this)"> vol
          </td>
          <td>
            <input type="number" class="set-input set-reps" value="${reps}" data-ex="${exIdx}" data-set="${setNum}" onchange="recalculateSetWeight(this)"> reps
          </td>
          <td class="calculated-weight" id="calc-wt-${exIdx}-${setNum}">${workingWeight} lbs</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="exercise-item">
        <div class="ex-header">
          <span class="ex-name">${ex.name}</span>
          <span class="ex-target"><i class="fa-solid fa-bullseye"></i> Overload: ${ex.targetWeight + 2.5} lbs</span>
        </div>
        <table class="sets-table">
          <thead>
            <tr>
              <th>Set</th>
              <th>Volume</th>
              <th>Reps</th>
              <th>Working Wt</th>
            </tr>
          </thead>
          <tbody>
            ${setRows}
          </tbody>
        </table>
      </div>
    `;
  }).join('');

  document.getElementById('btn-log-workout-session').onclick = () => {
    const workoutEntry = {
      action: 'logWorkout',
      workoutType: `Day ${dayNum}: ${cycleData.name}`,
      duration: 45,
      calories: 320,
      notes: `Completed rolling Day ${dayNum} cycle with per-set weight auto-calculator.`
    };
    postWorkoutToBackend(workoutEntry);
    alert(`Day ${dayNum} Workout Logged Successfully!`);
  };
}

function recalculateSetWeight(inputEl) {
  const exIdx = inputEl.getAttribute('data-ex');
  const setNum = inputEl.getAttribute('data-set');
  
  const volInput = document.querySelector(`.set-vol[data-ex="${exIdx}"][data-set="${setNum}"]`);
  const repsInput = document.querySelector(`.set-reps[data-ex="${exIdx}"][data-set="${setNum}"]`);
  const calcCell = document.getElementById(`calc-wt-${exIdx}-${setNum}`);

  const vol = Number(volInput.value) || 0;
  const reps = Number(repsInput.value) || 1;

  const calculatedWorkingWeight = (vol / reps).toFixed(1);
  calcCell.textContent = `${calculatedWorkingWeight} lbs`;
}

/* ==========================================================================
   INBODY COMPOSITION TRENDS (CHART.JS)
   ========================================================================== */
window.openInBodyManualModal = function() {
  const modal = document.getElementById('modal-inbody-checkin');
  if (!modal) return;
  if (document.getElementById('inbody-input-date')) {
    document.getElementById('inbody-input-date').value = getLocalDateString();
  }
  modal.classList.add('active');
  modal.style.display = 'flex';
};

window.closeInBodyManualModal = function() {
  const modal = document.getElementById('modal-inbody-checkin');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
};

function initInBodyChart() {
  const addBtn = document.getElementById('btn-add-checkin');
  const scanBtn = document.getElementById('btn-upload-inbody-scan');
  const scanInput = document.getElementById('inbody-scan-image-input');
  
  const modal = document.getElementById('modal-inbody-checkin');
  const closeBtn = document.getElementById('btn-close-inbody-modal');
  const saveBtn = document.getElementById('btn-save-inbody-manual');

  if (addBtn && modal) {
    addBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.openInBodyManualModal();
    });
  }

  if (closeBtn && modal) {
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      window.closeInBodyManualModal();
    });
  }

  // Close modal when clicking backdrop outside modal content
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
      }
    });
  }

  if (saveBtn && modal) {
    saveBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const dateVal = document.getElementById('inbody-input-date').value || getLocalDateString();
      const weightVal = parseNum(document.getElementById('inbody-input-weight').value);
      const smmVal = parseNum(document.getElementById('inbody-input-smm').value);
      const bfmVal = parseNum(document.getElementById('inbody-input-bfm').value);
      const bfpVal = parseBodyFat(document.getElementById('inbody-input-bfp').value);
      const scoreVal = parseNum(document.getElementById('inbody-input-score').value) || 85;

      if (weightVal <= 0) {
        alert('Please enter a valid scale weight in lbs.');
        return;
      }

      const newCheckin = {
        Date: dateVal,
        Weight: weightVal,
        SMM: smmVal,
        BFM: bfmVal,
        BFP: bfpVal,
        Score: scoreVal
      };

      appState.checkins.push(newCheckin);
      updateInBodyUI();
      postCheckinToBackend(newCheckin);

      modal.classList.remove('active');
      modal.style.display = 'none';
      alert(`✅ Manually Logged InBody Scan!\nWeight: ${weightVal} lbs | SMM: ${smmVal} lbs | BF%: ${bfpVal}%`);
    });
  }

  if (scanBtn && scanInput) {
    scanBtn.onclick = () => scanInput.click();
    scanInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      scanBtn.disabled = true;
      scanBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Scanning AI...`;

      const reader = new FileReader();
      reader.onload = async (evt) => {
        const photoData = {
          base64: evt.target.result.split(',')[1],
          mimeType: file.type || 'image/jpeg'
        };

        try {
          const parsed = await parseInBodyScanWithGemini(photoData);
          if (parsed && parsed.weight > 0) {
            const newCheckin = {
              Date: parsed.date || getLocalDateString(),
              Weight: parseNum(parsed.weight),
              SMM: parseNum(parsed.smm),
              BFM: parseNum(parsed.bfm),
              BFP: parseBodyFat(parsed.bfp),
              Score: parseNum(parsed.score) || 85
            };
            appState.checkins.push(newCheckin);
            updateInBodyUI();
            postCheckinToBackend(newCheckin);

            alert(`📸 InBody Scan Analyzed Successfully!\n\nDate: ${newCheckin.Date}\nWeight: ${newCheckin.Weight} lbs\nSMM: ${newCheckin.SMM} lbs\nBF%: ${newCheckin.BFP}%\nScore: ${newCheckin.Score}\n\nSynced directly to your Google Sheet!`);
          } else {
            alert('⚠️ Could not extract InBody metrics clearly from this image. Please check image quality or enter manually.');
          }
        } catch (err) {
          console.log('InBody OCR Error:', err);
          alert('⚠️ Error scanning InBody sheet. Please try again or use manual entry.');
        } finally {
          scanBtn.disabled = false;
          scanBtn.innerHTML = `<i class="fa-solid fa-camera"></i> Scan InBody Sheet`;
          scanInput.value = '';
        }
      };
      reader.readAsDataURL(file);
    };
  }

  updateInBodyUI();
}

async function parseInBodyScanWithGemini(photoData) {
  const promptText = `
  You are an expert InBody and Body Composition Result Sheet OCR parser.
  Analyze this photo or screenshot of an InBody result sheet or mobile app screenshot.
  Extract the following body composition values carefully:
  - Date: "YYYY-MM-DD" format if visible, otherwise return today's date string
  - Weight: body weight in lbs (number, e.g. 228.8)
  - Skeletal Muscle Mass (SMM): muscle mass in lbs (number, e.g. 104.1)
  - Body Fat Mass (BFM): body fat mass in lbs if present (number, e.g. 49.4)
  - Body Fat Percent (BFP): percentage like 21.6 (number, e.g. 21.6, NOT 0.216)
  - InBody Score: score out of 100 if present (number, e.g. 84)

  Return strictly valid JSON with no markdown formatting:
  {
    "date": "YYYY-MM-DD",
    "weight": 228.8,
    "smm": 104.1,
    "bfm": 49.4,
    "bfp": 21.6,
    "score": 85
  }
  `;

  if (appState.geminiApiKey) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${appState.geminiApiKey}`;
    const parts = [
      {
        inline_data: {
          mime_type: photoData.mimeType,
          data: photoData.base64
        }
      },
      { text: promptText }
    ];

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] })
    });
    const data = await response.json();
    const rawText = data.candidates[0].content.parts[0].text;
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  }
  return null;
}

function parseBodyFat(val) {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') {
    return val > 0 && val < 1 ? Number((val * 100).toFixed(1)) : Number(val.toFixed(1));
  }
  const str = String(val).replace('%', '').trim();
  const num = parseFloat(str);
  if (isNaN(num)) return 0;
  return num > 0 && num < 1 ? Number((num * 100).toFixed(1)) : Number(num.toFixed(1));
}

function parseCheckinRow(c) {
  const dateStr = String(c.Date || c.date || '').split('T')[0];
  const weight = parseNum(c['Weight (lbs)'] || c.Weight || c.weight || c['Weight']);
  const smm = parseNum(c['Skeletal Muscle Mass (lbs)'] || c['Skeletal Muscle Mass'] || c.SMM || c.smm);
  const bfp = parseBodyFat(c['Body Fat %'] || c['BF%'] || c.BFP || c.bfp || c['Body Fat']);
  const score = parseNum(c['InBody Score'] || c.Score || c.score || 84);
  return { Date: dateStr, Weight: weight, SMM: smm, BFP: bfp, Score: score };
}

function updateInBodyUI() {
  if (!appState.checkins || appState.checkins.length === 0) return;

  // 1. Sort checkins chronologically by Date
  appState.checkins.sort((a, b) => new Date(a.Date) - new Date(b.Date));

  // 2. Update Latest InBody Scan Summary Cards
  const validCheckins = appState.checkins.filter(c => parseNum(c.Weight) > 0);
  const latest = validCheckins.length > 0 ? validCheckins[validCheckins.length - 1] : appState.checkins[appState.checkins.length - 1];

  if (latest && parseNum(latest.Weight) > 0) {
    if (document.getElementById('scan-weight-val')) document.getElementById('scan-weight-val').textContent = `${parseNum(latest.Weight).toFixed(1)} lbs`;
    if (document.getElementById('scan-smm-val')) document.getElementById('scan-smm-val').textContent = `${parseNum(latest.SMM).toFixed(1)} lbs`;
    if (document.getElementById('scan-bfp-val')) document.getElementById('scan-bfp-val').textContent = `${parseBodyFat(latest.BFP).toFixed(1)} %`;
    if (document.getElementById('scan-score-val')) document.getElementById('scan-score-val').textContent = `${latest.Score || 84} / 100`;
  }

  // 3. Render Chart
  renderInBodyChart();
}

function renderInBodyChart() {
  const canvas = document.getElementById('inbodyChart');
  if (!canvas) return;

  const validCheckins = appState.checkins.filter(c => parseNum(c.Weight) > 0);
  if (validCheckins.length === 0) return;

  // Show last 1 month window (35 days window relative to latest checkin date)
  const latest = validCheckins[validCheckins.length - 1];
  const latestTime = new Date(latest.Date).getTime();
  const oneMonthAgo = new Date(latestTime - 35 * 24 * 60 * 60 * 1000);

  let filtered = validCheckins.filter(c => new Date(c.Date) >= oneMonthAgo);
  if (filtered.length < 2) {
    filtered = validCheckins.slice(-6);
  }

  const labels = filtered.map(c => c.Date);
  const weights = filtered.map(c => parseNum(c.Weight));
  const smm = filtered.map(c => parseNum(c.SMM));
  const bfp = filtered.map(c => parseBodyFat(c.BFP));

  if (inbodyChartInstance) {
    // Preserve legend visibility state (hidden/visible lines) on auto-refresh!
    inbodyChartInstance.data.labels = labels;
    inbodyChartInstance.data.datasets[0].data = weights;
    inbodyChartInstance.data.datasets[1].data = smm;
    inbodyChartInstance.data.datasets[2].data = bfp;
    inbodyChartInstance.update('none');
    return;
  }

  const ctx = canvas.getContext('2d');
  inbodyChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Scale Weight (lbs)',
          data: weights,
          borderColor: '#00F2FE',
          backgroundColor: 'rgba(0, 242, 254, 0.12)',
          tension: 0.35,
          borderWidth: 3,
          fill: true,
          yAxisID: 'yWeight'
        },
        {
          label: 'Skeletal Muscle Mass (lbs)',
          data: smm,
          borderColor: '#00E676',
          backgroundColor: 'rgba(0, 230, 118, 0.08)',
          borderWidth: 2.5,
          borderDash: [4, 4],
          tension: 0.35,
          yAxisID: 'yWeight'
        },
        {
          label: 'Body Fat %',
          data: bfp,
          borderColor: '#FF9F43',
          backgroundColor: 'rgba(255, 159, 67, 0.1)',
          borderWidth: 2.5,
          tension: 0.35,
          yAxisID: 'yBFP'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          position: 'top',
          labels: { color: '#94A3B8', font: { family: 'Inter', size: 11, weight: '600' }, usePointStyle: true, padding: 10 }
        },
        tooltip: {
          backgroundColor: 'rgba(11, 15, 23, 0.95)',
          titleColor: '#00F2FE',
          bodyColor: '#F8FAFC',
          borderColor: 'rgba(0, 242, 254, 0.3)',
          borderWidth: 1,
          padding: 10
        }
      },
      scales: {
        x: {
          ticks: { color: '#64748B', font: { size: 10 } },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        yWeight: {
          type: 'linear',
          display: true,
          position: 'left',
          title: { display: true, text: 'Weight / Muscle (lbs)', color: '#00F2FE', font: { size: 10 } },
          ticks: { color: '#94A3B8', font: { size: 10 } },
          grid: { color: 'rgba(255,255,255,0.05)' }
        },
        yBFP: {
          type: 'linear',
          display: true,
          position: 'right',
          title: { display: true, text: 'Body Fat %', color: '#FF9F43', font: { size: 10 } },
          ticks: { color: '#FF9F43', font: { size: 10 } },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });
}

function parseNum(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const match = String(val).replace(/,/g, '').match(/[\d.]+/);
  return match ? parseFloat(match[0]) : 0;
}

function getLocalDateString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const ACTIVE_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbymx_eZpA3oTQ5giCwDhe--tUEhVTQmEl8vWGnfjqQD32Z7AQvlo-zMwVhuVd_QWLC8/exec';

/* ==========================================================================
   GOOGLE APPS SCRIPT BACKEND SYNC
   ========================================================================= */
async function fetchLiveData() {
  let targetUrl = appState.webAppUrl || ACTIVE_WEBAPP_URL;
  const localDate = getLocalDateString();
  const cacheBust = `&_t=${Date.now()}`;

  try {
    let res = await fetch(`${targetUrl}?action=getDashboardData&date=${localDate}${cacheBust}`);
    if (!res.ok) {
      targetUrl = ACTIVE_WEBAPP_URL;
      res = await fetch(`${targetUrl}?action=getDashboardData&date=${localDate}${cacheBust}`);
    }
    const data = await res.json();
    
    if (data.status === 'success') {
      appState.webAppUrl = targetUrl;
      localStorage.setItem('recomp_webapp_url', targetUrl);

      const rawEntries = data.todayMacros || [];

      const parsed = rawEntries.map(r => {
        const food = r['Food / Meal Item'] || r.Food || r.food || r.Meal || r.food_name || '';
        const calories = parseNum(r['Est. Calories (kcal)'] || r.Calories || r.calories);
        const protein = parseNum(r['Protein (g)'] || r.Protein || r.protein);
        let carbs = parseNum(r['Carbs (g)'] || r.Carbs || r.carbs || r['Carbohydrates']);
        let fat = parseNum(r['Fat (g)'] || r.Fat || r.fat || r['Fats']);
        let fiber = parseNum(r['Fiber (g)'] || r['Soluble Fiber (g)'] || r['Fiber'] || r.fiber);
        const time = r.Time || r.time || '';
        const goalScore = r['Goal Score'] || r.goalScore || 'A';
        const dateVal = String(r.Date || r.date || '').split('T')[0];

        // Automatic macro re-hydration: if Carbs, Fat, or Fiber are 0/blank in Sheet row, estimate from food name!
        if ((carbs === 0 && fat === 0) || fiber === 0) {
          const estimated = parseMealFallback(food);
          if (carbs === 0) carbs = estimated.carbs;
          if (fat === 0) fat = estimated.fat;
          if (fiber === 0) fiber = estimated.fiber;
        }

        return { food, calories, protein, carbs, fat, fiber, goalScore, time, date: dateVal };
      }).filter(m => m.food && m.calories > 0);

      // Strictly filter for today's date (localDate) only
      const todayMatches = parsed.filter(m => m.date && m.date.startsWith(localDate));

      appState.todayMeals = todayMatches;
      localStorage.setItem('recomp_today_meals', JSON.stringify(appState.todayMeals));

      if (data.checkins && data.checkins.length > 0) {
        appState.checkins = data.checkins.map(parseCheckinRow).filter(c => c.Date && c.Weight > 0);
      }

      updateDashboardUI();
      updateInBodyUI();
    }
  } catch (err) {
    console.log('Using local fallback URL due to fetch error:', err);
    if (targetUrl !== ACTIVE_WEBAPP_URL) {
      appState.webAppUrl = ACTIVE_WEBAPP_URL;
      localStorage.setItem('recomp_webapp_url', ACTIVE_WEBAPP_URL);
      fetchLiveData();
    }
  }
}

async function postMealToBackend(meal) {
  if (!appState.webAppUrl) return;
  try {
    await fetch(appState.webAppUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'logMeal', ...meal })
    });
  } catch (err) { console.log('POST meal error:', err); }
}

async function postWorkoutToBackend(workout) {
  if (!appState.webAppUrl) return;
  try {
    await fetch(appState.webAppUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(workout)
    });
  } catch (err) { console.log('POST workout error:', err); }
}

async function postCheckinToBackend(checkin) {
  if (!appState.webAppUrl) return;
  try {
    const payload = {
      action: 'logCheckin',
      date: checkin.Date || checkin.date || getLocalDateString(),
      weight: checkin.Weight || checkin.weight || 0,
      smm: checkin.SMM || checkin.smm || 0,
      bfm: checkin.BFM || checkin.bfm || 0,
      bfp: checkin.BFP || checkin.bfp || 0,
      score: checkin.Score || checkin.score || ''
    };
    await fetch(appState.webAppUrl, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) { console.log('POST checkin error:', err); }
}
