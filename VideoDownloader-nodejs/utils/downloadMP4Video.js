const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const trimVideoStart = require('./trimVideoStart'); // 引入裁剪视频开头的函数
const { getBilibiliCookie } = require('../db/dbService'); // 引入获取B站cookie的方法

/**
 * 下载 MP4 视频并保存到本地，支持进度报告
 *
 * @param {string} videoUrl - 视频文件的 URL
 * @param {string} outputFilename - 输出的视频文件名
 * @param {string} downloadPath - 下载路径
 * @param {WebSocket|null} ws - WebSocket 连接用于发送进度，可选
 * @param {string} downloadId - 下载任务ID，用于WebSocket进度报告
 * @param {number} retryCount - 当前重试次数，内部使用
 * @param {number} startFragment - 开始片段，用于跳过视频开头
 * @returns {Promise<string>} - 返回保存文件的完整路径
 */
async function downloadMP4Video(
  videoUrl,
  outputFilename,
  downloadPath,
  ws = null,
  downloadId = null,
  retryCount = 0,
  startFragment = 0
) {
  return new Promise((resolve, reject) => {
    try {
      // 最大重试次数
      const MAX_RETRY = 3;

      // 如果超过最大重试次数，则放弃
      if (retryCount > MAX_RETRY) {
        console.error(`下载失败，已达到最大重试次数 (${MAX_RETRY}次)`);

        // 通知下载失败，需要更新数据库状态
        if (ws && ws.readyState === 1 && downloadId) {
          try {
            ws.send(JSON.stringify({
              type: 'download_failed',
              data: {
                id: downloadId,
                message: `下载失败，已重试${MAX_RETRY}次`,
                shouldResetState: true // 标记需要将数据库状态重置为1
              }
            }));
          } catch (wsError) {
            console.warn('WebSocket发送失败信息失败:', wsError.message);
          }
        }

        reject(new Error(`下载失败，已重试${MAX_RETRY}次`));
        return;
      }

      // 创建下载路径
      if (!fs.existsSync(downloadPath)) {
        fs.mkdirSync(downloadPath, { recursive: true });
      }

      const outputFilePath = path.join(downloadPath, outputFilename);
      const fileStream = fs.createWriteStream(outputFilePath);

      // 解析URL确定使用http还是https
      const parsedUrl = url.parse(videoUrl);
      const httpModule = parsedUrl.protocol === 'https:' ? https : http;

      console.log(`开始下载MP4视频: ${videoUrl}${retryCount > 0 ? ` (重试 #${retryCount})` : ''}`);
      console.log(`输出文件: ${outputFilePath}`);
      
      // 定义默认请求选项
      const requestOptions = {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        }
      };
      
      // 如果是Bilibili的链接，进行特殊处理
      const isBilibiliUrl = videoUrl.includes('bilibili.com');
      
      // 处理请求配置
      const processRequest = async () => {
        // B站URL特殊处理
        if (isBilibiliUrl) {
          try {
            console.log('检测到Bilibili链接，获取Cookie并设置特殊请求头');
            // 获取B站Cookie
            const cookieResult = await getBilibiliCookie();
            
            // 设置B站专用请求头
            requestOptions.headers = {
              'Referer': 'https://www.bilibili.com/',
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
              'Origin': 'https://www.bilibili.com'
            };
            
            // 如果有Cookie，添加到请求头
            if (cookieResult.exists && cookieResult.cookie) {
              requestOptions.headers['Cookie'] = cookieResult.cookie;
              console.log('已成功添加Bilibili Cookie');
            } else {
              console.warn('未找到可用的Bilibili Cookie');
            }
          } catch (cookieErr) {
            console.error('获取Bilibili Cookie失败:', cookieErr);
          }
        }
        
        // 创建请求
        const request = httpModule.get(videoUrl, requestOptions, (response) => {
          // 检查是否重定向
          if (response.statusCode === 301 || response.statusCode === 302) {
            const redirectUrl = response.headers.location;
            console.log(`遇到重定向，新URL: ${redirectUrl}`);
            // 递归调用处理重定向
            downloadMP4Video(redirectUrl, outputFilename, downloadPath, ws, downloadId, retryCount, startFragment)
              .then(resolve)
              .catch(reject);
            return;
          }

          // 检查响应状态码
          if (response.statusCode !== 200) {
            fileStream.close();
            fs.unlink(outputFilePath, () => { }); // 删除部分下载的文件

            // 尝试重试
            if (retryCount < MAX_RETRY) {
              console.log(`服务器返回非200状态码: ${response.statusCode}，准备重试 (${retryCount + 1}/${MAX_RETRY})`);
              setTimeout(() => {
                downloadMP4Video(videoUrl, outputFilename, downloadPath, ws, downloadId, retryCount + 1, startFragment)
                  .then(resolve)
                  .catch(reject);
              }, 3000); // 延迟3秒后重试
              return;
            }

            reject(new Error(`服务器返回非200状态码: ${response.statusCode}`));
            return;
          }

          // 获取总文件大小
          const totalSize = parseInt(response.headers['content-length'] || '0', 10);
          let downloadedSize = 0;
          let lastProgressUpdate = 0;
          let lastDataTime = Date.now(); // 上次接收数据的时间
          let stuckCheckInterval = null; // 用于检测下载是否卡住的定时器

          // 创建卡住检测定时器
          const STUCK_TIMEOUT = 60000; // 60秒没有数据认为卡住
          stuckCheckInterval = setInterval(() => {
            const idleTime = Date.now() - lastDataTime;
            if (idleTime > STUCK_TIMEOUT) {
              clearInterval(stuckCheckInterval);
              console.warn(`下载卡住 ${STUCK_TIMEOUT / 1000} 秒，准备重试...`);

              // 终止当前请求
              request.destroy();
              fileStream.close();

              // 如果已经下载了部分内容，可以保留并尝试断点续传
              // 简单实现：这里我们先尝试全新下载
              fs.unlink(outputFilePath, () => {
                // 尝试重试
                if (retryCount < MAX_RETRY) {
                  setTimeout(() => {
                    downloadMP4Video(videoUrl, outputFilename, downloadPath, ws, downloadId, retryCount + 1, startFragment)
                      .then(resolve)
                      .catch(reject);
                  }, 3000); // 延迟3秒后重试
                } else {
                  reject(new Error(`下载卡住，已重试${MAX_RETRY}次后失败`));
                }
              });
            }
          }, 10000); // 每10秒检查一次

          response.on('data', (chunk) => {
            downloadedSize += chunk.length;
            lastDataTime = Date.now(); // 更新最后接收数据的时间

            // 计算下载进度百分比
            const progress = totalSize ? Math.floor((downloadedSize / totalSize) * 100) : 0;

            // 仅在进度有明显变化时更新（避免过多WebSocket消息）
            const now = Date.now();
            if (progress !== lastProgressUpdate && (progress % 5 === 0 || now - lastProgressUpdate > 3000)) {
              lastProgressUpdate = progress;
              console.log(`下载进度: ${progress}%`);

              // 通过WebSocket发送进度信息
              if (ws && ws.readyState === 1 && downloadId) {
                try {
                  ws.send(JSON.stringify({
                    type: 'download_progress',
                    data: {
                      id: downloadId,
                      progress,
                      downloadedSize,
                      totalSize,
                      type: "mp4"
                    }
                  }));
                } catch (wsError) {
                  console.warn('WebSocket发送进度信息失败:', wsError.message);
                }
              }
            }
          });

          response.pipe(fileStream);

          fileStream.on('finish', () => {
            fileStream.close();
            clearInterval(stuckCheckInterval); // 清除卡住检测
            console.log('视频下载完成！');

            if (startFragment > 0) {
              trimVideoStart(outputFilePath, startFragment)
                .then(trimmedFilePath => {
                  // 裁剪成功后处理
                  if (ws && ws.readyState === 1 && downloadId) {
                    try {
                      ws.send(JSON.stringify({
                        type: 'download_complete',
                        data: {
                          id: downloadId,
                          filePath: trimmedFilePath
                        }
                      }));
                    } catch (wsError) {
                      console.warn('WebSocket发送完成信息失败:', wsError.message);
                    }
                  }
                  resolve(trimmedFilePath);
                })
                .catch(err => {
                  // 裁剪失败时返回原始文件
                  console.error('裁剪视频失败:', err.message);
                  if (ws && ws.readyState === 1 && downloadId) {
                    try {
                      ws.send(JSON.stringify({
                        type: 'download_complete',
                        data: {
                          id: downloadId,
                          filePath: outputFilePath
                        }
                      }));
                    } catch (wsError) {
                      console.warn('WebSocket发送完成信息失败:', wsError.message);
                    }
                  }
                  resolve(outputFilePath);
                });
              return;
            }

            // 无需裁剪时通知下载完成
            if (ws && ws.readyState === 1 && downloadId) {
              try {
                ws.send(JSON.stringify({
                  type: 'download_complete',
                  data: {
                    id: downloadId,
                    filePath: outputFilePath
                  }
                }));
              } catch (wsError) {
                console.warn('WebSocket发送完成信息失败:', wsError.message);
              }
            }

            resolve(outputFilePath);
          });

          fileStream.on('error', (err) => {
            clearInterval(stuckCheckInterval); // 清除卡住检测
            fileStream.close();
            fs.unlink(outputFilePath, () => { }); // 删除部分下载的文件
            console.error('文件写入错误:', err.message);

            // 尝试重试
            if (retryCount < MAX_RETRY) {
              console.log(`文件写入错误，准备重试 (${retryCount + 1}/${MAX_RETRY})`);
              setTimeout(() => {
                downloadMP4Video(videoUrl, outputFilename, downloadPath, ws, downloadId, retryCount + 1, startFragment)
                  .then(resolve)
                  .catch(reject);
              }, 3000); // 延迟3秒后重试
              return;
            }

            reject(err);
          });
        });

        request.on('error', (err) => {
          fileStream.close();
          fs.unlink(outputFilePath, () => { }); // 删除部分下载的文件
          console.error('下载请求错误:', err.message);

          // 尝试重试
          if (retryCount < MAX_RETRY) {
            console.log(`下载请求错误，准备重试 (${retryCount + 1}/${MAX_RETRY})`);
            setTimeout(() => {
              downloadMP4Video(videoUrl, outputFilename, downloadPath, ws, downloadId, retryCount + 1, startFragment)
                .then(resolve)
                .catch(reject);
            }, 3000); // 延迟3秒后重试
            return;
          }

          reject(err);
        });
      };

      // 执行请求处理流程
      processRequest();

    } catch (error) {
      console.error('下载过程中发生错误:', error.message);
      reject(error);
    }
  });
}

module.exports = { downloadMP4Video }; 