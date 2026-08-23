'use strict';

const { formatYen, currentYearMonth } = require('./format');

describe('formatYen', () => {
  test('金額を3桁区切りの円表記にする', () => {
    expect(formatYen(1234567)).toBe('¥1,234,567');
  });

  test('0円も表記できる', () => {
    expect(formatYen(0)).toBe('¥0');
  });
});

describe('currentYearMonth', () => {
  test('YYYY-MM 形式の文字列を返す', () => {
    // 月は 0 始まりなので 8 は 9月
    expect(currentYearMonth(new Date(2026, 8, 15))).toBe('2026-09');
  });

  test('1桁の月は 0 埋めされる', () => {
    expect(currentYearMonth(new Date(2026, 0, 1))).toBe('2026-01');
  });
});
