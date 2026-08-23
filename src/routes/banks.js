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
const bankFormValidator = zValidator(
  'form',
  z.object({
    bankName: z.string().min(1).max(255),
    memo: z.string().max(1000),
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
const bankIdValidator = zValidator(
  'param',
  z.object({ bankId: z.string().uuid() }),
  (result) => {
    if (!result.success) {
      throw new HTTPException(400, {
        message: 'URL の形式が正しくありません。',
      });
    }
  },
);

// 自分が作成したデータかどうか
function isMine(userId, record) {
  return Boolean(record) && record.createdBy === userId;
}

// 金融機関の一覧と登録フォーム
app.get('/', async (c) => {
  const { user } = c.get('session');
  const userId = parseInt(user.id, 10);
  const banks = await prisma.bank.findMany({
    where: { createdBy: userId },
    orderBy: { bankName: 'asc' },
    include: { cards: true },
  });
  return c.html(
    layout(
      c,
      '金融機関管理',
      html`
        <h3 class="my-3">金融機関の登録</h3>
        <form method="post" action="/banks">
          <div class="mb-3">
            <h5>金融機関名</h5>
            <input
              type="text"
              name="bankName"
              class="form-control"
              placeholder="例: ○○銀行"
            />
          </div>
          <div class="mb-3">
            <h5>メモ</h5>
            <textarea
              name="memo"
              class="form-control"
              placeholder="支店名など (口座番号は入力しないでください)"
            ></textarea>
          </div>
          <button type="submit" class="btn btn-primary">登録する</button>
        </form>

        <h3 class="my-3">金融機関一覧</h3>
        <table class="table align-middle">
          <tr>
            <th>金融機関名</th>
            <th>メモ</th>
            <th>紐づくカード数</th>
            <th></th>
          </tr>
          ${banks.map(
            (bank) => html`
              <tr>
                <td>${bank.bankName}</td>
                <td style="white-space: pre;">${bank.memo}</td>
                <td>${bank.cards.length}</td>
                <td>
                  <a
                    class="btn btn-sm btn-outline-primary"
                    href="/banks/${bank.bankId}/edit"
                    >編集</a
                  >
                  <form
                    method="post"
                    action="/banks/${bank.bankId}/delete"
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

// 金融機関の作成
app.post('/', bankFormValidator, async (c) => {
  const { user } = c.get('session');
  const { bankName, memo } = c.req.valid('form');
  await prisma.bank.create({
    data: {
      bankId: randomUUID(),
      bankName,
      memo,
      createdBy: parseInt(user.id, 10),
    },
  });
  return c.redirect('/banks');
});

// 金融機関の編集フォーム
app.get('/:bankId/edit', bankIdValidator, async (c) => {
  const { user } = c.get('session');
  const userId = parseInt(user.id, 10);
  const { bankId } = c.req.valid('param');
  const bank = await prisma.bank.findUnique({ where: { bankId } });
  if (!isMine(userId, bank)) {
    return c.notFound();
  }
  return c.html(
    layout(
      c,
      `金融機関の編集: ${bank.bankName}`,
      html`
        <h3 class="my-3">金融機関の編集</h3>
        <form method="post" action="/banks/${bank.bankId}/update">
          <div class="mb-3">
            <h5>金融機関名</h5>
            <input
              type="text"
              name="bankName"
              class="form-control"
              value="${bank.bankName}"
            />
          </div>
          <div class="mb-3">
            <h5>メモ</h5>
            <textarea name="memo" class="form-control">${bank.memo}</textarea>
          </div>
          <button type="submit" class="btn btn-primary">
            以上の内容で更新する
          </button>
        </form>
      `,
    ),
  );
});

// 金融機関の更新
app.post('/:bankId/update', bankIdValidator, bankFormValidator, async (c) => {
  const { user } = c.get('session');
  const userId = parseInt(user.id, 10);
  const { bankId } = c.req.valid('param');
  const { bankName, memo } = c.req.valid('form');
  const bank = await prisma.bank.findUnique({ where: { bankId } });
  if (!isMine(userId, bank)) {
    return c.notFound();
  }
  await prisma.bank.update({
    where: { bankId },
    data: { bankName, memo },
  });
  return c.redirect('/banks');
});

// 金融機関の削除 (カードが紐づいている場合は削除不可)
app.post('/:bankId/delete', bankIdValidator, async (c) => {
  const { user } = c.get('session');
  const userId = parseInt(user.id, 10);
  const { bankId } = c.req.valid('param');
  const bank = await prisma.bank.findUnique({
    where: { bankId },
    include: { cards: true },
  });
  if (!isMine(userId, bank)) {
    return c.notFound();
  }
  if (bank.cards.length > 0) {
    throw new HTTPException(400, {
      message:
        'この金融機関を引き落とし口座にしているカードがあるため削除できません。先にカードを削除するか、カードの口座を変更してください。',
    });
  }
  await prisma.bank.delete({ where: { bankId } });
  return c.redirect('/banks');
});

module.exports = app;
