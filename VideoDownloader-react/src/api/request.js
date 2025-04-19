import axios from 'axios';

// 防抖请求缓存
const requestCache = {
  // 缓存最近一次请求
  lastRequests: new Map(),
  // 缓存时间（毫秒）
  cacheTime: 1000,
  // 不进行缓存的请求路径
  noCachePaths: [
    '/api/downloadList',  // 下载列表不缓存，确保每次获取最新数据
    '/api/startDownload', // 开始下载不缓存
    '/api/scheduleDownload' // 定时下载不缓存
  ]
};

/**
 * 创建axios实例
 * 
 * 功能：创建统一配置的axios请求实例，用于发送API请求
 */
const request = axios.create({
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json'
  }
});

/**
 * 请求拦截器
 * 
 * 功能：在请求发送前对请求配置进行处理
 * 可以添加token等认证信息
 */
request.interceptors.request.use(
  config => {
    // 检查是否为不进行缓存的请求路径
    if (requestCache.noCachePaths.some(path => config.url.includes(path))) {
      // 对于不缓存的路径，直接发送请求
      return config;
    }
    
    // 请求防抖处理
    const requestKey = `${config.method}:${config.url}`;
    const now = Date.now();
    const lastRequest = requestCache.lastRequests.get(requestKey);
    
    if (lastRequest && (now - lastRequest.time < requestCache.cacheTime)) {
      // 如果相同请求在缓存时间内，返回上次的结果
      console.log(`使用缓存请求结果: ${requestKey}`);
      if (lastRequest.promise) {
        config.__CACHE_HIT__ = true;
        config.__CACHE_PROMISE__ = lastRequest.promise;
      }
    }
    
    // 记录本次请求时间
    if (!lastRequest || !lastRequest.promise) {
      requestCache.lastRequests.set(requestKey, {
        time: now,
        promise: null
      });
    }
    
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

/**
 * 响应拦截器
 * 
 * 功能：统一处理响应数据和错误
 * 成功状态码: 200
 * 失败状态码: 400
 */
request.interceptors.response.use(
  response => {
    // 处理缓存命中的请求
    if (response.config.__CACHE_HIT__ && response.config.__CACHE_PROMISE__) {
      return response.config.__CACHE_PROMISE__;
    }
    
    // 更新请求缓存
    const config = response.config;
    const requestKey = `${config.method}:${config.url}`;
    const cacheItem = requestCache.lastRequests.get(requestKey);
    
    // 从响应中提取数据
    const res = response.data;
    
    // 检查状态码
    if (res.code !== 200 && res.code !== undefined) {
      console.error('API请求返回错误:', res.message || '未知错误');
      return Promise.reject(new Error(res.message || '请求失败'));
    }
    
    // 根据响应格式返回数据
    const responseData = res.data !== undefined ? res.data : res;
    
    // 保存结果到缓存
    if (cacheItem && !requestCache.noCachePaths.some(path => config.url.includes(path))) {
      cacheItem.promise = Promise.resolve(responseData);
    }
    
    return responseData;
  },
  error => {
    // 处理请求防抖缓存命中
    if (error.config && error.config.__CACHE_HIT__ && error.config.__CACHE_PROMISE__) {
      return error.config.__CACHE_PROMISE__;
    }
    
    console.error('请求错误', error);
    
    // 构造统一的错误响应格式
    return Promise.reject({
      code: 400,
      message: error.message || '网络请求失败',
      data: null
    });
  }
);

export default request; 