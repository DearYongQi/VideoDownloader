const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { Parser } = require('m3u8-parser');

/**
 * 改进的并发队列实现
 */
class ImprovedQueue {
  constructor(concurrency) {
    this.concurrency = concurrency;
    this.running = 0;
    this.queue = [];
    this.results = [];
    this.errors = [];
    this.isStopped = false;
  }

  add(task) {
    if (this.isStopped) {
      throw new Error('Queue has been stopped');
    }
    this.queue.push(task);
    this.next();
  }

  async next() {
    if (this.isStopped || this.running >= this.concurrency || this.queue.length === 0) {
      return;
    }

    this.running++;
    const task = this.queue.shift();

    try {
      const result = await task();
      this.results.push(result);
    } catch (error) {
      this.errors.push(error);
      console.error('Task failed:', error.message);
    } finally {
      this.running--;
      this.next();
    }
  }

  stop() {
    this.isStopped = true;
  }

  async done() {
    return new Promise((resolve) => {
      const check = () => {
        if (this.running === 0 && this.queue.length === 0) {
          resolve({
            results: this.results,
            errors: this.errors
          });
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }
}

/**
 * 下载文件内容，带重试机制
 */
async function downloadFile(url, returnType = 'text', maxRetries = 3, timeout = 30000) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await new Promise((resolve, reject) => {
        const client = url.startsWith('https://') ? https : http;
        const request = client.get(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Accept': '*/*',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive'
          },
          timeout: timeout
        }, (res) => {
          if (res.statusCode !== 200) {
            return reject(new Error(`HTTP 状态码: ${res.statusCode}`));
          }

          if (returnType === 'buffer') {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
          } else {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
          }
        });

        request.on('error', (err) => {
          reject(new Error(`下载失败: ${err.message}`));
        });

        request.on('timeout', () => {
          request.destroy();
          reject(new Error('请求超时'));
        });
      });
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        console.log(`下载失败，${delay}ms 后重试 (${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * 下载 m3u8 视频并保存为本地 TS 文件
 * @param {string} m3u8Url - m3u8 文件的 URL
 * @param {string} outputFilename - 输出的视频文件名
 * @param {string} downloadPath - 下载路径
 * @param {number} timeout - 单个片段下载超时时间
 * @param {number} maxRetries - 最大重试次数
 * @param {number} startSegment - 从片段索引位置开始下载
 * @param {number} maxConcurrentDownloads - 最大并发下载数
 * @param {WebSocket|null} ws - WebSocket 连接用于发送进度
 * @param {string} downloadId - 下载任务ID
 * @returns {Promise<string>} - 返回保存文件的完整路径
 */
async function downloadM3U8Video(
  m3u8Url,
  outputFilename = 'video.ts',
  downloadPath = path.join(process.cwd(), 'video'),
  timeout = 15000,
  maxRetries = 3,
  startSegment = 0,
  maxConcurrentDownloads = 15,
  ws = null,
  downloadId = null,
) {
  let tempDir = null;
  try {
    console.log('开始下载 m3u8 视频...');
    console.log(`目标 URL: ${m3u8Url}`);

    // 创建下载路径
    if (!fs.existsSync(downloadPath)) {
      fs.mkdirSync(downloadPath, { recursive: true });
    }

    // 下载并解析 m3u8 文件
    console.log('正在下载 m3u8 文件...');
    const m3u8Content = await downloadFile(m3u8Url, 'text', maxRetries, timeout);
    const parser = new Parser();
    parser.push(m3u8Content);
    parser.end();

    const segments = parser.manifest.segments;
    if (!segments || segments.length === 0) {
      throw new Error('未找到 TS 片段');
    }

    console.log(`共找到 ${segments.length} 个 TS 片段`);

    // 获取加密信息
    const encryptionKey = parser.manifest.segments[0].key;
    if (encryptionKey) {
      console.log('检测到加密，将使用密钥进行解密');
    }

    // 从 startSegment 开始下载 TS
    const segmentsToDownload = segments.slice(startSegment);
    const totalSegments = segmentsToDownload.length;

    // 创建临时文件夹
    tempDir = path.join(downloadPath, `temp_${Date.now()}`);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // 下载密钥（如果需要）
    let decryptionKey = null;
    if (encryptionKey && encryptionKey.uri) {
      try {
        console.log('正在下载解密密钥...');
        decryptionKey = await downloadFile(encryptionKey.uri, 'buffer', maxRetries, timeout);
        console.log('密钥已下载');
      } catch (err) {
        throw new Error(`密钥下载失败: ${err.message}`);
      }
    }

    // 创建下载队列
    const queue = new ImprovedQueue(maxConcurrentDownloads);
    const results = [];
    let completed = 0;
    let failedCount = 0;

    // 添加下载任务到队列
    for (let i = 0; i < totalSegments; i++) {
      const segment = segmentsToDownload[i];
      const tsUrl = new URL(segment.uri, m3u8Url).href;
      const tsFilename = path.join(tempDir, `segment_${i.toString().padStart(5, '0')}.ts`);

      queue.add(async () => {
        let retries = 0;
        let success = false;
        let lastError = null;

        while (retries <= maxRetries && !success) {
          try {
            const data = await downloadFile(tsUrl, 'buffer', 1, timeout);

            if (decryptionKey) {
              const iv = segment.key && segment.key.iv ?
                Buffer.from(segment.key.iv.replace('0x', ''), 'hex') :
                Buffer.alloc(16, 0);

              const decipher = crypto.createDecipheriv('aes-128-cbc', decryptionKey, iv);
              const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
              fs.writeFileSync(tsFilename, decrypted);
            } else {
              fs.writeFileSync(tsFilename, data);
            }

            success = true;
          } catch (err) {
            lastError = err;
            retries++;
            if (retries <= maxRetries) {
              const delay = Math.min(1000 * Math.pow(2, retries), 10000);
              console.log(`片段 ${i} 下载失败，${delay}ms 后重试 (${retries}/${maxRetries})`);
              await new Promise(resolve => setTimeout(resolve, delay));
            }
          }
        }

        completed++;
        const progress = Math.floor((completed / totalSegments) * 100);

        if (!success) {
          failedCount++;
          console.error(`片段 ${i} 下载失败: ${lastError.message}`);
        }

        console.log(`进度: ${progress}% (${completed}/${totalSegments}), 失败: ${failedCount}`);

        if (ws && ws.readyState === 1 && downloadId) {
          ws.send(JSON.stringify({
            type: 'download_progress',
            data: {
              id: downloadId,
              progress,
              completed,
              total: totalSegments,
              failed: failedCount,
              type: "m3u8"
            }
          }));
        }

        return { success, index: i, filename: tsFilename };
      });
    }

    // 等待所有下载完成
    const { results: downloadResults, errors } = await queue.done();

    // 检查下载结果
    if (errors.length > 0) {
      console.warn(`下载过程中发生 ${errors.length} 个错误`);
    }

    const failedSegments = downloadResults.filter(result => !result.success);
    if (failedSegments.length > 0) {
      console.warn(`${failedSegments.length} 个片段下载失败，但仍将继续合并`);
    }

    // 合并文件
    console.log('开始合并文件...');
    const outputFilePath = path.join(downloadPath, outputFilename);
    const writeStream = fs.createWriteStream(outputFilePath);

    for (const result of downloadResults.filter(r => r.success).sort((a, b) => a.index - b.index)) {
      const data = fs.readFileSync(result.filename);
      writeStream.write(data);
    }

    writeStream.end();
    await new Promise(resolve => writeStream.on('finish', resolve));

    console.log('文件合并完成');

    return outputFilePath;
  } catch (error) {
    console.error('下载失败:', error.message);
    throw error;
  } finally {
    // 清理临时文件
    if (tempDir && fs.existsSync(tempDir)) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
        console.log('临时文件已清理');
      } catch (err) {
        console.warn(`临时文件夹清理失败: ${err.message}`);
      }
    }
  }
}

// 如果直接运行该文件，则可执行测试代码
if (require.main === module) {
  // 测试下载
  const m3u8Url = process.argv[2] || 'https://t30.cdn2020.com/video/m3u8/2025/04/08/b36cdf15/index.m3u8';
  const outputFile = process.argv[3] || 'video.ts';

  console.log('开始测试下载...');
  console.log(`m3u8 URL: ${m3u8Url}`);
  console.log(`输出文件: ${outputFile}`);

  downloadM3U8Video(m3u8Url, outputFile)
    .then((filePath) => {
      console.log(`下载完成！文件保存在: ${filePath}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('下载失败:', err.message);
      process.exit(1);
    });
}

module.exports = { downloadM3U8Video };