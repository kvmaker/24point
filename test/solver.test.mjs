import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const match = html.match(/\/\/ ===== SOLVER START =====([\s\S]*?)\/\/ ===== SOLVER END =====/);
assert.ok(match, 'index.html 中未找到 SOLVER 标记');
const api = new Function(match[1] + '\nreturn { solve: solve };')();

function valueOf(text) {
  return Function('return (' + text.replace(/×/g, '*').replace(/÷/g, '/') + ')')();
}

test('1 1 1 1 在整数模式下无解', () => {
  assert.deepEqual(api.solve([1, 1, 1, 1]), []);
});

test('1 2 3 4 有解，且每条算式求值均为 24', () => {
  const solutions = api.solve([1, 2, 3, 4]);
  assert.ok(solutions.length > 0);
  for (const text of solutions) {
    assert.ok(Math.abs(valueOf(text) - 24) < 1e-9, `${text} 求值不是 24`);
  }
});

test('2 3 4 6 有解', () => {
  assert.ok(api.solve([2, 3, 4, 6]).length > 0);
});
