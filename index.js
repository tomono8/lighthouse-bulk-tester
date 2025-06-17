#!/usr/bin/env node

import fs from 'fs-extra';
import path from 'path';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { Command } from 'commander';
import csv from 'csv-parser';
import { createObjectCsvWriter as createCsvWriter } from 'csv-writer';
import chalk from 'chalk';
import ora from 'ora';

const program = new Command();

// CLIの設定
program
  .name('lighthouse-bulk')
  .description('Bulk Google Lighthouse testing tool for multiple websites')
  .version('1.0.0')
  .option('-i, --input <file>', 'Input file containing URLs (txt or csv)', 'urls.txt')
  .option('-o, --output <file>', 'Output CSV file', 'lighthouse-results.csv')
  .option('-c, --config <config>', 'Lighthouse configuration', 'performance')
  .option('--mobile', 'Test mobile performance (default: desktop)')
  .option('--delay <ms>', 'Delay between tests in milliseconds', '1000')
  .parse();

const options = program.opts();

// Lighthouseの設定
const lighthouseConfig = {
  extends: 'lighthouse:default',
  settings: {
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
    formFactor: options.mobile ? 'mobile' : 'desktop',
    screenEmulation: options.mobile ? {
      mobile: true,
      width: 375,
      height: 667,
      deviceScaleFactor: 2,
      disabled: false,
    } : {
      mobile: false,
      width: 1350,
      height: 940,
      deviceScaleFactor: 1,
      disabled: false,
    }
  }
};

// URLを読み込む関数
async function loadUrls(inputFile) {
  const urls = [];
  const ext = path.extname(inputFile).toLowerCase();
  
  if (!await fs.pathExists(inputFile)) {
    throw new Error(`Input file not found: ${inputFile}`);
  }

  if (ext === '.csv') {
    return new Promise((resolve, reject) => {
      const results = [];
      fs.createReadStream(inputFile)
        .pipe(csv())
        .on('data', (data) => {
          // CSVの最初の列をURLとして使用
          const url = Object.values(data)[0];
          if (url && url.trim()) {
            results.push(url.trim());
          }
        })
        .on('end', () => resolve(results))
        .on('error', reject);
    });
  } else {
    // テキストファイルの場合
    const content = await fs.readFile(inputFile, 'utf8');
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && !line.startsWith('//'));
  }
}

// 単一URLのLighthouseテストを実行
async function runLighthouseTest(url, chrome) {
  try {
    const runnerResult = await lighthouse(url, {
      port: chrome.port,
      disableDeviceEmulation: false,
      chromeFlags: ['--disable-mobile-emulation']
    }, lighthouseConfig);

    const { lhr } = runnerResult;
    
    return {
      url: url,
      timestamp: new Date().toISOString(),
      performance: Math.round(lhr.categories.performance.score * 100),
      accessibility: Math.round(lhr.categories.accessibility.score * 100),
      bestPractices: Math.round(lhr.categories['best-practices'].score * 100),
      seo: Math.round(lhr.categories.seo.score * 100),
      firstContentfulPaint: lhr.audits['first-contentful-paint'].displayValue,
      largestContentfulPaint: lhr.audits['largest-contentful-paint'].displayValue,
      cumulativeLayoutShift: lhr.audits['cumulative-layout-shift'].displayValue,
      speedIndex: lhr.audits['speed-index'].displayValue,
      totalBlockingTime: lhr.audits['total-blocking-time'].displayValue,
      status: 'success'
    };
  } catch (error) {
    console.error(chalk.red(`Error testing ${url}:`), error.message);
    return {
      url: url,
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
    };
  }
}

// 結果をCSVに保存
async function saveResults(results, outputFile) {
  const csvWriter = createCsvWriter({
    path: outputFile,
    header: [
      { id: 'url', title: 'URL' },
      { id: 'timestamp', title: 'Timestamp' },
      { id: 'performance', title: 'Performance Score' },
      { id: 'accessibility', title: 'Accessibility Score' },
      { id: 'bestPractices', title: 'Best Practices Score' },
      { id: 'seo', title: 'SEO Score' },
      { id: 'firstContentfulPaint', title: 'First Contentful Paint' },
      { id: 'largestContentfulPaint', title: 'Largest Contentful Paint' },
      { id: 'cumulativeLayoutShift', title: 'Cumulative Layout Shift' },
      { id: 'speedIndex', title: 'Speed Index' },
      { id: 'totalBlockingTime', title: 'Total Blocking Time' },
      { id: 'status', title: 'Status' },
      { id: 'error', title: 'Error Message' }
    ]
  });

  await csvWriter.writeRecords(results);
}

// メイン実行関数
async function main() {
  console.log(chalk.blue.bold('🏮 Lighthouse Bulk Tester'));
  console.log(chalk.gray(`Device: ${options.mobile ? 'Mobile' : 'Desktop'}`));
  console.log(chalk.gray(`Input: ${options.input}`));
  console.log(chalk.gray(`Output: ${options.output}`));
  console.log();

  let spinner = ora('Loading URLs...').start();
  
  try {
    // URLを読み込み
    const urls = await loadUrls(options.input);
    spinner.succeed(`Loaded ${urls.length} URLs`);
    
    if (urls.length === 0) {
      throw new Error('No valid URLs found in input file');
    }

    // Chromeを起動
    spinner = ora('Starting Chrome...').start();
    const chrome = await chromeLauncher.launch({
      chromeFlags: ['--headless', '--disable-gpu', '--no-sandbox']
    });
    spinner.succeed('Chrome started');

    // 各URLをテスト
    const results = [];
    const delay = parseInt(options.delay);
    
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      spinner = ora(`Testing ${i + 1}/${urls.length}: ${url}`).start();
      
      const result = await runLighthouseTest(url, chrome);
      results.push(result);
      
      if (result.status === 'success') {
        spinner.succeed(
          `${chalk.green('✓')} ${url} - Performance: ${result.performance}%`
        );
      } else {
        spinner.fail(`${chalk.red('✗')} ${url} - Failed`);
      }
      
      // 最後のURL以外は待機
      if (i < urls.length - 1 && delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Chromeを終了
    await chrome.kill();

    // 結果を保存
    spinner = ora('Saving results...').start();
    await saveResults(results, options.output);
    spinner.succeed(`Results saved to ${options.output}`);

    // サマリーを表示
    const successCount = results.filter(r => r.status === 'success').length;
    const avgPerformance = results
      .filter(r => r.status === 'success')
      .reduce((sum, r) => sum + r.performance, 0) / successCount;

    console.log();
    console.log(chalk.green.bold('📊 Summary'));
    console.log(`Total URLs: ${urls.length}`);
    console.log(`Successful: ${successCount}`);
    console.log(`Failed: ${urls.length - successCount}`);
    if (successCount > 0) {
      console.log(`Average Performance Score: ${Math.round(avgPerformance)}%`);
    }
    console.log();
    console.log(chalk.blue(`Results saved to: ${path.resolve(options.output)}`));

  } catch (error) {
    spinner.fail(error.message);
    console.error(chalk.red('Error:'), error.message);
    process.exit(1);
  }
}

// 未処理のエラーをキャッチ
process.on('unhandledRejection', (error) => {
  console.error(chalk.red('Unhandled error:'), error);
  process.exit(1);
});

// プログラムを実行
if (process.argv[1] === new URL(import.meta.url).pathname) {
  main();
}

export { main, loadUrls, runLighthouseTest }; 