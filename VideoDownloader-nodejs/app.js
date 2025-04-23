const express = require('express');
const http = require('http');
const cors = require('cors');
const WebSocket = require('ws');
const path = require('path');
const downloadQueue = require('./utils/downloadQueue');
const fs = require('fs');
const { saveVideo } = require('./db/dbService');

// 引入定时任务管理器
const scheduleManager = require('./utils/scheduleManager');

// 初始化Express应用
const app = express();
const server = http.createServer(app);

// 初始化WebSocket服务器
const wss = new WebSocket.Server({ server });

// 设置下载队列的WebSocket服务器
downloadQueue.setWebSocketServer(wss);

// 设置定时任务管理器的WebSocket服务器
scheduleManager.setWebSocketServer(wss);

// 中间件配置 - 确保这些中间件在所有路由之前
app.use(cors()); // 启用CORS跨域

// 设置更大的请求体限制，防止大型请求被拒绝
app.use(express.json({ limit: '10mb' })); // 解析JSON请求体 
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // 解析URL编码的请求体

// 添加一个视频链接检测中间件
app.use('/api', (req, res, next) => {
    // 只检查POST请求
    if (req.method !== 'POST') {
        return next();
    }
    
    // 确保请求体存在
    if (!req.body) {
        return next();
    }
    
    // 排除已有的视频保存接口
    if (req.path === '/saveVideoLink' || req.path === '/puppeteer') {
        return next();
    }
    
    // 安全地从请求体中获取URL，避免解构undefined
    let url, videoLink, linkToCheck;
    try {
        url = req.body.url;
        videoLink = req.body.videoLink;
        linkToCheck = videoLink || url;
        
        if (!linkToCheck || typeof linkToCheck !== 'string') {
            return next();
        }
        
        console.log(`[DEBUG] 检查链接:`, linkToCheck);
        
        // 检测是否是视频链接（与piPuppeteer.js中的逻辑保持一致）
        const isVideoLink = (link) => {
            // 严格的视频链接检测（以mp4或m3u8结尾）
            const strictMatch = /\.(mp4|m3u8)(\?.*)?$/i.test(link);
            if (strictMatch) return true;
            
            // 宽松的视频链接检测（包含mp4或m3u8，但不一定以其结尾）
            const looseMatch = /(mp4|m3u8)/i.test(link) && 
                            /(http|https):\/\//i.test(link);
            
            // 进一步检查是否包含常见视频相关路径
            const containsVideoPath = /\/(video|play|stream|media|movies?|videos?)\//.test(link);
            
            return strictMatch || (looseMatch && (containsVideoPath || link.toLowerCase().includes('video')));
        };
        
        if (isVideoLink(linkToCheck)) {
            console.log('检测到直接视频链接:', linkToCheck);
            
            // 生成标题格式：时间戳_域名
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const day = String(now.getDate()).padStart(2, '0');
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            const formattedTime = `${year}-${month}-${day}_${hours}:${minutes}:${seconds}`;
            
            // 提取域名
            let hostname = 'unknown';
            try {
                const urlObj = new URL(linkToCheck);
                hostname = urlObj.hostname;
            } catch (e) {
                console.error('解析URL失败:', e);
            }
            
            const title = `${formattedTime}_${hostname}`;
            
            // 保存到数据库并响应请求
            saveVideo(title, linkToCheck, 'html')
                .then(result => {
                    console.log('直接视频链接已保存:', result);
                    res.status(200).json({
                        success: true,
                        code: 200,
                        message: '视频链接已保存',
                        data: {
                            title,
                            videoLink: linkToCheck
                        }
                    });
                })
                .catch(err => {
                    console.error('保存直接视频链接失败:', err);
                    res.status(500).json({
                        success: false,
                        code: 500,
                        error: `保存视频链接失败: ${err.message}`
                    });
                });
            
            // 重要：阻止后续处理
            return;
        }
    } catch (err) {
        console.error('[ERROR] 处理视频链接时出错:', err);
        // 继续处理，不中断请求
    }
    
    // 继续正常处理请求
    next();
});

// 添加静态文件服务 - 提供React应用的构建文件
app.use(express.static(path.join(__dirname, 'public')));

// 使用更可靠的方式处理中文路径

// 添加一个专门处理所有视频请求的中间件
app.use('/video', (req, res, next) => {
    try {
        // 解码请求的路径
        const requestedPath = decodeURIComponent(req.path);
        // 构建完整的文件路径 (去掉开头的 / 符号)
        const filePath = path.join(__dirname, 'video', requestedPath.substring(1));
        
        // 检查文件是否存在
        fs.access(filePath, fs.constants.F_OK, (err) => {
            if (err) {
                // 如果文件不存在，尝试模糊匹配
                const dirPath = path.dirname(filePath);
                const baseName = path.basename(requestedPath);
                
                fs.readdir(dirPath, (err, files) => {
                    if (err) {
                        return next();
                    }
                    
                    // 查找文件名包含关键部分的文件
                    const matchingFile = files.find(file => {
                        // 移除文件名中的下划线及之后的部分进行比较
                        const fileMainPart = file.split('_')[0];
                        const requestMainPart = baseName.split('_')[0];
                        
                        return file.includes(requestMainPart) || requestMainPart.includes(fileMainPart);
                    });
                    
                    if (matchingFile) {
                        const matchedFilePath = path.join(dirPath, matchingFile);
                        res.sendFile(matchedFilePath);
                    } else {
                        next();
                    }
                });
            } else {
                // 文件存在，直接发送
                res.sendFile(filePath);
            }
        });
    } catch (error) {
        console.error('处理视频文件出错:', error);
        next();
    }
});

// 解析html
const xlRouter = require('./router/piPuppeteer/piPuppeteer');
app.use('/api', xlRouter);

// 添加抖音路由
const douyinRouter = require('./router/douyin/douyin');
app.use('/api', douyinRouter);

// 哔哩哔哩
const bilibiliRouter = require('./router/bilibili/bilibili');
app.use('/api', bilibiliRouter)

// 哔哩哔哩 Cookie 管理
const bilibiliCookieRouter = require('./router/bilibili/bilibiliCookie');
app.use('/api', bilibiliCookieRouter)

// 快手
const kuaishouRouter = require('./router/kuaishou/kuaishou');
app.use('/api', kuaishouRouter)

// 添加视频API路由
const videoAPIRouter = require('./router/videoAPI/videoAPI');
app.use('/api', videoAPIRouter);

// 添加下载列表路由
const downloadListRouter = require('./router/downloadList/downloadList');
app.use('/api', downloadListRouter);

// 系统监控
const systemMonitor = require('./utils/systemMonitor');

app.use((req, res, next) => {
    // 设置响应头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
}
);

// 使用正则表达式替代星号
app.get(/.*/, (req, res, next) => {
    // 避免处理/api和/video路径
    if (req.path.startsWith('/api/') || req.path.startsWith('/video/')) {
        return next();
    }
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// WebSocket连接处理
wss.on('connection', (ws) => {
    console.log('客户端已连接');
    
    // 设置定时发送系统状态
    const intervalId = setInterval(() => {
        systemMonitor.sendSystemStatus(ws);
        scheduleManager.sendAllScheduledTasksStatus(ws);
    }, 1000); // 每1秒发送一次

    ws.on('close', () => {
        console.log('客户端已断开连接');
        clearInterval(intervalId);
    });

    ws.on('error', (error) => {
        console.error('WebSocket错误:', error);
    });
});

// 启动服务器
server.on('error', (err) => {
    console.error('Server error:', err);
});

server.on('listening', () => {
    console.log('服务已启动 86');
});

// 监听端口
server.listen(86);