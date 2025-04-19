import React, { useState, useEffect } from 'react';
import { extractUrl, getUrlType, normalizeUrl } from '../utils';
import { 
  parseBilibili, 
  parseDouyin, 
  parseKuaishou, 
  parsePuppeteer 
} from '../api';

/**
 * VideoParser - 视频解析组件
 * 
 * 功能：处理视频链接的提取、识别和解析
 * 
 * 参数：
 * @param {object} props 
 * @param {string} props.input - 输入的文本
 * @param {function} props.setInput - 设置输入文本的函数
 * @param {function} props.onParseSuccess - 解析成功的回调函数
 * 
 * 返回：含有视频解析功能的组件
 */
function VideoParser({ input, setInput, onParseSuccess }) {
  const [extractedUrl, setExtractedUrl] = useState('');
  const [urlType, setUrlType] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsingTasks, setParsingTasks] = useState([]);
  const [error, setError] = useState(null);

  /**
   * 当输入变化时，自动提取URL
   */
  useEffect(() => {
    if (!input) {
      setExtractedUrl('');
      setUrlType('');
      return;
    }

    const urls = extractUrl(input);
    if (urls.length > 0) {
      const url = normalizeUrl(urls[0]);
      setExtractedUrl(url);
      setUrlType(getUrlType(url));
    } else {
      setExtractedUrl('');
      setUrlType('');
    }
  }, [input]);

  /**
   * 解析视频
   * 
   * 功能：根据URL类型调用对应的解析API
   */
  const parseVideo = async () => {
    if (!extractedUrl) {
      setError('未检测到有效的视频URL');
      return;
    }

    setError(null);
    setParsing(true);
    
    // 创建一个新的解析任务
    const taskId = Date.now().toString();
    const taskUrl = extractedUrl;
    const taskType = urlType;
    
    // 添加到解析任务列表
    setParsingTasks(prev => [...prev, {
      id: taskId,
      url: taskUrl,
      type: taskType,
      status: 'parsing'
    }]);
    
    // 清空当前输入，允许用户继续输入下一个URL
    clearInput();
    
    // 异步执行解析任务
    executeParseTask(taskId, taskUrl, taskType);
    
    // 解析完成
    setParsing(false);
  };

  /**
   * 执行解析任务
   * 
   * @param {string} taskId - 任务ID
   * @param {string} url - 要解析的URL
   * @param {string} type - URL类型
   */
  const executeParseTask = async (taskId, url, type) => {
    try {
      let result;
      
      // 根据URL类型选择解析方法
      switch (type) {
        case 'bilibili':
          result = await parseBilibili(url);
          break;
        case 'douyin':
          result = await parseDouyin(url);
          break;
        case 'kuaishou':
          result = await parseKuaishou(url);
          break;
        default:
          result = await parsePuppeteer(url);
      }
      
      // 更新任务状态为成功
      setParsingTasks(prev => prev.map(task => 
        task.id === taskId ? { ...task, status: 'success' } : task
      ));
      
      // 添加解析成功事件，确保列表能够更新
      if (result) {
        console.log('解析视频成功，触发刷新列表');
        window.dispatchEvent(new CustomEvent('parse-success', { detail: result }));
        
        // 如果提供了回调，则调用
        if (onParseSuccess) {
          onParseSuccess(result);
        }
        
        // 解析成功2秒后从列表中移除
        setTimeout(() => {
          setParsingTasks(prev => prev.filter(task => task.id !== taskId));
        }, 2000);
      }
    } catch (err) {
      console.error('解析视频失败:', err);
      
      // 更新任务状态为失败
      setParsingTasks(prev => prev.map(task => 
        task.id === taskId ? { ...task, status: 'error', error: err.message || '未知错误' } : task
      ));
      
      // 不阻塞UI，只记录错误
      setError(`解析失败: ${err.message || '未知错误'}`);
    }
  };

  /**
   * 清除输入但保留解析任务
   */
  const clearInput = () => {
    setInput('');
    setExtractedUrl('');
    setUrlType('');
    setError(null);
  };

  /**
   * 清除所有内容和解析任务
   */
  const clearAll = () => {
    clearInput();
    setParsingTasks([]);
  };

  /**
   * 获取实际显示的任务列表
   * 仅包含正在解析和失败的任务
   */
  const getActiveTasks = () => {
    return parsingTasks.filter(task => task.status === 'parsing' || task.status === 'error');
  };

  return {
    extractedUrl,
    urlType,
    parsing,
    parsingTasks: getActiveTasks(),
    error,
    parseVideo,
    clearInput,
    clearAll
  };
}

export default VideoParser; 