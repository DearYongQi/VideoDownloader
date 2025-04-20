/**
 * 格式化日期
 * @param {string|number} timestamp - 日期字符串或时间戳
 * @returns {string} 格式化后的日期字符串
 */
export const formatDate = (timestamp) => {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
};

// 网速显示专用 (始终使用 KB/MB)
export const formatSpeed = (bytes) => {
  if (bytes === 0) return '0.00 KB';
  const k = 1024;
  const units = ['KB', 'MB'];
  
  // 计算单位层级 (1:KB, 2:MB)
  const unitIndex = bytes < k * k ? 0 : 1;
  const value = bytes / Math.pow(k, unitIndex + 1);
  
  return `${value.toFixed(2)} ${units[unitIndex]}`;
};

// 存储容量显示专用 (智能使用 GB/TB)
export const formatStorage = (bytes) => {
  if (bytes === 0) return '0.00 GB';
  const k = 1024;
  const units = ['GB', 'TB'];
  
  // 计算单位层级 (3:GB, 4:TB)
  const unitIndex = bytes < k ** 4 ? 0 : 1;
  const value = bytes / Math.pow(k, unitIndex + 3);
  
  return `${value.toFixed(2)} ${units[unitIndex]}`;
};

// 从文本中提取URL
export const extractUrl = (text) => {
  // 匹配URL正则表达式，支持常见的URL格式
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const matches = text.match(urlRegex);
  return matches || [];
};

// 判断URL类型
export const getUrlType = (url) => {
  if (!url) return 'unknown';
  
  if (url.includes('bilibili.com') || url.includes('b23.tv')) {
    return 'bilibili';
  } else if (url.includes('douyin.com')) {
    return 'douyin';
  } else if (url.includes('kuaishou.com')) {
    return 'kuaishou';
  } else {
    return 'generic';
  }
};

// 处理URL，移除无关参数或标准化
export const normalizeUrl = (url) => {
  try {
    const urlObj = new URL(url);
    // 保留必要的查询参数，移除跟踪参数等
    // 这个函数可以根据不同平台做特殊处理
    return url;
  } catch (error) {
    console.error('URL格式错误:', error);
    return url;
  }
};

// 获取系统主题模式
export const getSystemTheme = () => {
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches 
    ? 'dark' 
    : 'light';
};

// 监听系统主题变化
export const watchSystemTheme = (callback) => {
  if (!window.matchMedia) return () => {};
  
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const listener = (e) => {
    callback(e.matches ? 'dark' : 'light');
  };
  
  // 添加事件监听
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', listener);
  } else {
    // 兼容旧版本
    mediaQuery.addListener(listener);
  }
  
  // 返回清理函数
  return () => {
    if (mediaQuery.removeEventListener) {
      mediaQuery.removeEventListener('change', listener);
    } else {
      mediaQuery.removeListener(listener);
    }
  };
};

/**
 * 格式化文件大小
 * @param {number} bytes - 文件大小（字节）
 * @returns {string} 格式化后的文件大小字符串
 */
export const formatFileSize = (bytes) => {
  if (!bytes || bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}; 

