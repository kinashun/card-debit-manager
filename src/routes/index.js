'use strict';

const { Hono } = require('hono');
const { html } = require('hono/html');
const { PrismaClient } = require('@prisma/client');
const layout = require('../layout');
const { formatYen, currentYearMonth } = require('../format');

const prisma = new PrismaClient({ log: ['query'] });
const app = new Hono();

app.get('/', async (c) => {
  const { user } = c.get('session') ?? {};

  // 未ログイン時はサービス紹介を表示
  if (!user) {
    return c.html(
      layout(
        c,
        null,
        html`
          <div class="my-3">
            <div class="p-5 bg-light rounded-3">
              <h1 class="text-body">カード引き落とし管理</h1>
              <p class="lead">
                複数のクレジットカードの支払金額・引き落とし日・引き落とし口座を一括管理し、
                金融機関ごとに「今月いくら用意すればよいか」がひと目でわかるサービスです。
              </p>
              <a class="btn btn-primary" href="/login">GitHub でログインして始める</a>
            </div>
          </div>
        `,
      ),
    );
  }

  const userId = parseInt(user.id, 10);
  const yearMonth = currentYearMonth();

  // 自分のカードを引き落とし日順に取得 (口座と今月の支払を結合)
  const cards = await prisma.card.findMany({
    where: { createdBy: userId },
    orderBy: { debitDay: 'asc' },
    include: {
      bank: true,
      payments: { where: { yearMonth } },
    },
  });

  // 金融機関ごとの合計 Map を作成 (key: bankId, value: { bankName, total, debitDays })
  const bankTotalMap = new Map();
  let grandTotal = 0;
  cards.forEach((card) => {
    const entry = bankTotalMap.get(card.bankId) ?? {
      bankName: card.bank.bankName,
      total: 0,
      debitDays: new Set(),
    };
    card.payments.forEach((payment) => {
      entry.total += payment.amount;
      grandTotal += payment.amount;
    });
    entry.debitDays.add(card.debitDay);
    bankTotalMap.set(card.bankId, entry);
  });
  const bankTotals = Array.from(bankTotalMap.values());

  return c.html(
    layout(
      c,
      `${yearMonth} の引き落とし`,
      html`
        <h3 class="my-3">
          ${yearMonth} の引き落とし合計: ${formatYen(grandTotal)}
        </h3>

        <div class="row">
          ${bankTotals.map(
            (bank) => html`
              <div class="col-md-4">
                <div class="card my-3">
                  <h5 class="card-header">${bank.bankName}</h5>
                  <div class="card-body">
                    <p class="card-text fs-4">${formatYen(bank.total)}</p>
                  </div>
                  <div class="card-footer">
                    引き落とし日: 毎月
                    ${Array.from(bank.debitDays)
                      .sort((a, b) => a - b)
                      .join(', ')}
                    日
                  </div>
                </div>
              </div>
            `,
          )}
        </div>

        <h3 class="my-3">カード別の内訳</h3>
        <table class="table align-middle">
          <tr>
            <th>引落日</th>
            <th>カード</th>
            <th>引き落とし口座</th>
            <th>今月の支払金額</th>
            <th>状態</th>
          </tr>
          ${cards.map((card) => {
            const payment = card.payments[0];
            const amount = payment ? payment.amount : 0;
            const isPaid = payment ? payment.isPaid : 0;
            return html`
              <tr>
                <td>${card.debitDay} 日</td>
                <td>${card.cardName}</td>
                <td>${card.bank.bankName}</td>
                <td>
                  <form method="post" action="/payments" class="d-flex">
                    <input type="hidden" name="cardId" value="${card.cardId}" />
                    <input
                      type="hidden"
                      name="yearMonth"
                      value="${yearMonth}"
                    />
                    <input
                      type="number"
                      name="amount"
                      value="${amount}"
                      min="0"
                      class="form-control me-2"
                      style="max-width: 10rem;"
                    />
                    <button type="submit" class="btn btn-outline-primary">
                      登録
                    </button>
                  </form>
                </td>
                <td>
                  ${payment
                    ? html`<button
                        class="paid-toggle-button btn ${isPaid
                          ? 'btn-success'
                          : 'btn-outline-secondary'}"
                        data-card-id="${card.cardId}"
                        data-year-month="${yearMonth}"
                      >
                        ${isPaid ? '支払済' : '未払い'}
                      </button>`
                    : html`<span class="text-muted">金額未登録</span>`}
                </td>
              </tr>
            `;
          })}
        </table>

        ${cards.length === 0
          ? html`<p>
              まだカードが登録されていません。まず
              <a href="/banks">金融機関</a> と <a href="/cards">カード</a>
              を登録してください。
            </p>`
          : ''}
      `,
    ),
  );
});

module.exports = app;
