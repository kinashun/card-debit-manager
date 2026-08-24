'use strict';

const { Hono } = require('hono');
const { logger } = require('hono/logger');
const { html } = require('hono/html');
const { HTTPException } = require('hono/http-exception');
const { secureHeaders } = require('hono/secure-headers');
const { env } = require('hono/adapter');
const { trimTrailingSlash } = require('hono/trailing-slash');
const { serveStatic } = require('@hono/node-server/serve-static');
const { githubAuth } = require('@hono/oauth-providers/github');
const { getIronSession } = require('iron-session');
const { PrismaClient } = require('@prisma/client');

const layout = require('./layout');
const indexRouter = require('./routes/index');
const banksRouter = require('./routes/banks');
const cardsRouter = require('./routes/cards');
const paymentsRouter = require('./routes/payments');

const prisma = new PrismaClient({ log: ['query'] });
const app = new Hono();

app.use(logger());
app.use(serveStatic({ root: './public' }));
app.use(secureHeaders());
app.use(trimTrailingSlash());

// セッション管理用のミドルウェア
app.use(async (c, next) => {
  const { SESSION_PASSWORD } = env(c);
  const session = await getIronSession(c.req.raw, c.res, {
    password: SESSION_PASSWORD,
    cookieName: 'session',
  });
  c.set('session', session);
  await next();
});

// GitHub 認証
app.use('/auth/github', async (c, next) => {
  const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } = env(c);
  const authHandler = githubAuth({
    client_id: GITHUB_CLIENT_ID,
    client_secret: GITHUB_CLIENT_SECRET,
    scope: ['read:user', 'user:email'],
    oauthApp: true,
  });
  return await authHandler(c, next).catch((error) => {
    console.error(error);
    return c.redirect('/login');
  });
});

// GitHub 認証の後の処理
app.get('/auth/github', async (c) => {
  const session = c.get('session');
  const user = c.get('user-github');
  session.user = user;
  await session.save();

  // ログインしたユーザーを users テーブルに保存 (外部キー用)
  const userId = parseInt(user.id, 10);
  await prisma.user.upsert({
    where: { userId },
    create: { userId, username: user.login },
    update: { username: user.login },
  });

  return c.redirect('/');
});

// ログイン
app.get('/login', (c) => {
  return c.html(
    layout(
      c,
      'ログイン',
      html`
        <h1>ログイン</h1>
        <p>
          <a class="btn btn-primary" href="/auth/github">GitHub でログイン</a>
        </p>
      `,
    ),
  );
});

// ログアウト
app.get('/logout', (c) => {
  const session = c.get('session');
  session.destroy();
  return c.redirect('/');
});

app.route('/', indexRouter);
app.route('/banks', banksRouter);
app.route('/cards', cardsRouter);
app.route('/payments', paymentsRouter);

app.notFound((c) => {
  return c.html(
    layout(
      c,
      'Not Found',
      html`
        <h1>Not Found</h1>
        <p>${c.req.url} の内容が見つかりませんでした。</p>
      `,
    ),
    404,
  );
});

app.onError((error, c) => {
  const statusCode = error instanceof HTTPException ? error.status : 500;
  const { NODE_ENV } = env(c);
  console.error(error);
  return c.html(
    layout(
      c,
      'Error',
      html`
        <h1>Error</h1>
        <h2>${error.name} (${statusCode})</h2>
        <p>${error.message}</p>
        ${NODE_ENV === 'development' ? html`<pre>${error.stack}</pre>` : ''}
      `,
    ),
    statusCode,
  );
});

module.exports = app;
