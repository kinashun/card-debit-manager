'use strict';

const { Hono } = require('hono');
const { HTTPException } = require('hono/http-exception');
const { randomUUID } = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const { z } = require('zod');
const { zValidator } = require('@hono/zod-validator');
const ensureAuthenticated = require('../middlewares/ensure-authenticated');

const prisma = new PrismaClient({ log: ['query'] });
const app = new Hono();

app.use(ensureAuthenticated());

const yearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

// フォームのバリデーション (支払金額の登録)
const paymentFormValidator = zValidator(
  'form',
  z.object({
    cardId: z.string().uuid(),
    yearMonth: yearMonthSchema,
    amount: z.coerce.number().int().min(0),
  }),
  (result) => {
    if (!result.success) {
      throw new HTTPException(400, {
        message: '入力された情報が不十分または正しくありません',
      });
    }
  },
);

// JSON のバリデーション (支払済みトグル)
const paymentJsonValidator = zValidator(
  'json',
  z.object({
    cardId: z.string().uuid(),
    yearMonth: yearMonthSchema,
  }),
  (result, c) => {
    if (!result.success) {
      return c.json({ status: 'NG', errors: [result.error] }, 400);
    }
  },
);

// 支払金額の登録・更新 (カード × 年月 で upsert)
app.post('/', paymentFormValidator, async (c) => {
  const { user } = c.get('session');
  const userId = parseInt(user.id, 10);
  const { cardId, yearMonth, amount } = c.req.valid('form');

  // 自分のカードかどうかを確認
  const card = await prisma.card.findUnique({ where: { cardId } });
  if (!card || card.createdBy !== userId) {
    return c.notFound();
  }

  await prisma.payment.upsert({
    where: {
      paymentCompositeId: { cardId, yearMonth },
    },
    create: {
      paymentId: randomUUID(),
      cardId,
      yearMonth,
      amount,
    },
    update: { amount },
  });
  return c.redirect('/');
});

// 支払済み / 未払い のトグル (fetch から呼ばれる JSON API)
app.post('/toggle-paid', paymentJsonValidator, async (c) => {
  const { user } = c.get('session');
  const userId = parseInt(user.id, 10);
  const { cardId, yearMonth } = c.req.valid('json');

  const card = await prisma.card.findUnique({ where: { cardId } });
  if (!card || card.createdBy !== userId) {
    return c.json({ status: 'NG', errors: [{ msg: 'カードが不正です。' }] }, 403);
  }

  const payment = await prisma.payment.findUnique({
    where: { paymentCompositeId: { cardId, yearMonth } },
  });
  if (!payment) {
    return c.json(
      { status: 'NG', errors: [{ msg: '支払金額が未登録です。' }] },
      404,
    );
  }

  const isPaid = payment.isPaid ? 0 : 1;
  try {
    await prisma.payment.update({
      where: { paymentCompositeId: { cardId, yearMonth } },
      data: { isPaid },
    });
  } catch (error) {
    console.error(error);
    return c.json(
      { status: 'NG', errors: [{ msg: 'データベース エラー。' }] },
      500,
    );
  }
  return c.json({ status: 'OK', isPaid });
});

module.exports = app;
