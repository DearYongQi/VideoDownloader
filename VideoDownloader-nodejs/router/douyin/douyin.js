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
        browser = await puppeteer.launch({});

        try {
            const page = await browser.newPage();
            
            // 设置网络条件为高速网络
            await page.emulateNetworkConditions({
                download: 125000000,  // 1000 Mbps
                upload: 125000000,
                latency: 1
            });

            await page.emulate({
                viewport: { width: 3840, height: 2160 }
            })

            // 使用mac mini 提高清晰度
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15');

            // 导航到抖音链接
            console.log(`正在打开抖音链接: ${douyinUrl}`);
            await page.goto(douyinUrl, { waitUntil: 'networkidle2', timeout: 30000 });

            // 等待页面加载完成
            try {
                await page.waitForSelector('video', { timeout: 10000 });
                console.log('成功找到视频元素');
            } catch (error) {
                console.warn('未找到视频元素，继续尝试获取链接');
            }

            // 提取视频标题
            let title = await page.evaluate(() => {
                const titleEl = document.querySelector('title') ||
                    document.querySelector('h1');
                return titleEl ? titleEl.textContent.trim() : Date.now().toString();
            });

            console.log(`原始标题: ${title}`);
            title = cleanTitle(title);
            console.log(`清理后标题: ${title}`);

            // 获取所有视频源
            const sources = await page.$$eval('video source', sources => {
                return sources.map(source => source.src).filter(src => src);
            });
            
            console.log(`找到 ${sources.length} 个视频源链接`);

            // 测试所有视频源
            const sourceResults = [];
            for (let i = 0; i < sources.length; i++) {
                console.log(`测试视频源 ${i + 1}/${sources.length}: ${sources[i].substring(0, 100)}...`);
                const result = await testVideoSource(sources[i]);
                sourceResults.push({ ...result, index: i });
                console.log(`视频源 ${i + 1} 测试结果:`, result.isValid ? '可用' : '不可用', result.reason || '');
            }

            // 关闭浏览器
            await browser.close();
            browser = null;

            // 找出可下载的视频源
            const downloadableSource = sourceResults.find(source => source.isValid);

            if (!downloadableSource) {
                return res.status(400).json({
                    code: 400,
                    error: '未找到可下载的视频源',
                    sources: sourceResults
                });
            }

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