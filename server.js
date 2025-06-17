import express from 'express';
import cors from 'cors';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// ミドルウェアの設定
app.use(cors());
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// WebSocket接続の処理
io.on('connection', (socket) => {
    console.log('Client connected');
    
    socket.on('disconnect', () => {
        console.log('Client disconnected');
    });
});

// Lighthouseテストの実行
async function runLighthouse(url, device, socket, strictMode = false) {
    const chrome = await chromeLauncher.launch({
        chromeFlags: [
            '--headless',
            '--disable-gpu', 
            '--no-sandbox',
            '--disable-dev-shm-usage',        // メモリ使用量最適化
            '--disable-setuid-sandbox',       // セキュリティ最適化
            '--no-first-run',                 // 初回実行スキップ
            '--disable-default-apps',         // デフォルトアプリ無効
            '--disable-background-timer-throttling', // バックグラウンド最適化
            '--disable-renderer-backgrounding',
            '--disable-backgrounding-occluded-windows'
        ]
    });
    
    // strictMode時はより厳しい条件、falseの場合はPageSpeed Insights相当
    const throttlingConfig = strictMode ? {
        // より厳しい条件（実際の低速環境）
        rttMs: device === 'mobile' ? 300 : 40,
        throughputKbps: device === 'mobile' ? 819.2 : 5120,  // より遅い回線
        cpuSlowdownMultiplier: device === 'mobile' ? 6 : 2,   // より重いCPU制限
        requestLatencyMs: device === 'mobile' ? 300 : 0,
        downloadThroughputKbps: device === 'mobile' ? 819.2 : 5120,
        uploadThroughputKbps: device === 'mobile' ? 337.5 : 5120
    } : {
        // PageSpeed Insights相当（標準）
        rttMs: device === 'mobile' ? 150 : 40,
        throughputKbps: device === 'mobile' ? 1638.4 : 10240,
        cpuSlowdownMultiplier: device === 'mobile' ? 4 : 1,
        requestLatencyMs: device === 'mobile' ? 150 : 0,
        downloadThroughputKbps: device === 'mobile' ? 1638.4 : 10240,
        uploadThroughputKbps: device === 'mobile' ? 675 : 10240
    };
    
    const options = {
        logLevel: 'info',
        output: 'json',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
        port: chrome.port,
        formFactor: device === 'mobile' ? 'mobile' : 'desktop',
        throttling: throttlingConfig,
        screenEmulation: {
            mobile: device === 'mobile',
            width: device === 'mobile' ? 375 : 1350,
            height: device === 'mobile' ? 667 : 940,
            deviceScaleFactor: device === 'mobile' ? 2 : 1,
            disabled: false
        },
        emulatedFormFactor: device === 'mobile' ? 'mobile' : 'desktop',
        internalDisableDeviceScreenEmulation: false,
        channel: 'devtools'  // PageSpeed Insightsと同じチャンネル
    };
    
    // console.logをインターセプトしてLH:statusログをキャッチ
    const originalConsoleLog = console.log;
    const originalConsoleInfo = console.info;
    const logInterceptor = (...args) => {
        const message = args.join(' ');
        if (socket && message.includes('LH:')) {
            socket.emit('lh-status', message);
        }
        originalConsoleLog(...args);
    };
    const infoInterceptor = (...args) => {
        const message = args.join(' ');
        if (socket && message.includes('LH:')) {
            socket.emit('lh-status', message);
        }
        originalConsoleInfo(...args);
    };
    
    try {
        if (socket) socket.emit('lh-status', `LH: Status テスト開始: ${url}`);
        
        // console.logをインターセプト
        console.log = logInterceptor;
        console.info = infoInterceptor;
        
        const results = await lighthouse(url, options);
        const lhr = results.lhr;
        if (socket) socket.emit('lh-status', `LH: Status テスト完了: ${url}`);
        return {
            url,
            timestamp: new Date().toISOString(),
            performance: Math.round(lhr.categories.performance.score * 100),
            accessibility: Math.round(lhr.categories.accessibility.score * 100),
            bestPractices: Math.round(lhr.categories['best-practices'].score * 100),
            seo: Math.round(lhr.categories.seo.score * 100),
            firstContentfulPaint: `${(lhr.audits['first-contentful-paint'].numericValue / 1000).toFixed(1)} s`,
            largestContentfulPaint: `${(lhr.audits['largest-contentful-paint'].numericValue / 1000).toFixed(1)} s`,
            cumulativeLayoutShift: lhr.audits['cumulative-layout-shift'].numericValue.toFixed(2),
            speedIndex: `${(lhr.audits['speed-index'].numericValue / 1000).toFixed(1)} s`,
            totalBlockingTime: `${Math.round(lhr.audits['total-blocking-time'].numericValue)} ms`,
            interactionToNextPaint: lhr.audits['interaction-to-next-paint'] ? `${Math.round(lhr.audits['interaction-to-next-paint'].numericValue)} ms` : 'N/A',
            timeToFirstByte: lhr.audits['server-response-time'] ? `${(lhr.audits['server-response-time'].numericValue / 1000).toFixed(1)} s` : 'N/A',
            status: 'success'
        };
    } catch (error) {
        if (socket) socket.emit('lh-status', `LH: Status エラー: ${url} - ${error.message}`);
        console.error(`Error running Lighthouse for ${url}:`, error);
        throw error;
    } finally {
        // console.logを元に戻す
        console.log = originalConsoleLog;
        console.info = originalConsoleInfo;
        await chrome.kill();
    }
}

// APIエンドポイント
app.post('/api/test', async (req, res) => {
    const { url, device, socketId, strictMode = false } = req.body;
    
    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }
    
    // socketIdがあれば該当クライアントのsocketを取得
    let socket = null;
    if (socketId && io.sockets.sockets.get(socketId)) {
        socket = io.sockets.sockets.get(socketId);
    }
    try {
        const result = await runLighthouse(url, device || 'desktop', socket, strictMode);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: error.message,
            url,
            timestamp: new Date().toISOString(),
            performance: 0,
            accessibility: 0,
            bestPractices: 0,
            seo: 0,
            firstContentfulPaint: 'N/A',
            largestContentfulPaint: 'N/A',
            cumulativeLayoutShift: 'N/A',
            speedIndex: 'N/A',
            totalBlockingTime: 'N/A',
            interactionToNextPaint: 'N/A',
            timeToFirstByte: 'N/A',
            status: 'error'
        });
    }
});

// サーバーの起動
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 