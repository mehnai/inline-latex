const { test } = require('node:test');
const assert = require('node:assert/strict');
const { inkBounds, contentScale, transparentPaper } = require('../src/pdf-layout');

test('crop includes colored figures as well as text, with padding', () => {
  const data = new Uint8ClampedArray(100 * 100 * 4).fill(255);
  for (const [x, y] of [[30, 40], [60, 70]]) {
    const i = (y * 100 + x) * 4;
    data[i] = 255; data[i + 1] = 0; data[i + 2] = 0;
  }
  assert.deepEqual(inkBounds({ data, width: 100, height: 100 }, 5), { x: 25, y: 35, width: 41, height: 41 });
});
test('blank page produces a minimal empty area', () => {
  assert.deepEqual(inkBounds({ data: new Uint8ClampedArray(400).fill(255), width: 10, height: 10 }), { x: 0, y: 0, width: 1, height: 1 });
});
test('short snippets keep natural size; wide content fits the note', () => {
  assert.equal(contentScale({ width: 100 }, 700), 1.6);
  assert.equal(contentScale({ width: 100 }, 700, 2), 3.2);
  assert.equal(contentScale({ width: 1000 }, 700), 0.7);
});
test('paper becomes genuinely transparent while black and colored ink remain', () => {
  const data = new Uint8ClampedArray([255,255,255,255, 0,0,0,255, 255,0,0,255, 128,128,128,255]);
  transparentPaper({ data });
  assert.equal(data[3], 0);
  assert.deepEqual([...data.slice(4, 12)], [0,0,0,255,255,0,0,255]);
  assert.deepEqual([...data.slice(12)], [0,0,0,127]);
});
