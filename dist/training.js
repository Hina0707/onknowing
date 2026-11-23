export const DEFAULT_QUESTION_COUNT = 5;
export const MIN_QUESTION_COUNT = 1;
export const MAX_QUESTION_COUNT = 10;
export const MAX_COACH_REPLIES = 2;

export const confidenceLevels = [
  { label: '찍었어요', guide: '답을 고른 근거가 없어요.' },
  { label: '잘 모르겠어요', guide: '단서는 찾았지만 답을 좁히기 어려워요.' },
  { label: '반반이에요', guide: '두 보기 사이에서 고민돼요.' },
  { label: '거의 확실해요', guide: '근거는 있지만 조건이나 계산이 조금 걸려요.' },
  { label: '확실해요', guide: '왜 이 답인지 설명할 수 있어요.' }
];

export const outcomes = {
  secure: { label: '확신 있는 정답', tone: 'positive' },
  overconfident: { label: '과대평가', feedback: '확신했지만 틀렸어요', tone: 'negative' },
  underconfident: { label: '과소평가', tone: 'caution' },
  unsure: { label: '확신 낮은 오답', feedback: '근거를 찾기 어려웠어요', tone: 'neutral' },
  mixedCorrect: { label: '반반 · 정답', feedback: '망설였지만 맞혔어요', tone: 'neutral' },
  mixedIncorrect: { label: '반반 · 오답', feedback: '망설였고 틀렸어요', tone: 'neutral' }
};

export const reasons = {
  concept: '개념을 몰랐어요',
  calculation: '계산 실수',
  reading: '문제를 잘못 읽었어요'
};

export function classifyOutcome(confidence, correct) {
  if (confidence === 3) return correct ? 'mixedCorrect' : 'mixedIncorrect';
  if (confidence >= 4) return correct ? 'secure' : 'overconfident';
  return correct ? 'underconfident' : 'unsure';
}

export function grade(question, confidence, answerIndex) {
  if (!Number.isInteger(confidence) || confidence < 1 || confidence > 5) {
    throw new Error('자신감을 먼저 선택해 주세요.');
  }
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= question.choices.length) {
    throw new Error('답안을 선택해 주세요.');
  }

  const correct = question.answerIndex === answerIndex;
  const outcome = classifyOutcome(confidence, correct);
  const confidencePercent = (confidence - 1) * 25;
  const calibration = 100 - Math.abs(confidencePercent - (correct ? 100 : 0));
  return { confidence, answerIndex, correct, outcome, calibration };
}

export function summarize(attempts) {
  const count = attempts.length;
  const correctCount = attempts.filter(attempt => attempt.correct).length;
  if (!count) return { correctCount, accuracy: 0, confidence: 0, calibration: 0 };
  return {
    correctCount,
    accuracy: Math.round(correctCount * 100 / count),
    confidence: attempts.reduce((sum, attempt) => sum + attempt.confidence, 0) / count,
    calibration: Math.round(attempts.reduce((sum, attempt) => sum + attempt.calibration, 0) / count)
  };
}

export function analyzeReport(attempts) {
  const summary = summarize(attempts);
  const confidencePercent = attempts.length ? Math.round((summary.confidence - 1) * 25) : 0;
  const outcomeCounts = Object.fromEntries(Object.keys(outcomes).map(key => [key, 0]));
  const mistakeCounts = Object.fromEntries(Object.keys(reasons).map(key => [key, 0]));
  const weak = new Map();
  let coachedCount = 0;
  for (const attempt of attempts) {
    const outcome = classifyOutcome(attempt.confidence, attempt.correct);
    outcomeCounts[outcome]++;
    if (attempt.correct) continue;
    if (Object.hasOwn(mistakeCounts, attempt.mistake)) mistakeCounts[attempt.mistake]++;
    if (attempt.coachReplies > 0) coachedCount++;
    const concept = typeof attempt.concept === 'string' ? attempt.concept.trim() : '';
    if (!concept) continue;
    const entry = weak.get(concept) || { concept, missed: 0, overconfident: 0 };
    entry.missed++;
    if (outcome === 'overconfident') entry.overconfident++;
    weak.set(concept, entry);
  }
  const priorities = [...weak.values()]
    .sort((left, right) => right.overconfident - left.overconfident || right.missed - left.missed)
    .slice(0, 3);
  return { ...summary, confidencePercent, gap: confidencePercent - summary.accuracy,
    outcomeCounts, mistakeCounts, priorities, coachedCount };
}

const practiceForMistake = {
  concept: '핵심 개념을 내 말로 한 문장 적고, 그 개념이 적용되는 조건을 하나 붙여 보세요.',
  calculation: '중간 계산과 단위를 한 줄씩 적고, 답을 고르기 전에 원래 식에 대입해 확인하세요.',
  reading: '문제에서 주어진 정보와 구해야 할 값을 따로 표시한 뒤, 조건을 빠뜨리지 않았는지 확인하세요.'
};

export function describeReport(attempts, totals, retest) {
  const { secure, overconfident, underconfident, unsure, mixedCorrect, mixedIncorrect } = totals.outcomeCounts;
  const count = attempts.length;
  const wrongCount = count - totals.correctCount;
  const strengths = [...new Set(attempts.filter(attempt => attempt.correct && attempt.confidence >= 4)
    .map(attempt => attempt.concept).filter(Boolean))].slice(0, 2);
  let performance = count + '문제 중 ' + totals.correctCount + '문제를 맞혔어요. ';
  if (secure) {
    performance += '그중 ' + secure + '문제는 자신감 4~5점으로 고른 답이 맞았어요. '
      + (strengths.length ? strengths.map(concept => '‘' + concept + '’').join(', ') + '에서 답을 고른 근거를 짧게 정리해 두면 다음 문제에도 써먹을 수 있어요.' : '이 문제들에서 답을 고른 근거를 짧게 정리해 보세요.');
  } else if (totals.correctCount) {
    performance += '확신이 낮거나 반반이라고 고른 문제에서 정답을 맞혔어요. 해설에서 내 풀이가 맞았던 부분을 찾고, 어떤 조건이 그 풀이를 뒷받침했는지 짚어 보세요.';
  } else {
    performance += '오답을 한꺼번에 다시 풀기보다, 먼저 한 문제를 골라 어디서 막혔는지 살펴보고 해설의 첫 단계만 따라 해 보세요.';
  }

  const judgmentParts = [];
  if (overconfident) {
    judgmentParts.push('자신감 4~5점으로 틀린 문제는 ' + overconfident + '개예요. 해당 문제의 해설을 읽고, 내 풀이가 어떤 가정에서 출발했는지 비교해 보세요.');
  }
  if (underconfident) {
    judgmentParts.push('자신감 1~2점으로 맞힌 문제는 ' + underconfident + '개예요. 맞았던 판단에 어떤 근거가 있었는지 찾아보세요.');
  }
  if (secure && !underconfident && !mixedCorrect) {
    judgmentParts.push('맞힌 문제는 모두 자신감도 높았어요.');
  }
  if (overconfident && underconfident) {
    judgmentParts.push('두 유형이 함께 있으면 평균만으로는 차이가 작아 보일 수 있으니 문항별 결과도 확인해 보세요.');
  }
  if (mixedCorrect || mixedIncorrect) {
    judgmentParts.push('‘반반이에요’를 고른 문제는 정답 ' + mixedCorrect + '개, 오답 ' + mixedIncorrect + '개예요. 고민한 보기의 차이를 해설에서 짚어 보세요.');
  }
  if (unsure) {
    judgmentParts.push('자신감 1~2점으로 틀린 문제는 ' + unsure + '개예요. 풀이에 필요한 핵심 개념과 첫 단서부터 복습해 보세요.');
  }

  const first = totals.priorities[0];
  const plan = [first
    ? '‘' + first.concept + '’부터 보세요. 오답 ' + first.missed + '문제의 해설을 읽고 원본 자료에서 근거가 되는 부분을 찾아 표시해 보세요.'
    : wrongCount ? '첫 오답을 골라 내 답과 해설이 처음 갈라지는 곳을 찾아보세요.'
      : '가장 확신이 낮았던 문항을 골라 정답을 가린 채, 답을 고른 이유를 한 문장으로 설명해 보세요.'];
  const leadingReason = Object.entries(totals.mistakeCounts)
    .filter(([, count]) => count > 0).sort((left, right) => right[1] - left[1])[0];
  plan.push(leadingReason
    ? '기록한 오답 이유 중 ‘' + reasons[leadingReason[0]] + '’가 ' + leadingReason[1] + '건 있었어요. ' + practiceForMistake[leadingReason[0]]
    : '다음 문제에서는 어떤 조건이나 개념을 근거로 자신감을 골랐는지 한 줄 적어 보세요.');
  plan.push('같은 개념을 숫자나 조건이 바뀐 문제에 적용해 보고, 풀이의 어느 단계가 같고 어느 단계가 달라졌는지 비교하세요.');

  let retestText = wrongCount
    ? '아직 재검증 결과가 없어요. 오답 코칭과 해설을 본 뒤 ‘틀린 개념 다시 풀기’로 같은 개념을 확인할 수 있어요.'
    : '이번에는 첫 풀이를 모두 맞혔어요. 다음에는 같은 개념을 다른 상황에서 적용해 보세요.';
  if (retest) {
    retestText = retest.correct
      ? '재검증에서 ‘' + retest.concept + '’ 문항을 맞혔어요. 다음 복습에서도 같은 개념이 쓰이는 조건을 짧게 설명해 보세요.'
      : '재검증에서도 ‘' + retest.concept + '’ 문항을 틀렸어요. 해설을 보며 풀이가 달라진 단계에 표시하고, 짧은 예제로 그 단계를 다시 연습해 보세요.';
  }
  return { performance, judgment: judgmentParts.join(' '), plan, retest: retestText };
}
