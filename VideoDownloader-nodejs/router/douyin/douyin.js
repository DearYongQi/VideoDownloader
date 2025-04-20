const express = require('express');
const puppeteer = require('puppeteer');
const router = express.Router();
const { saveVideo } = require('../../db/dbService');
const axios = require('axios');

// 提取抖音分享链接中的真实链接
function extractDouyinUrl(shareText) {
    // 匹配抖音链接的正则表达式
    const regex = /https:\/\/v\.douyin\.com\/[a-zA-Z0-9_-]+\//;
    const match = shareText.match(regex);
    return match ? match[0] : null;
}

// 清理标题，只保留汉字和英文
function cleanTitle(title) {
    if (!title) return Date.now().toString();
    // 只保留汉字和英文字母，去掉空格、符号等
    return title.replace(/[^\u4e00-\u9fa5a-zA-Z]/g, '');
}

// 异步测试视频链接是否可用于下载
async function testVideoSource(url) {
    try {
        // 检查URL是否有效
        if (!url || typeof url !== 'string' || !url.startsWith('http')) {
            return { isValid: false, reason: 'Invalid URL format' };
        }

        // 发送HEAD请求检查链接有效性
        const response = await axios({
            method: 'HEAD',
            url,
            timeout: 5000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:89.0) Gecko/20100101 Firefox/89.0'
            }
        });

        // 检查状态码
        if (response.status !== 200) {
            return { isValid: false, reason: `Status code: ${response.status}` };
        }

        // 检查内容类型是否为视频
        const contentType = response.headers['content-type'] || '';
        if (!contentType.includes('video')) {
            return { isValid: false, reason: `Invalid content type: ${contentType}` };
        }

        // 检查是否有内容长度（表示可下载）
        const contentLength = response.headers['content-length'];
        if (!contentLength || parseInt(contentLength) <= 0) {
            return { isValid: false, reason: 'No content length' };
        }

        return {
            isValid: true,
            contentType,
            contentLength: parseInt(contentLength),
            url
        };
    } catch (error) {
        return {
            isValid: false,
            reason: error.message || 'Request failed',
            url
        };
    }
}

// 抖音视频处理路由
router.post('/douyin', async (req, res) => {
    let browser = null;

    try {
        const { url } = req.body;

        if (!url) {
            return res.status(400).json({
                code: 400,
                error: '请提供抖音分享链接'
            });
        }

        // 提取抖音链接
        const douyinUrl = extractDouyinUrl(url);
        if (!douyinUrl) {
            return res.status(400).json({
                code: 400,
                error: '无效的抖音分享链接'
            });
        }

        console.log(`处理抖音链接: ${douyinUrl}`);

        // 启动浏览器
        const puppeteerConfig = {};
        
        // 改进环境检测逻辑，更精确地识别树莓派
        const isRaspberryPi = process.platform === 'linux' && 
                             (process.arch === 'arm' || process.arch === 'arm64') && 
                             require('fs').existsSync('/usr/bin/chromium-browser');
        
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
                '--disable-extensions',
                '--window-size=1920,1080',
                '--user-agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15"',
                '--js-flags=--expose-gc',
                '--disable-backgrounding-occluded-windows',
                '--disable-component-extensions-with-background-pages'
            ];
            // 在树莓派上强制使用无头模式
            puppeteerConfig.headless = true;
        } else {
            // Mac 或其他环境使用默认配置
            console.log('使用默认浏览器配置');
            puppeteerConfig.headless = true;
            puppeteerConfig.args = ['--no-sandbox', '--disable-setuid-sandbox'];
        }
        
        browser = await puppeteer.launch(puppeteerConfig);

        try {
            const page = await browser.newPage();
            
            // 设置网络条件为高速网络
            await page.emulateNetworkConditions({
                download: 125000000,  // 1000 Mbps
                upload: 125000000,
                latency: 1
            });

            // 增强Mac模拟能力
            await page.evaluateOnNewDocument(() => {
                // 覆盖navigator对象，模拟Mac系统
                Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
                Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15' });
                
                // 模拟Mac的其他特性
                Object.defineProperty(navigator, 'appVersion', { get: () => '5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15' });
                Object.defineProperty(screen, 'colorDepth', { get: () => 24 });
                Object.defineProperty(window, 'devicePixelRatio', { get: () => 2 });
                
                // 防止检测webdriver
                delete navigator.__proto__.webdriver;
            });

            await page.emulate({
                viewport: { 
                    width: 1920, 
                    height: 1080,
                    deviceScaleFactor: 2,
                    isMobile: false,
                    hasTouch: false,
                    isLandscape: true
                }
            });

            // 使用Mac用户代理
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15');

            // 收集找到的视频URL
            const videoUrls = new Set();

            // 监控XHR/Fetch响应，查找视频URL
            page.on('response', async response => {
                try {
                    const url = response.url();
                    if (url.includes('.mp4') || url.includes('.m3u8')) {
                        videoUrls.add(url);
                        console.log(`从网络请求中发现视频URL: ${url.substring(0, 100)}...`);
                    }
                } catch (error) {
                    // 忽略错误
                }
            });

            // 导航到抖音链接
            console.log(`正在打开抖音链接: ${douyinUrl}`);
            await page.goto(douyinUrl, { waitUntil: "domcontentloaded", timeout: isRaspberryPi ? 60000 : 30000 });

            // 等待页面加载完成
            try {
                await page.waitForSelector('video', { timeout: 10000 });
                console.log('成功找到视频元素');
            } catch (error) {
                console.warn('未找到视频元素，继续尝试获取链接');
            }

            // 尝试自动滚动页面，触发更多资源加载
            await page.evaluate(() => {
                window.scrollBy(0, 300);
                window.scrollBy(0, -200);
            });
            
            // 等待资源加载
            await new Promise(resolve => setTimeout(resolve, 3000));

            // 提取视频标题
            let title = await page.evaluate(() => {
                const titleEl = document.querySelector('title') ||
                    document.querySelector('h1');
                return titleEl ? titleEl.textContent.trim() : Date.now().toString();
            });

            console.log(`原始标题: ${title}`);
            title = cleanTitle(title);
            console.log(`清理后标题: ${title}`);

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
            const sources = Array.from(videoUrls);
            console.log(`找到 ${sources.length} 个视频源链接`);

            // 测试所有视频源
            const sourceResults = [];
            for (let i = 0; i < sources.length; i++) {
                console.log(`测试视频源 ${i + 1}/${sources.length}: ${sources[i].substring(0, 100)}...`);
                const result = await testVideoSource(sources[i]);
                sourceResults.push({ ...result, index: i });
                console.log(`视频源 ${i + 1} 测试结果:`, result.isValid ? '可用' : '不可用', result.reason || '');
            }

            // 找出可下载的视频源
            let downloadableSource = null;
            
            // 智能排序视频源 - 优先选择真实视频而非广告
            const sortedSources = [...sourceResults].sort((a, b) => {
                // 首先确保都是可用的
                if (a.isValid && !b.isValid) return -1;
                if (!a.isValid && b.isValid) return 1;
                
                // 广告特征检测 - 抖音广告通常在静态CDN，真实视频在vod服务上
                const isAdsA = a.url.includes('static') || a.url.includes('douyinstatic') || a.url.includes('uuu_');
                const isAdsB = b.url.includes('static') || b.url.includes('douyinstatic') || b.url.includes('uuu_');
                
                if (isAdsA && !isAdsB) return 1;  // a是广告，b不是，b优先
                if (!isAdsA && isAdsB) return -1; // a不是广告，b是，a优先
                
                // 真实视频特征 - 通常包含这些路径
                const isRealVideoA = a.url.includes('/play/') || a.url.includes('aweme/v1/play') || a.url.includes('video/tos');
                const isRealVideoB = b.url.includes('/play/') || b.url.includes('aweme/v1/play') || b.url.includes('video/tos');
                
                if (isRealVideoA && !isRealVideoB) return -1;
                if (!isRealVideoA && isRealVideoB) return 1;
                
                // 如果内容长度可用，优先选择较大的文件（真实视频通常更大）
                if (a.contentLength && b.contentLength) {
                    return b.contentLength - a.contentLength;
                }
                
                // 如果以上都不能区分，保持原有顺序
                return 0;
            });
            
            // 挑选第一个可用的源
            downloadableSource = sortedSources.find(source => source.isValid);

            if (!downloadableSource) {
                return res.status(400).json({
                    code: 400,
                    error: '未找到可下载的视频源',
                    sources: sourceResults
                });
            }
            
            console.log(`选择的视频源: ${downloadableSource.url.substring(0, 100)}...`);

            // 保存到数据库
            const saveResult = await saveVideo(title, downloadableSource.url, 'douyin');

            return res.status(200).json({
                code: 200,
                message: '成功获取视频',
                title,
                videoUrl: downloadableSource.url,
                dbSaveResult: saveResult,
                allSources: sourceResults
            });
        } catch (error) {
            console.error('处理抖音视频失败:', error);
            return res.status(400).json({
                code: 400,
                error: `处理抖音视频失败: ${error.message}`
            });
        }
    } catch (error) {
        console.error('抖音视频处理路由出错:', error);
        return res.status(400).json({
            code: 400,
            error: `抖音视频处理路由出错: ${error.message}`
        });
    } finally {
        // 确保浏览器被关闭
        if (browser) {
            try {
                await browser.close();
            } catch (error) {
                console.error('关闭浏览器失败:', error);
            }
        }
    }
});

module.exports = router;