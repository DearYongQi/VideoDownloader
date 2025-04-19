const express = require('express');
const router = express.Router();
const { getBilibiliCookie, updateBilibiliCookie } = require('../../db/dbService');

/**
 * 获取 bilibili Cookie
 * GET /api/bilibili/cookie
 */
router.get('/bilibili/cookie', async (req, res) => {
    try {
        // 获取 bilibili Cookie
        const result = await getBilibiliCookie();
        
        if (result.error) {
            return res.status(500).json({
                code: 500,
                error: `获取 bilibili Cookie 失败: ${result.message}`
            });
        }
        
        // 返回 Cookie 信息
        return res.status(200).json({
            code: 200,
            exists: result.exists,
            cookie: result.cookie,
            updatedAt: result.updatedAt
        });
    } catch (error) {
        console.error('获取 bilibili Cookie 路由出错:', error);
        return res.status(500).json({
            code: 500,
            error: `获取 bilibili Cookie 路由出错: ${error.message}`
        });
    }
});

/**
 * 更新 bilibili Cookie
 * POST /api/bilibili/cookie
 * 请求体：{ cookie: "bilibili cookie 字符串" }
 */
router.post('/bilibili/cookie', async (req, res) => {
    try {
        const { cookie } = req.body;
        
        if (!cookie || typeof cookie !== 'string') {
            return res.status(400).json({
                code: 400,
                error: '请提供有效的 bilibili Cookie 字符串'
            });
        }
        
        // 更新 bilibili Cookie
        const result = await updateBilibiliCookie(cookie);
        
        // 返回更新结果
        return res.status(200).json({
            code: 200,
            message: result.created ? 'Cookie 创建成功' : 'Cookie 更新成功',
            updatedAt: result.updatedAt
        });
    } catch (error) {
        console.error('更新 bilibili Cookie 路由出错:', error);
        return res.status(500).json({
            code: 500,
            error: `更新 bilibili Cookie 路由出错: ${error.message}`
        });
    }
});

module.exports = router; 