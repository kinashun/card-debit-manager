# カード引き落とし管理

複数のクレジットカードの「今月の支払金額」「引き落とし日」「引き落とし口座 (金融機関)」を一括管理し、金融機関ごとに「今月いくら用意すればよいか」を表示する Web アプリケーション。

## 機能

- GitHub OAuth によるログイン (iron-session でセッション管理)
- 金融機関 (引き落とし口座) の登録・編集・削除
- カードの登録・編集・削除 (締め日 / 引き落とし日 / 引き落とし口座)
- 月ごとの支払金額の登録 (カード × 年月 で upsert)
- ダッシュボード
  - 金融機関ごとの今月の合計金額 (Bootstrap カードで表示)
  - カード別の内訳 (引き落とし日順)
  - 支払済み / 未払い のトグル (fetch による非同期更新)
- zod + @hono/zod-validator による入力バリデーション

## 使用技術

Hono / @hono/node-server / iron-session / @hono/oauth-providers (GitHub) / Prisma + PostgreSQL / zod / webpack + babel / Bootstrap / jQuery / Jest / Docker

## セットアップ

1. GitHub の Settings > Developer settings > OAuth Apps で OAuth App を作成する
   - Homepage URL: `http://localhost:3000`
   - Authorization callback URL: `http://localhost:3000/auth/github`
2. `.env` を作成して値を設定する

   ```
   cp .env.example .env
   ```

3. コンテナを起動する

   ```
   docker compose up -d --build
   ```

4. アプリのコンテナに入る

   ```
   docker compose exec app bash
   ```

5. コンテナ内で依存関係をインストールする

   ```
   npm install
   ```

6. データベースのマイグレーションを実行する (Prisma Client も生成される)

   ```
   npx prisma migrate dev --name init
   ```

7. クライアントサイドのビルド (Bootstrap と jQuery をバンドル)

   ```
   npm run build
   ```

8. サーバーを起動して http://localhost:3000/ にアクセスする

   ```
   npm start
   ```

## テスト

```
npm test
```

`src/format.test.js` に金額表記と年月文字列のユニットテストがある。ルートハンドラのテストを追加する場合は、授業の `app.test.js` (mockIronSession / sendFormRequest / sendJsonRequest) と同じパターンで書ける。

## セキュリティ上の設計

- **カード番号・セキュリティコード・口座番号は保存しない。** 保存するのはカードのニックネーム・金額・日付・金融機関名のみ。
- `SESSION_PASSWORD` は 32 文字以上 (iron-session の要件)。
- すべてのデータは `createdBy` でユーザーに紐づき、参照・更新・削除の前に本人確認を行う。
- URL パラメータ / フォーム / JSON は zod で検証し、不正な入力は 400 で弾く。
- Hono の `html` タグ付きテンプレートにより HTML エスケープが行われ、XSS を防ぐ。
- `secureHeaders()` ミドルウェアでセキュリティ関連ヘッダを付与。

## 公開するとき

- OAuth App の callback URL を公開 URL (`https://～/auth/github`) に変更する (開発用と本番用で OAuth App を分けるとよい)
- 環境変数 (`SESSION_PASSWORD` / `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` / `DATABASE_URL`) をホスティング側で設定する
- `NODE_ENV` を `production` にする (エラーページにスタックトレースが出なくなる)
- PostgreSQL が使えるホスティング (Render / Railway / Fly.io など) を選ぶ

## 補足

package.json のバージョンは目安。授業環境とバージョンを合わせたい場合は、教材の package.json に合わせて調整すること。
