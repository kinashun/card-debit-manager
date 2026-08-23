'use strict';

// 金額を 3桁区切りの円表記にする
function formatYen(amount) {
  return `¥${amount.toLocaleString('ja-JP')}`;
}

// 現在の年月を "YYYY-MM" 形式で返す
function currentYearMonth(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

module.exports = { formatYen, currentYearMonth };
