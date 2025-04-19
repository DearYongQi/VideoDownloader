import { useState, useEffect } from 'react';
import wsService from '../utils/websocket';

/**
 * useWebSocket - WebSocket连接管理钩子函数
 * 
 * 功能：管理WebSocket连接，处理下载进度和系统信息实时更新
 * 参数：无
 * 
 * 返回：
 * @returns {Object} 包含以下属性的对象:
 *   - isConnected {boolean} 连接状态
 *   - messages {Array} 收到的消息列表
 *   - currentDownload {Object} 当前下载的任务信息
 *   - systemInfo {Object} 系统资源使用信息
 *   - scheduledTasks {Array} 定时任务信息
 *   - reconnect {function} 重新连接的函数
 */
export default function useWebSocket() {
  // console.log('useWebSocket 被调用，组件堆栈:', new Error().stack);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState([]);
  const [currentDownload, setCurrentDownload] = useState(null);
  const [scheduledTasks, setScheduledTasks] = useState([]);
  const [systemInfo, setSystemInfo] = useState({
    network: { tx_speed: 0, rx_speed: 0 },
    disk: { total: 0, free: 0 },
    memory: { total: 0, used: 0 }
  });

  useEffect(() => {
    console.log('注册 WebSocket 监听器');

    // 建立连接
    wsService.connect();

    /**
     * 连接状态监听器
     * 
     * 功能：处理WebSocket连接状态变化
     * @param {boolean} connected - 连接状态
     */
    const connectionListener = (connected) => {
      setIsConnected(connected);
    };

    /**
     * 消息处理监听器
     * 
     * 功能：处理各类WebSocket消息
     * @param {Object} data - 消息数据
     */
    const messageListener = (data) => {
      // 确保数据对象存在
      if (!data) {
        console.warn('接收到无效的WebSocket消息');
        return;
      }

      // 先检查消息类型
      const messageType = data.type;
      if (!messageType) {
        console.warn('接收到无类型的WebSocket消息:', data);
        return;
      }

      // 提取payload或data字段
      const messagePayload = data.payload || data.data;
      
      if (messageType === 'download_progress') {
        // 下载进度更新
        if (messagePayload && messagePayload.status === 'error') {
          // 下载失败
          console.error('下载失败:', messagePayload.message || messagePayload.error || '未知错误');
          setMessages(prev => [...prev, {
            type: 'download_error',
            payload: messagePayload.progress
          }]);
          setCurrentDownload(null);
          // 下载错误时才触发一次列表刷新事件
          window.dispatchEvent(new CustomEvent('download-state-change', {
            detail: { source: 'websocket-download-error' }
          }));
        } else if (messagePayload) {
          // 正常进度更新，只更新当前下载状态，不触发列表刷新
          setCurrentDownload({
            id: messagePayload.id,
            progress: messagePayload.progress,
            type: messagePayload.type
          });
        }
      } else if (messageType === 'system_status') {
        // 系统信息更新，不触发列表刷新
        if (messagePayload) {
          setSystemInfo(messagePayload);
        }
      } else if (messageType === 'download_complete') {
        // 下载完成
        console.log('下载完成:', messagePayload);
        setMessages(prev => [...prev, data]);
        setCurrentDownload(null);
        // 下载完成后触发一次列表刷新事件
        window.dispatchEvent(new CustomEvent('download-state-change', {
          detail: { source: 'websocket-download-complete' }
        }));
      } else if (messageType === 'all_scheduled_tasks') {
        // 将数据保存到状态中
        setScheduledTasks(messagePayload);
      } else {
        // 其他消息，只记录不刷新列表
        setMessages(prev => [...prev, data]);
      }
    };

    // 注册事件监听
    const unsubscribeConnection = wsService.addEventListener('connection', connectionListener);
    const unsubscribeMessage = wsService.addEventListener('message', messageListener);

    // 清理函数
    return () => {
      console.log('清理 WebSocket 监听器');
      unsubscribeConnection();
      unsubscribeMessage();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 重新连接WebSocket
   * 
   * 功能：手动重新建立WebSocket连接
   * 返回：无
   */
  const reconnect = () => {
    wsService.connect();
  };

  return {
    isConnected,
    messages,
    currentDownload,
    systemInfo,
    scheduledTasks,
    reconnect
  };
} 