# Lighthouse Bulk Tester

複数のウェブサイトのGoogle Lighthouseスコアを一括で測定するためのツールです。

## 機能

- モダンなWebインターフェース
- テキストファイル（.txt）とCSVファイル（.csv）のサポート
- デスクトップ/モバイルの切り替え
- 詳細なパフォーマンスメトリクス
- 結果のCSV/JSONエクスポート

## 必要条件

- Node.js 18以上
- Google Chrome
- Docker（Dockerを使用する場合）

## 使用方法

### 方法1: ローカルで実行

1. リポジトリをクローン：
```bash
git clone https://github.com/yourusername/lighthouse-bulk-tester.git
cd lighthouse-bulk-tester
```

2. 依存関係をインストール：
```bash
npm install
```

3. サーバーを起動：
```bash
npm start
```

4. ブラウザでアクセス：
```
http://localhost:3000
```

### 方法2: Dockerを使用

1. DockerとDocker Composeをインストール

2. リポジトリをクローン：
```bash
git clone https://github.com/yourusername/lighthouse-bulk-tester.git
cd lighthouse-bulk-tester
```

3. コンテナを起動：
```bash
docker-compose up -d
```

4. ブラウザでアクセス：
```
http://localhost:3000
```

## URLリストの形式

### テキストファイル（.txt）
```
https://example.com
https://example.org
# コメント行は無視されます
https://example.net
```

### CSVファイル（.csv）
```
url,description
https://example.com,Example Site
https://example.org,Another Site
```

## 配布方法

### 1. Dockerイメージとして配布

1. Dockerイメージをビルド：
```bash
docker build -t lighthouse-bulk-tester .
```

2. イメージをエクスポート：
```bash
docker save lighthouse-bulk-tester > lighthouse-bulk-tester.tar
```

3. イメージをインポート：
```bash
docker load < lighthouse-bulk-tester.tar
```

4. コンテナを起動：
```bash
docker-compose up -d
```

### 2. ソースコードとして配布

1. リポジトリをクローン：
```bash
git clone https://github.com/tomono8/lighthouse-bulk-tester.git
```

2. 依存関係をインストール：
```bash
npm install
```

3. サーバーを起動：
```bash
npm start
```

## トラブルシューティング

### Chromeの起動エラー

- Chromeがインストールされていることを確認
- システムの要件を満たしていることを確認

### パーミッションエラー（macOS）

```bash
chmod +x node_modules/chrome-launcher/chrome-launcher.js
```

### ポートが使用中

別のポートを指定：
```bash
PORT=3001 npm start
```

### Windowsでの注意点・対処法

- **PowerShellやコマンドプロンプトでのパス指定に注意**
  - パスの区切りは `\`（バックスラッシュ）を使用してください。
- **Chromeのパスが見つからない場合**
  - Chromeが標準以外の場所にインストールされている場合、`chrome-launcher`のパス解決に失敗することがあります。
  - その場合は `CHROME_PATH` 環境変数を設定してください。
    例：
    ```powershell
    $env:CHROME_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
    npm start
    ```
- **ファイルの文字コード**
  - URLリストファイルはUTF-8で保存してください。
- **ファイアウォールやセキュリティソフト**
  - ポート3000番の通信がブロックされていないか確認してください。 

## ライセンス

MIT 

## ポイント
このツールは、より厳しい条件下での測定です。実際のユーザー環境（低速回線・低スペック端末）を想定した場合の性能を確認できます。