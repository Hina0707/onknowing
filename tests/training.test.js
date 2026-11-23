import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStudyRequest, handleQuiz, parseStudyResponse, readFileInput } from '../lib/quiz.js';
import { grade, summarize } from '../dist/training.js';

const sample = {
  concept: '제곱', prompt: '3의 제곱은?',
  choices: { A: '6', B: '9', C: '12', D: '18' },
  answer: 'B', explanation: '3 × 3 = 9입니다.',
  commonMistake: '같은 수를 더하는 대신 곱해야 합니다.'
};
const questions = [3, 4, 5, 6, 7].map(number => ({ ...sample, prompt: number + '의 제곱은?' }));

test('validates file bytes and uses distinct request schemas for quiz and summary', () => {
  const pdf = Buffer.from('%PDF-1.7\n').toString('base64');
  const document = readFileInput({ mimeType: 'application/pdf', data: pdf });
  assert.equal(document.type, 'document');
  assert.equal(buildStudyRequest('quiz', document).input[1].data, pdf);
  assert.deepEqual(buildStudyRequest('quiz', document).response_format.schema.required, ['questions']);
  assert.deepEqual(buildStudyRequest('concepts', document).response_format.schema.required, ['overview', 'concepts']);
  assert.throws(() => readFileInput({ mimeType: 'image/png', data: pdf }), /파일 형식/);
  assert.throws(() => readFileInput({ mimeType: 'text/plain', data: pdf }), /PDF, PNG/);
});

test('validates five distinct questions and their deterministic grade keys', () => {
  const quiz = parseStudyResponse('quiz', JSON.stringify({ questions }));
  assert.equal(quiz.questions.length, 5);
  assert.deepEqual(quiz.questions[0].choices, ['6', '9', '12', '18']);
  assert.equal(quiz.questions[0].answerIndex, 1);
  assert.throws(() => parseStudyResponse('quiz', JSON.stringify({ questions: questions.slice(0, 4) })), /5개/);
  const duplicate = [...questions.slice(0, 4), questions[0]];
  assert.throws(() => parseStudyResponse('quiz', JSON.stringify({ questions: duplicate })), /서로 다른/);
  const invalid = [{ ...sample, choices: { ...sample.choices, A: ' 9 ' } }, ...questions.slice(1)];
  assert.throws(() => parseStudyResponse('quiz', JSON.stringify({ questions: invalid })), /선택지와 정답/);
});

test('allows a concept summary without any quiz data and rejects repeated retests', () => {
  const concepts = [{ title: '제곱', summary: '같은 수를 두 번 곱합니다.', caution: '두 번 더하는 것과 다릅니다.' }];
  const result = parseStudyResponse('concepts', JSON.stringify({ concepts }));
  assert.deepEqual(result.concepts, concepts);
  assert.ok(result.overview.items.length);
  assert.equal(parseStudyResponse('concepts', '{"concepts":[]}'), null);
  assert.throws(() => parseStudyResponse('retest', JSON.stringify(sample), { original: '3의  제곱은' }), /첫 문제와 같아요/);
});

test('uses the requested question count across the API and preserves a generated figure', async () => {
  const request = buildStudyRequest('quiz', {}, { questionCount: 3 });
  assert.equal(request.response_format.schema.properties.questions.maxItems, 3);
  assert.match(request.input[0].text, /3개/);
  const figure = {
    caption: '한 변의 길이가 3인 정사각형',
    items: [{ kind: 'box', x: 20, y: 20, x2: 60, y2: 85, text: '3' }]
  };
  const raw = JSON.stringify({ questions: [{ ...sample, figure }, ...questions.slice(1, 3)] });
  const result = parseStudyResponse('quiz', raw, { questionCount: 3 });
  assert.equal(result.questions.length, 3);
  assert.deepEqual(result.questions[0].figure, figure);
  assert.throws(() => parseStudyResponse('quiz', raw, { questionCount: 4 }), /4개/);
  assert.equal((await handleQuiz({ action: 'quiz', questionCount: 11 }, {})).status, 400);
});

test('classifies confidence outcomes and keeps the score calculation for midpoint answers', () => {
  const question = parseStudyResponse('quiz', JSON.stringify({ questions })).questions[0];
  const attempts = [grade(question, 4, 1), grade(question, 5, 0), grade(question, 3, 1),
    grade(question, 1, 0), grade(question, 5, 1)];
  assert.deepEqual(attempts.map(attempt => attempt.outcome),
    ['secure', 'overconfident', 'mixedCorrect', 'unsure', 'secure']);
  assert.equal(grade(question, 3, 0).outcome, 'mixedIncorrect');
  assert.equal(grade(question, 3, 0).calibration, 50);
  assert.equal(grade(question, 2, 1).outcome, 'underconfident');
  assert.throws(() => grade(question, 0, 1), /자신감/);
  assert.deepEqual(summarize(attempts), { correctCount: 3, accuracy: 60, confidence: 3.6, calibration: 65 });
});
