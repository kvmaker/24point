# 24 点求解器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个零依赖的单文件 Web 页面，输入 4 个 1–10 的数字，列出所有通过四则运算得到 24 的算式。

**Architecture:** 求解器用递归两两合并（4→3→2→1 个节点）枚举所有表达式树，值统一用有理数 `{n, d}` 表示；整数模式只是额外要求 `d === 1`。每棵表达式树被规范化成等价键（减法改写成「加负数」、除法改写成「乘倒数」，再摊平排序）后去重。引擎代码写在 `index.html` 内一对 `SOLVER` 注释标记之间，Node 测试脚本提取该段代码执行断言，因此无需构建步骤即可自动化测试。

**Tech Stack:** 原生 HTML/CSS/JavaScript（无任何依赖）；测试用 Node 内置 `node:test` + `node:assert`；浏览器验证用 Playwright。

**Spec:** `docs/superpowers/specs/2026-09-29-24point-design.md`

## Global Constraints

- 零外部依赖：禁止 CDN、框架、构建工具。
- 交付物是单个 `index.html`，内嵌 CSS 与 JS，双击即可在浏览器打开。
- 数字范围 1–10 的整数；界面上不出现 J / Q / K 等牌面符号。
- 目标值固定 24；仅支持 `+ - × ÷`。
- 「允许分数中间结果」开关默认关闭。
- 提交信息使用中文，格式为 `<类型>: <描述>`。

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `index.html` | 唯一交付物。内嵌 CSS、引擎（在 `SOLVER START/END` 标记之间）、UI 逻辑、页面自检 |
| `test/solver.test.mjs` | Node 测试：从 `index.html` 提取引擎代码并断言其行为 |
| `README.md` | 用法说明与算法简介 |

---

### Task 1: 测试脚手架 + 整数模式求解器

**Files:**
- Create: `index.html`（骨架：CSS 占位 + `SOLVER` 标记 + 空 body）
- Create: `test/solver.test.mjs`

**Interfaces:**
- Produces: `solve(nums, options) -> string[]`（初版不去重、不排序，返回渲染后的算式字符串）

- [ ] **Step 0: 创建开发分支**

```bash
git checkout -b feat/24point-solver
```

- [ ] **Step 1: 写失败测试**

`test/solver.test.mjs`：

```js
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/`
Expected: FAIL —— `index.html` 不存在，读取文件抛出 ENOENT。

- [ ] **Step 3: 写最小实现**

`index.html` 骨架，引擎放在标记之间：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>24 点求解器</title>
</head>
<body>
<script id="solver">
// ===== SOLVER START =====
function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a || 1;
}

function makeRat(n, d) {
  if (d === 0) return null;
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

function ratAdd(a, b) { return makeRat(a.n * b.d + b.n * a.d, a.d * b.d); }
function ratSub(a, b) { return makeRat(a.n * b.d - b.n * a.d, a.d * b.d); }
function ratMul(a, b) { return makeRat(a.n * b.n, a.d * b.d); }
function ratDiv(a, b) { return b.n === 0 ? null : makeRat(a.n * b.d, a.d * b.n); }

function combine(a, b, op, allowFraction) {
  const x = a.value;
  const y = b.value;
  let r = null;
  if (op === '+') r = ratAdd(x, y);
  else if (op === '-') r = ratSub(x, y);
  else if (op === '*') r = ratMul(x, y);
  else if (op === '/') r = ratDiv(x, y);
  if (!r) return null;
  if (!allowFraction && r.d !== 1) return null;
  return { value: r, expr: { op: op, left: a.expr, right: b.expr } };
}

function render(node) {
  if (node.num !== undefined) return String(node.num);
  const sym = { '+': '+', '-': '-', '*': '×', '/': '÷' }[node.op];
  return '(' + render(node.left) + ' ' + sym + ' ' + render(node.right) + ')';
}

function solve(nums, options) {
  const allowFraction = !!(options && options.allowFraction);
  const results = [];

  function walk(list) {
    if (list.length === 1) {
      const node = list[0];
      if (node.value.d === 1 && node.value.n === 24) results.push(node.expr);
      return;
    }
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const rest = list.filter(function (_, k) { return k !== i && k !== j; });
        const candidates = [
          combine(a, b, '+', allowFraction),
          combine(a, b, '*', allowFraction),
          combine(a, b, '-', allowFraction),
          combine(b, a, '-', allowFraction),
          combine(a, b, '/', allowFraction),
          combine(b, a, '/', allowFraction)
        ];
        for (let c = 0; c < candidates.length; c++) {
          if (candidates[c]) walk(rest.concat([candidates[c]]));
        }
      }
    }
  }

  walk(nums.map(function (v) { return { value: { n: v, d: 1 }, expr: { num: v } }; }));
  return results.map(render);
}
// ===== SOLVER END =====
</script>
</body>
</html>
```

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test test/`
Expected: 3 个测试 PASS。

- [ ] **Step 5: 提交**

```bash
git add index.html test/solver.test.mjs
git commit -m "feat: 实现整数模式的 24 点递归求解器"
```

---

### Task 2: 渲染的括号优化与结果排序

**Files:**
- Modify: `index.html`（`render` 函数与 `solve` 的返回值）

**Interfaces:**
- Consumes: `render(node) -> string`（Task 1）
- Produces: `render(node) -> string`（仅在必要时加括号）；`solve` 返回按「长度升序、长度相同按字典序」排序的数组

- [ ] **Step 1: 写失败测试**

在 `test/solver.test.mjs` 中追加（并把提取行改为 `return { solve: solve, render: render };`）：

```js
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/`
Expected: FAIL —— 第一条断言得到 `((8 ÷ ((3 - (8 ÷ 3)))))` 这类全括号串。

- [ ] **Step 3: 实现**

替换 `render`，并在 `solve` 的 `return` 处加排序：

```js
const PREC = { '+': 1, '-': 1, '*': 2, '/': 2 };
const SYMBOL = { '+': '+', '-': '-', '*': '×', '/': '÷' };

function renderOperand(node, parentPrec, isRight) {
  const childPrec = node.num !== undefined ? Infinity : PREC[node.op];
  const needParen = childPrec < parentPrec ||
    (childPrec === parentPrec && isRight && parentPrec <= 2);
  const text = render(node);
  return needParen ? '(' + text + ')' : text;
}

function render(node) {
  if (node.num !== undefined) return String(node.num);
  const prec = PREC[node.op];
  return renderOperand(node.left, prec, false) + ' ' + SYMBOL[node.op] + ' ' + renderOperand(node.right, prec, true);
}

function compareExpr(a, b) {
  return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
}
```

`solve` 末尾改为：`return results.map(render).sort(compareExpr);`

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test test/`
Expected: 全部 PASS（Task 1 的求值断言仍成立，因为括号变化不改变求值）。

- [ ] **Step 5: 提交**

```bash
git add index.html test/solver.test.mjs
git commit -m "feat: 算式渲染仅在必要时加括号，结果按长度与字典序排序"
```

---

### Task 3: 等价键去重

**Files:**
- Modify: `index.html`（新增 `addTerms` / `mulFactors` / `absorbNeg` / `invert` / `canonicalKey`，改 `solve`）
- Modify: `test/solver.test.mjs`

**Interfaces:**
- Consumes: `render(node) -> string`、`compareExpr(a, b) -> number`（Task 2）
- Produces: `canonicalKey(node) -> string`；`solve` 返回的数组中不存在互为交换律/结合律/移项重复的算式

- [ ] **Step 1: 写失败测试**

把提取行改为 `return { solve: solve, render: render, canonicalKey: canonicalKey };`，并追加：

```js
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
```

- [ ] **Step 2: 跑测试确认失败**

Run: `node --test test/`
Expected: FAIL —— `canonicalKey` 未定义。

- [ ] **Step 3: 实现**

在 `compareExpr` 之后插入：

```js
function addTerms(node) {
  if (node.num !== undefined) return [{ sign: 1, node: node }];
  if (node.op === '+') return addTerms(node.left).concat(addTerms(node.right));
  if (node.op === '-') {
    return addTerms(node.left).concat(addTerms(node.right).map(function (t) {
      return { sign: -t.sign, node: t.node };
    }));
  }
  return [{ sign: 1, node: node }];
}

function mulFactors(node) {
  if (node.num !== undefined) return [{ inv: false, node: node }];
  if (node.op === '*') return mulFactors(node.left).concat(mulFactors(node.right));
  if (node.op === '/') {
    return mulFactors(node.left).concat(mulFactors(node.right).map(function (f) {
      return { inv: !f.inv, node: f.node };
    }));
  }
  return [{ inv: false, node: node }];
}

function absorbNeg(node) {
  if (node.num !== undefined) return { num: -node.num };
  if (node.op === '*' || node.op === '/') {
    return { op: node.op, left: absorbNeg(node.left), right: node.right };
  }
  if (node.op === '+' || node.op === '-') return { negOf: node };
  return node;
}

function invert(node) {
  if (node.num !== undefined) return { invNum: node.num };
  return { invOf: node };
}

function canonicalKey(node) {
  if (node.invNum !== undefined) return 'inv(' + node.invNum + ')';
  if (node.invOf !== undefined) return 'inv(' + canonicalKey(node.invOf) + ')';
  if (node.negOf !== undefined) return 'neg(' + canonicalKey(node.negOf) + ')';

  const terms = addTerms(node);
  if (terms.length > 1 || terms[0].sign === -1) {
    const keys = terms.map(function (t) {
      return canonicalKey(t.sign === -1 ? absorbNeg(t.node) : t.node);
    });
    keys.sort();
    return '(+ ' + keys.join(' ') + ')';
  }

  const atom = terms[0].node;
  if (atom.num !== undefined) return String(atom.num);
  if (atom.op === '*' || atom.op === '/') {
    const keys = mulFactors(atom).map(function (f) {
      return canonicalKey(f.inv ? invert(f.node) : f.node);
    });
    keys.sort();
    return '(* ' + keys.join(' ') + ')';
  }
  return String(atom.num);
}
```

把 `solve` 中 `walk` 的终止分支改为去重版本：

```js
    if (list.length === 1) {
      const node = list[0];
      if (node.value.d === 1 && node.value.n === 24) {
        const key = canonicalKey(node.expr);
        if (!seen.has(key)) {
          seen.add(key);
          results.push(node.expr);
        }
      }
      return;
    }
```

并在 `const results = [];` 后加 `const seen = new Set();`。

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test test/`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add index.html test/solver.test.mjs
git commit -m "feat: 用规范化等价键消除交换律、结合律与移项造成的重复解"
```

---

### Task 4: 分数模式

**Files:**
- Modify: `index.html`（引擎已支持 `allowFraction`，本任务只需补测试；如发现缺口则修正引擎）
- Modify: `test/solver.test.mjs`

**Interfaces:**
- Consumes: `solve(nums, { allowFraction: boolean }) -> string[]`

- [ ] **Step 1: 写失败测试**

```js
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
```

- [ ] **Step 2: 跑测试确认当前状态**

Run: `node --test test/`
Expected: 若 `3 3 8 8` 的整数/分数断言或含 `0` 的除零断言失败，说明 Task 1 的引擎有缺口，在 Step 3 修。若 4 个测试全部直接 PASS，说明 Task 1 的实现已覆盖分数模式，跳过修改、执行 Step 3 的核对后直接提交。

- [ ] **Step 3: 核对 `allowFraction` 的传递链路**

引擎中三处决定分数模式是否生效，逐项确认：

1. `solve` 开头 `const allowFraction = !!(options && options.allowFraction);` —— 确认它把该值传给了 `combine`。
2. `combine` 中 `if (!allowFraction && r.d !== 1) return null;` —— 确认真值时放行非整数结果。
3. `ratDiv` 中 `b.n === 0 ? null : ...` —— 确认除零返回 `null`，使该分支被跳过。

若某处与上述不符则修正引擎；不要改测试去迁就实现。

- [ ] **Step 4: 跑测试确认通过**

Run: `node --test test/`
Expected: 全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add index.html test/solver.test.mjs
git commit -m "test: 覆盖分数模式与整数模式下经典牌组的有解性差异"
```

---

### Task 5: Web UI

**Files:**
- Modify: `index.html`（body 与 UI 脚本）

**Interfaces:**
- Consumes: `solve(nums, { allowFraction }) -> string[]`（Task 1–4）

- [ ] **Step 1: 写失败验证**

用 Playwright 打开 `file:///Users/maxyu/work/24point/index.html`，确认页面当前只有空白（无输入框）。

- [ ] **Step 2: 实现 body 与样式**

替换 `<body>` 中 solver 脚本之后的部分（保留 solver 脚本不变）：

```html
<main>
  <h1>24 点求解器</h1>
  <div class="inputs">
    <input class="num-input" type="number" min="1" max="10" step="1" aria-label="数字 1">
    <input class="num-input" type="number" min="1" max="10" step="1" aria-label="数字 2">
    <input class="num-input" type="number" min="1" max="10" step="1" aria-label="数字 3">
    <input class="num-input" type="number" min="1" max="10" step="1" aria-label="数字 4">
  </div>
  <div class="quick" id="quick"></div>
  <div class="actions">
    <button id="solve-btn" type="button">求解</button>
    <button id="random-btn" type="button">随机出题</button>
    <label><input id="allow-fraction" type="checkbox"> 允许分数中间结果</label>
  </div>
  <p class="error" id="error" hidden></p>
  <p class="count" id="count" hidden></p>
  <ol class="solutions" id="solutions"></ol>
</main>
```

在 solver 脚本之后新增 UI 脚本：

```html
<script>
const inputs = Array.from(document.querySelectorAll('.num-input'));
const quick = document.getElementById('quick');
const errorBox = document.getElementById('error');
const countBox = document.getElementById('count');
const listBox = document.getElementById('solutions');

for (let n = 1; n <= 10; n++) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = String(n);
  btn.addEventListener('click', function () {
    const empty = inputs.find(function (i) { return i.value.trim() === ''; });
    if (empty) empty.value = String(n);
  });
  quick.appendChild(btn);
}

function readInputs() {
  const values = inputs.map(function (i) { return i.value.trim(); });
  if (values.some(function (v) { return v === ''; })) return { error: '请填满 4 个数字' };
  const nums = values.map(Number);
  const bad = nums.some(function (v) { return !Number.isInteger(v) || v < 1 || v > 10; });
  return bad ? { error: '请输入 1–10 的整数' } : { nums: nums };
}

function show(text) {
  errorBox.textContent = text;
  errorBox.hidden = false;
}

document.getElementById('solve-btn').addEventListener('click', function () {
  const parsed = readInputs();
  if (parsed.error) {
    show(parsed.error);
    countBox.hidden = true;
    listBox.innerHTML = '';
    return;
  }
  errorBox.hidden = true;
  const solutions = solve(parsed.nums, { allowFraction: document.getElementById('allow-fraction').checked });
  countBox.hidden = false;
  listBox.innerHTML = '';
  if (solutions.length === 0) {
    countBox.textContent = '这组数字无解';
    return;
  }
  countBox.textContent = '共 ' + solutions.length + ' 种解法';
  for (const text of solutions) {
    const li = document.createElement('li');
    li.textContent = text;
    listBox.appendChild(li);
  }
});

document.getElementById('random-btn').addEventListener('click', function () {
  inputs.forEach(function (i) {
    i.value = String(Math.floor(Math.random() * 10) + 1);
  });
  errorBox.hidden = true;
});
</script>
```

样式（写入 `<head>` 的 `<style>`）：

```css
body { font-family: -apple-system, "PingFang SC", sans-serif; margin: 0; padding: 32px; background: #f6f7f9; color: #1f2328; }
main { max-width: 640px; margin: 0 auto; }
h1 { font-size: 22px; margin: 0 0 20px; }
.inputs { display: flex; gap: 8px; }
.num-input { width: 72px; padding: 10px; font-size: 18px; text-align: center; border: 1px solid #d0d7de; border-radius: 6px; }
.quick { display: flex; flex-wrap: wrap; gap: 6px; margin: 12px 0; }
.quick button { width: 34px; height: 34px; font-size: 14px; border: 1px solid #d0d7de; border-radius: 6px; background: #fff; cursor: pointer; }
.actions { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.actions button { padding: 8px 16px; font-size: 14px; border: 1px solid #d0d7de; border-radius: 6px; background: #fff; cursor: pointer; }
.error { color: #cf222e; }
.count { font-weight: 600; }
.solutions { line-height: 1.9; font-size: 16px; padding-left: 24px; }
```

- [ ] **Step 3: 用 Playwright 验证**

依次验证并逐项确认：
1. 打开页面，4 个输入框与 1–10 快捷按钮可见。
2. 输入 `3 3 8 8`，点「求解」→ 显示「这组数字无解」。
3. 勾选「允许分数中间结果」，再点「求解」→ 列表包含 `8 ÷ (3 - 8 ÷ 3)`。
4. 输入 `11` → 点求解 → 显示「请输入 1–10 的整数」。
5. 清空一个输入框 → 点求解 → 显示「请填满 4 个数字」。
6. 点「随机出题」→ 4 个框都填成 1–10 的数字。

- [ ] **Step 4: 提交**

```bash
git add index.html
git commit -m "feat: 添加输入、分数开关、随机出题与结果列表界面"
```

---

### Task 6: 页面自检与 README

**Files:**
- Modify: `index.html`（自检脚本）
- Create: `README.md`

**Interfaces:**
- Consumes: `solve(nums, { allowFraction }) -> string[]`
- Produces: `index.html#selftest` 页面内断言输出

- [ ] **Step 1: 写失败验证**

用 Playwright 打开 `file:///Users/maxyu/work/24point/index.html#selftest`，确认当前无任何自检输出。

- [ ] **Step 2: 实现自检**

在 UI 脚本之后追加：

```html
<script>
if (location.hash === '#selftest') {
  const checks = [
    ['3 3 8 8 整数模式无解', function () { return solve([3, 3, 8, 8]).length === 0; }],
    ['3 3 8 8 分数模式有解', function () { return solve([3, 3, 8, 8], { allowFraction: true }).includes('8 ÷ (3 - 8 ÷ 3)'); }],
    ['1 5 5 5 整数模式无解', function () { return solve([1, 5, 5, 5]).length === 0; }],
    ['1 5 5 5 分数模式有解', function () { return solve([1, 5, 5, 5], { allowFraction: true }).length > 0; }],
    ['4 4 10 10 两种模式均有解', function () { return solve([4, 4, 10, 10]).includes('(10 × 10 - 4) ÷ 4'); }],
    ['1 1 1 1 无解', function () { return solve([1, 1, 1, 1], { allowFraction: true }).length === 0; }],
    ['1 2 3 4 结果无重复', function () {
      const s = solve([1, 2, 3, 4]);
      return new Set(s).size === s.length && s.length > 0;
    }]
  ];
  const lines = checks.map(function (c) { return (c[1]() ? 'PASS  ' : 'FAIL  ') + c[0]; });
  const pre = document.createElement('pre');
  pre.textContent = lines.join('\n');
  document.body.appendChild(pre);
}
</script>
```

- [ ] **Step 3: 写 README.md**

内容包含：用途、打开方式（双击 `index.html`）、数字范围 1–10、分数开关的含义与为何 3 3 8 8 必须开它、算法说明（递归两两合并 + 等价键去重，并说明分配律等价不消除）、自检入口 `index.html#selftest`、测试命令 `node --test test/`。

- [ ] **Step 4: 验证**

1. Run: `node --test test/` → 全部 PASS。
2. Playwright 打开 `index.html#selftest` → 7 行全为 PASS。

- [ ] **Step 5: 提交**

```bash
git add index.html README.md
git commit -m "docs: 补充页面自检模式与 README"
```

- [ ] **Step 6: 合并回 master**

```bash
git checkout master && git merge --no-ff feat/24point-solver -m "merge: 合并 24 点求解器实现"
```
