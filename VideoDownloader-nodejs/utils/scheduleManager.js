/**
 * 定时下载任务管理器
 * 用于管理和监控所有的定时下载任务，并通过WebSocket发送实时状态
 */

// 存储所有的定时下载任务
const scheduledTasks = new Map();
let wss = null;

/**
 * 设置WebSocket服务器
 * @param {WebSocket.Server} webSocketServer - WebSocket服务器实例
 */
function setWebSocketServer(webSocketServer) {
    wss = webSocketServer;
}

/**
 * 添加定时下载任务
 * @param {string[]} ids - 任务ID数组
 * @param {Object} config - 下载配置
 * @param {number} delaySeconds - 延迟时间（秒）
 * @param {Date} scheduledTime - 计划执行时间
 * @param {function} executeCallback - 执行任务的回调函数
 * @returns {Object} 任务信息
 */
function addScheduledTask(ids, config, delaySeconds, scheduledTime, executeCallback) {
    // 创建任务ID（使用时间戳和随机数）
    const taskId = `schedule_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    
    // 创建任务对象
    const task = {
        taskId,
        ids,          // 视频任务ID数组
        config,       // 下载配置
        createdAt: new Date(), // 创建时间
        scheduledTime, // 计划执行时间
        delaySeconds,  // 延迟时间（秒）
        remainingSeconds: delaySeconds, // 剩余时间（秒）
        timerId: null, // 定时器ID
        status: 'pending', // 状态：pending, running, completed, cancelled
    };
    
    // 设置定时器
    task.timerId = setTimeout(() => {
        try {
            // 更新任务状态
            task.status = 'running';
            
            // 执行回调函数
            executeCallback();
            
            // 更新任务状态
            task.status = 'completed';
            
            // 完成后10秒从列表中移除
            setTimeout(() => {
                scheduledTasks.delete(taskId);
            }, 10);
        } catch (error) {
            console.error(`执行定时任务失败 ${taskId}:`, error);
            task.status = 'error';
            task.error = error.message;
        }
    }, delaySeconds * 1000);
    
    // 添加到任务管理器
    scheduledTasks.set(taskId, task);
    
    return task;
}

/**
 * 取消定时下载任务
 * @param {string} taskId - 任务ID
 * @returns {boolean} 是否成功取消
 */
function cancelScheduledTask(taskId) {
    const task = scheduledTasks.get(taskId);
    if (!task) {
        return false;
    }
    
    // 清除定时器
    if (task.timerId) {
        clearTimeout(task.timerId);
        task.timerId = null;
    }
    
    // 更新任务状态
    task.status = 'cancelled';
    
    // 从列表中移除
    scheduledTasks.delete(taskId);
    
    return true;
}

/**
 * 获取所有定时下载任务
 * @returns {Array} 任务列表
 */
function getAllScheduledTasks() {
    return Array.from(scheduledTasks.values());
}

/**
 * 根据视频ID获取相关的定时下载任务
 * @param {string} videoId - 视频ID
 * @returns {Array} 相关的定时下载任务
 */
function getScheduledTasksByVideoId(videoId) {
    return Array.from(scheduledTasks.values())
        .filter(task => task.ids.includes(videoId));
}

/**
 * 更新所有任务的剩余时间
 */
function updateTasksRemainingTime() {
    const now = new Date();
    
    scheduledTasks.forEach(task => {
        if (task.status === 'pending') {
            // 计算剩余时间（秒）
            const diffMs = task.scheduledTime - now;
            task.remainingSeconds = Math.max(0, Math.floor(diffMs / 1000));
        }
    });
}

/**
 * 发送所有定时任务状态
 * @param {WebSocket} ws - WebSocket连接
 */
function sendAllScheduledTasksStatus(ws) {
    if (!ws || ws.readyState !== 1) return; // 确保WebSocket连接是打开的
    
    // 先更新所有任务的剩余时间
    updateTasksRemainingTime();
    
    // 获取所有任务
    const tasks = getAllScheduledTasks();
    
    // 简化任务数据
    const tasksInfo = tasks.map(task => {
        return {
            taskId: task.taskId,
            ids: task.ids,
            scheduledTime: task.scheduledTime.toISOString(),
            remainingSeconds: task.remainingSeconds,
            status: task.status,
            error: task.error
        };
    });
    
    // 只有有任务时才发送
    if (tasksInfo.length > 0) {
        ws.send(JSON.stringify({
            type: 'all_scheduled_tasks',
            payload: tasksInfo
        }));
    }
}

// 移除定时更新单个任务状态的计时器（不再需要）

module.exports = {
    setWebSocketServer,
    addScheduledTask,
    cancelScheduledTask,
    getAllScheduledTasks,
    getScheduledTasksByVideoId,
    sendAllScheduledTasksStatus
}; 