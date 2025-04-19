const express = require('express');
const puppeteer = require('puppeteer');
const router = express.Router();
const { saveVideo } = require('../../db/dbService');
const axios = require('axios');

// 提取快手分享链接中的真实链接
function extractKuaishouUrl(shareText) {
    const regex = /https?:\/\/(?:v\.kuaishou\.com\/[a-zA-Z0-9_-]+|www\.kuaishou\.com\/(?:f\/[a-zA-Z0-9_-]+|short-video\/[a-zA-Z0-9]+))/;
    const match = shareText.match(regex);
    return match ? match[0] : null;
}

// 清理标题，移除表情符号和特殊字符
function cleanTitle(title) {
    if (!title) return "未知标题";
    const cleaned = title.replace(/[\uD83C-\uDBFF\uDC00-\uDFFF]+/g, '')
                         .replace(/[^\u4e00-\u9fa5a-zA-Z0-9.,，。？?!！:：；;《》\-_\s]/g, '')
                         .trim();
    return cleaned || "未知标题";
}

// 获取重定向后的URL
async function getRedirectedUrl(url) {
    try {
        const response = await axios.get(url, {
            maxRedirects: 5,
            validateStatus: status => status < 400,
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
            }
        });
        return response.request.res.responseUrl || url;
    } catch (error) {
        console.error(`获取重定向URL失败: ${error.message}`);
        return url;
    }
}

// 基础测试视频URL是否可用
async function testVideoUrl(url) {
    try {
        if (!url || typeof url !== 'string' || !url.startsWith('http')) {
            return false;
        }
        
        const response = await axios({
            method: 'HEAD',
            url,
            timeout: 5000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
                'Referer': 'https://www.kuaishou.com/'
            }
        });
        
        return response.status === 200;
    } catch (error) {
        return false;
    }
}

// 简化版自动滚动页面
async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 100;
            const timer = setInterval(() => {
                window.scrollBy(0, distance);
                totalHeight += distance;
                if (totalHeight >= 1500) {
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    });
}

// 快手视频处理路由
router.post('/kuaishou', async (req, res) => {
    let browser = null;

    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({
                code: 400,
                error: '请提供快手分享链接'
            });
        }

        // 提取快手链接
        let kuaishouUrl = extractKuaishouUrl(url);
        if (!kuaishouUrl) {
            return res.status(400).json({
                code: 400,
                error: '无效的快手分享链接'
            });
        }

        console.log(`处理快手链接: ${kuaishouUrl}`);
        
        // 获取重定向后的URL
        kuaishouUrl = await getRedirectedUrl(kuaishouUrl);
        console.log(`重定向后的URL: ${kuaishouUrl}`);

        // 启动浏览器
        const puppeteerConfig = {};
        
        // 检测运行环境，针对不同系统设置不同配置
        const isRaspberryPi = process.platform === 'linux' && process.arch === 'arm' || process.arch === 'arm64';
        
        if (isRaspberryPi) {
            // 树莓派环境配置
            console.log('检测到树莓派环境，使用特定配置');
            puppeteerConfig.executablePath = '/usr/bin/chromium-browser';
            puppeteerConfig.args = [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--disable-features=site-per-process',
                '--disable-extensions'
            ];
        } else {
            // Mac 或其他环境使用默认配置
            console.log('使用默认浏览器配置');
            puppeteerConfig.headless = "new";
            puppeteerConfig.args = ['--no-sandbox', '--disable-setuid-sandbox'];
        }
        
        browser = await puppeteer.launch(puppeteerConfig);

        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1');
        
        // 收集找到的视频URL
        const videoUrls = new Set();

        // 监控XHR/Fetch响应，查找视频URL
        page.on('response', async response => {
            try {
                const url = response.url();
                if (url.includes('.mp4') || url.includes('.m3u8')) {
                    videoUrls.add(url);
                }
            } catch (error) {
                // 忽略错误
            }
        });

        // 导航到快手链接
        await page.goto(kuaishouUrl, { 
            waitUntil: 'networkidle2', 
            timeout: 30000 
        });
        
        // 尝试加载视频元素
        try {
            await page.waitForSelector('video', { timeout: 10000 });
        } catch (error) {
            console.log('未找到视频元素，继续尝试');
        }
        
        // 触发更多资源加载
        await autoScroll(page);
        
        // 尝试点击播放按钮
        try {
            await page.click('.play-btn', { timeout: 2000 });
            await page.waitForTimeout(2000);
        } catch (e) {
            // 忽略点击失败
        }

        // 提取视频标题
        let title = await page.evaluate(() => {
            const selectors = ['.video-info-title', '.video-title', '.title', '.desc', 'h1', '.caption-container'];
            for (const selector of selectors) {
                const el = document.querySelector(selector);
                if (el && el.textContent.trim()) {
                    return el.textContent.trim();
                }
            }
            return document.title || '未知标题';
        });

        // 清理标题
        title = cleanTitle(title);
        console.log(`标题: ${title}`);

        // 从页面提取视频链接
        const pageVideoUrls = await page.evaluate(() => {
            const urls = [];
            document.querySelectorAll('video').forEach(video => {
                if (video.src) urls.push(video.src);
            });
            document.querySelectorAll('source').forEach(source => {
                if (source.src) urls.push(source.src);
            });
            return Array.from(new Set(urls));
        });
        
        pageVideoUrls.forEach(url => videoUrls.add(url));

        // 关闭浏览器
        await browser.close();
        browser = null;

        // 转换Set为数组
        const allVideoUrls = Array.from(videoUrls);
        console.log(`找到 ${allVideoUrls.length} 个视频链接`);

        if (allVideoUrls.length === 0) {
            return res.status(400).json({
                code: 400,
                error: '未找到任何视频链接'
            });
        }

        // 测试视频链接是否可用
        let validVideoUrl = null;
        for (const videoUrl of allVideoUrls) {
            if (await testVideoUrl(videoUrl)) {
                validVideoUrl = videoUrl;
                break;
            }
        }

        if (!validVideoUrl) {
            validVideoUrl = allVideoUrls[0]; // 如果没有测试通过的链接，使用第一个链接
        }

        // 保存到数据库
        const saveResult = await saveVideo(title, validVideoUrl, 'kuaishou');

        return res.status(200).json({
            code: 200,
            message: '成功获取快手视频',
            title,
            videoUrl: validVideoUrl,
            dbSaveResult: saveResult
        });
    } catch (error) {
        console.error('处理快手视频失败:', error);
        return res.status(400).json({
            code: 400,
            error: `处理快手视频失败: ${error.message}`
        });
    } finally {
        if (browser) {
            await browser.close();
        }
    }
});

module.exports = router;
