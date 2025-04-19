const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * Convert TS video file to MP4 format and delete the original TS file
 * @param {string} tsFilePath - Path to the TS video file
 * @param {string} [downloadId] - 下载任务ID，用于WebSocket进度报告
 * @param {WebSocket|null} [ws] - WebSocket连接，用于发送进度信息
 * @param {number} [skipStart=0] - 跳过视频开头的秒数
 * @returns {Promise<string>} - Path to the converted MP4 file
 */
function m3u8ToMp4(tsFilePath, downloadId, ws = null, skipStart = 0) {
  return new Promise((resolve, reject) => {
    // Check if the input file exists
    if (!fs.existsSync(tsFilePath)) {
      return reject(new Error(`Input file not found: ${tsFilePath}`));
    }

    // 生成输出文件路径，保持原文件名，仅修改扩展名为.mp4
    const outputDir = path.dirname(tsFilePath);
    const fileName = path.basename(tsFilePath, path.extname(tsFilePath));
    const outputPath = path.join(outputDir, `${fileName}.mp4`);

    // 上次进度更新时间和值
    let lastProgressUpdate = 0;
    
    // 创建ffmpeg命令
    let command = ffmpeg(tsFilePath);
    
    // 如果需要跳过开头部分
    if (skipStart > 0) {
      console.log(`跳过视频开头 ${skipStart} 秒`);
      command = command.seekInput(skipStart);
    }
    
    // 配置输出选项并开始转换
    command
      .outputOptions('-c:v copy') // Copy video codec to avoid re-encoding
      .outputOptions('-c:a aac')  // Convert audio to AAC
      .output(outputPath)
      .on('start', (commandLine) => {
        console.log(`Started ffmpeg with command: ${commandLine}`);
      })
      .on('progress', (progress) => {
        const percent = Math.floor(progress.percent || 0);
        console.log(`Processing: ${percent}% done`);
        
        // 仅在进度有明显变化时更新（避免过多WebSocket消息）
        const now = Date.now();
        if (percent !== lastProgressUpdate && (percent % 5 === 0 || now - lastProgressUpdate > 3000)) {
          lastProgressUpdate = percent;
          
          // 通过WebSocket发送进度信息
          if (ws && ws.readyState === 1 && downloadId) {
            try {
              ws.send(JSON.stringify({
                type: 'download_progress',
                data: {
                  id: downloadId,
                  progress: percent,
                  type: "m3u8ToMp4"
                }
              }));
            } catch (wsError) {
              console.warn('WebSocket发送进度信息失败:', wsError.message);
            }
          }
        }
      })
      .on('error', (err) => {
        console.error('Error during conversion:', err);
        reject(err);
      })
      .on('end', () => {
        console.log(`Conversion finished: ${outputPath}`);
        
        // Delete the original TS file
        fs.unlink(tsFilePath, (err) => {
          if (err) {
            console.warn(`Warning: Could not delete original file ${tsFilePath}:`, err);
          } else {
            console.log(`Deleted original file: ${tsFilePath}`);
          }
          
          resolve(outputPath);
        });
      })
      .run();
  });
}

module.exports = m3u8ToMp4;