'use strict';

import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap';
import $ from 'jquery';

// 支払済み / 未払い のトグルボタン
$('.paid-toggle-button').each((i, e) => {
  const button = $(e);
  button.on('click', () => {
    const cardId = button.data('card-id');
    const yearMonth = button.data('year-month');
    fetch('/payments/toggle-paid', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId, yearMonth }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.status !== 'OK') {
          console.error(data.errors);
          return;
        }
        button.text(data.isPaid ? '支払済' : '未払い');
        button.toggleClass('btn-success', data.isPaid === 1);
        button.toggleClass('btn-outline-secondary', data.isPaid !== 1);
      });
  });
});
