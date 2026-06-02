/**
 * Wissenstest-Engine
 * ==================
 * Rendert das Quiz einer Richtlinie, wertet die Antworten gegen die
 * Bestehensgrenze (quizBestehenProzent) aus, zählt Versuche und schreibt das
 * Ergebnis in die Bestätigungen-Liste (über spSaveAcknowledgement).
 *
 * Quiz-Format (QuizJson): [{ frage, optionen:[…], richtig: <Index> }]
 */

let _quiz = { policyId: null, answers: {}, questions: [] };

/** Array mischen (Fisher-Yates, liefert neue Kopie). */
function _shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Fragen UND Antwortoptionen mischen; der „richtig"-Index wandert korrekt mit. */
function shuffleQuiz(quiz) {
  return _shuffle((quiz || []).map(q => {
    const opts = (q.optionen || []).map((text, i) => ({ text, correct: i === q.richtig }));
    const mixed = _shuffle(opts);
    return {
      frage: q.frage,
      optionen: mixed.map(o => o.text),
      richtig: mixed.findIndex(o => o.correct),
    };
  }));
}

function startQuiz(policyId) {
  const p = State.policies.find(x => x.id === policyId);
  if (!p || !Array.isArray(p.quiz) || !p.quiz.length) {
    toast('Kein Wissenstest hinterlegt.', 'error');
    return;
  }
  // Kenntnisnahme ist Voraussetzung
  const a = State.acks.find(x => x.richtlinieId === p.id && x.version === p.version);
  if (!a || !a.gelesenAm) {
    toast('Bitte zuerst die Kenntnisnahme bestätigen.', 'error');
    openDetail(policyId);
    return;
  }
  _quiz = { policyId, answers: {}, questions: shuffleQuiz(p.quiz) };
  switchView('quiz');
  renderQuizForm(p);
}

function renderQuizForm(p) {
  const v = document.getElementById('view-quiz');
  v.innerHTML = `
    <div class="quiz-wrap">
      <button class="btn btn-ghost btn-sm back-btn" onclick="openDetail('${p.id}')">← Zurück zur Richtlinie</button>
      <div class="detail-header">
        <h2>Wissenstest: ${esc(p.title)}</h2>
        <div class="quiz-progress">${_quiz.questions.length} Frage(n) &middot; bestanden ab ${p.quizBestehenProzent}% richtig &middot; Reihenfolge bei jedem Versuch zufällig</div>
      </div>
      <form id="quiz-form" onsubmit="return false">
        ${_quiz.questions.map((q, i) => quizQuestionHtml(q, i)).join('')}
      </form>
      <div style="display:flex;justify-content:flex-end;margin-top:8px">
        <button class="btn btn-primary btn-lg" id="quiz-submit" onclick="submitQuiz('${p.id}')">Antworten auswerten</button>
      </div>
    </div>`;
}

function quizQuestionHtml(q, i) {
  const opts = Array.isArray(q.optionen) ? q.optionen : [];
  return `<div class="quiz-q" data-qi="${i}">
    <div class="quiz-q-title"><span class="quiz-q-num">${i + 1}.</span>${esc(q.frage)}</div>
    ${opts.map((opt, oi) => `
      <label class="quiz-opt" data-oi="${oi}">
        <input type="radio" name="q${i}" value="${oi}" onchange="markSel(${i},${oi})">
        <span>${esc(opt)}</span>
      </label>`).join('')}
  </div>`;
}

function markSel(qi, oi) {
  _quiz.answers[qi] = oi;
  const q = document.querySelector(`.quiz-q[data-qi="${qi}"]`);
  if (q) q.querySelectorAll('.quiz-opt').forEach(o => o.classList.toggle('sel', +o.dataset.oi === oi));
}

async function submitQuiz(policyId) {
  const p = State.policies.find(x => x.id === policyId);
  if (!p) return;
  const qs = _quiz.questions;
  const total = qs.length;
  if (Object.keys(_quiz.answers).length < total) {
    toast(`Bitte alle ${total} Fragen beantworten.`, 'error');
    return;
  }

  let correct = 0;
  qs.forEach((q, i) => { if (_quiz.answers[i] === q.richtig) correct++; });
  const score = Math.round(correct / total * 100);
  const passed = score >= p.quizBestehenProzent;

  // Antworten farblich auswerten + sperren
  qs.forEach((q, i) => {
    const qEl = document.querySelector(`.quiz-q[data-qi="${i}"]`);
    if (!qEl) return;
    qEl.querySelectorAll('input').forEach(inp => inp.disabled = true);
    qEl.querySelectorAll('.quiz-opt').forEach(o => {
      const oi = +o.dataset.oi;
      if (oi === q.richtig) o.classList.add('correct');
      else if (oi === _quiz.answers[i]) o.classList.add('wrong');
    });
  });

  // Ergebnis speichern
  const existing = State.acks.find(x => x.richtlinieId === p.id && x.version === p.version);
  const versuche = (existing?.quizVersuche || 0) + 1;
  const now = new Date().toISOString();
  const submitBtn = document.getElementById('quiz-submit');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Speichern …'; }

  try {
    await spSaveAcknowledgement({
      id:              existing?.id,
      richtlinieId:    p.id,
      version:         p.version,
      benutzerUpn:     State.user.upn,
      benutzerName:    State.user.name,
      gelesenAm:       existing?.gelesenAm || now,
      quizBestanden:   passed || existing?.quizBestanden || false,
      quizScore:       Math.max(score, existing?.quizScore || 0),
      quizVersuche:    versuche,
      abgeschlossenAm: passed ? (existing?.abgeschlossenAm || now) : (existing?.abgeschlossenAm || ''),
    });
    await reloadAcks();
  } catch (e) {
    toast('Ergebnis konnte nicht gespeichert werden: ' + e.message, 'error');
  }

  // Ergebnis-Banner
  if (submitBtn) submitBtn.remove();
  const wrap = document.querySelector('.quiz-wrap');
  const res = document.createElement('div');
  res.className = 'quiz-q quiz-result ' + (passed ? 'pass' : 'fail');
  res.innerHTML = `
    <div class="big">${score}%</div>
    <div class="msg">${correct} von ${total} richtig — ${passed ? 'bestanden ✓' : 'leider nicht bestanden'}</div>
    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
      ${passed
        ? `<button class="btn btn-success" onclick="openDetail('${p.id}')">Weiter</button>`
        : `<button class="btn btn-primary" onclick="startQuiz('${p.id}')">Erneut versuchen</button>
           <button class="btn btn-ghost" onclick="openDetail('${p.id}')">Zurück zur Richtlinie</button>`}
    </div>`;
  wrap.appendChild(res);
  res.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
