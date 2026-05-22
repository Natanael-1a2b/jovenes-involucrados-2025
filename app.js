(() => {
  const $ = id => document.getElementById(id);
  const screens = { categories: $('screen-categories'), quiz: $('screen-quiz'), complete: $('screen-complete'), repaso: $('screen-repaso') };
  const CATEGORY_NAMES = { hora_silenciosa: 'Hora Silenciosa', discipulado: 'Disipulado', versiculos: 'Memorización', lecciones: 'Lecciones', todas: 'Todas las Categorías' };

  let currentCategory = '';
  let state = {
    shuffled: [],
    currentIndex: 0,
    correctCount: 0,
    incorrectCount: 0,
    answers: []
  };

  let deferredPrompt;
  const btnInstall = $('btn-install');

  // Register Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(err => console.error('SW Error:', err));
    });
  }

  // PWA Install Prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    btnInstall.classList.remove('hidden');
  });

  btnInstall.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') btnInstall.classList.add('hidden');
      deferredPrompt = null;
    }
  });

  window.addEventListener('appinstalled', () => {
    btnInstall.classList.add('hidden');
    deferredPrompt = null;
  });

  function initCategories() {
    updateStreak();
    
    const repasarList = getRepasarErrores();
    $('count-repasar-errores').textContent = `${repasarList.length} preguntas`;
    if (repasarList.length > 0) {
      QUESTIONS['repasar_errores'] = repasarList;
      updateProgressUI('repasar_errores', repasarList.length);
      if ($('btn-clear-repaso-home')) $('btn-clear-repaso-home').classList.remove('hidden');
    } else {
      delete QUESTIONS['repasar_errores'];
      const progEl = $('prog-repasar-errores');
      if (progEl) progEl.style.width = '0%';
      if ($('btn-clear-repaso-home')) $('btn-clear-repaso-home').classList.add('hidden');
    }

    let totalAll = 0;
    Object.keys(QUESTIONS).forEach(k => {
      if (k === 'repasar_errores') return;
      const count = QUESTIONS[k].length;
      totalAll += count;
      const elCount = $('count-' + k);
      if (elCount) elCount.textContent = count + ' preguntas';
      updateProgressUI(k, count);
    });
    
    $('count-todas').textContent = totalAll + ' preguntas';
    updateProgressUI('todas', totalAll);
  }

  function updateStreak() {
    const lastVisit = localStorage.getItem('ji2026_last_visit');
    let streak = parseInt(localStorage.getItem('ji2026_streak') || '0');
    const todayStr = new Date().toDateString();
    
    if (lastVisit !== todayStr) {
      if (lastVisit) {
        // Reset to 00:00:00 to calculate purely by days
        const lastDate = new Date(lastVisit);
        const today = new Date(todayStr);
        const diffTime = today - lastDate;
        const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24)); 
        if (diffDays === 1) streak++;
        else if (diffDays > 1) streak = 1;
      } else {
        streak = 1;
      }
      localStorage.setItem('ji2026_last_visit', todayStr);
      localStorage.setItem('ji2026_streak', streak);
    }
    
    const badge = $('streak-badge');
    const count = $('streak-count');
    if(badge && count) {
      if(streak > 0) {
        badge.classList.remove('hidden');
        count.textContent = streak;
      } else {
        badge.classList.add('hidden');
      }
    }
  }

  function updateProgressUI(cat, total) {
    const saved = loadProgress(cat);
    const progEl = $('prog-' + cat);
    if (!progEl) return;
    
    if (saved && saved.shuffled && saved.shuffled.length > 0) {
      const pct = (saved.currentIndex / saved.shuffled.length) * 100;
      progEl.style.width = pct + '%';
    } else {
      progEl.style.width = '0%';
    }
  }

  function saveProgress() {
    if (!currentCategory || currentCategory === 'repasar_errores') return;
    localStorage.setItem('ji2026_state_' + currentCategory, JSON.stringify(state));
    updateProgressUI(currentCategory, state.shuffled.length);
  }

  function loadProgress(cat) {
    if (cat === 'repasar_errores') return null;
    const saved = localStorage.getItem('ji2026_state_' + cat);
    if (!saved) return null;
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.warn('Error parsing state for', cat, e);
      clearProgress(cat);
      return null;
    }
  }

  function clearProgress(cat) {
    if (cat === 'repasar_errores') return;
    localStorage.removeItem('ji2026_state_' + cat);
    updateProgressUI(cat, 0);
  }

  // Repasar Errores Helpers
  function getRepasarErrores() {
    const saved = localStorage.getItem('ji2026_repasar_errores');
    if (!saved) return [];
    try {
      return JSON.parse(saved);
    } catch (e) {
      console.warn('Error parsing repasar_errores', e);
      clearRepasarErrores();
      return [];
    }
  }

  function saveToRepasarErrores(q) {
    let list = getRepasarErrores();
    if (!list.some(item => item.q === q.q)) {
      list.push(q);
      localStorage.setItem('ji2026_repasar_errores', JSON.stringify(list));
    }
  }

  function removeFromRepasarErrores(questionText) {
    let list = getRepasarErrores();
    list = list.filter(item => item.q !== questionText);
    localStorage.setItem('ji2026_repasar_errores', JSON.stringify(list));
  }

  function clearRepasarErrores() {
    localStorage.removeItem('ji2026_repasar_errores');
  }

  function vibrate(pattern) {
    if (navigator.vibrate) {
      try { navigator.vibrate(pattern); } catch(e) {}
    }
  }

  // Historial para botón físico 'Atrás' en móviles
  history.replaceState({ screen: 'categories' }, '');

  window.addEventListener('popstate', (e) => {
    if (!screens.categories.classList.contains('active')) {
      initCategories();
      const update = () => {
        Object.values(screens).forEach(s => s.classList.remove('active'));
        screens.categories.classList.add('active');
      };
      if (document.startViewTransition) { document.startViewTransition(update); } else { update(); }
    }
  });

  function goHome() {
    vibrate(20);
    if (history.state && history.state.screen !== 'categories') {
      history.back();
    } else {
      initCategories();
      showScreen('categories');
    }
  }

  function showScreen(name) {
    if (name !== 'categories' && screens.categories.classList.contains('active')) {
      history.pushState({ screen: name }, '');
    }
    const update = () => {
      Object.values(screens).forEach(s => s.classList.remove('active'));
      screens[name].classList.add('active');
    };
    if (document.startViewTransition) {
      document.startViewTransition(update).ready.catch(() => {});
    } else {
      update();
    }
  }

  let confirmAction = null;
  function showConfirmModal(title, text, confirmText, action) {
    const modal = $('modal-confirm');
    modal.querySelector('.modal-title').textContent = title;
    modal.querySelector('.modal-text').textContent = text;
    $('btn-modal-confirm').textContent = confirmText;
    confirmAction = action;
    modal.classList.remove('hidden');
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildMetaTags(q, category) {
    let html = '';
    const tag = (cls, icon, text) => `<span class="meta-tag meta-tag--${cls}">${icon} ${text}</span>`;
    const srcCat = q._srcCat || (category === 'repasar_errores' ? 'repasar_errores' : category);
    
    // 1. Categoría
    const catName = CATEGORY_NAMES[srcCat] || 'Repaso';
    html += tag('carpeta', '🏷️', catName);

    // 2 y 3. Carpeta y Lección / Referencia
    if (srcCat === 'lecciones') {
      if (q.carpeta) html += tag('carpeta', '📂', q.carpeta);
      if (q.leccion) html += tag('leccion', '📝', q.leccion);
    } else if (srcCat === 'discipulado') {
      if (q.leccion_num) html += tag('lecnum', '📘', `Lección ${q.leccion_num}`);
      if (q.leccion_titulo) html += tag('leccion', '📝', q.leccion_titulo);
    } else if (srcCat === 'versiculos') {
      if (q.leccion) html += tag('leccion', '📝', q.leccion);
    }

    // 4. Número
    if (q.num) html += tag('num', '#', `Pregunta ${q.num}`);

    return html;
  }

  function startCategory(cat, forceRestart = false) {
    currentCategory = cat;
    const saved = loadProgress(cat);

    // Validate if saved state matches current database length
    let expectedLength = 0;
    if (cat === 'todas') {
      Object.keys(QUESTIONS).forEach(k => { expectedLength += QUESTIONS[k].length; });
    } else {
      expectedLength = (QUESTIONS[cat] || []).length;
    }

    if (saved && !forceRestart) {
      if (saved.shuffled && saved.shuffled.length === expectedLength) {
        state = saved;
        if (!state.answers) state.answers = [];
      } else {
        forceRestart = true; // Invalidate stale state
      }
    }

    if (!saved || forceRestart) {
      let questions = [];
      if (cat === 'todas') {
        Object.keys(QUESTIONS).forEach(k => {
          QUESTIONS[k].forEach(q => questions.push({ ...q, _srcCat: k }));
        });
      } else {
        questions = QUESTIONS[cat] || [];
      }
      state = {
        shuffled: shuffle(questions),
        currentIndex: 0,
        correctCount: 0,
        incorrectCount: 0,
        answers: []
      };
      saveProgress();
    }

    $('quiz-category-title').textContent = CATEGORY_NAMES[cat];
    $('quiz-total').textContent = state.shuffled.length;
    showQuestion();
    showScreen('quiz');
  }

  function showQuestion() {
    if (state.currentIndex >= state.shuffled.length) { 
      // Complete
      const total = state.shuffled.length;
      const pct = Math.round((state.correctCount / total) * 100) || 0;
      
      $('score-detail').textContent = `${state.correctCount} / ${total} correctas`;
      $('score-pct').textContent = '0%';
      $('score-ring-fill').style.strokeDashoffset = 327; // Reset ring
      
      showScreen('complete'); 
      clearProgress(currentCategory);

      if (currentCategory === 'repasar_errores') {
        $('btn-replay').classList.add('hidden');
        $('btn-clear-errores').classList.remove('hidden');
      } else {
        $('btn-replay').classList.remove('hidden');
        $('btn-clear-errores').classList.add('hidden');
      }
      
      // Animate score ring
      setTimeout(() => {
        const offset = 327 - (327 * pct / 100);
        const ring = $('score-ring-fill');
        ring.style.strokeDashoffset = offset;
        $('score-pct').textContent = pct + '%';
        if(pct >= 80) ring.style.stroke = '#34d399'; // Green
        else if (pct >= 50) ring.style.stroke = '#fbbf24'; // Yellow
        else ring.style.stroke = '#ef4444'; // Red
      }, 100);

      startConfetti();
      return; 
    }
    
    const q = state.shuffled[state.currentIndex];
    $('quiz-current').textContent = state.currentIndex + 1;
    $('question-text').textContent = q.q;
    $('question-meta').innerHTML = buildMetaTags(q, currentCategory);
    $('answer-text').textContent = q.a;

    if (currentCategory === 'repasar_errores') {
      $('btn-delete-error').classList.remove('hidden');
    } else {
      $('btn-delete-error').classList.add('hidden');
    }
    
    $('answer-section').classList.add('hidden');
    $('btn-reveal').classList.remove('hidden');
    $('action-score').classList.add('hidden');
    $('review-result').classList.add('hidden');
    $('btn-next-review').classList.add('hidden');

    // Check if this question was already answered (review mode)
    const alreadyAnswered = state.answers[state.currentIndex] !== undefined;
    if (alreadyAnswered) {
      const wasCorrect = state.answers[state.currentIndex];
      $('answer-section').classList.remove('hidden');
      $('btn-reveal').classList.add('hidden');
      $('action-score').classList.add('hidden');
      $('btn-next-review').classList.remove('hidden');

      const resultEl = $('review-result');
      resultEl.classList.remove('hidden', 'review-result--correct', 'review-result--wrong');
      resultEl.classList.add(wasCorrect ? 'review-result--correct' : 'review-result--wrong');
      $('review-result-icon').textContent = wasCorrect ? '✓' : '✗';
      $('review-result-text').textContent = wasCorrect ? 'Lo sabías' : 'No lo sabías';
    }
    
    let anim = 'slideUp .4s ease';
    if (typeof window.lastQuestionIndex !== 'undefined' && window.lastQuestionCategory === currentCategory) {
       if (state.currentIndex > window.lastQuestionIndex) anim = 'slideInRight .35s ease';
       else if (state.currentIndex < window.lastQuestionIndex) anim = 'slideInLeft .35s ease';
    }
    window.lastQuestionIndex = state.currentIndex;
    window.lastQuestionCategory = currentCategory;

    const qCard = $('question-card');
    const aSec = $('answer-section');
    const rRes = $('review-result');

    qCard.style.animation = 'none';
    aSec.style.animation = 'none';
    rRes.style.animation = 'none';
    
    // Forzar reflow para reiniciar la animación sin saltos visuales
    void qCard.offsetWidth;
    
    qCard.style.animation = anim; 
    if (alreadyAnswered) {
      aSec.style.animation = anim;
      rRes.style.animation = anim;
    } else {
      aSec.style.animation = '';
      rRes.style.animation = '';
    }
    
    $('progress-bar').style.width = ((state.currentIndex) / state.shuffled.length) * 100 + '%';

    // Show/hide previous button
    const btnPrev = $('btn-prev');
    if (btnPrev) {
      if (state.currentIndex > 0) btnPrev.classList.remove('hidden');
      else btnPrev.classList.add('hidden');
    }
  }

  function handleScore(isCorrect) {
    const q = state.shuffled[state.currentIndex];

    if (isCorrect) {
      state.correctCount++;
      vibrate(50);
    } else {
      state.incorrectCount++;
      vibrate([50, 50, 50]);
      if (currentCategory !== 'repasar_errores') {
        saveToRepasarErrores({ ...q, _srcCat: currentCategory });
      }
    }
    
    state.answers.push(isCorrect);
    state.currentIndex++;
    saveProgress();
    showQuestion();
  }

  function goBack() {
    if (state.currentIndex <= 0) return;
    state.currentIndex--;
    showQuestion();
  }

  // CONFETTI
  let confettiCtx = null;
  let particles = [];
  function startConfetti() {
    const canvas = $('confetti-canvas');
    if (!canvas) return;
    confettiCtx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    particles = [];
    const colors = ['#f43f5e', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
    for(let i=0; i<80; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        w: Math.random() * 8 + 4,
        h: Math.random() * 8 + 4,
        c: colors[Math.floor(Math.random() * colors.length)],
        vy: Math.random() * 4 + 2,
        r: Math.random() * 360,
        vr: (Math.random() - 0.5) * 10
      });
    }
    requestAnimationFrame(updateConfetti);
  }
  function updateConfetti() {
    if(!confettiCtx || !particles.length) return;
    confettiCtx.clearRect(0,0,confettiCtx.canvas.width, confettiCtx.canvas.height);
    let active = false;
    particles.forEach(p => {
      p.y += p.vy;
      p.r += p.vr;
      if (p.y < confettiCtx.canvas.height) active = true;
      confettiCtx.save();
      confettiCtx.translate(p.x, p.y);
      confettiCtx.rotate(p.r * Math.PI / 180);
      confettiCtx.fillStyle = p.c;
      confettiCtx.fillRect(-p.w/2, -p.h/2, p.w, p.h);
      confettiCtx.restore();
    });
    if(active) requestAnimationFrame(updateConfetti);
  }

  // REPASO MODE
  let allRepasoQuestions = [];
  let currentRepasoCategory = 'todas';

  function initRepaso() {
    allRepasoQuestions = [];
    Object.keys(QUESTIONS).forEach(k => {
      QUESTIONS[k].forEach(q => allRepasoQuestions.push({ ...q, _srcCat: k }));
    });
    
    const tabsContainer = $('repaso-tabs');
    if (tabsContainer) {
      tabsContainer.innerHTML = '';
      const catKeys = ['todas', ...Object.keys(QUESTIONS)];
      catKeys.forEach(k => {
        const btn = document.createElement('button');
        btn.className = `repaso-tab ${k === currentRepasoCategory ? 'active' : ''}`;
        btn.textContent = CATEGORY_NAMES[k] || k;
        btn.addEventListener('click', () => {
          currentRepasoCategory = k;
          document.querySelectorAll('.repaso-tab').forEach(t => t.classList.remove('active'));
          btn.classList.add('active');
          filterRepaso();
        });
        tabsContainer.appendChild(btn);
      });
    }

    $('repaso-search').value = '';
    currentRepasoCategory = 'todas';
    if (tabsContainer) {
       document.querySelectorAll('.repaso-tab').forEach(t => t.classList.remove('active'));
       if (tabsContainer.firstChild) tabsContainer.firstChild.classList.add('active');
    }
    
    filterRepaso();
  }

  function renderRepaso(questions) {
    const list = $('repaso-list');
    list.innerHTML = '';
    
    if (questions.length === 0) {
      list.innerHTML = `<div style="text-align:center; padding: 2rem; color: rgba(255,255,255,.5);">No se encontraron preguntas.</div>`;
      return;
    }

    questions.forEach((q, i) => {
      const item = document.createElement('div');
      item.className = 'repaso-item';
      
      const meta = buildMetaTags(q, 'repaso');
      
      item.innerHTML = `
        <div class="repaso-question">
          <div>
            <div class="question-meta" style="margin-bottom: 0.5rem;">${meta}</div>
            ${q.q}
          </div>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>
        </div>
        <div class="repaso-answer">${q.a}</div>
      `;
      
      item.querySelector('.repaso-question').addEventListener('click', () => {
        const isOpen = item.classList.contains('open');
        document.querySelectorAll('.repaso-item').forEach(el => el.classList.remove('open'));
        if (!isOpen) item.classList.add('open');
      });
      
      list.appendChild(item);
    });
  }

  function filterRepaso() {
    const term = $('repaso-search').value.toLowerCase();
    let filtered = allRepasoQuestions;
    
    if (currentRepasoCategory !== 'todas') {
      filtered = filtered.filter(q => q._srcCat === currentRepasoCategory);
    }
    
    if (term) {
      filtered = filtered.filter(q => 
        q.q.toLowerCase().includes(term) || 
        q.a.toLowerCase().includes(term) ||
        (q.leccion && q.leccion.toLowerCase().includes(term)) ||
        (q.leccion_titulo && q.leccion_titulo.toLowerCase().includes(term))
      );
    }
    renderRepaso(filtered);
  }

  $('repaso-search').addEventListener('input', filterRepaso);

  // Events
  document.querySelectorAll('.category-card').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.id === 'card-repasar-errores') startCategory('repasar_errores');
      else startCategory(btn.dataset.category);
    });
  });
  
  $('btn-reveal').addEventListener('click', () => {
    vibrate(20);
    $('answer-section').classList.remove('hidden');
    $('btn-reveal').classList.add('hidden');
    $('action-score').classList.remove('hidden');
  });
  
  $('btn-correct').addEventListener('click', () => handleScore(true));
  $('btn-wrong').addEventListener('click', () => handleScore(false)); 
  
  $('btn-back').addEventListener('click', goHome);
  $('btn-restart').addEventListener('click', () => {
    vibrate(20);
    showConfirmModal('¿Reiniciar Categoría?', 'Se perderá tu progreso actual y volverás a empezar desde cero.', 'Sí, reiniciar', () => {
      startCategory(currentCategory, true);
    });
  });

  $('btn-modal-cancel').addEventListener('click', () => {
    vibrate(20);
    $('modal-confirm').classList.add('hidden');
  });

  $('btn-modal-confirm').addEventListener('click', () => {
    vibrate(20);
    $('modal-confirm').classList.add('hidden');
    if (confirmAction) confirmAction();
  });
  $('btn-prev').addEventListener('click', () => { vibrate(20); goBack(); });
  $('btn-next-review').addEventListener('click', () => {
    vibrate(20);
    state.currentIndex++;
    showQuestion();
  });
  $('btn-replay').addEventListener('click', () => { vibrate(20); startCategory(currentCategory, true); });
  $('btn-clear-errores').addEventListener('click', () => {
    vibrate(20);
    showConfirmModal('¿Vaciar Lista?', 'Se eliminarán todas las preguntas que has guardado para repasar. Esta acción no se puede deshacer.', 'Sí, vaciar lista', () => {
      clearRepasarErrores();
      initCategories();
      showScreen('categories');
    });
  });
  $('btn-delete-error').addEventListener('click', () => {
    vibrate(20);
    showConfirmModal('¿Eliminar pregunta?', 'Esta pregunta se quitará de tu lista de repaso.', 'Sí, eliminar', () => {
      const q = state.shuffled[state.currentIndex];
      removeFromRepasarErrores(q.q);
      
      state.shuffled.splice(state.currentIndex, 1);
      state.answers.splice(state.currentIndex, 1);
      $('quiz-total').textContent = state.shuffled.length;
      
      if (state.shuffled.length === 0) {
        initCategories();
        showScreen('categories');
      } else {
        if (state.currentIndex >= state.shuffled.length) {
           state.currentIndex = state.shuffled.length - 1;
        }
        showQuestion();
      }
    });
  });
  $('btn-home').addEventListener('click', goHome);
  
  $('btn-repaso').addEventListener('click', () => {
    const list = getRepasarErrores();
    if (list.length === 0) return;
    vibrate(20);
    initRepaso();
    $('repaso-search').value = '';
    showScreen('repaso');
  });
  $('btn-back-repaso').addEventListener('click', goHome);

  if ($('btn-clear-repaso-home')) {
    $('btn-clear-repaso-home').addEventListener('click', () => {
      vibrate(20);
      showConfirmModal('¿Vaciar Lista?', 'Se eliminarán todas las preguntas que has guardado para repasar. Esta acción no se puede deshacer.', 'Sí, vaciar lista', () => {
        clearRepasarErrores();
        initCategories();
      });
    });
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (screens.quiz.classList.contains('active')) {
      if (e.code === 'Space' && !$('btn-reveal').classList.contains('hidden')) {
        e.preventDefault();
        $('btn-reveal').click();
      } else if (e.code === 'Space' && !$('btn-next-review').classList.contains('hidden')) {
        e.preventDefault();
        $('btn-next-review').click();
      } else if (e.code === 'ArrowRight' && !$('btn-reveal').classList.contains('hidden')) {
        $('btn-reveal').click();
      } else if (e.code === 'ArrowRight' && !$('btn-next-review').classList.contains('hidden')) {
        $('btn-next-review').click();
      } else if (e.code === 'ArrowRight' && !$('action-score').classList.contains('hidden')) {
        $('btn-correct').click();
      } else if (e.code === 'ArrowLeft' && !$('action-score').classList.contains('hidden')) {
        $('btn-wrong').click();
      } else if (e.code === 'ArrowLeft' && state.currentIndex > 0 && $('action-score').classList.contains('hidden')) {
        vibrate(20);
        goBack();
      } else if (e.code === 'Escape') {
        $('btn-back').click();
      }
    }
  });

  // Touch Swipe navigation
  let touchStartX = 0;
  let touchStartY = 0;
  let touchEndX = 0;
  let touchEndY = 0;

  screens.quiz.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  }, { passive: true });

  screens.quiz.addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].screenX;
    touchEndY = e.changedTouches[0].screenY;
    handleSwipe();
  }, { passive: true });

  function handleSwipe() {
    const swipeThreshold = 50;
    const diffX = touchEndX - touchStartX;
    const diffY = touchEndY - touchStartY;

    // Si el movimiento fue mayormente vertical (scroll), lo ignoramos
    if (Math.abs(diffY) > Math.abs(diffX)) return;

    if (Math.abs(diffX) < swipeThreshold) return; // not a significant swipe

    if (diffX > 0) {
      // Swiped Right (pulling from left) -> Go Back or "Lo sabía"
      if (!$('action-score').classList.contains('hidden')) {
        $('btn-correct').click();
      } else if (state.currentIndex > 0 && $('action-score').classList.contains('hidden')) {
        vibrate(20);
        goBack();
      }
    } else {
      // Swiped Left (pulling from right)
      if (!$('btn-reveal').classList.contains('hidden')) {
        // No hacer nada en la pregunta actual para evitar revelar por accidente
        return;
      } else if (!$('btn-next-review').classList.contains('hidden')) {
        $('btn-next-review').click();
      } else if (!$('action-score').classList.contains('hidden')) {
        $('btn-wrong').click();
      }
    }
  }

  // Init
  initCategories();
  const footerYearEl = $('footer-year');
  if (footerYearEl) footerYearEl.textContent = new Date().getFullYear();
})();
