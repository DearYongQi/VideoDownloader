import { useEffect, useState } from 'react';
import { ConfigProvider, theme, message } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import 'antd/dist/reset.css';
import { StyleProvider } from '@ant-design/cssinjs';
import InputBox from './components/InputBox';
import TaskList from './components/TaskList';
import DownloadProgress from './components/DownloadProgress';
import DownloadedList from './components/DownloadedList';
import VideoParser from './components/VideoParser';
import SystemMonitor from './components/SystemMonitor';
import BilibiliCookieModal from './components/BilibiliCookieModal';
import { watchSystemTheme } from './utils';
import { getDownloadList, startDownload, deleteDownloadedVideo, deleteAllDownloadedVideos, deletePendingTasks } from './api';
import './styles/App.scss';
import React from 'react';
import { ToastContainer, toast } from 'react-toastify';
import useWebSocket from './hooks/useWebSocket';
import 'react-toastify/dist/ReactToastify.css';

/**
 * App - 应用主组件
 * 
 * 功能：整合所有子组件，管理全局状态，处理视频解析和下载功能
 */
export default function App() {
  // 系统信息
  const { systemInfo, currentDownload, scheduledTasks } = useWebSocket();

  // 系统主题状态
  const [themeMode, setThemeMode] = useState('light');

  // 输入状态
  const [input, setInput] = useState('');

  // 下载列表状态
  const [downloadList, setDownloadList] = useState([]);
  const [loading, setLoading] = useState(false);

  // 选择状态
  const [selectedIds, setSelectedIds] = useState([]);
  const [isSelectMode, setIsSelectMode] = useState(false);

  // 下载进度选择状态
  const [isProgressSelectMode, setIsProgressSelectMode] = useState(false);
  const [selectedProgressId, setSelectedProgressId] = useState(null);

  // 已下载项目选择状态
  const [isDownloadedSelectMode, setIsDownloadedSelectMode] = useState(false);
  const [selectedDownloadedIds, setSelectedDownloadedIds] = useState([]);

  // 暴露message API给App的上下文
  const [messageApi, contextHolder] = message.useMessage();

  // 上一次刷新列表的时间
  const lastFetchTimeRef = React.useRef(0);

  // 哔哩哔哩Cookie弹窗状态
  const [bilibiliCookieModalVisible, setBilibiliCookieModalVisible] = useState(false);

  // 简单直接地获取下载列表
  const fetchDownloadList = async () => {
    setLoading(true);
    try {
      const response = await getDownloadList();
      if (response && Array.isArray(response)) {
        setDownloadList(response);
      } else if (response && response.data && Array.isArray(response.data)) {
        setDownloadList(response.data);
      }
    } catch (err) {
      console.error('获取列表失败:', err);
    } finally {
      setLoading(false);
    }
  };

  // 监听系统主题变化
  useEffect(() => {
    const unwatch = watchSystemTheme((newTheme) => {
      setThemeMode(newTheme);
    });
    return () => unwatch();
  }, []);

  // 初始化时获取一次列表
  useEffect(() => {
    fetchDownloadList();
  }, []);

  // 解析视频相关功能
  const videoParser = VideoParser({
    input,
    setInput,
    onParseSuccess: () => {
      console.log('视频解析成功，刷新列表');
      fetchDownloadList();
    }
  });

  // 监听下载状态变化，刷新列表（增加防抖处理）
  useEffect(() => {
    // 防抖处理函数，避免短时间内多次触发
    const handleStateChange = (event) => {
      const now = Date.now();
      // 如果距离上次刷新不足1秒，则忽略本次刷新请求
      if (now - lastFetchTimeRef.current < 1000) {
        console.log('忽略频繁的列表刷新请求', event?.detail?.source || '未知来源');
        return;
      }
      
      console.log('执行列表刷新', event?.detail?.source || '未知来源');
      lastFetchTimeRef.current = now;
      fetchDownloadList();
    };
    
    window.addEventListener('download-state-change', handleStateChange);
    return () => window.removeEventListener('download-state-change', handleStateChange);
  }, []);

  // 切换选择模式
  const toggleSelectMode = () => {
    setIsSelectMode(prev => {
      const newMode = !prev;
      // 退出选择模式时清空选择项
      if (!newMode) {
        setSelectedIds([]);
      }
      return newMode;
    });
  };

  // 切换下载进度选择模式
  const toggleProgressSelectMode = () => {
    setIsProgressSelectMode(prev => {
      const newMode = !prev;
      // 退出选择模式时清空选择项
      if (!newMode) {
        setSelectedProgressId(null);
      }
      return newMode;
    });
  };

  // 切换已下载项目选择模式
  const toggleDownloadedSelectMode = () => {
    setIsDownloadedSelectMode(prev => {
      const newMode = !prev;
      // 退出选择模式时清空选择项
      if (!newMode) {
        setSelectedDownloadedIds([]);
      }
      return newMode;
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

  // 切换已下载项目选择项
  const toggleDownloadedSelect = (id) => {
    setSelectedDownloadedIds(prev => {
      if (prev.includes(id)) {
        return prev.filter(item => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  // 复制URL到剪贴板
  const copyToClipboard = (text) => {
    if (!navigator.clipboard) {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      try {
        document.execCommand('copy');
        toast.success('链接已复制到剪贴板！', {
          position: "top-center",
          autoClose: 2000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
        });
      } catch (err) {
        toast.error('复制失败，请手动复制链接', {
          position: "top-center",
          autoClose: 2000,
        });
      }
      
      document.body.removeChild(textArea);
    } else {
      navigator.clipboard.writeText(text).then(() => {
        toast.success('链接已复制到剪贴板！', {
          position: "top-center",
          autoClose: 2000,
          hideProgressBar: false,
          closeOnClick: true,
          pauseOnHover: true,
          draggable: true,
        });
      }, () => {
        toast.error('复制失败，请手动复制链接', {
          position: "top-center",
          autoClose: 2000,
        });
      });
    }
  };

  // 处理点击解析项
  const handleParsingItemClick = (task) => {
    if (task.status === 'error') {
      copyToClipboard(task.url);
    }
  };

  // 开始下载或定时下载
  const startSelectedDownloads = async (config) => {
    // 如果有选中的ID，则只下载选中的待下载任务；否则下载所有待下载任务
    let idsToDownload;
    if (selectedIds.length > 0) {
      // 筛选选中的ID中状态为1（待下载）的任务
      idsToDownload = selectedIds.filter(id => {
        const task = downloadList.find(item => item._id === id);
        return task && task.state === 1;
      });
    } else {
      // 获取所有状态为1（待下载）的任务ID
      idsToDownload = downloadList.filter(item => item.state === 1).map(item => item._id);
    }
    
    // 如果没有可下载的任务，提示用户并返回
    if (idsToDownload.length === 0) {
      messageApi.warning('没有可下载的任务');
      return false;
    }
    
    try {
      // 统一使用一个接口进行下载，后端根据delaySeconds决定是否延迟
      await startDownload(idsToDownload, config);
      
      // 刷新列表
      fetchDownloadList();
      
      // 完成下载请求后，如果处于选择模式，则退出选择模式
      if (isSelectMode) {
        setIsSelectMode(false);
        setSelectedIds([]);
      }
      
      return true;
    } catch (err) {
      console.error('下载任务设置失败:', err);
      return false;
    }
  };

  // 删除已下载视频
  const deleteSelectedDownloads = async (customIds) => {
    // 如果传入了自定义ID数组则使用它，否则使用状态中的选中ID数组
    const idsToDelete = customIds || selectedDownloadedIds;
    
    if (!idsToDelete || idsToDelete.length === 0) {
      messageApi.warning('未选择任何视频');
      return false;
    }

    try {
      // 如果是删除全部视频
      if (idsToDelete.length === downloadedItems.length) {
        await deleteAllDownloadedVideos();
        messageApi.success('已删除全部视频');
      } else {
        // 删除选中的多个视频
        for (const id of idsToDelete) {
          await deleteDownloadedVideo(id);
        }
        messageApi.success(`已删除 ${idsToDelete.length} 个视频`);
      }

      // 清空选中状态
      setSelectedDownloadedIds([]);
      
      // 退出选择模式
      setIsDownloadedSelectMode(false);

      // 刷新列表
      await fetchDownloadList();
      return true;
    } catch (err) {
      console.error('删除视频失败:', err);
      messageApi.error(`删除视频失败: ${err.message || '未知错误'}`);
      return false;
    }
  };

  // 删除待下载任务
  const deleteSelectedPendingTasks = async () => {
    // 使用选中的ID数组
    const idsToDelete = selectedIds;
    
    if (!idsToDelete || idsToDelete.length === 0) {
      messageApi.warning('未选择任何任务');
      return false;
    }

    try {
      // 调用删除待下载任务API
      await deletePendingTasks(idsToDelete);
      
      // 清空选中状态
      setSelectedIds([]);
      
      // 退出选择模式
      setIsSelectMode(false);

      // 刷新列表
      await fetchDownloadList();
      return true;
    } catch (err) {
      console.error('删除任务失败:', err);
      messageApi.error(`删除任务失败: ${err.message || '未知错误'}`);
      return false;
    }
  };

  // 已完成的下载
  const downloadedItems = downloadList.filter(item => item.state === 3);

  // 未下载的任务
  const pendingTasks = downloadList.filter(item => item.state === 1);

  // 下载中的任务列表
  const downloadingTasks = downloadList.filter(item => item.state === 2);

  // 处理点击"哔哩哔哩"文字
  const handleBilibiliClick = (e) => {
    // 阻止事件冒泡，避免触发其他点击事件
    e.stopPropagation();
    // 显示Cookie管理弹窗
    setBilibiliCookieModalVisible(true);
  };

  return (
    <StyleProvider hashPriority="high">
      <ConfigProvider
        locale={zhCN}
        theme={{
          token: {
            colorPrimary: '#FFBD7A',
            borderRadius: 8,
          },
          algorithm: themeMode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm
        }}
      >
        <div className="app">
          {contextHolder}
          <div className="app-header">
            <div className="header-left">
              <h1 className="app-title">视频下载器</h1>
              <p className="app-subtitle">支持任何带视频的网页、抖音、快手、<span className="bilibili-text" onClick={handleBilibiliClick}>哔哩哔哩</span></p>
            </div>
            <div className="header-right">
              <SystemMonitor systemInfo={systemInfo}/>
            </div>
          </div>

          <div className="app-content">
            <InputBox
              input={input}
              onInputChange={setInput}
              onParse={videoParser.parseVideo}
              onClear={videoParser.clearAll}
              extractedUrl={videoParser.extractedUrl}
              urlType={videoParser.urlType}
              loading={videoParser.parsing}
              error={videoParser.error}
            />
            
            {/* 显示正在解析的任务 */}
            {videoParser.parsingTasks && videoParser.parsingTasks.length > 0 && (
              <div className="parsing-tasks">
                <h3>正在解析的视频 ({videoParser.parsingTasks.length})</h3>
                <div className="parsing-tasks-list">
                  {videoParser.parsingTasks.map(task => (
                    <div 
                      key={task.id} 
                      className={`parsing-task-item ${task.status}`}
                      onClick={() => handleParsingItemClick(task)}
                      style={{ cursor: task.status === 'error' ? 'pointer' : 'default' }}
                      title={task.status === 'error' ? '点击复制链接' : task.url}
                    >
                      <div className="task-url">
                        {task.url.length > 50 ? `${task.url.substring(0, 50)}...` : task.url}
                      </div>
                      <div className="task-status">
                        {task.status === 'parsing' && '解析中...'}
                        {task.status === 'success' && '解析成功'}
                        {task.status === 'error' && `解析失败: ${task.error || '未知错误'}`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="content-row">
              <div className="content-col">
                <TaskList
                  tasks={pendingTasks}
                  loading={loading}
                  selectedIds={selectedIds}
                  isSelectMode={isSelectMode}
                  onToggleSelect={toggleSelect}
                  onToggleSelectMode={toggleSelectMode}
                  onStartDownload={startSelectedDownloads}
                  onDeleteTasks={deleteSelectedPendingTasks}
                  messageApi={messageApi}
                />
              </div>

              <div className="content-col">
                <div className="downloading-section">
                  <DownloadProgress
                    isSelectMode={isProgressSelectMode}
                    onToggleSelectMode={toggleProgressSelectMode}
                    downloadingTasks={downloadingTasks}
                    currentDownload={currentDownload}
                    scheduledTasks={scheduledTasks}
                  />
                </div>

                <DownloadedList
                  downloadedItems={downloadedItems}
                  isSelectMode={isDownloadedSelectMode}
                  selectedIds={selectedDownloadedIds}
                  onToggleSelect={toggleDownloadedSelect}
                  onToggleSelectMode={toggleDownloadedSelectMode}
                  onDeleteVideos={deleteSelectedDownloads}
                  messageApi={messageApi}
                />
              </div>
            </div>
          </div>
          <ToastContainer />
          
          {/* 哔哩哔哩Cookie管理弹窗 */}
          <BilibiliCookieModal 
            visible={bilibiliCookieModalVisible}
            onClose={() => setBilibiliCookieModalVisible(false)}
          />
        </div>
      </ConfigProvider>
    </StyleProvider>
  );
}
