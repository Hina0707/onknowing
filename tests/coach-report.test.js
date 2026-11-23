import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCoachRequest, handleCoach } from '../lib/coach.js';
import { analyzeReport, describeReport } from '../dist/training.js';

const coaching = {
  question: {
    concept: '정적분',
    prompt: '넓이는 부호가 바뀌는 그래프에서 어떻게 구할까요?',
    choices: ['먼저 구간을 나눈다', '그대로 더한다', '한 점만 고른다', '정의할 수 없다'],
    answerIndex: 0,
    explanation: '정적분은 부호가 있는 값을 계산합니다. 실제 넓이는 각 구간의 넓이를 더합니다.',
    commonMistake: '부호가 다른 부분이 상쇄됩니다.',
    figureDescription: '그래프가 x축을 한 번 통과합니다.'
  },
  attempt: { answerIndex: 1, confidence: 5 }
};

test('coaching includes the submitted answer and adapts to each completed reply', () => {
  const start = buildCoachRequest(coaching);
  const input = JSON.parse(start.input);
  assert.equal(input.chosenAnswer, coaching.question.choices[1]);
  assert.equal(input.figureDescription, coaching.question.figureDescription);
  assert.equal(input.confidence, 5);
  assert.equal(start.store, false);
  assert.match(start.system_instruction, /최종 답, 완성된 풀이를 직접 밝히지/);

  const history = [{ role: 'coach', text: '그래프가 x축을 지나면 무슨 일이 일어날까요?' },
    { role: 'student', text: '모르겠어요.' }];
  const followUp = buildCoachRequest({ ...coaching, history });
  assert.deepEqual(JSON.parse(followUp.input).turns, history);
  assert.match(followUp.system_instruction, /더 기본적인 개념/);
  const concluding = buildCoachRequest({ ...coaching, history: [...history, ...history] });
  assert.match(concluding.system_instruction, /새 질문 없이/);
});

test('rejects coaching on a correct answer and malformed or extra turns', async () => {
  assert.equal((await handleCoach({ ...coaching, attempt: { answerIndex: 0, confidence: 5 } }, {})).status, 400);
  assert.equal((await handleCoach({ ...coaching, history: [{ role: 'student', text: '질문' }] }, {})).status, 400);
  const overLimit = Array.from({ length: 6 }, (_, index) => ({ role: index % 2 ? 'student' : 'coach', text: '대화' }));
  assert.equal((await handleCoach({ ...coaching, history: overLimit }, {})).status, 400);
  assert.equal((await handleCoach(coaching, {})).status, 503);
});

test('report ranks repeated overconfidence, tallies reasons, and keeps first-attempt statistics', () => {
  const attempts = [
    { concept: '정적분', correct: false, confidence: 5, calibration: 0, outcome: 'overconfident', mistake: 'reading', coachReplies: 2 },
    { concept: '정적분', correct: false, confidence: 4, calibration: 25, outcome: 'overconfident', mistake: 'reading' },
    { concept: '미분', correct: false, confidence: 2, calibration: 75, outcome: 'unsure', mistake: 'concept' },
    { concept: '극한', correct: false, confidence: 4, calibration: 25, outcome: 'overconfident' },
    { concept: '미분', correct: true, confidence: 3, calibration: 50, outcome: 'underconfident' }
  ];
  const report = analyzeReport(attempts);
  assert.equal(report.accuracy, 20);
  assert.equal(report.confidencePercent, 65);
  assert.equal(report.gap, 45);
  assert.deepEqual(report.priorities.map(item => item.concept), ['정적분', '극한', '미분']);
  assert.deepEqual(report.outcomeCounts, {
    secure: 0, overconfident: 3, underconfident: 0, unsure: 1, mixedCorrect: 1, mixedIncorrect: 0
  });
  assert.deepEqual(report.mistakeCounts, { concept: 1, calculation: 0, reading: 2 });
  assert.equal(report.coachedCount, 1);
  assert.deepEqual(analyzeReport([]).priorities, []);

  const description = describeReport(attempts, report, { concept: '정적분', correct: true });
  assert.match(description.performance, /5문제 중 1문제/);
  assert.match(description.judgment, /틀린 문제는 3개/);
  assert.match(description.judgment, /반반이에요.*정답 1개, 오답 0개/);
  assert.doesNotMatch(description.judgment, /자신감 1~2점으로 맞힌 문제/);
  assert.match(description.plan[0], /정적분.*오답 2문제/);
  assert.match(description.plan[1], /문제를 잘못 읽었어요.*2건/);
  assert.match(description.retest, /재검증.*정적분.*맞혔어요/);
});

test('report describes an all-correct session without inferring mistakes', () => {
  const attempts = [{ concept: '미분', correct: true, confidence: 5, calibration: 100, outcome: 'secure' }];
  const description = describeReport(attempts, analyzeReport(attempts));

  assert.match(description.performance, /미분/);
  assert.match(description.judgment, /맞힌 문제는 모두 자신감도 높았어요/);
  assert.match(description.retest, /첫 풀이를 모두 맞혔어요/);
});
