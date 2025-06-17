// DOM要素
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const startTestButton = document.getElementById('startTest');
const uploadInfo = document.getElementById('uploadInfo');
const uploadStatusBadge = document.getElementById('uploadStatusBadge');
const uploadedFileName = document.getElementById('uploadedFileName');
const uploadedUrlCount = document.getElementById('uploadedUrlCount');

let urls = [];
let socket;
let socketId = null;

function setupFileUpload() {
    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropZone.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    });
    dropZone.addEventListener('click', () => {
        fileInput.click();
    });
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        e.target.value = '';   // ← ここを追加（同じファイルを再選択できるようにクリア）
        }
    });
}

async function handleFile(file) {
    const fileType = file.name.split('.').pop().toLowerCase();
    if (fileType !== 'txt' && fileType !== 'csv') {
        showUploadInfo(false, file.name, 0);
        showNotification('テキストファイル（.txt）またはCSVファイル（.csv）をアップロードしてください。', 'error');
        return;
    }
    try {
        const text = await file.text();
        urls = parseUrls(text, fileType);
        if (urls.length === 0) {
            showUploadInfo(false, file.name, 0);
            showNotification('有効なURLが見つかりませんでした。', 'error');
            return;
        }
        startTestButton.disabled = false;
        showUploadInfo(true, file.name, urls.length);
        showNotification(`${urls.length}個のURLを読み込みました。`);
    } catch (error) {
        console.error('ファイル読み込みエラー:', error);
        showUploadInfo(false, file.name, 0);
        showNotification('ファイルの読み込み中にエラーが発生しました。', 'error');
    }
}

function showUploadInfo(success, fileName, urlCount) {
    uploadInfo.classList.remove('hidden');
    uploadStatusBadge.textContent = success ? 'アップロード成功' : 'アップロード失敗';
    uploadStatusBadge.className = success
        ? 'inline-block px-2 py-1 rounded text-xs font-bold bg-green-100 text-green-700'
        : 'inline-block px-2 py-1 rounded text-xs font-bold bg-red-100 text-red-700';
    uploadedFileName.textContent = fileName ? `ファイル名: ${fileName}` : '';
    uploadedUrlCount.textContent = urlCount ? `URL数: ${urlCount}` : '';
}

function showNotification(message, type = 'success') {
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) existingNotification.remove();
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

document.addEventListener('DOMContentLoaded', () => {
    setupFileUpload();
    startTestButton.addEventListener('click', () => {
        console.log('テスト開始ボタンがクリックされました');
        console.log('アップロードされたURLリスト:', urls);
        showNotification('テストを開始します...', 'info');
        startTest();
    });

    // CSVエクスポートボタンのイベントリスナー
    document.getElementById('exportCsv').addEventListener('click', () => {
        if (window.currentResults && window.currentResults.length > 0) {
            exportToCsv(window.currentResults);
        } else {
            showNotification('エクスポートする結果がありません。', 'error');
        }
    });

    // JSONエクスポートボタンのイベントリスナー
    document.getElementById('exportJson').addEventListener('click', () => {
        if (window.currentResults && window.currentResults.length > 0) {
            exportToJson(window.currentResults);
        } else {
            showNotification('エクスポートする結果がありません。', 'error');
        }
    });

    // Socket.io初期化
    socket = io();
    socket.on('connect', () => {
        socketId = socket.id;
    });
    const statusLogArea = document.getElementById('statusLogArea');
    if (socket && statusLogArea) {
        socket.on('lh-status', msg => {
            const div = document.createElement('div');
            div.textContent = msg;
            statusLogArea.appendChild(div);
            statusLogArea.scrollTop = statusLogArea.scrollHeight;
        });
    }
});

async function startTest() {
    console.log('テスト開始処理を実行します');
    showNotification('テストを開始します...', 'info');
    const device = document.querySelector('input[name="device"]:checked').value;
    const delay = parseInt(document.getElementById('delay').value) || 1000;
    const results = [];
    const loadingOverlay = document.getElementById('loadingOverlay');
    const loadingStatus = document.getElementById('loadingStatus');
    const circleProgress = document.getElementById('circleProgress');
    if (circleProgress) drawCircleProgress(0);
    loadingOverlay.classList.remove('hidden');
    startTestButton.disabled = true;
    const statusLogArea = document.getElementById('statusLogArea');
    if (statusLogArea) statusLogArea.innerHTML = '';
    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        loadingStatus.textContent = `テスト中: ${i + 1}/${urls.length} - ${url}`;
        try {
            const response = await fetch('/api/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url, device, socketId })
            });
            const result = await response.json();
            results.push(result);
            console.log(`Lighthouseスコアを計測中: ${url}`, result);
        } catch (error) {
            console.error(`Error testing ${url}:`, error);
            results.push({
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
                status: 'error',
                error: error.message
            });
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        // プログレスバー更新
        if (circleProgress) drawCircleProgress((i + 1) / urls.length);
    }
    if (circleProgress) drawCircleProgress(1);
    loadingOverlay.classList.add('hidden');
    startTestButton.disabled = false;
    console.log('テスト結果:', results);
    showNotification('テストが完了しました。', 'success');
    
    // 結果をグローバル変数に保存（エクスポート用）
    window.currentResults = results;
    
    displayResults(results);
}

function displayResults(results) {
    const resultsTable = document.getElementById('resultsTable');
    resultsTable.innerHTML = '';
    results.forEach(result => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${result.url}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${result.performance}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${result.accessibility}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${result.bestPractices}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${result.seo}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${result.firstContentfulPaint}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${result.largestContentfulPaint}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${result.cumulativeLayoutShift}</td>
            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${result.status}</td>
        `;
        resultsTable.appendChild(row);
    });
    // グラフィカルなカード表示
    const visualResultsContainer = document.getElementById('visualResultsContainer');
    visualResultsContainer.classList.remove('hidden');
    const visualResultsList = document.getElementById('visualResultsList');
    visualResultsList.innerHTML = '';
    results.forEach(result => {
        visualResultsList.appendChild(createVisualResultCard(result));
    });

    // サマリー統計を更新
    updateSummaryStats(results);
}

function createVisualResultCard(result) {
    // スコア色分け
    function scoreColor(val) {
        if (val === 'N/A' || val === undefined) return '#d1d5db';
        if (typeof val === 'string') val = parseFloat(val);
        if (val >= 90) return '#22c55e'; // green
        if (val >= 70) return '#eab308'; // yellow
        if (val >= 50) return '#f97316'; // orange
        return '#ef4444'; // red
    }
    // 指標バー色分け
    function metricColor(metric, value) {
        if (value === 'N/A' || value === undefined) return '#d1d5db';
        value = parseFloat(value);
        switch (metric) {
            case 'LCP': return value <= 2.5 ? '#22c55e' : value <= 4.0 ? '#eab308' : '#ef4444';
            case 'INP': return value <= 200 ? '#22c55e' : value <= 500 ? '#eab308' : '#ef4444';
            case 'CLS': return value <= 0.1 ? '#22c55e' : value <= 0.25 ? '#eab308' : '#ef4444';
            case 'FCP': return value <= 1.8 ? '#22c55e' : value <= 3.0 ? '#eab308' : '#ef4444';
            case 'TTFB': return value <= 0.8 ? '#22c55e' : value <= 1.8 ? '#eab308' : '#ef4444';
            case 'TBT': return value <= 200 ? '#22c55e' : value <= 600 ? '#eab308' : '#ef4444';
            case 'SpeedIndex': return value <= 3.4 ? '#22c55e' : value <= 5.8 ? '#eab308' : '#ef4444';
            default: return '#d1d5db';
        }
    }
    // 指標の数値と単位を分離
    function parseMetric(val) {
        if (val === 'N/A' || val === undefined) return {num: 'N/A', unit: ''};
        const m = String(val).match(/([\d.]+)\s*(\w*)/);
        return m ? {num: m[1], unit: m[2] || ''} : {num: val, unit: ''};
    }
    // 合格/不合格
    const isPass = result.performance >= 90 && result.accessibility >= 90 && result.bestPractices >= 90 && result.seo >= 90;
    const safeId = encodeURIComponent(result.url);
    const card = document.createElement('div');
    card.className = 'bg-white rounded-xl shadow-lg p-8 mb-6 flex flex-col gap-4';
    card.innerHTML = `
      <div class="flex flex-wrap items-center gap-4 mb-2">
        <div class="font-bold text-lg break-all flex-1">${result.url}</div>
        <span class="inline-block px-4 py-1 rounded-full text-sm font-bold ${isPass ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}">
          ${isPass ? '合格' : '不合格'}
        </span>
        <span class="inline-block px-3 py-1 rounded-full text-xs font-bold ${result.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">
          ${result.status === 'success' ? '成功' : '失敗'}
        </span>
      </div>
      <div class="flex flex-wrap gap-8 items-center justify-between">
        <div class="flex gap-6 flex-wrap">
          <div class="flex flex-col items-center">
            <canvas id="chart-${safeId}-performance" width="70" height="70"></canvas>
            <div class="text-lg font-bold mt-1">${result.performance}</div>
            <div class="text-xs mt-1">パフォーマンス</div>
          </div>
          <div class="flex flex-col items-center">
            <canvas id="chart-${safeId}-accessibility" width="70" height="70"></canvas>
            <div class="text-lg font-bold mt-1">${result.accessibility}</div>
            <div class="text-xs mt-1">ユーザー補助</div>
          </div>
          <div class="flex flex-col items-center">
            <canvas id="chart-${safeId}-bestpractices" width="70" height="70"></canvas>
            <div class="text-lg font-bold mt-1">${result.bestPractices}</div>
            <div class="text-xs mt-1">おすすめの方法</div>
          </div>
          <div class="flex flex-col items-center">
            <canvas id="chart-${safeId}-seo" width="70" height="70"></canvas>
            <div class="text-lg font-bold mt-1">${result.seo}</div>
            <div class="text-xs mt-1">SEO</div>
          </div>
        </div>
        <div class="flex-1 min-w-[260px]">
          <div class="grid grid-cols-2 gap-2 text-sm">
            ${['LCP','INP','CLS','FCP','TTFB','TBT','SpeedIndex'].map(metric => {
                let val = '';
                switch(metric) {
                  case 'LCP': val = result.largestContentfulPaint; break;
                  case 'INP': val = result.interactionToNextPaint; break;
                  case 'CLS': val = result.cumulativeLayoutShift; break;
                  case 'FCP': val = result.firstContentfulPaint; break;
                  case 'TTFB': val = result.timeToFirstByte; break;
                  case 'TBT': val = result.totalBlockingTime; break;
                  case 'SpeedIndex': val = result.speedIndex; break;
                }
                const {num, unit} = parseMetric(val);
                return `<div class='flex items-center gap-2'>
                  <span class='font-bold w-20 text-xs'>${metric}</span>
                  <span class='text-lg font-mono' style='color:${metricColor(metric, num)}'>${num}</span>
                  <span class='text-xs'>${unit}</span>
                  <div class='flex-1 h-2 rounded bg-gray-200 ml-2'>
                    <div style='width:${num !== 'N/A' ? Math.min((metric==='CLS'?num*100:num*20),100):0}%;background:${metricColor(metric, num)}' class='h-2 rounded'></div>
                  </div>
                </div>`;
              }).join('')}
          </div>
        </div>
      </div>
    `;
    setTimeout(() => {
      drawDoughnut(`chart-${safeId}-performance`, result.performance);
      drawDoughnut(`chart-${safeId}-accessibility`, result.accessibility);
      drawDoughnut(`chart-${safeId}-bestpractices`, result.bestPractices);
      drawDoughnut(`chart-${safeId}-seo`, result.seo);
    }, 0);
    return card;
}

function drawDoughnut(canvasId, value) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (canvas.chartInstance) {
        canvas.chartInstance.destroy();
    }
    canvas.chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            datasets: [{
                data: [value, 100 - value],
                backgroundColor: [
                    value >= 90 ? '#22c55e' : value >= 70 ? '#eab308' : value >= 50 ? '#f97316' : '#ef4444',
                    '#e5e7eb'
                ],
                borderWidth: 0
            }]
        },
        options: {
            cutout: '80%',
            responsive: false,
            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            }
        }
    });
}

function parseUrls(text, fileType) {
    if (fileType === 'csv') {
        return text.split('\n').map(line => line.split(',')[0].trim()).filter(Boolean);
    } else {
        return text.split('\n').map(line => line.trim()).filter(Boolean);
    }
}

// CSVエクスポート機能
function exportToCsv(results) {
    const headers = [
        'URL',
        'タイムスタンプ',
        'パフォーマンス',
        'アクセシビリティ',
        'ベストプラクティス',
        'SEO',
        'First Contentful Paint',
        'Largest Contentful Paint',
        'Cumulative Layout Shift',
        'Speed Index',
        'Total Blocking Time',
        'Time to First Byte',
        'Interaction to Next Paint',
        'ステータス',
        'エラー'
    ];

    const csvContent = [
        headers.join(','),
        ...results.map(result => [
            `"${result.url}"`,
            `"${result.timestamp}"`,
            result.performance || 0,
            result.accessibility || 0,
            result.bestPractices || 0,
            result.seo || 0,
            `"${result.firstContentfulPaint || 'N/A'}"`,
            `"${result.largestContentfulPaint || 'N/A'}"`,
            `"${result.cumulativeLayoutShift || 'N/A'}"`,
            `"${result.speedIndex || 'N/A'}"`,
            `"${result.totalBlockingTime || 'N/A'}"`,
            `"${result.timeToFirstByte || 'N/A'}"`,
            `"${result.interactionToNextPaint || 'N/A'}"`,
            `"${result.status}"`,
            `"${result.error || ''}"`
        ].join(','))
    ].join('\n');

    downloadFile(csvContent, 'lighthouse-results.csv', 'text/csv');
    showNotification('CSVファイルをダウンロードしました。', 'success');
}

// JSONエクスポート機能
function exportToJson(results) {
    const jsonContent = JSON.stringify(results, null, 2);
    downloadFile(jsonContent, 'lighthouse-results.json', 'application/json');
    showNotification('JSONファイルをダウンロードしました。', 'success');
}

// ファイルダウンロード共通機能
function downloadFile(content, filename, contentType) {
    const blob = new Blob([content], { type: contentType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
}

// サマリー統計を更新
function updateSummaryStats(results) {
    const totalUrls = results.length;
    const successCount = results.filter(r => r.status === 'success').length;
    const failCount = totalUrls - successCount;
    
    const successResults = results.filter(r => r.status === 'success');

    // DOM要素を更新（基本統計）
    const totalUrlsEl = document.getElementById('totalUrls');
    const successCountEl = document.getElementById('successCount');
    const failCountEl = document.getElementById('failCount');

    if (totalUrlsEl) totalUrlsEl.textContent = totalUrls;
    if (successCountEl) successCountEl.textContent = successCount;
    if (failCountEl) failCountEl.textContent = failCount;

    // スコア分布を計算（全スコアを対象）
    let highScoreCount = 0;
    let mediumScoreCount = 0;
    let lowScoreCount = 0;
    let veryLowScoreCount = 0;

    // カテゴリ別問題数を計算
    let performanceIssues = 0;
    let accessibilityIssues = 0;
    let bestPracticesIssues = 0;
    let seoIssues = 0;

    successResults.forEach(result => {
        // 各カテゴリのスコアを確認してスコア分布に分類
        [result.performance, result.accessibility, result.bestPractices, result.seo].forEach(score => {
            if (score >= 90) highScoreCount++;
            else if (score >= 70) mediumScoreCount++;
            else if (score >= 50) lowScoreCount++;
            else veryLowScoreCount++;
        });

        // 問題のあるカテゴリをカウント
        if (result.performance < 90) performanceIssues++;
        if (result.accessibility < 90) accessibilityIssues++;
        if (result.bestPractices < 90) bestPracticesIssues++;
        if (result.seo < 90) seoIssues++;
    });

    // スコア分布の表示を更新
    const highScoreEl = document.getElementById('highScoreCount');
    const mediumScoreEl = document.getElementById('mediumScoreCount');
    const lowScoreEl = document.getElementById('lowScoreCount');
    const veryLowScoreEl = document.getElementById('veryLowScoreCount');

    if (highScoreEl) highScoreEl.textContent = highScoreCount;
    if (mediumScoreEl) mediumScoreEl.textContent = mediumScoreCount;
    if (lowScoreEl) lowScoreEl.textContent = lowScoreCount;
    if (veryLowScoreEl) veryLowScoreEl.textContent = veryLowScoreCount;

    // カテゴリ別問題数の表示を更新
    const performanceIssuesEl = document.getElementById('performanceIssues');
    const accessibilityIssuesEl = document.getElementById('accessibilityIssues');
    const bestPracticesIssuesEl = document.getElementById('bestPracticesIssues');
    const seoIssuesEl = document.getElementById('seoIssues');

    if (performanceIssuesEl) performanceIssuesEl.textContent = performanceIssues;
    if (accessibilityIssuesEl) accessibilityIssuesEl.textContent = accessibilityIssues;
    if (bestPracticesIssuesEl) bestPracticesIssuesEl.textContent = bestPracticesIssues;
    if (seoIssuesEl) seoIssuesEl.textContent = seoIssues;

    // 結果コンテナを表示
    const resultsContainer = document.getElementById('resultsContainer');
    if (resultsContainer) {
        resultsContainer.classList.remove('hidden');
    }
}

// 円形プログレスバー描画関数
function drawCircleProgress(percent) {
    const canvas = document.getElementById('circleProgress');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 34;
    const lineWidth = 8;
    // 背景円
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = lineWidth;
    ctx.stroke();
    // 進捗円
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, -0.5 * Math.PI, (2 * percent - 0.5) * Math.PI);
    ctx.strokeStyle = '#6366f1';
    ctx.lineWidth = lineWidth;
    ctx.stroke();
    // テキスト
    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = '#333';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(percent * 100) + '%', centerX, centerY);
} 