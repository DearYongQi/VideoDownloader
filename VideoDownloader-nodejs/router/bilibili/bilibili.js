const express = require('express');
const router = express.Router();
const { saveVideo, getBilibiliCookie } = require('../../db/dbService');
const axios = require('axios');

// 提取B站链接中的视频ID
function extractBilibiliIds(url) {
    // 匹配B站链接的正则表达式
    const bvRegex = /BV[a-zA-Z0-9]+/;
    const avRegex = /av(\d+)/;
    
    const bvMatch = url.match(bvRegex);
    const avMatch = url.match(avRegex);
    
    return {
        bvid: bvMatch ? bvMatch[0] : null,
        aid: avMatch ? avMatch[1] : null
    };
}

// 清理标题，只保留汉字和英文
function cleanTitle(title) {
    if (!title) return "未知标题";
    // 只保留汉字和英文字母，去掉空格、符号等
    return title.replace(/[^\u4e00-\u9fa5a-zA-Z]/g, '');
}

// 验证URL是否为B站官方链接
function isValidBilibiliUrl(url) {
    // 检查URL是否包含bilibili.com
    return url && typeof url === 'string' && 
           (url.includes('bilibili.com/video/') || 
            url.includes('b23.tv/') || 
            url.includes('bili.tv/'));
}

// 获取B站视频信息
async function getBilibiliVideoInfo(bvid) {
    try {
        if (!bvid) {
            return {
                success: false,
                error: '无效的B站视频ID'
            };
        }

        // 使用bvid请求API获取视频信息
        const apiUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
        
        const response = await axios.get(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15'
            }
        });
        
        if (response.data && response.data.code === 0 && response.data.data) {
            const data = response.data.data;
            return {
                success: true,
                title: data.title,
                aid: data.aid,
                bvid: data.bvid,
                cid: data.cid
            };
        } else {
            return {
                success: false,
                error: `API请求失败: ${response.data.message || '未知错误'}`
            };
        }
    } catch (error) {
        console.error('获取B站视频信息失败:', error);
        return {
            success: false,
            error: `获取B站视频信息失败: ${error.message}`
        };
    }
}

// 获取B站视频下载链接
async function getBilibiliVideoUrl(aid, bvid, cid, providedCookie) {
    console.log(aid, bvid, cid);
    try {
        // 首先检查是否提供了 cookie，如果没有则从数据库获取
        let cookie = providedCookie;
        if (!cookie || cookie.trim() === '') {
            const cookieResult = await getBilibiliCookie();
            if (cookieResult.exists) {
                cookie = cookieResult.cookie;
                console.log('使用数据库中保存的 Cookie');
            } else {
                console.log('未提供 Cookie 且数据库中不存在 Cookie');
            }
        }
        
        const apiUrl = `https://api.bilibili.com/x/player/playurl?avid=${aid}&bvid=${bvid}&cid=${cid}&qn=80&fnver=0&fnval=0&fourk=1&ep_id=&type=mp4&otype=json&platform=html5&high_quality=1`;
        
        const response = await axios.get(apiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Safari/605.1.15',
                'Cookie': cookie || ''
            }
        });
        
        if (response.data && response.data.code === 0) {
            // 检查cookie是否有效
            const acceptDescription = response.data.data.accept_description || [];
            const hasHighQuality = acceptDescription.some(desc => 
                desc.includes('1080P') || desc.includes('720P')
            );
            
            if (!hasHighQuality) {
                return {
                    success: false,
                    error: 'Cookie无效或已过期，无法获取高清视频'
                };
            }
            
            // 获取视频URL
            const durl = response.data.data.durl;
            if (durl && durl.length > 0 && durl[0].url) {
                return {
                    success: true,
                    videoUrl: durl[0].url
                };
            } else {
                return {
                    success: false,
                    error: '无法获取视频下载链接'
                };
            }
        } else {
            return {
                success: false,
                error: `API请求失败: ${response.data.message || '未知错误'}`
            };
        }
    } catch (error) {
        console.error('获取B站视频下载链接失败:', error);
        return {
            success: false,
            error: `获取B站视频下载链接失败: ${error.message}`
        };
    }
}

// B站视频处理路由
router.post('/bilibili', async (req, res) => {
    try {
        const { url, cookie } = req.body;

        if (!url) {
            return res.status(400).json({
                code: 400,
                error: '请提供B站视频链接'
            });
        }

        // 验证URL是否为B站官方链接
        if (!isValidBilibiliUrl(url)) {
            return res.status(400).json({
                code: 400,
                error: '无效的B站视频链接'
            });
        }

        console.log(`处理B站链接: ${url}`);

        // 提取视频ID
        const { bvid, aid } = extractBilibiliIds(url);
        
        if (!bvid && !aid) {
            return res.status(400).json({
                code: 400,
                error: '无法从链接中提取视频ID'
            });
        }

        // 获取视频信息
        const videoInfo = await getBilibiliVideoInfo(bvid || aid);
        
        if (!videoInfo.success) {
            return res.status(400).json({
                code: 400,
                error: videoInfo.error
            });
        }

        // 获取视频下载链接
        const videoUrlResult = await getBilibiliVideoUrl(
            videoInfo.aid, 
            videoInfo.bvid, 
            videoInfo.cid, 
            cookie
        );
        
        if (!videoUrlResult.success) {
            return res.status(400).json({
                code: 400,
                error: videoUrlResult.error
            });
        }

        // 清理标题
        const cleanedTitle = cleanTitle(videoInfo.title);

        // 保存到数据库
        const saveResult = await saveVideo(cleanedTitle, videoUrlResult.videoUrl, 'bilibili');

        return res.status(200).json({
            code: 200,
            message: '成功获取视频',
            title: cleanedTitle,
            videoUrl: videoUrlResult.videoUrl,
            dbSaveResult: saveResult
        });
    } catch (error) {
        console.error('B站视频处理路由出错:', error);
        return res.status(400).json({
            code: 400,
            error: `B站视频处理路由出错: ${error.message}`
        });
    }
});

module.exports = router;
