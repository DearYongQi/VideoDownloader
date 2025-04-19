const express = require('express');
const router = express.Router();
const { getLatestVideos, findVideoById, findVideosByState, updateVideoState, deleteVideoById, saveVideo } = require('../../db/dbService');
const downloadQueue = require('../../utils/downloadQueue');
const fs = require('fs');
const path = require('path');
const scheduleManager = require('../../utils/scheduleManager');
const url = require('url');

/**
 * 获取最新视频列表
 * @route POST /api/downloadList
 * @returns {Object} 包含最新200条视频记录的响应
 */
router.post('/downloadList', async (req, res) => {
    try {
        console.log('接收到获取下载列表请求');
        
        // 从dbService获取最新视频列表
        const result = await getLatestVideos(200);
        
        // 如果没有找到记录，返回空数组
        if (!result.results || result.results.length === 0) {
            return res.status(200).json({
                code: 200,
                message: '未找到记录',
                data: []
            });
        }
        
        // 返回找到的记录
        return res.status(200).json({
            code: 200,
            message: '成功获取下载列表',
            data: result.results,
            count: result.results.length,
            fromCache: result.inMemoryOnly || false
        });
    } catch (error) {
        console.error('获取下载列表时出错:', error);
        return res.status(500).json({
            code: 500,
            error: `获取下载列表失败: ${error.message}`
        });
    }
});

/**
 * 获取下载队列状态
 */
router.get('/downloadQueue', (req, res) => {
    try {
        const queueInfo = downloadQueue.getQueueInfo();
        return res.status(200).json({
            success: true,
            data: queueInfo
        });
    } catch (error) {
        console.error('获取下载队列状态出错:', error);
        return res.status(500).json({
            success: false,
            message: `获取下载队列状态失败: ${error.message}`
        });
    }
});

/**
 * 开始下载任务
 * 请求体参数：
 *   ids: [string] - 要下载的视频ID数组
 *   config: {
 *     maxConcurrent: number - 最大并发请求数
 *     maxRetries: number - 最大重试次数
 *     startFragment: number - 开始片段位置序号
 *     delaySeconds: number - 延迟开始时间（秒），0表示立即开始
 *   }
 */
router.post('/startDownload', async (req, res) => {
    try {
        const { ids, config } = req.body;
        
        // 参数验证
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: '缺少必要参数或IDs数组为空'
            });
        }
        
        // 验证配置参数
        const downloadConfig = {
            maxConcurrent: parseInt(config?.maxConcurrent) || 1,
            maxRetries: parseInt(config?.maxRetries) || 5,
            startFragment: parseInt(config?.startFragment) || 0,
            delaySeconds: parseInt(config?.delaySeconds) || 0
        };
        
        // 检查参数有效性
        if (downloadConfig.maxConcurrent < 1 || downloadConfig.maxRetries < 0 || 
            downloadConfig.startFragment < 0 || downloadConfig.delaySeconds < 0) {
            return res.status(400).json({
                success: false,
                message: '配置参数无效'
            });
        }
        
        // 查询指定ID的视频
        const videoItems = [];
        const errors = [];
        
        for (const id of ids) {
            try {
                const video = await findVideoById(id);
                if (!video) {
                    errors.push(`未找到ID为${id}的视频`);
                    continue;
                }
                
                // 验证视频状态，只有状态为1（等待下载）的视频才能加入队列
                if (video.state !== 1) {
                    errors.push(`ID为${id}的视频状态不适合下载（当前状态: ${video.state}）`);
                    continue;
                }
                
                // 更新状态为2（正在下载）
                await updateVideoState(id, 2);
                videoItems.push(video);
            } catch (err) {
                errors.push(`处理ID为${id}的视频时出错: ${err.message}`);
            }
        }
        
        if (videoItems.length === 0) {
            // 如果没有有效的视频项，返回错误
            return res.status(400).json({
                success: false,
                message: '没有有效的视频项可以下载',
                errors
            });
        }
        
        // 判断是立即下载还是定时下载
        if (downloadConfig.delaySeconds > 0) {
            // 定时下载
            const delay = downloadConfig.delaySeconds * 1000; // 转为毫秒
            const scheduledTime = new Date(Date.now() + delay);
            
            // 格式化时间为可读格式，用于显示
            const formattedTime = scheduledTime.toLocaleString('zh-CN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false
            });
            
            // 计算可读的延迟时间描述
            const hours = Math.floor(downloadConfig.delaySeconds / 3600);
            const minutes = Math.floor((downloadConfig.delaySeconds % 3600) / 60);
            const seconds = downloadConfig.delaySeconds % 60;
            
            const timeText = [];
            if (hours > 0) timeText.push(`${hours}小时`);
            if (minutes > 0) timeText.push(`${minutes}分钟`);
            if (seconds > 0) timeText.push(`${seconds}秒`);
            const delayText = timeText.length > 0 ? timeText.join('') : '0秒';
            
            // 使用scheduleManager管理定时任务
            const task = scheduleManager.addScheduledTask(
                ids, // 任务ID数组
                downloadConfig, // 下载配置
                downloadConfig.delaySeconds, // 延迟时间（秒）
                scheduledTime, // 计划执行时间
                async () => {
                    try {
                        // 配置下载队列，移除delaySeconds参数
                        const { delaySeconds, ...configWithoutDelay } = downloadConfig;
                        downloadQueue.configDownload(configWithoutDelay);
                        downloadQueue.addToQueue(videoItems);
                        
                        console.log(`定时任务已开始执行，下载${videoItems.length}个视频`);
                    } catch (error) {
                        console.error('定时任务执行失败:', error);
                    }
                }
            );
            
            return res.status(200).json({
                success: true,
                message: `已设置定时下载任务，将在${delayText}后开始下载`,
                data: {
                    taskId: task.taskId, // 添加任务ID
                    scheduledTime: formattedTime,
                    delayInSeconds: downloadConfig.delaySeconds,
                    addedItems: videoItems.map(item => ({
                        id: item._id,
                        title: item.title
                    })),
                    errors: errors.length > 0 ? errors : undefined
                }
            });
        } else {
            // 立即下载
            // 配置下载队列，移除delaySeconds参数
            const { delaySeconds, ...configWithoutDelay } = downloadConfig;
            downloadQueue.configDownload(configWithoutDelay);
            
            // 添加到下载队列
            const addedItems = downloadQueue.addToQueue(videoItems);
            
            return res.status(200).json({
                success: true,
                message: `已将${addedItems.length}个视频添加到下载队列`,
                data: {
                    addedItems: addedItems.map(item => ({
                        id: item._id,
                        title: item.title
                    })),
                    errors: errors.length > 0 ? errors : undefined
                }
            });
        }
    } catch (error) {
        console.error('添加下载任务时出错:', error);
        return res.status(500).json({
            success: false,
            message: `添加下载任务失败: ${error.message}`
        });
    }
});

/**
 * 暂停所有下载任务
 * @route POST /api/pauseAll
 */
router.post('/pauseAll', (req, res) => {
    try {
        downloadQueue.pause();
        return res.status(200).json({
            success: true,
            message: '已暂停所有下载任务'
        });
    } catch (error) {
        console.error('暂停下载任务时出错:', error);
        return res.status(500).json({
            success: false,
            message: `暂停下载任务失败: ${error.message}`
        });
    }
});

/**
 * 继续所有下载任务
 * @route POST /api/resumeAll
 */
router.post('/resumeAll', (req, res) => {
    try {
        downloadQueue.resume();
        return res.status(200).json({
            success: true,
            message: '已继续所有下载任务'
        });
    } catch (error) {
        console.error('继续下载任务时出错:', error);
        return res.status(500).json({
            success: false,
            message: `继续下载任务失败: ${error.message}`
        });
    }
});

/**
 * 取消下载任务
 * @route POST /api/cancelDownload
 * @param {Object} req.body - 请求体
 * @param {string} req.body.id - 要取消的视频ID
 */
router.post('/cancelDownload', async (req, res) => {
    try {
        const { id } = req.body;
        
        if (!id) {
            return res.status(400).json({
                success: false,
                message: '缺少必要参数'
            });
        }

        // 更新状态为待下载
        await updateVideoState(id, 1);
        
        // 从下载队列中取消任务
        await downloadQueue.cancelDownload(id);

        return res.status(200).json({
            success: true,
            message: '已取消下载任务'
        });
    } catch (error) {
        console.error('取消下载任务时出错:', error);
        return res.status(500).json({
            success: false,
            message: `取消下载任务失败: ${error.message}`
        });
    }
});

/**
 * 删除已下载视频
 * @route POST /api/deleteDownloaded
 * @param {Object} req.body - 请求体
 * @param {string} req.body.id - 要删除的视频ID
 */
router.post('/deleteDownloaded', async (req, res) => {
    try {
        const { id } = req.body;
        
        if (!id) {
            return res.status(400).json({
                success: false,
                message: '缺少必要参数'
            });
        }

        // 获取视频信息
        const video = await findVideoById(id);
        if (!video) {
            return res.status(404).json({
                success: false,
                message: '未找到视频记录'
            });
        }

        // 删除视频文件
        const source = video.source || 'unknown';
        const downloadDir = path.join(process.cwd(), 'video', source);
        const files = fs.readdirSync(downloadDir);
        
        // 查找并删除相关视频文件
        files.forEach(file => {
            if (file.includes(video.title)) {
                const filePath = path.join(downloadDir, file);
                fs.unlinkSync(filePath);
            }
        });

        // 从数据库中删除记录
        await deleteVideoById(id);

        return res.status(200).json({
            success: true,
            message: '已删除视频文件和相关记录'
        });
    } catch (error) {
        console.error('删除视频时出错:', error);
        return res.status(500).json({
            success: false,
            message: `删除视频失败: ${error.message}`
        });
    }
});

/**
 * 删除所有已下载视频
 * @route POST /api/deleteAllDownloaded
 */
router.post('/deleteAllDownloaded', async (req, res) => {
    try {
        // 获取所有已下载的视频（状态为3）
        const { results: downloadedVideos } = await findVideosByState(3);
        
        // 删除所有视频文件
        const videoDir = path.join(process.cwd(), 'video');
        const sources = ['douyin', 'kuaishou', 'bilibili', 'html'];
        
        for (const source of sources) {
            const sourceDir = path.join(videoDir, source);
            if (fs.existsSync(sourceDir)) {
                const files = fs.readdirSync(sourceDir);
                for (const file of files) {
                    const filePath = path.join(sourceDir, file);
                    fs.unlinkSync(filePath);
                }
            }
        }

        // 删除数据库中的记录
        for (const video of downloadedVideos) {
            await deleteVideoById(video._id);
        }

        return res.status(200).json({
            success: true,
            message: '已删除所有视频文件和相关记录'
        });
    } catch (error) {
        console.error('删除所有视频时出错:', error);
        return res.status(500).json({
            success: false,
            message: `删除所有视频失败: ${error.message}`
        });
    }
});

/**
 * 删除指定视频列表项
 * @route POST /api/deleteItems
 * @param {Object} req.body - 请求体
 * @param {Array} req.body.ids - 要删除的视频ID数组
 */
router.post('/deletePendingTasks', async (req, res) => {
    try {
        const { ids } = req.body;
        
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: '缺少必要参数或IDs数组为空'
            });
        }

        const results = {
            success: [],
            failed: []
        };

        // 遍历处理每个ID
        for (const id of ids) {
            try {
                // 获取视频信息
                const video = await findVideoById(id);
                
                if (!video) {
                    results.failed.push({
                        id,
                        reason: '未找到视频记录'
                    });
                    continue;
                }

                // 如果视频当前正在下载，先取消下载
                if (video.state === 2) {
                    try {
                        await downloadQueue.cancelDownload(id);
                    } catch (cancelError) {
                        console.warn(`取消下载ID为${id}的视频时出错:`, cancelError);
                    }
                }

                // 如果视频已下载(状态为3)，删除视频文件
                if (video.state === 3) {
                    try {
                        const source = video.source || 'unknown';
                        const downloadDir = path.join(process.cwd(), 'video', source);
                        
                        if (fs.existsSync(downloadDir)) {
                            const files = fs.readdirSync(downloadDir);
                            
                            // 查找并删除相关视频文件
                            files.forEach(file => {
                                if (file.includes(video.title)) {
                                    const filePath = path.join(downloadDir, file);
                                    fs.unlinkSync(filePath);
                                }
                            });
                        }
                    } catch (fileError) {
                        console.warn(`删除ID为${id}的视频文件时出错:`, fileError);
                    }
                }

                // 从数据库中删除记录
                await deleteVideoById(id);
                results.success.push(id);
            } catch (error) {
                console.error(`删除ID为${id}的视频时出错:`, error);
                results.failed.push({
                    id,
                    reason: error.message
                });
            }
        }

        return res.status(200).json({
            success: true,
            message: `成功删除${results.success.length}项，失败${results.failed.length}项`,
            data: results
        });
    } catch (error) {
        console.error('批量删除视频时出错:', error);
        return res.status(500).json({
            success: false,
            message: `批量删除视频失败: ${error.message}`
        });
    }
});

/**
 * 直接保存视频链接
 * @route POST /api/saveVideoLink
 * @param {Object} req.body - 请求体
 * @param {string} req.body.videoLink - 视频链接 (mp4或m3u8)
 * @returns {Object} 操作结果
 */
router.post('/saveVideoLink', async (req, res) => {
    try {
        console.log('接收到保存视频链接请求，请求体类型:', typeof req.body);
        
        // 检查请求体是否存在
        if (!req.body) {
            console.error('请求体为undefined');
            return res.status(400).json({
                success: false,
                message: '无法解析请求体'
            });
        }
        
        const videoLink = req.body.videoLink;
        console.log('解析的videoLink:', videoLink);
        
        if (!videoLink) {
            return res.status(400).json({
                success: false,
                message: '缺少必要参数: videoLink'
            });
        }

        // 验证链接是否为视频链接
        const isValidVideoLink = videoLink.includes('.mp4') || 
                                videoLink.includes('.m3u8') || 
                                videoLink.includes('/mp4') ||
                                videoLink.toLowerCase().includes('video');
        
        if (!isValidVideoLink) {
            return res.status(400).json({
                success: false,
                message: '提供的链接不是有效的视频链接'
            });
        }

        // 生成时间戳，格式: YYYY-MM-DD_HH:MM:SS
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const formattedTime = `${year}-${month}-${day}_${hours}:${minutes}:${seconds}`;

        let title;
        if (req.body.title) {
            // 如果提供了title，使用 title_时间戳 格式
            title = `${req.body.title}_${formattedTime}`;
        } else {
            // 如果没有提供title，从URL中提取主机名作为标题的一部分
            let hostname;
            try {
                const urlObj = new URL(videoLink);
                hostname = urlObj.hostname;
            } catch (e) {
                hostname = 'unknown';
            }
            title = `${formattedTime}_${hostname}`;
        }

        // 保存到数据库
        const result = await saveVideo(title, videoLink, 'html');

        return res.status(200).json({
            success: true,
            message: '视频链接已保存',
            data: result
        });
    } catch (error) {
        console.error('保存视频链接时出错:', error);
        return res.status(500).json({
            success: false,
            message: `保存视频链接失败: ${error.message}`
        });
    }
});

module.exports = router; 