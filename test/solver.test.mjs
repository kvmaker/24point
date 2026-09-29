import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const match = html.match(/\/\/ ===== SOLVER START =====([\s\S]*?)\/\/ ===== SOLVER END =====/);
assert.ok(match, 'index.html 中未找到 SOLVER 标记');
const api = new Function(match[1] + '\nreturn { solve: solve, render: render };')();

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

test('括号只在必要时添加', () => {
  const classic = {
    op: '/',
    left: { num: 8 },
    right: { op: '-', left: { num: 3 }, right: { op: '/', left: { num: 8 }, right: { num: 3 } } }
  };
  assert.equal(api.render(classic), '8 ÷ (3 - 8 ÷ 3)');
  assert.equal(api.render({ op: '-', left: { op: '-', left: { num: 10 }, right: { num: 5 } }, right: { num: 2 } }), '10 - 5 - 2');
  assert.equal(api.render({ op: '-', left: { num: 10 }, right: { op: '-', left: { num: 5 }, right: { num: 2 } } }), '10 - (5 - 2)');
  assert.equal(api.render({ op: '*', left: { op: '+', left: { num: 1 }, right: { num: 2 } }, right: { num: 3 } }), '(1 + 2) × 3');
});

test('结果按长度升序、同长度按字典序排列', () => {
  const solutions = api.solve([2, 3, 4, 6]);
  const sorted = [...solutions].sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0));
  assert.deepEqual(solutions, sorted);
});
