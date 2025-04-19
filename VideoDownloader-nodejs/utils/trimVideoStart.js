const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

// 设置 ffmpeg 路径
ffmpeg.setFfmpegPath(ffmpegPath);

/**
 * 裁剪视频开头指定秒数的内容，保持原文件名不变
 * @param {string} videoPath - 视频文件路径
 * @param {number} startSeconds - 要从开头裁剪掉的秒数
 * @returns {Promise<string>} - 返回处理后的视频路径（与输入路径相同）
 */
function trimVideoStart(videoPath, startSeconds) {
  return new Promise((resolve, reject) => {
    // 检查输入文件是否存在
    if (!fs.existsSync(videoPath)) {
      return reject(new Error(`输入文件不存在: ${videoPath}`));
    }

    // 如果不需要裁剪（startSeconds为0或未定义），直接返回原路径
    if (!startSeconds || startSeconds <= 0) {
      return resolve(videoPath);
    }

    try {
      // 确保视频文件可读
      fs.accessSync(videoPath, fs.constants.R_OK);
      
      // 获取视频文件信息
      const fileStats = fs.statSync(videoPath);
      
      // 创建临时文件路径
      const dir = path.dirname(videoPath);
      const ext = path.extname(videoPath);
      const basename = path.basename(videoPath, ext);
      const tempFilePath = path.join(dir, `${basename}_temp${ext}`);
      
      // 确保目标目录存在且可写
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // 使用ffmpeg裁剪视频
      const command = ffmpeg(videoPath)
        .setStartTime(startSeconds) // 设置起始时间（跳过前N秒）
        .outputOptions('-c:v copy') // 复制视频编码以避免重新编码
        .outputOptions('-c:a copy') // 复制音频编码以避免重新编码
        .output(tempFilePath);
      
      command.on('error', (err) => {
        // 清理临时文件
        if (fs.existsSync(tempFilePath)) {
          try {
            fs.unlinkSync(tempFilePath);
          } catch (e) {
            // 忽略临时文件删除错误
          }
        }
        reject(err);
      });
      
      command.on('end', () => {
        try {
          // 确认临时文件存在且有效
          if (!fs.existsSync(tempFilePath)) {
            throw new Error('裁剪后的临时文件不存在');
          }
          
          const tempStats = fs.statSync(tempFilePath);
          if (tempStats.size === 0) {
            throw new Error('裁剪后的临时文件大小为0');
          }
          
          // 先删除原文件
          fs.unlinkSync(videoPath);
          
          // 将临时文件重命名为原文件名
          fs.renameSync(tempFilePath, videoPath);
          
          resolve(videoPath);
        } catch (err) {
          reject(err);
        }
      });
      
      command.run();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = trimVideoStart; 