const path = require('path');
const fs = require('fs');
const { downloadM3U8Video } = require('./downloadM3U8Video');
const { downloadMP4Video } = require('./downloadMP4Video');
const { updateVideoState, findVideoById } = require('../db/dbService');
const m3u8ToMp4 = require('./m3u8ToMp4');

class DownloadQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.currentDownload = null;
    this.maxConcurrent = 1; // 默认一次只处理一个下载
    this.websocketServer = null;
    this._lastProgressTime = 0;
    this._lastProgressValue = null;
    this.isPaused = false; // 添加暂停状态
    this.config = {
      maxRetries: 5,
      startFragment: 0,
      maxConcurrent: 10
    }; // 默认配置
  }

  /**
   * 设置WebSocket服务器实例
   * @param {WebSocket.Server} wss - WebSocket服务器
   */
  setWebSocketServer(wss) {
    this.websocketServer = wss;
  }

  /**
   * 设置下载配置
   * @param {Object} config - 下载配置
   * @param {number} config.maxConcurrent - 最大并发数
   * @param {number} config.maxRetries - 最大重试次数
   * @param {number} config.startFragment - 开始片段位置
   */
  configDownload(config = {}) {
    if (config.maxConcurrent && typeof config.maxConcurrent === 'number') {
      this.maxConcurrent = config.maxConcurrent;
    }
    
    // 保存配置，用于后续下载
    this.config = {
      ...this.config,
      ...config
    };
    
    console.log('设置下载配置:', this.config);
  }

  /**
   * 添加下载任务到队列
   * @param {Array} items - 下载项数组
   * @param {Object} config - 下载配置（可选，如果传入则覆盖之前设置的配置）
   * @returns {Array} - 添加到队列的项
   */
  addToQueue(items, config = null) {
    if (!Array.isArray(items) || items.length === 0) {
      return [];
    }

    // 使用传入的配置或者之前设置的配置
    const useConfig = config || this.config;

    // 设置队列限制
    if (useConfig.maxConcurrent && typeof useConfig.maxConcurrent === 'number') {
      this.maxConcurrent = useConfig.maxConcurrent;
    }

    // 添加配置到每个下载项
    const queueItems = items.map(item => ({
      ...item,
      config: {
        maxRetries: useConfig.maxRetries || 5,
        startFragment: useConfig.startFragment || 0,
        maxConcurrent: useConfig.maxConcurrent || 10
      },
      state: 'queued', // 队列状态：queued, downloading, completed, failed
      progress: 0,
      addedAt: Date.now()
    }));

    // 添加到队列
    this.queue.push(...queueItems);
    
    // 如果队列没有在处理，则开始处理
    if (!this.isProcessing && !this.isPaused) {
      this.processQueue();
    }

    return queueItems;
  }

  /**
   * 暂停下载队列
   */
  pause() {
    this.isPaused = true;
    this.sendWebSocketMessage({
      type: 'queue_paused',
      payload: {
        status: 'paused'
      }
    });
  }

  /**
   * 继续下载队列
   */
  resume() {
    this.isPaused = false;
    this.sendWebSocketMessage({
      type: 'queue_resumed',
      payload: {
        status: 'resumed'
      }
    });
    // 如果队列中有任务且当前没有在处理，则开始处理
    if (this.queue.length > 0 && !this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * 处理下载队列
   */
  async processQueue() {
    if (this.isProcessing || this.queue.length === 0 || this.isPaused) {
      return;
    }

    this.isProcessing = true;

    try {
      // 从队列中取出下一个下载项
      const item = this.queue.shift();
      this.currentDownload = item;

      // 获取完整的视频信息
      const videoInfo = await findVideoById(item._id);
      if (!videoInfo) {
        console.error(`找不到ID为 ${item._id} 的视频信息`);
        this.onDownloadFailed(item, '找不到视频信息');
        return;
      }

      // 更新状态为正在下载
      await updateVideoState(item._id, 2);

      // 根据源类型确定下载路径
      const source = videoInfo.source || 'unknown';
      const downloadDir = path.join(process.cwd(), 'video', source);
      
      // 确保下载目录存在
      if (!fs.existsSync(downloadDir)) {
        fs.mkdirSync(downloadDir, { recursive: true });
      }

      // 准备文件名（假设title已经处理过）
      const outputFilename = `${videoInfo.title}.ts`;

      // 检查链接类型（m3u8或mp4）并调用对应的下载方法
      const isM3U8 = this.isM3U8Link(videoInfo.downloadLink);
      
      try {
        if (isM3U8) {
          // 对于M3U8链接，调用m3u8下载器
          await downloadM3U8Video(
            videoInfo.downloadLink,
            outputFilename,
            downloadDir,
            10000, // 超时时间
            item.config.maxRetries,
            0,  // 跳过开头0秒
            item.config.maxConcurrent,
            this.getWebSocketConnection(),
            item._id
          );

          // 下载完成后转换为MP4格式
          const tsFilePath = path.join(downloadDir, outputFilename);
          try {
            await m3u8ToMp4(tsFilePath, item._id, this.getWebSocketConnection(), item.config.startFragment);
            console.log(`视频转换完成: ${tsFilePath}`);
          } catch (error) {
            console.error(`视频转换失败: ${error.message}`);
            // 转换失败不影响下载状态
          }
        } else {
          // 对于MP4或直链，调用MP4下载器
          const mp4Filename = `${videoInfo.title}.mp4`;
          await downloadMP4Video(
            videoInfo.downloadLink,
            mp4Filename,
            downloadDir,
            this.getWebSocketConnection(),
            item._id,
            item.config.maxRetries,
            item.config.startFragment
          );
        }

        // 下载成功，更新状态为已完成
        await updateVideoState(item._id, 3);
        this.onDownloadCompleted(item);
      } catch (error) {
        console.error(`下载失败: ${error.message}`);
        // 下载失败，恢复状态为待下载
        await updateVideoState(item._id, 1);
        this.onDownloadFailed(item, error.message);
      }
    } catch (error) {
      console.error(`处理队列时出错: ${error.message}`);
    } finally {
      this.currentDownload = null;
      this.isProcessing = false;
      
      // 继续处理队列中的下一项
      if (this.queue.length > 0) {
        setTimeout(() => this.processQueue(), 1000); // 稍微延迟处理下一个，避免可能的资源争用
      }
    }
  }

  /**
   * 下载完成处理
   * @param {Object} item - 下载项
   */
  onDownloadCompleted(item) {
    console.log(`下载完成: ${item._id}`);
    
    // 发送下载完成通知
    this.sendWebSocketMessage({
      type: 'download_complete',
      payload: {
        id: item._id,
        status: 'completed'
      }
    });
    
    // 继续处理队列
    if (this.queue.length > 0) {
      setTimeout(() => this.processQueue(), 1000);
    }
  }

  /**
   * 下载失败处理
   * @param {Object} item - 下载项
   * @param {string} error - 错误信息
   */
  onDownloadFailed(item, error) {
    console.error(`下载失败: ${item._id}, 错误: ${error}`);
    
    // 发送下载失败通知
    this.sendWebSocketMessage({
      type: 'download_progress',
      payload: {
        id: item._id,
        status: 'error',
        error: error
      }
    });
    
    // 继续处理队列
    if (this.queue.length > 0) {
      setTimeout(() => this.processQueue(), 1000);
    }
  }

  /**
   * 获取WebSocket连接
   * @returns {WebSocket|null} - WebSocket连接或null
   */
  getWebSocketConnection() {
    if (!this.websocketServer) {
      return null;
    }

    // 从WebSocket服务器获取活跃连接
    const clients = Array.from(this.websocketServer.clients);
    const activeClient = clients.find(client => client.readyState === 1);
    return activeClient || null;
  }

  /**
   * 发送WebSocket消息到所有活跃连接
   * @param {Object} message - 要发送的消息
   */
  sendWebSocketMessage(message) {
    if (!this.websocketServer) {
      return;
    }

    // 添加更严格的消息限流
    if (message.type === 'download_progress') {
      const now = Date.now();
      
      // 对于进度消息，限制每1000ms最多发送一次
      if (this._lastProgressTime && (now - this._lastProgressTime < 1000)) {
        // 如果消息发送过于频繁，则忽略此消息
        return;
      }
      
      // 记录最后发送时间
      this._lastProgressTime = now;
      
      // 对于进度消息，如果进度小于5%或进度变化小于5%，则跳过此次发送
      if (message.payload?.progress) {
        const progress = parseFloat(message.payload.progress);
        const lastProgress = this._lastProgressValue || 0;
        
        // 记录进度值以便下次比较
        this._lastProgressValue = progress;
        
        // 如果进度小于5%且变化小于5%，跳过发送
        if (progress < 5 || (Math.abs(progress - lastProgress) < 5 && progress < 95)) {
          return;
        }
      }
    }

    const messageStr = JSON.stringify(message);
    let clientCount = 0;
    
    this.websocketServer.clients.forEach(client => {
      if (client.readyState === 1) { // WebSocket.OPEN
        try {
          client.send(messageStr);
          clientCount++;
        } catch (error) {
          console.warn(`发送WebSocket消息失败: ${error.message}`);
        }
      }
    });
    
    // 仅在有客户端接收且不是系统状态消息时才记录日志
    if (clientCount > 0 && message.type !== 'system_status') {
      // 对于进度消息，仅在调试模式下记录日志
      if (message.type !== 'download_progress' || process.env.DEBUG) {
        console.log(`发送WebSocket消息(${message.type})到${clientCount}个客户端`);
      }
    }
  }

  /**
   * 检查链接是否为M3U8格式
   * @param {string} url - 下载链接
   * @returns {boolean} - 是否为M3U8链接
   */
  isM3U8Link(url) {
    if (!url) return false;
    
    try {
      // 转换为小写以便不区分大小写比较
      const lowerUrl = url.toLowerCase();
      
      // 检查URL是否以m3u8结尾或包含m3u8
      if (lowerUrl.endsWith('.m3u8') || 
          lowerUrl.includes('.m3u8?') || 
          lowerUrl.includes('m3u8') ||
          lowerUrl.includes('playlist') ||
          lowerUrl.includes('manifest')) {
        return true;
      }
      
      // 尝试解析URL并检查路径和查询参数
      const parsedUrl = new URL(url);
      const pathname = parsedUrl.pathname.toLowerCase();
      const query = parsedUrl.search.toLowerCase();
      
      if (pathname.includes('m3u8') || 
          pathname.includes('playlist') || 
          pathname.includes('manifest') ||
          query.includes('m3u8') ||
          query.includes('format=hls')) {
        return true;
      }
    } catch (error) {
      // URL解析错误，使用原始检查
      console.warn(`解析URL时出错 (${error.message})，使用基本检查`);
    }
    
    return false;
  }

  /**
   * 获取队列信息
   * @returns {Object} - 队列信息
   */
  getQueueInfo() {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      currentDownload: this.currentDownload
    };
  }

  /**
   * 取消指定ID的下载任务
   * @param {string} id - 要取消的任务ID
   */
  async cancelDownload(id) {
    // 如果当前正在下载的任务是要取消的任务
    if (this.currentDownload && this.currentDownload._id === id) {
      // 更新状态为待下载
      await updateVideoState(id, 1);
      this.currentDownload = null;
      this.isProcessing = false;
    }

    // 从队列中移除该任务
    this.queue = this.queue.filter(item => item._id !== id);

    // 发送取消通知
    this.sendWebSocketMessage({
      type: 'download_cancelled',
      payload: {
        id: id,
        status: 'cancelled'
      }
    });

    // 如果队列没有被暂停，继续处理下一个任务
    if (!this.isPaused && this.queue.length > 0) {
      this.processQueue();
    }
  }
}

// 创建单例实例
const downloadQueue = new DownloadQueue();

module.exports = downloadQueue; 