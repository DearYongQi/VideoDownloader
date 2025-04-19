const express = require('express');
const router = express.Router();
const { findVideosByState, updateVideoState } = require('../../db/dbService');
const fs = require('fs');
const path = require('path');

/**
 * 根据状态查询视频列表
 * 请求参数：state (必填)，表示要查询的视频状态
 */
router.get('/videos', async (req, res) => {
    try {
        const { state } = req.query;
        
        // 参数验证
        if (state === undefined) {
            return res.status(400).json({
                success: false,
                message: '缺少必要参数：state'
            });
        }
        
        // 确保state是数字
        const stateNum = parseInt(state, 10);
        if (isNaN(stateNum)) {
            return res.status(400).json({
                success: false,
                message: 'state参数必须是数字'
            });
        }
        
        // 查询指定状态的视频列表
        const result = await findVideosByState(stateNum);
        
        return res.status(200).json({
            success: true,
            data: result.results,
            count: result.results.length,
            inMemoryOnly: result.inMemoryOnly || false
        });
    } catch (error) {
        console.error('查询视频列表时出错:', error);
        return res.status(500).json({
            success: false,
            message: `查询视频列表失败: ${error.message}`
        });
    }
});

/**
 * 修改视频状态
 * 请求体参数：id (必填)，表示要修改的视频ID
 *           state (必填)，表示要修改的目标状态
 */
router.put('/video/state', async (req, res) => {
    try {
        const { id, state } = req.body;
        
        // 参数验证
        if (!id) {
            return res.status(400).json({
                success: false,
                message: '缺少必要参数：id'
            });
        }
        
        if (state === undefined) {
            return res.status(400).json({
                success: false,
                message: '缺少必要参数：state'
            });
        }
        
        // 确保state是数字
        const stateNum = parseInt(state, 10);
        if (isNaN(stateNum)) {
            return res.status(400).json({
                success: false,
                message: 'state参数必须是数字'
            });
        }
        
        // 修改视频状态
        const result = await updateVideoState(id, stateNum);
        
        if (!result.updated) {
            return res.status(404).json({
                success: false,
                message: result.message || '未找到指定ID的视频'
            });
        }
        
        return res.status(200).json({
            success: true,
            message: '视频状态更新成功',
            data: result.doc
        });
    } catch (error) {
        console.error('修改视频状态时出错:', error);
        return res.status(500).json({
            success: false,
            message: `修改视频状态失败: ${error.message}`
        });
    }
});

/**
 * 检查文件是否存在
 * 请求参数：path (必填)，表示要检查的文件路径
 */
router.get('/checkFile', (req, res) => {
    try {
        const { path: filePath } = req.query;
        
        // 参数验证
        if (!filePath) {
            return res.status(400).json({
                success: false,
                exists: false,
                message: '缺少必要参数：path'
            });
        }
        
        // 检查文件是否存在
        fs.access(filePath, fs.constants.F_OK, (err) => {
            if (err) {
                return res.status(200).json({
                    success: true,
                    exists: false
                });
            }
            
            return res.status(200).json({
                success: true,
                exists: true
            });
        });
    } catch (error) {
        console.error('检查文件是否存在时出错:', error);
        return res.status(500).json({
            success: false,
            exists: false,
            message: `检查文件失败: ${error.message}`
        });
    }
});

module.exports = router; 