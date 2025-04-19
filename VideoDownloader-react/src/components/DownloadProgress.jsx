import React, { useState, useEffect } from 'react';
import { Button, Tooltip, Space, List, Modal, message, Badge } from 'antd';
import { PauseCircleOutlined, PlayCircleOutlined, StopOutlined, UnorderedListOutlined, CheckOutlined, ExclamationCircleOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { cancelDownload, pauseAllDownloads, resumeAllDownloads } from '../api';
import '../styles/DownloadProgress.scss';

/**
 * DownloadProgress - 下载进度组件
 * 
 * 功能：显示当前下载任务的进度，提供暂停/继续、取消下载和选择功能
 * 
 * 参数：
 * @param {Array} downloadingTasks - 所有正在下载的任务列表
 * @param {boolean} isSelectMode - 是否处于选择模式
 * @param {function} onToggleSelectMode - 切换选择模式的回调
 * 
 * 返回：渲染下载进度条和控制按钮
 */
const DownloadProgress = ({ 
  downloadingTasks = [],
  isSelectMode = false,
  onToggleSelectMode = () => {},
  currentDownload,
  scheduledTasks
}) => {
  const [selectedIds, setSelectedIds] = useState([]);
  const [isDownloading, setIsDownloading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [scheduledTasksWithRemainingSeconds, setScheduledTasksWithRemainingSeconds] = useState([]);
  const [sortedTasks, setSortedTasks] = useState([]);

  // 监听下载进度消息
  useEffect(() => {
    if (currentDownload) {
      console.log('下载进度:', currentDownload);
    }
  }, [currentDownload]);

  useEffect(() => {
    if (scheduledTasks) {
      const tasksWithTime = scheduledTasks
        .flatMap(({ ids, remainingSeconds }) => 
            ids.map(id => ({ id, remainingSeconds }))
        );
      setScheduledTasksWithRemainingSeconds(tasksWithTime);
      console.log('定时任务:', tasksWithTime);
    }
  }, [scheduledTasks]);

  // 根据倒计时对任务进行排序
  useEffect(() => {
    if (downloadingTasks && downloadingTasks.length > 0) {
      // 检查是否有定时任务
      if (scheduledTasksWithRemainingSeconds && scheduledTasksWithRemainingSeconds.length > 0) {
        const tasksWithCountdown = [];
        const tasksWithoutCountdown = [];
        
        // 分离有倒计时和无倒计时的任务
        downloadingTasks.forEach(task => {
          const countdown = scheduledTasksWithRemainingSeconds.find(item => item.id === task._id);
          if (countdown && countdown.remainingSeconds > 0) {
            tasksWithCountdown.push({
              ...task,
              remainingSeconds: countdown.remainingSeconds
            });
          } else {
            tasksWithoutCountdown.push(task);
          }
        });
        
        // 对有倒计时的任务按剩余时间升序排序
        tasksWithCountdown.sort((a, b) => a.remainingSeconds - b.remainingSeconds);
        
        // 将无倒计时任务放在前面，然后是有倒计时的任务
        setSortedTasks([...tasksWithoutCountdown, ...tasksWithCountdown]);
      } else {
        // 如果没有定时任务，直接使用原始任务列表
        setSortedTasks([...downloadingTasks]);
      }
    } else {
      setSortedTasks([]);
    }
  }, [downloadingTasks, scheduledTasksWithRemainingSeconds]);

  /**
   * 处理暂停/继续下载
   * 
   * 功能：暂停或继续当前下载任务
   * 返回：无
   */
  const handlePauseResume = async () => {
    try {
      setLoading(true);
      if (isDownloading) {
        // 当前正在下载，需要暂停
        await pauseAllDownloads();
        message.success('已暂停所有下载任务');
      } else {
        // 当前已暂停，需要继续
        await resumeAllDownloads();
        message.success('已继续所有下载任务');
      }
      setIsDownloading(!isDownloading);
      // 通过自定义事件监听器通知其他组件状态变化
      // 这里添加一个标识符，避免重复触发
      // window.dispatchEvent(new CustomEvent('download-state-change', { 
      //   detail: { source: 'pause-resume' } 
      // }));
    } catch (error) {
      console.error(`${isDownloading ? '暂停' : '继续'}下载失败:`, error);
      message.error(`${isDownloading ? '暂停' : '继续'}下载失败: ${error.message || '未知错误'}`);
    } finally {
      setLoading(false);
    }
  };
  
  /**
   * 处理取消下载
   * 
   * 功能：取消选中的下载任务
   * 返回：无
   */
  const handleCancel = () => {
    // 检查是否有选中的任务
    if (!selectedIds || selectedIds.length === 0) {
      message.warning('请先选择要取消的下载任务');
      return;
    }

    // 显示确认对话框
    Modal.confirm({
      title: '确认取消',
      icon: <ExclamationCircleOutlined />,
      content: `确定要取消选中的 ${selectedIds.length} 个下载任务吗？`,
      okText: '确认取消',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          setLoading(true);
          // 取消选中的多个任务
          for (const id of selectedIds) {
            await cancelDownload(id);
          }
          message.success(`已取消${selectedIds.length}个下载任务`);
          setSelectedIds([]);
          onToggleSelectMode();
          // 通过自定义事件监听器通知其他组件状态变化
          window.dispatchEvent(new CustomEvent('download-state-change', { 
            detail: { source: 'cancel-selected' } 
          }));
        } catch (error) {
          console.error('取消下载失败:', error);
          message.error(`取消下载失败: ${error.message || '未知错误'}`);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  // 切换选择项
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(item => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  // 处理选择模式切换
  const handleToggleSelectMode = () => {
    if (isSelectMode) {
      // 如果当前是选择模式，直接退出，不清除选择
      onToggleSelectMode();
    } else {
      // 如果当前不是选择模式，进入选择模式
      onToggleSelectMode();
    }
  };

  // 获取任务的进度和类型信息
  const getTaskProgress = (taskId) => {
    if (currentDownload && currentDownload.id === taskId) {
      return { 
        progress: currentDownload.progress || 0, 
        type: currentDownload.type || 'mp4'
      };
    }
    return { progress: 0, type: null };
  };

  // 格式化倒计时时间为时:分:秒或分:秒
  const formatTime = (seconds) => {
    if (seconds >= 3600) {
      // 如果超过60分钟，显示为时:分:秒
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      const remainingSeconds = seconds % 60;
      return `${hours}:${minutes < 10 ? '0' : ''}${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
    } else {
      // 小于60分钟，显示为分:秒
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
    }
  };

  // 根据ID查找倒计时数据
  const getCountdownById = (id) => {
    return scheduledTasksWithRemainingSeconds.find(item => item.id === id);
  };

  // 计算倒计时不透明度 - 时间越少颜色越浅
  const calculateCountdownOpacity = (remainingSeconds) => {
    const maxTime = 3600; // 最大时间基准（1小时）
    const timePercent = (remainingSeconds / maxTime) * 100;
    return Math.max(0.3, Math.min(0.7, timePercent/100)); // 范围在0.3-0.7之间
  };

  return (
    <div className="download-progress-container">
      <div className="progress-header">
        <h3>
          下载任务
          {downloadingTasks && downloadingTasks.length > 0 && <Badge count={downloadingTasks.length} color="var(--primary-color)" className="count-badge" />}
        </h3>
        <Space className="header-actions" size={[8, 0]} wrap={false}>
          <Tooltip title={isDownloading ? "暂停全部" : "继续全部"} placement="bottom">
            <Button
              type="primary"
              icon={isDownloading ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
              onClick={handlePauseResume}
              loading={loading}
              className="action-button"
              disabled={downloadingTasks.length === 0}
            >
              <span className="button-text">{isDownloading ? '暂停全部' : '继续全部'}</span>
            </Button>
          </Tooltip>
          {isSelectMode && (
            <Tooltip title="取消" placement="bottom">
              <Button
                danger
                icon={<StopOutlined />}
                onClick={handleCancel}
                loading={loading}
                className="action-button"
                disabled={downloadingTasks.length === 0 || selectedIds.length === 0}
              >
                <span className="button-text">取消下载</span>
              </Button>
            </Tooltip>
          )}
          <Tooltip title={isSelectMode ? "完成" : "选择"} placement="bottom">
            <Button
              icon={isSelectMode ? <CheckOutlined /> : <UnorderedListOutlined />}
              onClick={handleToggleSelectMode}
              className="action-button"
              disabled={downloadingTasks.length === 0}
            >
              <span className="button-text">{isSelectMode ? '完成' : '选择'}</span>
            </Button>
          </Tooltip>
        </Space>
      </div>
      
      <div className="progress-content">
        {!isDownloading && (
          <div className="pause-overlay">
            <div className="pause-text">
              <PauseCircleOutlined />
              <span>下载已暂停</span>
            </div>
          </div>
        )}
        
        <List
          size="small"
          dataSource={sortedTasks}
          renderItem={item => {
            const { progress, type } = getTaskProgress(item._id);
            const countdown = getCountdownById(item._id);
            const hasCountdown = countdown && countdown.remainingSeconds > 0;
            const opacity = hasCountdown ? calculateCountdownOpacity(countdown.remainingSeconds) : 0;
            
            return (
              <List.Item>
                <div 
                  className={`download-list-item ${isSelectMode ? 'selectable' : ''} ${selectedIds.includes(item._id) ? 'selected' : ''}`}
                  onClick={() => isSelectMode && toggleSelect(item._id)}
                >
                  {isSelectMode && item._id && (
                    <div className="select-checkbox">
                      <div className={`checkbox ${selectedIds.includes(item._id) ? 'checked' : ''}`} />
                    </div>
                  )}
                  <span className="item-title" title={item.title}>{item.title}</span>
                  
                  {/* 倒计时容器 - 需要放在进度条前面以便进度条覆盖 */}
                  {hasCountdown && (
                    <div className="countdown-overlay" style={{ backgroundColor: `rgba(32, 156, 169, ${opacity})` }}>
                      <div className="countdown-badge">
                        <ClockCircleOutlined className="countdown-icon" />
                        <span className="countdown-time">{formatTime(countdown.remainingSeconds)}</span>
                      </div>
                    </div>
                  )}
                  
                  {/* 进度条容器 */}
                  {(progress > 0 || type) && (
                    <div className={`progress-container ${type || ''}`}>
                      {/* 蒙层进度 - 适用于m3u8和mp4类型 */}
                      {(type === 'm3u8' || type === 'mp4') && (
                        <div 
                          className="overlay-progress" 
                          style={{ width: `${progress}%` }}
                        ></div>
                      )}
                      
                      {/* 边框进度 - 适用于m3u8ToMp4和mp4类型 */}
                      {(type === 'm3u8ToMp4' || type === 'mp4') && (
                        <div className="border-progress-container">
                          <div 
                            className="border-progress-top" 
                            style={{ width: `${progress}%` }}
                          ></div>
                          <div 
                            className="border-progress-bottom" 
                            style={{ width: `${progress}%` }}
                          ></div>
                          {progress === 100 && (
                            <div className="border-progress-right"></div>
                          )}
                        </div>
                      )}
                      
                      {/* 进度文本 */}
                      <div className="progress-text">{progress}%</div>
                    </div>
                  )}
                </div>
              </List.Item>
            );
          }}
        />
      </div>
    </div>
  );
};

export default DownloadProgress;