'use strict';

const { Hono } = require('hono');
const { html } = require('hono/html');
const { HTTPException } = require('hono/http-exception');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');
const { zValidator } = require('@hono/zod-validator');
const layout = require('../layout');
const ensureAuthenticated = require('../middlewares/ensure-authenticated');

const prisma = new PrismaClient({ log: ['query'] });
const app = new Hono();

app.use(ensureAuthenticated());

// フォームのバリデーション
const cardFormValidator = zValidator(
  'form',
  z.object({
    cardName: z.string().min(1).max(255),
    closingDay: z.coerce.number().int().min(1).max(31),
    debitDay: z.coerce.number().int().min(1).max(31),
    bankId: z.string().uuid(),
  }),
  (result) => {
    if (!result.success) {
      throw new HTTPException(400, {
        message: '入力された情報が不十分または正しくありません',
      });
    }
  },
);

// URL パラメータのバリデーション
const cardIdValidator = zValidator(
  'param',
  z.object({ cardId: z.string().uuid() }),
  (result) => {
    if (!result.success) {
      throw new HTTPException(400, {
        message: 'URL の形式が正しくありません。',
      });
    }
  },
);

function isMine(userId, record) {
  return Boolean(record) && record.createdBy === userId;
}

// カードに紐づく支払データごとカードを削除する
async function deleteCardAggregate(cardId) {
  await prisma.payment.deleteMany({ where: { cardId } });
  await prisma.card.delete({ where: { cardId } });
}
app.deleteCardAggregate = deleteCardAggregate;

// 口座の選択肢
function bankOptions(banks, selectedBankId) {
  return banks.map(
    (bank) =>
      html`<option
        value="${bank.bankId}"
        ${bank.bankId === selectedBankId ? 'selected' : ''}
      >
        ${bank.bankName}
      </option>`,
  );
}

// カードの一覧と登録フォーム
app.get('/', async (c) => {
  const { user } = c.get('session');
  const userId = parseInt(user.id, 10);
  const banks = await prisma.bank.findMany({
    where: { createdBy: userId },
    orderBy: { bankName: 'asc' },
  });
  const cards = await prisma.card.findMany({
    where: { createdBy: userId },
    orderBy: { debitDay: 'asc' },
    include: { bank: true },
  });
  return c.html(
    layout(
      c,
      'カード管理',
      html`
        <h3 class="my-3">カードの登録</h3>
        ${banks.length === 0
          ? html`<p>
              先に <a href="/banks">金融機関</a>
              を登録してください。カードの引き落とし口座として必要です。
            </p>`
          : html`
              <form method="post" action="/cards">
                <div class="mb-3">
                  <h5>カード名</h5>
                  <input
                    type="text"
                    name="cardName"
                    class="form-control"
                    placeholder="例: ○○カード (カード番号は入力しないでください)"
                  />
                </div>
                <div class="row">
                  <div class="col-md-4 mb-3">
                    <h5>締め日 (毎月)</h5>
                    <input
                      type="number"
                      name="closingDay"
                      min="1"
                      max="31"
                      class="form-control"
                      placeholder="例: 15"
                    />
                  </div>
                  <div class="col-md-4 mb-3">
                    <h5>引き落とし日 (毎月)</h5>
                    <input
                      type="number"
                      name="debitDay"
                      min="1"
                      max="31"
                      class="form-control"
                      placeholder="例: 10"
                    />
                  </div>
                  <div class="col-md-4 mb-3">
                    <h5>引き落とし口座</h5>
                    <select name="bankId" class="form-select">
                      ${bankOptions(banks, null)}
                    </select>
                  </div>
                </div>
                <button type="submit" class="btn btn-primary">登録する</button>
              </form>
            `}

        <h3 class="my-3">カード一覧</h3>
        <table class="table align-middle">
          <tr>
            <th>カード名</th>
            <th>締め日</th>
            <th>引き落とし日</th>
            <th>引き落とし口座</th>
            <th></th>
          </tr>
          ${cards.map(
            (card) => html`
              <tr>
                <td>${card.cardName}</td>
                <td>${card.closingDay} 日</td>
                <td>${card.debitDay} 日</td>
                <td>${card.bank.bankName}</td>
                <td>
                  <a
                    class="btn btn-sm btn-outline-primary"
                    href="/cards/${card.cardId}/edit"
                    >編集</a
                  >
                  <form
                    method="post"
                    action="/cards/${card.cardId}/delete"
                    class="d-inline"
                  >
                    <button type="submit" class="btn btn-sm btn-outline-danger">
                      削除
                    </button>
                  </form>
                </td>
              </tr>
            `,
          )}
        </table>
      `,
    ),
  );
});

// カードの作成
app.post('/', cardFormValidator, async (c) => {
  const { user } = c.get('session');
  const userId = parseInt(user.id, 10);
  const { cardName, closingDay, debitDay, bankId } = c.req.valid('form');

  // 指定された口座が自分のものかを確認
  const bank = await prisma.bank.findUnique({ where: { bankId } });
  if (!isMine(userId, bank)) {
    return c.notFound();
  }

  await prisma.card.create({
    data: {
      cardId: randomUUID(),
      cardName,
      closingDay,
      debitDay,
      bankId,
      createdBy: userId,
    },
  });
  return c.redirect('/cards');
});

// カードの編集フォーム
app.get('/:cardId/edit', cardIdValidator, async (c) => {
  const { user } = c.get('session');
  const userId = parseInt(user.id, 10);
  const { cardId } = c.req.valid('param');
  const card = await prisma.card.findUnique({ where: { cardId } });
  if (!isMine(userId, card)) {
    return c.notFound();
  }
  const banks = await prisma.bank.findMany({
    where: { createdBy: userId },
    orderBy: { bankName: 'asc' },
  });
  return c.html(
    layout(
      c,
      `カードの編集: ${card.cardName}`,
      html`
        <h3 class="my-3">カードの編集</h3>
        <form method="post" action="/cards/${card.cardId}/update">
          <div class="mb-3">
            <h5>カード名</h5>
            <input
              type="text"
              name="cardName"
              class="form-control"
              value="${card.cardName}"
            />
          </div>
          <div class="row">
            <div class="col-md-4 mb-3">
              <h5>締め日 (毎月)</h5>
              <input
                type="number"
                name="closingDay"
                min="1"
                max="31"
                class="form-control"
                value="${card.closingDay}"
              />
            </div>
            <div class="col-md-4 mb-3">
              <h5>引き落とし日 (毎月)</h5>
              <input
                type="number"
                name="debitDay"
                min="1"
                max="31"
                class="form-control"
                value="${card.debitDay}"
              />
            </div>
            <div class="col-md-4 mb-3">
              <h5>引き落とし口座</h5>
              <select name="bankId" class="form-select">
                ${bankOptions(banks, card.bankId)}
              </select>
            </div>
          </div>
          <button type="submit" class="btn btn-primary">
            以上の内容で更新する
          </button>
        </form>
      `,
    ),
  );
});

// カードの更新
app.post('/:cardId/update', cardIdValidator, cardFormValidator, async (c) => {
  const { user } = c.get('session');
  const userId = parseInt(user.id, 10);
  const { cardId } = c.req.valid('param');
  const { cardName, closingDay, debitDay, bankId } = c.req.valid('form');

  const card = await prisma.card.findUnique({ where: { cardId } });
  if (!isMine(userId, card)) {
    return c.notFound();
  }
  const bank = await prisma.bank.findUnique({ where: { bankId } });
  if (!isMine(userId, bank)) {
    return c.notFound();
  }

  await prisma.card.update({
    where: { cardId },
    data: { cardName, closingDay, debitDay, bankId },
  });
  return c.redirect('/cards');
});

// カードの削除 (支払データごと削除)
app.post('/:cardId/delete', cardIdValidator, async (c) => {
  const { user } = c.get('session');
  const userId = parseInt(user.id, 10);
  const { cardId } = c.req.valid('param');
  const card = await prisma.card.findUnique({ where: { cardId } });
  if (!isMine(userId, card)) {
    return c.notFound();
  }
  await deleteCardAggregate(cardId);
  return c.redirect('/cards');
});

module.exports = app;
