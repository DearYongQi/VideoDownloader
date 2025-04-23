const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const router = express.Router();
const { saveVideo } = require('../../db/dbService');
process.noDeprecation = true;

/**
 * 异步函数重试工具
 * @param {Function} fn - 要重试的异步函数
 * @param {number} retries - 最大重试次数
 * @param {number} delay - 重试之间的延迟(ms)
 * @returns {Promise} - 函数执行结果
 */
async function retryAsync(fn, retries = 3, delay = 2000) {
    let lastError;
    for (let i = 0; i < retries; i++) {
        try {
            console.log(`尝试执行操作 (第 ${i + 1}/${retries} 次)`);
            return await fn();
        } catch (error) {
            console.error(`第 ${i + 1} 次尝试失败: ${error.message}`);
            lastError = error;
            if (i < retries - 1) {
                console.log(`等待 ${delay}ms 后重试...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    throw lastError;
}

/**
 * 判断URL是否为视频链接
 * @param {string} url - URL
 * @returns {boolean} - 是否为视频链接
 */
function isVideoLink(url) {
    if (!url || typeof url !== 'string') return false;
    
    // 排除特定的视频播放页面URL模式（不是直接视频链接）
    if (url.includes('/play/') && !url.match(/\.(mp4|m3u8|webm)/i)) {
        return false;
    }
    
    // 明确的视频格式匹配
    const videoExtensions = /\.(mp4|m3u8|mov|avi|wmv|flv|mkv|webm)(\?.*)?$/i;
    if (videoExtensions.test(url)) return true;
    
    // 包含视频关键词的URL匹配
    const videoKeywords = /(video|media|stream|play)/i;
    const containsVideoKeyword = videoKeywords.test(url);
    
    // 检查URL是否包含视频格式名称但不一定以其结尾
    const containsVideoFormat = /(\.mp4|\.m3u8|\.mov|\.avi|\.wmv|\.flv|\.mkv|\.webm)/i.test(url);
    
    return containsVideoFormat || (containsVideoKeyword && url.includes('http'));
}

/**
 * 清理标题
 * @param {string} title - 原始标题
 * @param {string} url - 来源URL
 * @returns {string} - 清理后的标题
 */
function cleanTitle(title, url) {
    // 去除特殊字符，只保留汉字和字母
    const cleanedTitle = title ? title.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, '') : '';

    // 获取格式化时间戳
    const timestamp = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');

        return `${year}-${month}-${day}_${hours}:${minutes}:${seconds}`;
    };

    // 提取域名
    let domain = '';
    try {
        domain = new URL(url).hostname;
    } catch (e) {
        domain = 'unknown';
    }

    // 如果标题为空，则返回时间戳和域名
    if (!cleanedTitle) {
        return `${timestamp()}_${domain}`;
    }

    return cleanedTitle;
}

/**
 * 检查m3u8文件是否有效且包含足够片段
 * @param {string} m3u8Url - m3u8 URL
 * @returns {Promise<boolean>} - 是否有效
 */
async function validateM3U8(m3u8Url) {
    return retryAsync(async () => {
        try {
            console.log(`检查m3u8文件: ${m3u8Url}`);
            const response = await axios.get(m3u8Url, {
                timeout: 5000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15'
                }
            });
            
            if (response.status !== 200) {
                console.log(`m3u8文件请求失败: ${response.status}`);
                return false;
            }
            
            const m3u8Content = response.data;
            
            // 检查是否是有效的m3u8
            if (!m3u8Content.includes('#EXTM3U')) {
                console.log('不是有效的m3u8文件');
                return false;
            }
            
            // 计算片段数量
            let tsCount = 0;
            
            // 查找常规.ts片段
            tsCount += (m3u8Content.match(/\.ts/g) || []).length;
            
            // 查找EXTINF标记数量(每个代表一个片段)
            const extinfCount = (m3u8Content.match(/#EXTINF/g) || []).length;
            tsCount = Math.max(tsCount, extinfCount);
            
            // 如果是主播放列表，尝试解析子播放列表
            if (tsCount < 10 && m3u8Content.includes('#EXT-X-STREAM-INF')) {
                console.log('检测到主播放列表，尝试提取子播放列表');
                
                // 提取子播放列表URL及其分辨率信息
                const subPlaylists = [];
                const lines = m3u8Content.split('\n');
                
                for (let i = 0; i < lines.length; i++) {
                    if (lines[i].includes('#EXT-X-STREAM-INF') && i + 1 < lines.length) {
                        // 提取分辨率和带宽信息
                        let resolution = '';
                        let bandwidth = 0;
                        
                        const resMatch = lines[i].match(/RESOLUTION=(\d+x\d+)/);
                        if (resMatch) resolution = resMatch[1];
                        
                        const bwMatch = lines[i].match(/BANDWIDTH=(\d+)/);
                        if (bwMatch) bandwidth = parseInt(bwMatch[1]);
                        
                        let subUrl = lines[i + 1].trim();
                        if (!subUrl.startsWith('http')) {
                            // 相对URL转为绝对URL
                            const baseUrl = new URL(m3u8Url);
                            if (subUrl.startsWith('/')) {
                                subUrl = `${baseUrl.protocol}//${baseUrl.host}${subUrl}`;
                            } else {
                                const pathParts = baseUrl.pathname.split('/');
                                pathParts.pop();
                                subUrl = `${baseUrl.protocol}//${baseUrl.host}${pathParts.join('/')}/${subUrl}`;
                            }
                        }
                        
                        subPlaylists.push({
                            url: subUrl,
                            resolution: resolution,
                            bandwidth: bandwidth
                        });
                    }
                }
                
                if (subPlaylists.length > 0) {
                    console.log(`找到 ${subPlaylists.length} 个子播放列表`);
                    
                    // 按分辨率和带宽排序，优先选择高分辨率和高带宽的播放列表
                    subPlaylists.sort((a, b) => {
                        // 首先按分辨率排序 (如果有分辨率信息)
                        if (a.resolution && b.resolution) {
                            const aPixels = a.resolution.split('x').reduce((w, h) => parseInt(w) * parseInt(h), 1);
                            const bPixels = b.resolution.split('x').reduce((w, h) => parseInt(w) * parseInt(h), 1);
                            if (aPixels !== bPixels) return bPixels - aPixels; // 降序排列
                        }
                        
                        // 其次按带宽排序
                        return b.bandwidth - a.bandwidth;
                    });
                    
                    // 打印排序后的播放列表
                    subPlaylists.forEach((pl, idx) => {
                        console.log(`播放列表 #${idx+1}: 分辨率=${pl.resolution || '未知'}, 带宽=${pl.bandwidth || '未知'}`);
                    });
                    
                    // 检查最高质量的播放列表
                    return await validateM3U8(subPlaylists[0].url);
                }
            }
            
            console.log(`m3u8文件包含 ${tsCount} 个片段`);
            // 提高要求，至少需要10个片段
            return tsCount >= 10;
        } catch (err) {
            console.error(`验证m3u8文件失败: ${err.message}`);
            return false;
        }
    }, 2, 1000);
}

/**
 * 验证视频链接是否有效
 * @param {string} url - 视频URL
 * @returns {Promise<boolean>} - 是否有效
 */
async function validateVideoUrl(url) {
    return retryAsync(async () => {
        try {
            if (url.includes('.m3u8')) {
                return await validateM3U8(url);
            } else {
                // 对于mp4等直接视频链接使用HEAD请求检查
                const response = await axios.head(url, {
                    timeout: 5000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15'
                    }
                });
                
                const contentType = response.headers['content-type'] || '';
                console.log(`视频链接响应类型: ${contentType}, 状态码: ${response.status}`);
                
                const isValid = response.status === 200 && (
                    contentType.includes('video') ||
                    contentType.includes('octet-stream') ||
                    contentType.includes('application/vnd')
                );
                
                // 检查内容长度，过滤掉小型广告片段
                if (isValid && response.headers['content-length']) {
                    const contentLength = parseInt(response.headers['content-length']);
                    // 提高过滤标准，过滤掉小于2MB的文件(可能是广告或占位符)
                    const minSize = 2 * 1024 * 1024; // 2MB
                    if (contentLength < minSize) {
                        console.log(`视频文件过小 ${contentLength} 字节 (${contentLength/1024/1024} MB)，可能是广告`);
                        return false;
                    }
                    console.log(`视频文件大小: ${contentLength/1024/1024} MB`);
                }
                
                return isValid;
            }
        } catch (err) {
            console.error(`验证视频链接失败: ${err.message}`);
            return false;
        }
    }, 2, 1000);
}

/**
 * 页面内执行的脚本，提取视频链接
 * 注意：此函数将在浏览器环境中执行，不能使用Node.js特有的API
 */
function extractVideoLinksFromPage() {
    // 收集所有可能的视频链接
    const videoLinks = new Set();
    
    // 1. 从video和source标签提取
    document.querySelectorAll('video, source').forEach(el => {
        if (el.src && el.src.startsWith('http')) {
            videoLinks.add(el.src);
        }
    });
    
    // 2. 从a标签href提取
    document.querySelectorAll('a[href*=".mp4"], a[href*=".m3u8"]').forEach(el => {
        if (el.href && el.href.startsWith('http')) {
            videoLinks.add(el.href);
        }
    });
    
    // 3. 从script标签内容中提取
    const scripts = document.querySelectorAll('script');
    const videoPatterns = [
        /['"]((https?:)?\/\/[^'"]+\.mp4([?#][^'"]*)?)['"]/g,
        /['"]((https?:)?\/\/[^'"]+\.m3u8([?#][^'"]*)?)['"]/g,
        /['"]((https?:)?\/\/[^'"]+\.mov([?#][^'"]*)?)['"]/g,
        /['"]((https?:)?\/\/[^'"]+\.webm([?#][^'"]*)?)['"]/g
    ];
    
    scripts.forEach(script => {
        const content = script.textContent || '';
        videoPatterns.forEach(pattern => {
            const matches = content.matchAll(pattern);
            for (const match of matches) {
                if (match[1]) {
                    // 确保是绝对URL
                    let url = match[1];
                    if (url.startsWith('//')) {
                        url = 'https:' + url;
                    }
                    if (url.startsWith('http')) {
                        videoLinks.add(url);
                    }
                }
            }
        });
    });
    
    // 4. 查找可能的JSON数据中的视频URL
    try {
        const jsonDataElements = Array.from(scripts).filter(s => 
            s.textContent.includes('"url"') || 
            s.textContent.includes('"videoUrl"') || 
            s.textContent.includes('"video_url"')
        );
        
        jsonDataElements.forEach(element => {
            const content = element.textContent;
            // 尝试从文本中提取JSON对象
            const jsonBlocks = content.match(/\{[^{]*"(url|videoUrl|video_url)"[^}]*\}/g) || [];
            
            jsonBlocks.forEach(block => {
                try {
                    // 尝试修复不完整的JSON
                    const fixedBlock = block.replace(/'/g, '"').replace(/([{,]\s*)(\w+):/g, '$1"$2":');
                    const obj = JSON.parse(fixedBlock);
                    
                    // 检查各种可能的视频URL属性
                    const urlFields = ['url', 'videoUrl', 'video_url', 'src', 'source', 'playUrl', 'file'];
                    urlFields.forEach(field => {
                        if (obj[field] && typeof obj[field] === 'string' && obj[field].startsWith('http')) {
                            videoLinks.add(obj[field]);
                        }
                    });
                } catch (e) {
                    // 解析JSON失败，忽略
                }
            });
        });
    } catch (e) {
        // JSON提取失败，忽略
    }
    
    return Array.from(videoLinks);
}

/**
 * 自动滚动页面以触发懒加载
 * @param {Object} page - Puppeteer页面对象
 */
async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 100;
            const scrollInterval = setInterval(() => {
                window.scrollBy(0, distance);
                totalHeight += distance;
                
                // 滚动到底部或超过5000像素后停止
                if (totalHeight >= document.body.scrollHeight || totalHeight > 5000) {
                    clearInterval(scrollInterval);
                    // 滚动回顶部，再触发一次加载
                    window.scrollTo(0, 0);
                    setTimeout(resolve, 500);
                }
            }, 100);
        });
    });
}

/**
 * 爬取页面中的视频链接
 * @param {string} url - 目标网页URL
 * @returns {Promise<{links: string[], title: string}>} - 视频链接和标题
 */
async function crawlVideoLinks(url) {
    let browser = null;
    
    return retryAsync(async () => {
        try {
            console.log(`开始爬取页面: ${url}`);
            
            // 根据运行环境配置Puppeteer
            const puppeteerConfig = {};
            
            // 检测树莓派环境
            const isRaspberryPi = process.platform === 'linux' && 
                                 (process.arch === 'arm' || process.arch === 'arm64');
            
            if (isRaspberryPi) {
                console.log('检测到树莓派环境，使用特定配置');
                puppeteerConfig.executablePath = '/usr/bin/chromium-browser';
                puppeteerConfig.args = [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    '--disable-extensions',
                    '--disable-features=site-per-process',
                    '--disable-web-security',
                    '--mute-audio'
                ];
                puppeteerConfig.headless = true;
                puppeteerConfig.ignoreHTTPSErrors = true;
            } else {
                console.log('使用默认浏览器配置');
                puppeteerConfig.headless = "new";
                puppeteerConfig.args = [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-web-security',
                    '--disable-features=site-per-process',
                    '--mute-audio'
                ];
            }
            
            browser = await puppeteer.launch(puppeteerConfig);
            const page = await browser.newPage();
            
            // 设置用户代理以模拟正常浏览器
            await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15');
            
            // 设置视口大小
            await page.setViewport({ width: 1280, height: 800 });
            
            // 拦截网络请求，查找视频URL
            const interceptedVideoUrls = new Set();
            await page.setRequestInterception(true);
            
            page.on('request', request => {
                const url = request.url();
                if (isVideoLink(url)) {
                    interceptedVideoUrls.add(url);
                }
                request.continue();
            });
            
            // 监听网络响应
            page.on('response', async response => {
                const url = response.url();
                const contentType = response.headers()['content-type'] || '';
                
                // 检查内容类型是否为视频或流媒体
                if (contentType.includes('video') || 
                    contentType.includes('mpegurl') || 
                    isVideoLink(url)) {
                    interceptedVideoUrls.add(url);
                }
            });
            
            // 导航到目标URL
            console.log(`加载页面: ${url}`);
            await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: isRaspberryPi ? 60000 : 30000
            });
            
            // 等待页面加载完成
            await page.waitForSelector('body', { timeout: 10000 });
            
            // 自动滚动页面以触发懒加载
            await autoScroll(page);
            
            // 额外等待一些时间来捕获可能的异步加载资源
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // 提取页面标题
            const title = await page.evaluate(() => {
                // 尝试多种方法提取标题
                const titleElement = document.querySelector('title');
                const h1Element = document.querySelector('h1');
                const ogTitle = document.querySelector('meta[property="og:title"]');
                
                if (titleElement && titleElement.textContent.trim()) {
                    return titleElement.textContent.trim();
                } else if (h1Element && h1Element.textContent.trim()) {
                    return h1Element.textContent.trim();
                } else if (ogTitle && ogTitle.getAttribute('content')) {
                    return ogTitle.getAttribute('content');
                }
                
                return ''; // 无法获取标题
            });
            
            // 从页面中提取视频链接
            const pageLinks = await page.evaluate(extractVideoLinksFromPage);
            
            // 合并所有找到的链接
            const allLinks = [...new Set([...pageLinks, ...interceptedVideoUrls])];
            console.log(`共找到 ${allLinks.length} 个潜在视频链接`);
            
            // 关闭浏览器
            await browser.close();
            browser = null;
            
            const cleanedTitle = cleanTitle(title, url);
            console.log(`页面标题: ${cleanedTitle}`);
            
            return { links: allLinks, title: cleanedTitle };
        } catch (error) {
            console.error(`爬取页面失败: ${error.message}`);
            throw error;
        } finally {
            // 确保浏览器关闭
            if (browser) {
                await browser.close();
            }
        }
    }, 2, 3000);
}

/**
 * 筛选有效的视频链接
 * @param {string[]} links - 潜在视频链接列表
 * @returns {Promise<Array>} - 有效的视频链接信息
 */
async function filterValidVideoLinks(links) {
    const validLinks = [];
    
    // 先过滤明显的非视频链接
    const potentialLinks = links.filter(link => isVideoLink(link));
    console.log(`筛选出 ${potentialLinks.length} 个潜在视频链接`);
    
    // 并行验证链接，但限制并发数，避免过多请求
    const concurrencyLimit = 3;
    const chunks = [];
    
    // 分块处理链接
    for (let i = 0; i < potentialLinks.length; i += concurrencyLimit) {
        chunks.push(potentialLinks.slice(i, i + concurrencyLimit));
    }
    
    // 依次处理每个块
    for (const chunk of chunks) {
        // 使用Promise.all并行处理每个块中的链接
        const results = await Promise.all(
            chunk.map(async (link) => {
                try {
                    console.log(`验证链接: ${link}`);
                    const isValid = await validateVideoUrl(link);
                    if (isValid) {
                        return {
                            url: link,
                            type: link.includes('.m3u8') ? 'm3u8' : 'mp4'
                        };
                    }
                    return null;
                } catch (err) {
                    console.error(`验证链接失败: ${err.message}`);
                    return null;
                }
            })
        );
        
        // 过滤掉无效链接并添加到有效链接列表
        validLinks.push(...results.filter(result => result !== null));
    }
    
    console.log(`验证完成，找到 ${validLinks.length} 个有效视频链接`);
    return validLinks;
}

/**
 * 处理URL (直接视频链接或网页链接)
 * @param {string} url - 要处理的URL
 * @returns {Promise<Object>} - 处理结果
 */
async function processUrl(url) {
    console.log(`处理URL: ${url}`);
    
    try {
        // 检查是否是直接视频链接
        if (isVideoLink(url)) {
            console.log(`检测到直接视频链接`);
            const isValid = await validateVideoUrl(url);
            
            if (isValid) {
                // 为直接视频链接生成标题
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                let domain = '';
                try {
                    domain = new URL(url).hostname;
                } catch (e) {
                    domain = 'unknown';
                }
                
                const title = `${timestamp}_${domain}`;
                const type = url.includes('.m3u8') ? 'm3u8' : 'mp4';
                
                // 保存到数据库
                await saveVideo(title, url, 'html');
                
                return {
                    success: true,
                    message: '成功保存直接视频链接',
                    links: [{
                        url: url,
                        type: type,
                        title: title
                    }]
                };
            } else {
                throw new Error('直接视频链接无效');
            }
        }
        
        // 爬取网页中的视频链接
        const { links, title } = await crawlVideoLinks(url);
        
        if (links.length === 0) {
            return {
                success: false,
                message: '未找到任何视频链接'
            };
        }
        
        // 验证找到的视频链接
        const validLinks = await filterValidVideoLinks(links);
        
        if (validLinks.length === 0) {
            return {
                success: false,
                message: '未找到有效的视频链接'
            };
        }
        
        // 保存到数据库，为多个链接添加序号
        const savedLinks = [];
        for (let i = 0; i < validLinks.length; i++) {
            const link = validLinks[i];
            // 如果有多个链接，则从第一个开始添加序号
            let titleWithIndex = title;
            if (validLinks.length > 1) {
                const fileExt = link.type; // 获取文件类型（m3u8或mp4）
                titleWithIndex = `${title}-${i + 1}.${fileExt}`;
            }
            
            console.log(`保存第 ${i + 1} 个视频: ${titleWithIndex}`);
            await saveVideo(titleWithIndex, link.url, 'html');
            
            savedLinks.push({
                ...link,
                title: titleWithIndex
            });
        }
        
        return {
            success: true,
            message: `成功找到 ${validLinks.length} 个视频链接并保存`,
            links: savedLinks
        };
    } catch (error) {
        console.error(`处理URL失败: ${error.message}`);
        throw error;
    }
}

// 路由处理
router.post('/puppeteer', async (req, res) => {
    console.log('接收到爬取请求');
    
    // 从请求中获取URL
    const url = req.body && req.body.url;
    
    // 参数验证
    if (!url || typeof url !== 'string') {
        return res.status(400).json({
            code: 400,
            success: false,
            error: 'URL参数无效或缺失'
        });
    }
    
    try {
        const result = await processUrl(url);
        
        if (result.success) {
            res.status(200).json({
                code: 200,
                success: true,
                message: result.message,
                links: result.links
            });
        } else {
            res.status(400).json({
                code: 400,
                success: false,
                error: result.message
            });
        }
    } catch (error) {
        console.error('处理视频爬取请求失败:', error);
        res.status(500).json({
            code: 500,
            success: false,
            error: '视频爬取失败',
            message: error.message
        });
    }
});

module.exports = router;
