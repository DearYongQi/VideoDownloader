import React, { useState } from 'react';
import { List, Empty, Modal, Button, Checkbox, Space, Tooltip, Badge } from 'antd';
import { PlayCircleOutlined, DownloadOutlined, WarningOutlined, ReloadOutlined, DeleteOutlined, UnorderedListOutlined, CheckOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import { formatDate } from '../utils';
import '../styles/DownloadedList.scss';

/**
 * DownloadedList - 已下载视频列表组件
 * 
 * 功能：显示已完成下载的视频列表，支持播放和下载，以及删除操作
 * 
 * 参数：
 * @param {Array} downloadedItems - 已下载完成的视频项数组
 * @param {boolean} isSelectMode - 是否处于选择模式
 * @param {Array} selectedIds - 已选择的视频ID数组
 * @param {function} onToggleSelect - 切换选择单个视频的回调
 * @param {function} onToggleSelectMode - 切换选择模式的回调
 * @param {function} onDeleteVideos - 删除选中视频的回调
 * @param {Object} messageApi - Ant Design消息API
 * 
 * 返回：渲染已下载视频列表和视频播放模态框
 */
const DownloadedList = ({
  downloadedItems,
  isSelectMode = false,
  selectedIds = [],
  onToggleSelect = () => {},
  onToggleSelectMode = () => {},
  onDeleteVideos = () => {},
  messageApi
}) => {
  const [videoModalVisible, setVideoModalVisible] = useState(false);
  const [currentVideo, setCurrentVideo] = useState(null);
  const [videoError, setVideoError] = useState(false);

  /**
   * 打开视频播放模态框
   * 
   * 功能：设置当前视频并显示模态框
   * @param {Object} item - 视频项数据
   * 返回：无
   */
  const handleOpenVideo = (item) => {
    // 如果处于选择模式，则不打开视频
    if (isSelectMode) {
      onToggleSelect(item._id);
      return;
    }
    
    setCurrentVideo(item);
    setVideoError(false);
    setVideoModalVisible(true);
  };

  /**
   * 关闭视频播放模态框
   * 
   * 功能：隐藏模态框并清除当前视频
   * 返回：无
   */
  const handleCloseVideo = () => {
    setVideoModalVisible(false);
    setTimeout(() => {
      setCurrentVideo(null);
      setVideoError(false);
    }, 300);
  };

  /**
   * 获取视频文件路径，按照指定格式拼接
   * @param {Object} item - 视频项数据
   * @returns {string} - 拼接后的视频URL
   */
  const getVideoPath = (item) => {
    if (!item || !item.title) return '';
    
    // 获取文件名（可能包含扩展名或不包含）
    let fileName = item.title;
    
    // 不管文件名是什么，都添加.mp4扩展名
    if (!fileName.toLowerCase().endsWith('.mp4')) {
      fileName = `${fileName}.mp4`;
    }

    // 获取当前API端口号，如果无法获取则使用默认的6588
    const getApiPort = () => {
      
      // 尝试从当前页面URL获取
      // 假设前端端口与API端口存在固定关系，如前端端口+1=API端口
      const currentPort = window.location.port;
      if (currentPort) {
        // 如果是开发环境的3000端口，则API可能在86
        if (currentPort === '3000') {
          return '86';
        }
        // 其他情况可能API与前端在同一端口或是前端端口+1
        // 这里为简单起见，如果是其他端口，就使用同样的端口
        return currentPort;
      }
      
      // 默认端口号
      return '86';
    };

    // 按照新格式拼接视频地址，使用动态端口
    return `${window.location.protocol}//${window.location.hostname}:${getApiPort()}/video/${item.source}/${fileName}`;
  };

  /**
   * 尝试重新加载视频
   */
  const handleRetryVideo = () => {
    if (!currentVideo) return;
    
    // 重置视频元素
    const videoElement = document.querySelector('.video-player video');
    const unavailableDiv = document.querySelector('.video-unavailable');
    
    if (videoElement && unavailableDiv) {
      // 隐藏错误提示
      unavailableDiv.style.display = 'none';
      // 显示视频元素
      videoElement.style.display = 'block';
      // 重新加载视频
      videoElement.src = getVideoPath(currentVideo);
      videoElement.load();
      setVideoError(false);
    }
  };

  /**
   * 处理视频错误
   */
  const handleVideoError = (e) => {
    // 视频加载失败时显示错误
    e.target.style.display = 'none';
    const unavailableDiv = document.querySelector('.video-unavailable');
    if (unavailableDiv) {
      unavailableDiv.style.display = 'flex';
    }
    setVideoError(true);
  };

  /**
   * 渲染视频播放模态框
   * 
   * 功能：根据视频数据渲染视频播放模态框
   * 返回：视频播放模态框组件
   */
  const renderVideoModal = () => {
    if (!currentVideo) return null;

    const videoUrl = getVideoPath(currentVideo);

    return (
      <Modal
        title={currentVideo.title}
        open={videoModalVisible}
        onCancel={handleCloseVideo}
        width={800}
        className="video-modal"
        footer={[
          videoError ? (
            <Button key="retry" type="primary" ghost icon={<ReloadOutlined />} onClick={handleRetryVideo}>
              重试加载
            </Button>
          ) : (
            <Button key="download" type="primary" icon={<DownloadOutlined />} 
              onClick={() => window.open(videoUrl, '_blank')}>
              下载视频
            </Button>
          ),
          <Button key="close" onClick={handleCloseVideo}>
            关闭
          </Button>
        ].filter(Boolean)}
      >
        <div className="video-player">
          <video 
            controls 
            width="100%" 
            src={videoUrl} 
            autoPlay
            onError={handleVideoError}
          >
            您的浏览器不支持视频播放
          </video>
          <div className="video-unavailable" style={{display: 'none'}}>
            <WarningOutlined />
            <p>视频文件暂时不可用</p>
            <p className="sub-message">请检查文件是否存在或稍后再试</p>
            <Button icon={<ReloadOutlined />} onClick={handleRetryVideo} type="primary" ghost className="retry-button">
              重试加载
            </Button>
          </div>
        </div>
      </Modal>
    );
  };

  /**
   * 渲染列表项
   * 
   * 功能：根据视频数据渲染单个列表项
   * @param {Object} item - 视频数据
   * 返回：列表项组件
   */
  const renderItem = (item) => {
    return (
      <List.Item 
        className="downloaded-item"
        onClick={() => handleOpenVideo(item)}
      >
        <div className="item-container">
          {isSelectMode && (
            <Checkbox
              checked={selectedIds.includes(item._id)}
              onChange={(e) => {
                e.stopPropagation();
                onToggleSelect(item._id);
              }}
              onClick={(e) => e.stopPropagation()}
              className="select-checkbox"
            />
          )}
          <div className="item-content">
            <div className="item-title">
              {item.title}
            </div>
            <div className="item-meta">
              <span className="item-source">{item.source || '未知来源'}</span>
              <span className="item-time">{formatDate(item.time)}</span>
            </div>
          </div>
          {!isSelectMode && <PlayCircleOutlined className="play-icon" />}
        </div>
      </List.Item>
    );
  };

  // 计算列表和选中项信息
  const totalCount = downloadedItems?.length || 0;
  const selectedCount = selectedIds?.length || 0;

  /**
   * 显示删除确认对话框
   * 
   * @param {Array} ids - 要删除的视频ID数组
   * @param {string} message - 确认消息
   */
  const showDeleteConfirm = (ids, message) => {
    Modal.confirm({
      title: '确认删除',
      icon: <ExclamationCircleOutlined />,
      content: message,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk() {
        onDeleteVideos(ids);
      }
    });
  };

  return (
    <div className="downloaded-list-container">
      <div className="list-header">
        <h3>
          已下载项目
          {totalCount > 0 && <Badge count={totalCount} color="var(--primary-color)" className="count-badge" />}
        </h3>
        <Space className="header-actions" size={[8, 0]} wrap={false}>
          <Tooltip title="全部删除" placement="bottom">
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                // 如果有已下载项目，则选中所有项目并调用删除方法
                if (downloadedItems && downloadedItems.length > 0) {
                  const allIds = downloadedItems.map(item => item._id);
                  showDeleteConfirm(allIds, `确定要删除全部 ${allIds.length} 个视频吗？`);
                }
              }}
              disabled={!downloadedItems || downloadedItems.length === 0}
              className="action-button delete-all-button"
            >
              <span className="button-text">全部删除</span>
            </Button>
          </Tooltip>
          {isSelectMode && (
            <Tooltip title="删除选中" placement="bottom">
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={() => {
                  if (selectedIds && selectedIds.length > 0) {
                    showDeleteConfirm(selectedIds, `确定要删除选中的 ${selectedIds.length} 个视频吗？`);
                  } else {
                    messageApi?.warning('请先选择要删除的视频');
                  }
                }}
                disabled={!selectedIds.length}
                className="action-button"
                style={{ marginLeft: '2px', marginRight: '2px' }}
              >
                <span className="button-text">删除选中{selectedCount > 0 ? `(${selectedCount})` : ""}</span>
              </Button>
            </Tooltip>
          )}
          <Tooltip title={isSelectMode ? "完成" : "选择"} placement="bottom">
            <Button
              icon={isSelectMode ? <CheckOutlined /> : <UnorderedListOutlined />}
              onClick={onToggleSelectMode}
              disabled={!downloadedItems || downloadedItems.length === 0}
              className="action-button"
            >
              <span className="button-text">{isSelectMode ? '完成' : '选择'}</span>
            </Button>
          </Tooltip>
        </Space>
      </div>
      
      <List
        className="downloaded-list"
        dataSource={downloadedItems}
        renderItem={renderItem}
        locale={{
          emptyText: <Empty description="暂无已下载视频" />
        }}
      />
      
      {renderVideoModal()}
    </div>
  );
};

export default DownloadedList;