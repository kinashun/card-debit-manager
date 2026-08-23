'use strict';

const { html } = require('hono/html');

function layout(c, title, body) {
  const { user } = c.get('session') ?? {};
  title = title ? `${title} - カード引き落とし管理` : 'カード引き落とし管理';
  return html`<!doctype html>
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${title}</title>
        <link rel="stylesheet" href="/stylesheets/bundle.css" />
      </head>
      <body>
        <nav class="navbar navbar-expand-md navbar-light bg-light">
          <div class="container-fluid">
            <a class="navbar-brand" href="/">カード引き落とし管理</a>
            <button
              class="navbar-toggler"
              type="button"
              data-bs-toggle="collapse"
              data-bs-target="#navbarResponsive"
              aria-controls="navbarResponsive"
              aria-expanded="false"
              aria-label="Toggle navigation"
            >
              <span class="navbar-toggler-icon"></span>
            </button>
            <div id="navbarResponsive" class="collapse navbar-collapse">
              <ul class="navbar-nav me-auto">
                ${user
                  ? html`
                      <li class="nav-item">
                        <a class="nav-link" href="/cards">カード管理</a>
                      </li>
                      <li class="nav-item">
                        <a class="nav-link" href="/banks">金融機関管理</a>
                      </li>
                    `
                  : ''}
              </ul>
              <ul class="navbar-nav ms-auto">
                ${user
                  ? html`<li class="nav-item">
                      <a class="nav-link" href="/logout">${user.login} をログアウト</a>
                    </li>`
                  : html`<li class="nav-item">
                      <a class="nav-link" href="/login">ログイン</a>
                    </li>`}
              </ul>
            </div>
          </div>
        </nav>
        <div class="container my-4">${body}</div>
        <script src="/javascripts/bundle.js"></script>
      </body>
    </html>`;
}

module.exports = layout;
