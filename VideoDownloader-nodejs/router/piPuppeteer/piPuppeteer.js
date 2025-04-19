const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const router = express.Router();
const { saveVideo } = require('../../db/dbService');
process.noDeprecation = true;

// 添加全局重试函数 - 可处理任何异步函数
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
 * 检查URL是否是视频链接
 * @param {string} url - 要检查的URL
 * @returns {boolean} - 是否是视频链接
 */
function isVideoLink(url) {
    // 严格的视频链接检测（以mp4或m3u8结尾）
    const strictMatch = /\.(mp4|m3u8)(\?.*)?$/i.test(url);
    if (strictMatch) return true;
    
    // 宽松的视频链接检测（包含mp4或m3u8，但不一定以其结尾）
    const looseMatch = /(mp4|m3u8)/i.test(url) && 
                       /(http|https):\/\//i.test(url);
    
    // 进一步检查是否包含常见视频相关路径
    const containsVideoPath = /\/(video|play|stream|media|movies?|videos?)\//.test(url);
    
    return strictMatch || (looseMatch && (containsVideoPath || url.toLowerCase().includes('video')));
}

/**
 * 清理标题，只保留汉字
 * @param {string} title - 原始标题
 * @returns {string} - 清理后的标题
 */
function cleanTitle(title, url) {
    // 去掉空格、感叹号、@、&等符号和数字，只保留汉字
    const cleanedTitle = title ? title.replace(/[^\u4e00-\u9fa5]/g, '') : '';

    // 获取时间戳
    const timestamp = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0'); // 月份从 0 开始，需要加 1
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');

        return `${year}-${month}-${day}_${hours}:${minutes}:${seconds}`;
    }

    // 从URL提取域名
    let domain = '';

    try {
        domain = new URL(url).hostname;
    } catch (e) {
        domain = url;
    }

    // 如果清理后的标题为空，则只返回时间戳和域名
    if (!cleanedTitle) {
        return `${timestamp()}_${domain}`;
    }

    return cleanedTitle;
}

/**
 * 检查 m3u8 文件的 ts 片段数量是否足够
 * @param {string} m3u8Url - m3u8 文件地址
 * @returns {Promise<boolean>} - 如果 ts 片段数量不足 5，则返回 false
 */
async function hasEnoughTsSegments(m3u8Url) {
    return retryAsync(async () => {
        try {
            console.log(`检查m3u8文件的ts片段数量: ${m3u8Url}`);
            const response = await axios.get(m3u8Url, {
                timeout: 5000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            const m3u8Content = response.data;

            // 改进m3u8解析逻辑，寻找更多可能的ts片段模式
            let tsSegments = [];

            // 常规 .ts 结尾的片段
            const regularTsSegments = m3u8Content.split('\n').filter(line =>
                line.trim().endsWith('.ts') || line.trim().includes('.ts?')
            );

            // 查找可能包含ts但没有明确.ts扩展名的片段 (有些m3u8使用无扩展名片段或自定义格式)
            const mediaSegments = m3u8Content.split('\n').filter(line =>
                !line.startsWith('#') && line.trim() &&
                !regularTsSegments.includes(line)
            );

            // 检查是否有EXTINF标记，这表示片段定义行
            const extinfCount = (m3u8Content.match(/#EXTINF/g) || []).length;

            // 合并发现的所有可能片段
            tsSegments = [...regularTsSegments, ...mediaSegments];

            // 如果有EXTINF但没有找到足够片段，使用EXTINF数量
            if (extinfCount > 0 && tsSegments.length < extinfCount) {
                console.log(`根据EXTINF标记数量，m3u8文件应有 ${extinfCount} 个片段`);
                tsSegments = new Array(extinfCount);
            }

            console.log(`m3u8文件的片段数量为: ${tsSegments.length}`);

            // 如果是主播放列表(可能链接到子播放列表)而非分段列表
            if (tsSegments.length === 0 && m3u8Content.includes('#EXT-X-STREAM-INF')) {
                console.log('检测到主播放列表，尝试提取子播放列表链接');
                const subPlaylistUrls = [];
                const lines = m3u8Content.split('\n');

                for (let i = 0; i < lines.length; i++) {
                    if (!lines[i].startsWith('#') && lines[i].trim()) {
                        let subUrl = lines[i].trim();
                        // 构建完整URL（处理相对路径）
                        if (!subUrl.startsWith('http')) {
                            const baseUrl = new URL(m3u8Url);
                            if (subUrl.startsWith('/')) {
                                subUrl = `${baseUrl.protocol}//${baseUrl.host}${subUrl}`;
                            } else {
                                const pathParts = baseUrl.pathname.split('/');
                                pathParts.pop();  // 移除文件名
                                subUrl = `${baseUrl.protocol}//${baseUrl.host}${pathParts.join('/')}/${subUrl}`;
                            }
                        }
                        subPlaylistUrls.push(subUrl);
                    }
                }

                if (subPlaylistUrls.length > 0) {
                    console.log(`找到 ${subPlaylistUrls.length} 个子播放列表，使用第一个进行检查`);
                    // 检查第一个子播放列表
                    return await hasEnoughTsSegments(subPlaylistUrls[0]);
                }
            }

            if (tsSegments.length < 5) {
                console.log(`m3u8文件的片段不足5个，不符合要求: ${m3u8Url}`);
                return false;
            }

            return true;
        } catch (err) {
            console.error(`无法检查m3u8文件的片段: ${m3u8Url}，错误: ${err.message}`);
            return false;
        }
    }, 3, 1000);
}

/**
 * 检查 m3u8 链接是否有效
 * @param {string} url - m3u8 文件地址
 * @returns {Promise<boolean>} - 返回链接是否有效
 */
async function isValidM3U8(url) {
    return retryAsync(async () => {
        try {
            console.log(`检查m3u8链接是否有效: ${url}`);
            // 使用GET代替HEAD请求，因为有些服务器可能不支持HEAD请求
            const response = await axios.get(url, {
                timeout: 5000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });

            const isValid = response.status === 200 &&
                (response.data.includes('#EXTM3U') ||
                    response.headers['content-type']?.includes('application/vnd.apple.mpegurl') ||
                    response.headers['content-type']?.includes('application/x-mpegurl'));

            console.log(`m3u8链接${isValid ? '有效' : '无效'}: ${url}`);
            return isValid;
        } catch (err) {
            console.error(`无效的m3u8链接: ${url}，错误: ${err.message}`);
            return false;
        }
    }, 3, 1000);
}

/**
 * 检查 mp4 链接是否有效
 * @param {string} url - mp4 文件地址
 * @returns {Promise<boolean>} - 返回链接是否有效
 */
async function isValidMP4(url) {
    return retryAsync(async () => {
        try {
            console.log(`检查mp4链接是否有效: ${url}`);
            const response = await axios.head(url, {
                timeout: 5000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });

            // 检查状态码和Content-Type
            const isValid = response.status === 200 &&
                (response.headers['content-type']?.includes('video') ||
                    response.headers['content-type']?.includes('octet-stream'));

            console.log(`mp4链接${isValid ? '有效' : '无效'}: ${url}`);
            return isValid;
        } catch (err) {
            console.error(`无效的mp4链接: ${url}，错误: ${err.message}`);
            return false;
        }
    }, 3, 1000);
}

// DOM 链接提取函数（在浏览器上下文执行）
function collectVideoLinksFromDOM() {
    const isVideoLink = url => /\.(mp4|m3u8)(\?.*)?$/i.test(url);
    const links = new Set();

    // 检查 video 元素
    document.querySelectorAll('video').forEach(video => {
        if (video.src) {
            const url = new URL(video.src, location.href).href;
            if (isVideoLink(url)) links.add(url);
        }
    });

    // 检查 source 元素
    document.querySelectorAll('source').forEach(source => {
        if (source.src) {
            const url = new URL(source.src, location.href).href;
            if (isVideoLink(url)) links.add(url);
        }
    });

    // 检查所有包含视频链接的元素
    document.querySelectorAll('[src*=".mp4"], [src*=".m3u8"], [href*=".mp4"], [href*=".m3u8"]').forEach(el => {
        const src = el.src || el.href;
        if (src) {
            const url = new URL(src, location.href).href;
            if (isVideoLink(url)) links.add(url);
        }
    });

    // 尝试从JavaScript中抓取可能的视频链接
    const scripts = document.querySelectorAll('script');
    const scriptTexts = Array.from(scripts).map(script => script.textContent || '');

    // 查找m3u8链接
    const m3u8Matches = scriptTexts.join(' ').match(/(['"])(https?:\/\/[^'"]+\.m3u8(\?[^'"]*)?)\1/g) || [];

    // 查找mp4链接
    const mp4Matches = scriptTexts.join(' ').match(/(['"])(https?:\/\/[^'"]+\.mp4(\?[^'"]*)?)\1/g) || [];

    [...m3u8Matches, ...mp4Matches].forEach(match => {
        if (!match) return;
        // 提取引号中的URL
        const url = match.slice(1, -1);
        if (isVideoLink(url)) links.add(url);
    });

    return Array.from(links);
}

/**
 * 自动滚动页面以触发懒加载内容
 */
async function autoScroll(page) {
    try {
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 100;
                const timer = setInterval(() => {
                    const scrollHeight = document.body.scrollHeight;
                    window.scrollBy(0, distance);
                    totalHeight += distance;

                    if (totalHeight >= scrollHeight || totalHeight > 5000) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 100);
            });
        });
    } catch (error) {
        console.error('滚动页面时出错:', error.message);
        // 即使滚动失败，也不影响主流程
    }
}

/**
 * 使用 Puppeteer 检索网页中的视频链接
 * @param {string} url - 网页地址
 * @returns {Promise<{links: Array, title: string}>} - 视频链接列表和页面标题
 */
async function fetchVideoLinks(url) {
    let browser = null;

    return retryAsync(async () => {
        try {
            browser = await puppeteer.launch({
                headless: 'new',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process'
                ]
            });

            const page = await browser.newPage();
            const interceptedUrls = new Set();

            console.log(`正在打开浏览器...`);

            // 设置用户代理
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

            // 设置请求拦截以捕获视频链接
            await page.setRequestInterception(true);
            page.on('request', (request) => {
                const requestUrl = request.url();
                if (/\.(mp4|m3u8)(\?.*)?$/i.test(requestUrl)) {
                    interceptedUrls.add(requestUrl);
                }
                request.continue();
            });

            console.log(`正在访问 ${url}...`);
            await page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: 30000
            });
            console.log('页面加载完成');

            // 自动滚动页面以触发懒加载内容
            console.log('正在滚动页面以加载更多内容...');
            await autoScroll(page);

            // 等待可能的懒加载内容 - 使用setTimeout替代waitForTimeout
            console.log('等待额外内容加载...');
            await new Promise(resolve => setTimeout(resolve, 3000));

            // 获取页面标题
            let title = await page.evaluate(() => {
                // 按优先级尝试多种方式获取标题
                // 1. 首先尝试获取title标签内容
                const titleElement = document.querySelector('title');
                if (titleElement && titleElement.textContent.trim()) {
                    return titleElement.textContent.trim();
                }
                
                // 2. 尝试获取h1标签内容
                const h1Element = document.querySelector('h1');
                if (h1Element && h1Element.textContent.trim()) {
                    return h1Element.textContent.trim();
                }
                
                // 3. 尝试获取og:title元标签内容
                const ogTitle = document.querySelector('meta[property="og:title"]');
                if (ogTitle && ogTitle.getAttribute('content')) {
                    return ogTitle.getAttribute('content');
                }
                
                // 4. 尝试获取任何带有"title"类或ID的元素
                const titleByClass = document.querySelector('.title, .video-title, [id*="title"]');
                if (titleByClass && titleByClass.textContent.trim()) {
                    return titleByClass.textContent.trim();
                }
                
                // 5. 尝试获取其他常见的标题元素
                const h2Element = document.querySelector('h2');
                if (h2Element && h2Element.textContent.trim()) {
                    return h2Element.textContent.trim();
                }
                
                // 如果所有方法都失败，返回空字符串
                return '';
            });

            console.log('原始标题:', title);
            title = cleanTitle(title, url);
            console.log(`清理后标题: ${title}`);

            console.log(`正在提取视频链接...`);
            // 从 DOM 中提取视频链接
            const domLinks = await page.evaluate(collectVideoLinksFromDOM);

            // 合并结果并去重
            const allLinks = [...new Set([...domLinks, ...interceptedUrls])];
            console.log(`共找到 ${allLinks.length} 个可能的视频链接`);

            return { links: allLinks, title };
        } catch (error) {
            console.error(`爬取视频链接时出错: ${error.message}`);
            throw error;
        } finally {
            // 确保浏览器被关闭
            if (browser) {
                try {
                    await browser.close();
                    console.log('浏览器已关闭');
                } catch (closeError) {
                    console.error('关闭浏览器时出错:', closeError.message);
                }
            }
        }
    }, 3, 3000);
}

/**
 * 验证视频链接是否有效
 * @param {Array} links - 潜在的视频链接列表
 * @returns {Promise<Array>} - 有效的视频链接列表
 */
async function validateVideoLinks(links) {
    console.log('开始验证视频链接...');
    const validLinks = [];

    for (const link of links) {
        try {
            if (link.endsWith('.m3u8')) {
                // 验证m3u8链接
                const isValid = await isValidM3U8(link);
                if (!isValid) continue;

                // 检查ts片段数量
                const hasEnough = await hasEnoughTsSegments(link);
                if (!hasEnough) continue;

                validLinks.push({
                    url: link,
                    type: 'm3u8'
                });
            } else if (link.endsWith('.mp4')) {
                // 验证mp4链接
                const isValid = await isValidMP4(link);
                if (!isValid) continue;

                validLinks.push({
                    url: link,
                    type: 'mp4'
                });
            }
        } catch (error) {
            console.error(`验证链接 ${link} 时出错:`, error.message);
            // 继续验证下一个链接
            continue;
        }
    }

    console.log(`验证完成，找到 ${validLinks.length} 个有效的视频链接`);
    return validLinks;
}

/**
 * 检查链接类型并处理
 * @param {string} url - 要处理的URL
 * @returns {Promise<object>} - 处理结果
 */
async function processUrl(url) {
    console.log(`处理URL: ${url}`);

    try {
        // 检查URL是否是视频链接
        if (isVideoLink(url)) {
            console.log(`检测到视频链接: ${url}`);
            let isValid = false;

            try {
                // 根据链接类型验证
                if (url.includes('.m3u8')) {
                    isValid = await isValidM3U8(url);
                    if (isValid) {
                        const hasEnough = await hasEnoughTsSegments(url);
                        isValid = hasEnough;
                    }
                } else if (url.includes('.mp4')) {
                    isValid = await isValidMP4(url);
                } else {
                    // 对于其他格式的视频链接，默认考虑为有效
                    isValid = true;
                }

                if (isValid) {
                    // 使用URL中提取的信息生成标题
                    let fileName = '';
                    let hostName = '';
                    
                    try {
                        const urlObj = new URL(url);
                        fileName = path.basename(urlObj.pathname).split('?')[0] || 'video';
                        hostName = urlObj.hostname;
                    } catch (e) {
                        console.error('解析URL失败:', e);
                        fileName = 'video';
                        hostName = 'unknown';
                    }
                    
                    // 生成格式化的时间
                    const now = new Date();
                    const year = now.getFullYear();
                    const month = String(now.getMonth() + 1).padStart(2, '0');
                    const day = String(now.getDate()).padStart(2, '0');
                    const hours = String(now.getHours()).padStart(2, '0');
                    const minutes = String(now.getMinutes()).padStart(2, '0');
                    const seconds = String(now.getSeconds()).padStart(2, '0');
                    const formattedTime = `${year}-${month}-${day}_${hours}:${minutes}:${seconds}`;
                    
                    // 生成标题：时间戳_域名
                    const title = `${formattedTime}_${hostName}`;

                    // 调用saveVideo函数保存到数据库
                    try {
                        const result = await saveVideo(title, url, 'html');
                        console.log('视频链接已保存到数据库:', result);
                        
                        return {
                            success: true,
                            message: '直接保存视频链接成功',
                            links: [{
                                url: url,
                                type: url.includes('.m3u8') ? 'm3u8' : 'mp4'
                            }]
                        };
                    } catch (error) {
                        console.error('保存视频链接失败:', error);
                        throw new Error(`保存直接视频链接失败: ${error.message}`);
                    }
                } else {
                    throw new Error('视频链接无效');
                }
            } catch (error) {
                console.error('验证视频链接时出错:', error);
                throw new Error(`验证视频链接失败: ${error.message}`);
            }
        }

        // 不是直接视频链接，需要爬取
        return await processFetchVideo(url);
    } catch (error) {
        console.error('处理URL时出错:', error);
        throw error;
    }
}

// 处理爬取视频链接的主函数
async function processFetchVideo(url) {
    console.log('=== 开始处理视频链接爬取 ===');
    let retryCount = 0;
    let validLinks = [];
    let lastError = null;

    while (retryCount < 3 && validLinks.length === 0) {
        console.log(`第 ${retryCount + 1} 次尝试爬取视频链接`);

        try {
            // 爬取视频链接
            const { links, title } = await fetchVideoLinks(url);

            if (links.length === 0) {
                console.log('未找到任何视频链接，准备重试...');
                retryCount++;
                continue;
            }

            // 验证链接是否有效
            validLinks = await validateVideoLinks(links);

            if (validLinks.length === 0) {
                console.log('未找到有效视频链接，准备重试...');
                retryCount++;
            } else {
                console.log(`找到 ${validLinks.length} 个有效视频链接`);

                // 保存到数据库
                for (const link of validLinks) {
                    try {
                        await saveVideo(title, link.url, 'html');
                    } catch (error) {
                        console.error('保存到数据库失败:', error);
                    }
                }
            }
        } catch (error) {
            console.error(`第 ${retryCount + 1} 次爬取出错:`, error.message);
            lastError = error;
            retryCount++;

            // 在重试前等待一段时间
            if (retryCount < 3) {
                console.log(`等待 3 秒后重试...`);
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
    }

    if (validLinks.length === 0) {
        console.log('三次尝试后仍未找到有效视频链接');
        return {
            success: false,
            message: '未找到有效视频链接',
            error: lastError ? lastError.message : undefined
        };
    }

    return {
        success: true,
        message: '成功找到视频链接并保存',
        links: validLinks
    };
}

// 路由处理
router.post('/puppeteer', async (req, res) => {
    console.log(`接收到爬取请求，请求体类型:`, typeof req.body);
    
    // 安全地从请求体中获取URL
    let url;
    try {
        // 检查请求体是否存在
        if (!req.body) {
            console.error('请求体为undefined');
            return res.status(400).json({
                code: 400,
                success: false,
                error: '无法解析请求体'
            });
        }
        
        url = req.body.url;
        console.log(`解析的URL:`, url);
    } catch (e) {
        console.error('获取URL时出错:', e);
        return res.status(400).json({
            code: 400,
            success: false,
            error: '获取URL参数失败'
        });
    }

    // 参数校验
    if (!url || typeof url !== 'string') {
        console.log('无效的URL参数');
        return res.status(400).json({
            code: 400,
            success: false,
            error: 'url必须是非空字符串'
        });
    }

    try {
        // 处理URL
        const result = await processUrl(url);

        if (result.success) {
            console.log('处理成功，返回结果');

            res.status(200).json({
                code: 200,
                success: true,
                message: result.message,
                links: result.links
            });
        } else {
            console.log('处理失败，返回错误信息');
            res.status(400).json({
                code: 400,
                success: false,
                error: result.message,
                details: result.error
            });
        }
    } catch (err) {
        console.error('处理过程出错:', err);
        res.status(500).json({
            code: 500,
            success: false,
            error: '视频解析失败',
            message: err.message
        });
    }
});

module.exports = router;
