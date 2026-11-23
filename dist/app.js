import { DEFAULT_QUESTION_COUNT, MAX_QUESTION_COUNT, MIN_QUESTION_COUNT, MAX_COACH_REPLIES,
  analyzeReport, classifyOutcome, confidenceLevels, describeReport, grade, outcomes, reasons, summarize } from './training.js';
import { mountFigure } from './figures.js';
import { setMath } from './math.js';
import { createSourcePreview } from './source-preview.js';

const $ = id => document.getElementById(id);
const tabs = [...document.querySelectorAll('[data-view]')];
const letters = ['A', 'B', 'C', 'D'];
const mimeTypes = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const maxFileBytes = 3 * 1024 * 1024;
const storageKey = 'onknowing.training.v2';
const dateFormat = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' });
const confidenceFormat = new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 });

let view = 'quiz';
let stage = 'upload';
let busyAction = '';
let selectedFile;
let conceptResult;
let quiz;
let currentReport;
let historyReport;
let retestQuestion;
let retestIndex = -1;
let reviewIndex = 0;
let reviewStates = [];
let renderedCoachState;
let renderedCoachMessageCount = 0;
let sourceReview;
let confidence = 0;
let answerIndex = -1;
const errors = { quiz: '', concepts: '', retest: '' };
let reports = readReports(storageKey);
const legacyReports = readReports('onknowing.training.v1').filter(item => item?.initial).map(item => ({
  id: item.completedAt,
  fileName: item.concept,
  completedAt: item.completedAt,
  attempts: [{ ...item.initial, concept: item.concept, mistake: item.mistake }],
  retest: item.retest && { ...item.retest, concept: item.concept, explanation: item.retestExplanation }
}));

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function mathElement(tag, text, className) {
  return setMath(element(tag, undefined, className), text);
}

function readReports(key) {
  try {
    const saved = JSON.parse(localStorage.getItem(key));
    return Array.isArray(saved) ? saved.filter(item => typeof item?.completedAt === 'string'
      && Number.isFinite(Date.parse(item.completedAt))) : [];
  } catch { return []; }
}

function saveReport(report = currentReport) {
  reports = [report, ...reports.filter(item => item.id !== report.id)]
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt)).slice(0, 20);
  try { localStorage.setItem(storageKey, JSON.stringify(reports)); } catch { /* The current report remains available. */ }
}

function clearErrors() {
  errors.quiz = '';
  errors.concepts = '';
}

function updateWaiting(id, message) {
  const status = $(id);
  if (status.textContent !== message) status.textContent = message;
  status.parentElement.classList.toggle('is-waiting', Boolean(message));
}

function updateUpload() {
  const concepts = view === 'concepts';
  const questionCount = $('question-count').value;
  $('upload-title').textContent = concepts ? '개념 정리' : '학습 자료를 올려 주세요';
  $('upload-description').textContent = concepts
    ? '파일에서 핵심 개념과 헷갈리기 쉬운 부분을 정리해요.'
    : 'Gemini가 파일을 읽고 선택한 수만큼 객관식 문제를 만들어요.';
  $('study-file').disabled = Boolean(busyAction);
  $('question-count-field').hidden = concepts;
  $('question-count').disabled = Boolean(busyAction);
  $('upload-submit').disabled = Boolean(busyAction) || !selectedFile;
  $('upload-submit').textContent = concepts ? '개념 정리하기' : '문제 ' + questionCount + '개 만들기';
  updateWaiting('upload-status', busyAction === view
    ? (concepts ? '개념을 정리하고 있어요…' : '문제 ' + questionCount + '개를 만들고 있어요…')
    : busyAction ? '다른 학습 기능을 처리하고 있어요…' : '');
  $('upload-error').hidden = !errors[view];
  $('upload-error').textContent = errors[view] || '';
  $('concept-results').hidden = !concepts || !conceptResult;
}

function renderView(focusHeading = false) {
  let screen = view === 'concepts' ? 'upload' : stage;
  if (view === 'history') screen = historyReport ? 'report' : 'history';
  if (screen === 'retest') screen = 'question';
  for (const name of ['upload', 'question', 'review', 'history', 'report']) $(name + '-screen').hidden = name !== screen;

  tabs.forEach(tab => tab.setAttribute('aria-pressed', String(tab.dataset.view === view)));
  if (screen === 'upload') updateUpload();
  if (screen === 'review') {
    updateReviewActions();
    renderCoach();
  }
  if (screen === 'history') renderHistory();
  if (screen === 'report') renderReport(view === 'history' ? historyReport : currentReport);
  if (focusHeading) {
    $(screen + '-screen').querySelector('h1').focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

function validFile(file) {
  const extension = file.name.split('.').at(-1).toLowerCase();
  const mimeType = mimeTypes[extension];
  if (!mimeType) throw new Error('PDF, JPG, PNG, WebP 파일을 선택해 주세요.');
  if (!file.size || file.size > maxFileBytes) throw new Error('내용이 있는 3MB 이하 파일을 선택해 주세요.');
  return mimeType;
}

async function encodeFile(file) {
  const mimeType = validFile(file);
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result));
    reader.addEventListener('error', () => reject(new Error('파일을 읽지 못했어요. 다시 선택해 주세요.')));
    reader.readAsDataURL(file);
  });
  return { mimeType, data: dataUrl.slice(dataUrl.indexOf(',') + 1) };
}

async function requestData(body, endpoint = '/api/quiz') {
  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(58000)
    });
  } catch {
    throw new Error('서버에서 응답을 받지 못했어요. 다시 시도해 주세요.');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data) throw new Error(data?.error || '요청을 처리하지 못했어요. 다시 시도해 주세요.');
  return data;
}

async function useFile(event) {
  event.preventDefault();
  if (busyAction || !selectedFile || view === 'history') return;
  const action = view;
  const file = selectedFile;
  const questionCount = Number($('question-count').value);
  busyAction = action;
  errors[action] = '';
  renderView();
  try {
    const body = { action, file: await encodeFile(file) };
    if (action === 'quiz') body.questionCount = questionCount;
    const data = await requestData(body);
    if (action === 'concepts') {
      conceptResult = { fileName: file.name, concepts: data.concepts, overview: data.overview };
      renderConcepts();
    } else {
      quiz?.sourcePreview.dispose();
      quiz = { fileName: file.name, sourcePreview: createSourcePreview(file), questions: data.questions, answers: [] };
      stage = 'question';
      renderQuestion();
    }
  } catch (error) {
    errors[action] = error.message;
  } finally {
    busyAction = '';
    renderView(view === action && action === 'quiz' && stage === 'question');
  }
}

function renderConcepts() {
  $('concept-file').textContent = conceptResult.fileName;
  mountFigure($('concept-overview'), conceptResult.overview);
  const cards = conceptResult.concepts.map(concept => {
    const card = element('article', undefined, 'card concept-card');
    const caution = element('p', undefined, 'long-text');
    caution.append(element('strong', '헷갈리기 쉬운 점 '), mathElement('span', concept.caution));
    card.append(mathElement('h3', concept.title), mathElement('p', concept.summary, 'long-text'), caution);
    return card;
  });
  $('concept-list').replaceChildren(...cards);
}

function updateSubmit() {
  $('submit-answer').disabled = !confidence || answerIndex < 0;
}

function renderQuestion() {
  confidence = 0;
  answerIndex = -1;
  const isRetest = stage === 'retest';
  const position = quiz.answers.length;
  const question = isRetest ? retestQuestion : quiz.questions[position];
  $('question-title').textContent = isRetest ? '재검증 문제' : '문제 ' + (position + 1) + ' / ' + quiz.questions.length;
  $('question-subtitle').textContent = isRetest ? '같은 개념을 새 문제에서 적용해 보세요.' : quiz.fileName;
  setMath($('question-text'), question.prompt);
  mountFigure($('question-figure'), question.figure);
  $('submit-answer').textContent = isRetest ? '재검증 제출' : position + 1 === quiz.questions.length ? '제출하고 해설 보기' : '다음 문제';

  const options = question.choices.map((choice, index) => {
    const label = document.createElement('label');
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'answer';
    radio.value = String(index);
    radio.addEventListener('change', () => {
      answerIndex = index;
      updateSubmit();
    });
    label.append(radio, element('span', letters[index], 'choice-letter'), mathElement('span', choice));
    return label;
  });
  $('answer-options').replaceChildren(...options);

  const levels = confidenceLevels.map(({ label, guide }, index) => {
    const level = index + 1;
    const card = element('label', undefined, 'confidence-option');
    const radio = document.createElement('input');
    const guideId = 'confidence-guide-' + level;
    radio.type = 'radio';
    radio.name = 'confidence';
    radio.value = String(level);
    radio.setAttribute('aria-label', level + '점 · ' + label);
    radio.setAttribute('aria-describedby', guideId);
    radio.addEventListener('change', () => {
      confidence = level;
      updateSubmit();
    });
    const title = element('span', undefined, 'confidence-option-title');
    const mark = element('span', '✓', 'confidence-mark');
    mark.setAttribute('aria-hidden', 'true');
    title.append(element('span', level + '점', 'confidence-score'), element('span', label), mark);
    const description = element('span', guide, 'confidence-guide');
    description.id = guideId;
    card.append(radio, title, description);
    return card;
  });
  $('confidence-options').replaceChildren(...levels);
  updateSubmit();
}

function showCategory(node, outcome, { detailed = false } = {}) {
  const category = outcomes[outcome];
  node.textContent = (detailed && category.feedback) || category.label;
  node.dataset.tone = category.tone;
}

function formatConfidence(score) {
  const level = confidenceLevels[score - 1];
  return score + '점' + (level ? ' · ' + level.label : '');
}

function formatChoice(question, index) {
  return letters[index] + '. ' + question.choices[index];
}

function saveInitialReport() {
  const attempts = quiz.questions.map((question, index) => ({
    concept: question.concept, ...grade(question, quiz.answers[index].confidence, quiz.answers[index].answerIndex)
  }));
  currentReport = { id: crypto.randomUUID(), fileName: quiz.fileName, completedAt: new Date().toISOString(), attempts };
  retestIndex = attempts.findIndex(attempt => attempt.outcome === 'overconfident');
  if (retestIndex < 0) retestIndex = attempts.findIndex(attempt => !attempt.correct);
  saveReport();
}

function submitQuestion(event) {
  event.preventDefault();
  if (!confidence || answerIndex < 0 || view !== 'quiz') return;
  if (stage === 'retest') {
    const result = grade(retestQuestion, confidence, answerIndex);
    currentReport.retest = {
      concept: quiz.questions[retestIndex].concept, originalQuestion: retestIndex, ...result,
      explanation: '정답 ' + formatChoice(retestQuestion, retestQuestion.answerIndex) + '\n' + retestQuestion.explanation
    };
    saveReport();
    stage = 'report';
  } else if (stage === 'question') {
    quiz.answers.push({ confidence, answerIndex });
    if (quiz.answers.length === quiz.questions.length) {
      saveInitialReport();
      stage = 'review';
      prepareReview();
    } else {
      renderQuestion();
    }
  }
  renderView(true);
}

function prepareReview() {
  const { attempts } = currentReport;
  const totals = summarize(attempts);
  $('review-score').textContent = attempts.length + '문제 중 ' + totals.correctCount + '문제를 맞혔어요.';
  reviewStates = attempts.map(attempt => ({
    messages: [], draft: '', pending: false, error: '', showSolution: attempt.correct
  }));
  $('review-index').replaceChildren(...attempts.map((attempt, index) => {
    const button = element('button', (index + 1) + '번');
    button.type = 'button';
    button.dataset.result = attempt.correct ? 'correct' : 'incorrect';
    button.setAttribute('aria-label', (index + 1) + '번 ' + (attempt.correct ? '정답' : '오답'));
    button.addEventListener('click', () => showReviewQuestion(index, true));
    return button;
  }));
  showReviewQuestion(Math.max(0, retestIndex));
}

function showReviewQuestion(index, focus = false) {
  if (index < 0 || index >= reviewStates.length) return;
  reviewIndex = index;
  const attempt = currentReport.attempts[index];
  const question = quiz.questions[index];
  for (const [position, button] of [...$('review-index').children].entries()) {
    button.setAttribute('aria-pressed', String(position === index));
  }
  $('previous-review').disabled = index === 0;
  $('next-review').disabled = index === reviewStates.length - 1;
  setMath($('review-question-title'), (index + 1) + '번 · ' + question.concept);
  showCategory($('review-outcome'), classifyOutcome(attempt.confidence, attempt.correct), { detailed: true });
  setMath($('review-question-text'), question.prompt);
  mountFigure($('review-question-figure'), question.figure);
  setMath($('review-your-answer'), '내 답 ' + formatChoice(question, attempt.answerIndex) + ' · 자신감 ' + formatConfidence(attempt.confidence));
  $('review-confidence-guide').hidden = attempt.correct || attempt.confidence > 2;
  setMath($('review-correct-answer'), '정답 ' + formatChoice(question, question.answerIndex));
  setMath($('review-explanation'), question.explanation);
  prepareReviewSource(question.source);
  $('review-common-mistake').hidden = attempt.correct;
  setMath($('review-common-mistake'), '놓쳤을 수 있는 부분 · ' + question.commonMistake);
  $('review-reason-label').hidden = attempt.correct;
  $('review-reason').value = attempt.mistake || '';
  $('coach-panel').hidden = attempt.correct;
  updateSolution();
  renderCoach();
  if (focus) $('review-question-title').focus();
}

function updateSolution() {
  const revealed = reviewStates[reviewIndex].showSolution;
  $('review-solution').hidden = !revealed;
  $('reveal-solution').hidden = currentReport.attempts[reviewIndex].correct;
  $('reveal-solution').textContent = revealed ? '정답과 해설 접기' : '정답과 해설 보기';
  $('reveal-solution').setAttribute('aria-expanded', String(revealed));
}

function prepareReviewSource(evidence) {
  sourceReview = { reader: quiz.sourcePreview, evidence, started: false };
  const details = $('review-source');
  details.open = false;
  details.hidden = false;
  $('source-preview').replaceChildren();
  $('source-status').textContent = '';
  $('source-note').hidden = !evidence?.note;
  if (evidence?.note) setMath($('source-note'), 'AI가 연결한 근거 · ' + evidence.note);
  $('source-quote').hidden = !evidence?.quote;
  $('source-quote-text').textContent = evidence?.quote || '';
  $('source-quote-label').textContent = 'AI가 제시한 근거 문구';
  $('source-original').removeAttribute('href');
}

async function showReviewSource() {
  const current = sourceReview;
  if (!current || current.started || !$('review-source').open) return;
  current.started = true;
  const { reader, evidence } = current;
  const link = $('source-original');
  link.href = reader.original();

  if (!reader.isPdf) {
    const photo = document.createElement('img');
    photo.src = reader.original();
    photo.alt = '업로드한 원본 사진';
    $('source-preview').append(photo);
    $('source-status').textContent = '업로드한 원본 사진';
    return;
  }
  if (!evidence?.page) {
    $('source-status').textContent = 'AI가 근거 페이지를 특정하지 못했어요. 원본 파일에서 확인할 수 있어요.';
    return;
  }

  $('source-status').textContent = '원본 PDF 페이지를 불러오는 중이에요…';
  try {
    const preview = await reader.previewPdf(evidence.page, evidence.quote);
    if (sourceReview !== current) return;
    if (!preview.canvas) {
      $('source-status').textContent = 'AI가 제시한 페이지가 원본 범위를 벗어났어요. 원본 파일에서 확인해 주세요.';
      return;
    }
    $('source-preview').append(preview.canvas);
    link.href = reader.original(evidence.page);
    $('source-status').textContent = 'AI가 연결한 원본 PDF ' + evidence.page + '쪽 / ' + preview.pageCount + '쪽';
    if (preview.quoteMatched) $('source-quote-label').textContent = '이 페이지 원문에서 확인한 문구';
  } catch {
    if (sourceReview === current) {
      $('source-status').textContent = '페이지를 미리 볼 수 없어요. 원본 파일 열기로 확인해 주세요.';
      link.href = reader.original(evidence.page);
    }
  }
}

function coachMessage(message) {
  const item = element('li', undefined, 'coach-message');
  item.dataset.role = message.role;
  const isCoach = message.role === 'coach';
  const avatar = element('span', isCoach ? 'G' : '나', 'coach-avatar ' + (isCoach ? 'coach-avatar-ai' : 'coach-avatar-user'));
  avatar.setAttribute('aria-hidden', 'true');
  const body = element('div', undefined, 'coach-message-body');
  body.append(element('strong', isCoach ? 'Gemini' : '나'), mathElement('p', message.text));
  item.append(avatar, body);
  return item;
}

function renderCoach() {
  const session = reviewStates[reviewIndex];
  if (currentReport.attempts[reviewIndex].correct) return;
  const started = session.messages.length > 0;
  const completed = session.messages.length >= 1 + MAX_COACH_REPLIES * 2;
  const thread = $('coach-thread');
  const changedConversation = renderedCoachState !== session;
  if (changedConversation) {
    thread.replaceChildren();
    renderedCoachState = session;
    renderedCoachMessageCount = 0;
  }
  const newMessages = session.messages.slice(renderedCoachMessageCount);
  for (const message of newMessages) thread.append(coachMessage(message));
  if (newMessages.length) thread.scrollTop = thread.scrollHeight;
  renderedCoachMessageCount = session.messages.length;
  $('coach-start').hidden = started;
  $('coach-start').disabled = session.pending;
  $('coach-form').hidden = !started || completed;
  $('coach-answer').readOnly = session.pending;
  if ($('coach-answer').value !== session.draft) $('coach-answer').value = session.draft;
  $('coach-send').disabled = session.pending || !session.draft.trim();
  $('coach-complete').hidden = !completed;
  updateWaiting('coach-status', session.pending ? 'Gemini가 답변을 쓰고 있어요…' : '');
  $('coach-error').hidden = !session.error;
  $('coach-error').textContent = session.error;
}

async function sendCoach(reply = '') {
  if (view !== 'quiz' || stage !== 'review') return;
  const session = reviewStates[reviewIndex];
  const report = currentReport;
  const question = quiz.questions[reviewIndex];
  const attempt = report.attempts[reviewIndex];
  if (attempt.correct || session.pending || session.messages.length >= 1 + MAX_COACH_REPLIES * 2) return;
  const started = session.messages.length > 0;
  const text = reply.trim();
  if (started !== Boolean(text)) return;
  const history = text ? [...session.messages, { role: 'student', text }] : [];
  session.pending = true;
  session.error = '';
  renderCoach();
  try {
    const result = await requestData({
      question: {
        concept: question.concept, prompt: question.prompt, choices: question.choices,
        answerIndex: question.answerIndex, explanation: question.explanation,
        commonMistake: question.commonMistake, figureDescription: question.figure?.caption
      },
      attempt: { answerIndex: attempt.answerIndex, confidence: attempt.confidence },
      history
    }, '/api/coach');
    if (!result.text?.trim()) throw new Error('코칭 답변을 받지 못했어요. 다시 시도해 주세요.');
    session.messages = [...history, { role: 'coach', text: result.text }];
    session.draft = '';
    if (text) {
      attempt.coachReplies = Math.floor(session.messages.length / 2);
      saveReport(report);
    }
  } catch (error) {
    session.error = error.message;
  } finally {
    session.pending = false;
    if (view === 'quiz' && stage === 'review' && reviewStates[reviewIndex] === session) {
      const focused = document.activeElement;
      renderCoach();
      if (session.messages.length === 1 && focused === $('coach-start')) {
        $('coach-answer').focus({ preventScroll: true });
      } else if (session.messages.length >= 1 + MAX_COACH_REPLIES * 2
        && $('coach-form').contains(focused)) {
        $('reveal-solution').focus({ preventScroll: true });
      }
    }
    if ((view === 'quiz' && stage === 'report' && currentReport === report)
      || (view === 'history' && historyReport === report)) renderReport(report);
  }
}

function updateReviewActions() {
  $('start-retest').hidden = retestIndex < 0 || Boolean(currentReport.retest);
  $('start-retest').disabled = Boolean(busyAction);
  $('open-report').disabled = busyAction === 'retest';
  $('retest-error').hidden = !errors.retest;
  $('retest-error').textContent = errors.retest;
  updateWaiting('retest-status', busyAction === 'retest' ? '재검증 문제를 만들고 있어요…' : '');
}

async function startRetest() {
  if (busyAction || retestIndex < 0 || currentReport.retest) return;
  const previous = quiz.questions[retestIndex];
  busyAction = 'retest';
  errors.retest = '';
  renderView();
  try {
    const data = await requestData({ action: 'retest', concept: previous.concept, prompt: previous.prompt });
    retestQuestion = data.question;
    stage = 'retest';
    renderQuestion();
  } catch (error) {
    errors.retest = error.message;
  } finally {
    busyAction = '';
    renderView(view === 'quiz' && stage === 'retest');
  }
}

function renderHistory() {
  const entries = [...reports, ...legacyReports]
    .filter(report => report?.attempts?.length && Number.isFinite(Date.parse(report.completedAt)))
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt));
  $('history-empty').hidden = entries.length > 0;
  $('reports-list').replaceChildren(...entries.map(report => {
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.append(element('strong', report.fileName), element('span', dateFormat.format(new Date(report.completedAt))));
    button.addEventListener('click', () => { historyReport = report; renderView(true); });
    li.append(button);
    return li;
  }));
}

function renderReport(report) {
  const totals = analyzeReport(report.attempts);
  const description = describeReport(report.attempts, totals, report.retest);
  setMath($('analysis-performance'), description.performance);
  setMath($('analysis-judgment'), description.judgment);
  $('analysis-plan').replaceChildren(...description.plan.map(step => mathElement('li', step)));
  setMath($('analysis-retest'), description.retest);
  $('report-source').textContent = report.fileName;
  $('report-accuracy').textContent = totals.accuracy + '%';
  $('report-correct-count').textContent = report.attempts.length + '문제 중 ' + totals.correctCount + '문제 정답';
  $('report-confidence').textContent = confidenceFormat.format(totals.confidence);
  $('report-calibration').textContent = totals.calibration + '점';
  $('confidence-bar').value = totals.confidencePercent;
  $('confidence-percent').textContent = totals.confidencePercent + '%';
  $('accuracy-bar').value = totals.accuracy;
  $('accuracy-percent').textContent = totals.accuracy + '%';
  let gapText = '이번 풀이의 평균 자신감과 정답률이 같아요.';
  if (totals.gap !== 0) {
    gapText = '평균 자신감이 실제 정답률보다 ' + Math.abs(totals.gap) + '%p ' + (totals.gap > 0 ? '높아요.' : '낮아요.');
  }
  $('report-gap').textContent = gapText;
  const presentOutcomes = Object.entries(totals.outcomeCounts).filter(([, count]) => count > 0);
  $('report-outcomes').replaceChildren(...presentOutcomes.map(([key, count]) => {
    const item = document.createElement('li');
    const tag = element('span', undefined, 'result-tag');
    showCategory(tag, key);
    item.append(tag, element('strong', count + '문항'));
    return item;
  }));
  $('report-rows').replaceChildren(...report.attempts.map((attempt, index) => {
    const row = document.createElement('tr');
    const heading = mathElement('th', (index + 1) + '번 · ' + attempt.concept);
    heading.scope = 'row';
    row.append(heading, element('td', attempt.correct ? '정답' : '오답'),
      element('td', formatConfidence(attempt.confidence)), element('td', attempt.calibration + '점'));
    return row;
  }));
  $('report-weak').textContent = totals.priorities.length
    ? '자신 있게 틀린 개념을 먼저, 그다음 자주 틀린 개념을 복습해 보세요.'
    : '이번 학습에서 틀린 개념이 없어요.';
  $('report-priorities').replaceChildren(...totals.priorities.map(item => {
    const row = document.createElement('li');
    const overconfident = item.overconfident ? ' · 과대평가 ' + item.overconfident + '문항' : '';
    row.append(mathElement('strong', item.concept), element('span', '오답 ' + item.missed + '문항' + overconfident));
    return row;
  }));
  const reasonsForMistakes = Object.entries(totals.mistakeCounts)
    .filter(([, count]) => count > 0).map(([key, count]) => reasons[key] + ' ' + count + '건');
  $('report-reasons').hidden = !reasonsForMistakes.length;
  $('report-reasons').textContent = '내가 고른 오답 이유 · ' + reasonsForMistakes.join(' · ');
  const missedCount = report.attempts.length - totals.correctCount;
  $('report-coaching').hidden = missedCount === 0;
  $('report-coaching').textContent = '오답 ' + missedCount + '문항 중 ' + totals.coachedCount + '문항에서 코칭에 답했어요.';
  $('retest-report').hidden = !report.retest;
  if (report.retest) {
    const initial = report.attempts[report.retest.originalQuestion];
    const compared = initial ? '첫 풀이 오답 → 재검증 ' : '';
    setMath($('retest-result'), report.retest.concept + ' · ' + compared + (report.retest.correct ? '정답' : '오답')
      + ' · 자신감 ' + (initial ? formatConfidence(initial.confidence) + ' → ' : '') + formatConfidence(report.retest.confidence));
    setMath($('retest-explanation'), report.retest.explanation);
  }
  $('back-to-history').hidden = view !== 'history';
  $('back-to-review').hidden = view !== 'quiz';
  $('new-quiz').hidden = view === 'history';
}

for (const tab of tabs) {
  tab.addEventListener('click', () => {
    view = tab.dataset.view;
    if (view === 'history') historyReport = undefined;
    renderView(true);
  });
}
const countSelect = $('question-count');
const countOptions = [];
for (let count = MIN_QUESTION_COUNT; count <= MAX_QUESTION_COUNT; count++) {
  const option = element('option', count + '문제');
  option.value = String(count);
  countOptions.push(option);
}
countSelect.replaceChildren(...countOptions);
countSelect.value = String(DEFAULT_QUESTION_COUNT);
countSelect.addEventListener('change', updateUpload);
$('study-file').addEventListener('change', () => {
  clearErrors();
  selectedFile = $('study-file').files[0];
  if (selectedFile) {
    try { validFile(selectedFile); } catch (error) {
      selectedFile = undefined;
      $('study-file').value = '';
      errors[view] = error.message;
    }
  }
  renderView();
});
$('upload-form').addEventListener('submit', useFile);
$('answer-form').addEventListener('submit', submitQuestion);
$('previous-review').addEventListener('click', () => showReviewQuestion(reviewIndex - 1, true));
$('next-review').addEventListener('click', () => showReviewQuestion(reviewIndex + 1, true));
$('review-source').addEventListener('toggle', showReviewSource);
$('reveal-solution').addEventListener('click', () => {
  const session = reviewStates[reviewIndex];
  session.showSolution = !session.showSolution;
  updateSolution();
});
$('review-reason').addEventListener('change', () => {
  currentReport.attempts[reviewIndex].mistake = $('review-reason').value;
  saveReport();
});
$('coach-start').addEventListener('click', () => sendCoach());
$('coach-answer').addEventListener('input', () => {
  const session = reviewStates[reviewIndex];
  session.draft = $('coach-answer').value;
  $('coach-send').disabled = session.pending || !session.draft.trim();
});
$('coach-answer').addEventListener('keydown', event => {
  if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return;
  event.preventDefault();
  if (!$('coach-send').disabled) $('coach-form').requestSubmit();
});
$('coach-form').addEventListener('submit', event => {
  event.preventDefault();
  sendCoach(reviewStates[reviewIndex].draft);
});
$('start-retest').addEventListener('click', startRetest);
$('open-report').addEventListener('click', () => { stage = 'report'; renderView(true); });
$('back-to-history').addEventListener('click', () => { historyReport = undefined; renderView(true); });
$('back-to-review').addEventListener('click', () => { stage = 'review'; renderView(true); });
$('new-quiz').addEventListener('click', () => {
  stage = 'upload';
  quiz?.sourcePreview.dispose();
  sourceReview = undefined;
  quiz = undefined;
  currentReport = undefined;
  retestQuestion = undefined;
  retestIndex = -1;
  reviewStates = [];
  renderedCoachState = undefined;
  errors.quiz = '';
  errors.retest = '';
  renderView(true);
});
renderView();
