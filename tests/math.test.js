import test from 'node:test';
import assert from 'node:assert/strict';
import katex from 'katex';
import { splitMath } from '../dist/math.js';

test('splits Korean prose, inline math and multiline display math', () => {
  const parts = splitMath(String.raw`함수 \(f(x)=x^2\)의 값을 구하세요.
\[\int_0^1 \frac{x}{2}\,dx\]`);
  assert.equal(parts[0].text, '함수 ');
  assert.deepEqual(parts.filter(part => part.type === 'math').map(({ formula, displayMode }) => [formula, displayMode]),
    [['f(x)=x^2', false], [String.raw`\int_0^1 \frac{x}{2}\,dx`, true]]);
  const output = katex.renderToString(parts.at(-1).formula, { displayMode: true, trust: false });
  assert.match(output, /<math\b.*display="block"/);
  assert.match(output, /<mfrac>/);
});

test('renders legacy function notation and does not misread code, currency or confidence scores', () => {
  const parts = splitMath('f(x)를 2x^-10 및 x²와 비교. 선택지: `operator[](i)`, $5 and $6, 4/5.');
  assert.deepEqual(parts.filter(part => part.type === 'math').map(part => part.formula), ['f(x)', '2x^{-10}', 'x^{2}']);
  assert.deepEqual(parts.find(part => part.type === 'code'), { type: 'code', text: 'operator[](i)' });
  assert.match(parts.at(-1).text, /\$5 and \$6, 4\/5/);
  assert.deepEqual(splitMath('$x$ $$y^2$$').filter(part => part.type === 'math').map(part => part.displayMode), [false, true]);
});
