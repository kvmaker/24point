import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const match = html.match(/\/\/ ===== SOLVER START =====([\s\S]*?)\/\/ ===== SOLVER END =====/);
assert.ok(match, 'index.html 中未找到 SOLVER 标记');
const api = new Function(match[1] + '\nreturn { solve: solve, render: render, canonicalKey: canonicalKey };')();

function valueOf(text) {
  return Function('return (' + text.replace(/×/g, '*').replace(/÷/g, '/') + ')')();
}

test('1 1 1 1 在整数模式下无解', () => {
  assert.deepEqual(api.solve([1, 1, 1, 1]), []);
});

test('1 2 3 4 有解，且每条算式求值均为 24', () => {
  const solutions = api.solve([1, 2, 3, 4]);
  assert.equal(solutions.length, 4);
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

test('交换律归一：a+b 与 b+a 同键', () => {
  const x = { op: '+', left: { num: 3 }, right: { num: 5 } };
  const y = { op: '+', left: { num: 5 }, right: { num: 3 } };
  assert.equal(api.canonicalKey(x), api.canonicalKey(y));
});

test('结合律归一：(a+b)+c 与 a+(b+c) 同键', () => {
  const x = { op: '+', left: { op: '+', left: { num: 1 }, right: { num: 2 } }, right: { num: 3 } };
  const y = { op: '+', left: { num: 1 }, right: { op: '+', left: { num: 2 }, right: { num: 3 } } };
  assert.equal(api.canonicalKey(x), api.canonicalKey(y));
});

test('移项归一：(a-b)+c 与 (a+c)-b 同键', () => {
  const x = { op: '+', left: { op: '-', left: { num: 9 }, right: { num: 4 } }, right: { num: 2 } };
  const y = { op: '-', left: { op: '+', left: { num: 9 }, right: { num: 2 } }, right: { num: 4 } };
  assert.equal(api.canonicalKey(x), api.canonicalKey(y));
});

test('约分位置归一：(a÷b)×c 与 (a×c)÷b 同键', () => {
  const x = { op: '*', left: { op: '/', left: { num: 8 }, right: { num: 3 } }, right: { num: 6 } };
  const y = { op: '/', left: { op: '*', left: { num: 8 }, right: { num: 6 } }, right: { num: 3 } };
  assert.equal(api.canonicalKey(x), api.canonicalKey(y));
});

test('负号不会在规范化中丢失', () => {
  const scaled = { op: '*', left: { op: '+', left: { num: 2 }, right: { num: 3 } }, right: { num: 4 } };
  const withMinus = { op: '-', left: { num: 9 }, right: scaled };
  const withoutMinus = { op: '+', left: { num: 9 }, right: scaled };
  assert.notEqual(api.canonicalKey(withMinus), api.canonicalKey(withoutMinus));
});

test('求解结果中不存在重复算式', () => {
  for (const nums of [[1, 2, 3, 4], [2, 2, 6, 6], [4, 4, 10, 10]]) {
    const solutions = api.solve(nums);
    assert.equal(new Set(solutions).size, solutions.length);
  }
});

test('镜像对（符号整体翻转）合并为一条：1 1 4 9', () => {
  // (1-4)×(1-9) 与 (4-1)×(9-1) 是同一个乘积思路，去重后只保留 1 条
  const solutions = api.solve([1, 1, 4, 9]);
  assert.equal(solutions.length, 1);
  // 两种写法的规范键必须相同
  const f1 = { op: '*', left: { op: '-', left: { num: 1 }, right: { num: 4 } }, right: { op: '-', left: { num: 1 }, right: { num: 9 } } };
  const f2 = { op: '*', left: { op: '-', left: { num: 4 }, right: { num: 1 } }, right: { op: '-', left: { num: 9 }, right: { num: 1 } } };
  assert.equal(api.canonicalKey(f1), api.canonicalKey(f2));
});

test('镜像对合并：1 7 9 10（奇数 flip 只翻一个因子时两种写法仍相同键）', () => {
  // (1-9)×(7-10) 与 (9-1)×(10-7) 应合并为 1 条
  assert.equal(api.solve([1, 7, 9, 10]).length, 1);
});

test('3 3 8 8：整数模式无解，分数模式给出 8 ÷ (3 - 8 ÷ 3)', () => {
  assert.deepEqual(api.solve([3, 3, 8, 8]), []);
  assert.ok(api.solve([3, 3, 8, 8], { allowFraction: true }).includes('8 ÷ (3 - 8 ÷ 3)'));
});

test('1 5 5 5：整数模式无解，分数模式有解', () => {
  assert.deepEqual(api.solve([1, 5, 5, 5]), []);
  assert.ok(api.solve([1, 5, 5, 5], { allowFraction: true }).length > 0);
});

test('4 4 10 10 两种模式均有解，且分数模式每条求值均为 24', () => {
  assert.ok(api.solve([4, 4, 10, 10]).includes('(10 × 10 - 4) ÷ 4'));
  const solutions = api.solve([4, 4, 10, 10], { allowFraction: true });
  assert.ok(solutions.length > 0);
  for (const text of solutions) {
    assert.ok(Math.abs(valueOf(text) - 24) < 1e-9, `${text} 求值不是 24`);
  }
});

test('除零不产生解', () => {
  for (const text of api.solve([5, 5, 5, 0], { allowFraction: true })) {
    assert.doesNotThrow(() => valueOf(text));
  }
});
