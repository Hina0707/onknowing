import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStudyRequest, parseStudyResponse } from '../lib/quiz.js';
import { containsSourceQuote, validSourcePage } from '../dist/source-preview.js';

test('quiz generation asks for a source, and retest generation preserves its own schema', () => {
  const quiz = buildStudyRequest('quiz', {}).response_format.schema;
  const retest = buildStudyRequest('retest', {}).response_format.schema;
  assert.ok(quiz.properties.questions.items.required.includes('source'));
  assert.ok(!retest.required.includes('source'));
  assert.match(buildStudyRequest('quiz', {}).system_instruction, /인쇄된 페이지 번호를 쓰지 마세요/);
});

test('received source references preserve valid PDF positions and mark unknown positions', () => {
  const sample = {
    concept: '미분', prompt: '어떤 함수의 도함수를 구해 보세요.',
    choices: { A: 'A', B: 'B', C: 'C', D: 'D' }, answer: 'A',
    explanation: '해설', commonMistake: '오답 이유'
  };
  const parse = source => parseStudyResponse('quiz', JSON.stringify({ questions: [{ ...sample, source }] }),
    { questionCount: 1 }).questions[0].source;
  assert.deepEqual(parse({ page: 2, quote: '  f(x)=x²  ', note: '공식 적용' }),
    { page: 2, quote: 'f(x)=x²', note: '공식 적용' });
  assert.deepEqual(parse({ page: 0, quote: '', note: '사진의 도형' }), { page: 0, quote: '', note: '사진의 도형' });
  assert.equal(parse({ page: -1, quote: '', note: '' }), null);
});

test('PDF preview rejects out-of-range pages and checks source quotes without changing math symbols', () => {
  assert.equal(validSourcePage(2, 2), true);
  assert.equal(validSourcePage(3, 2), false);
  assert.equal(validSourcePage(0, 2), false);
  assert.equal(containsSourceQuote('원본 문장\n f(x) = x²+1 입니다.', 'f(x)=x²+1'), true);
  assert.equal(containsSourceQuote('원본 문장 f(x)=x²+1', 'f(x)=x²+2'), false);
  assert.equal(containsSourceQuote('원본 문장 f(x)=x²+1', 'f(x)=x2+1'), false);
  assert.equal(containsSourceQuote('아무 글', '  '), false);
});
