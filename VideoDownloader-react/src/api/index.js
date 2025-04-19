import request from './request';

/**
 * 哔哩哔哩视频解析
 * 
 * 功能：解析哔哩哔哩视频链接，获取视频信息和下载链接
 * @param {string} url - 哔哩哔哩视频链接
 * 
 * @returns {Promise<Object>} 返回Promise对象，包含：
 *   - success {boolean} 是否成功
 *   - data {Object} 视频信息，包含标题、封面图、下载链接等
 *   - message {string} 成功或错误消息
 */
export const parseBilibili = (url) => {
  return request({
    url: '/api/bilibili',
    method: 'post',
    data: { url }
  });
};

/**
 * 抖音视频解析
 * 
 * 功能：解析抖音视频链接，获取视频信息和下载链接
 * @param {string} url - 抖音视频链接
 * 
 * @returns {Promise<Object>} 返回Promise对象，包含：
 *   - success {boolean} 是否成功
 *   - data {Object} 视频信息，包含标题、封面图、下载链接等
 *   - message {string} 成功或错误消息
 */
export const parseDouyin = (url) => {
  return request({
    url: '/api/douyin',
    method: 'post',
    data: { url }
  });
};

/**
 * 快手视频解析
 * 
 * 功能：解析快手视频链接，获取视频信息和下载链接
 * @param {string} url - 快手视频链接
 * 
 * @returns {Promise<Object>} 返回Promise对象，包含：
 *   - success {boolean} 是否成功
 *   - data {Object} 视频信息，包含标题、封面图、下载链接等
 *   - message {string} 成功或错误消息
 */
export const parseKuaishou = (url) => {
  return request({
    url: '/api/kuaishou',
    method: 'post',
    data: { url }
  });
};

/**
 * 通用网页视频解析
 * 
 * 功能：使用Puppeteer解析一般网页中的视频
 * @param {string} url - 网页链接
 * 
 * @returns {Promise<Object>} 返回Promise对象，包含：
 *   - success {boolean} 是否成功
 *   - data {Object} 视频信息，包含标题、封面图、下载链接等
 *   - message {string} 成功或错误消息
 */
export const parsePuppeteer = (url) => {
  return request({
    url: '/api/puppeteer',
    method: 'post',
    data: { url }
  });
};

/**
 * 获取下载列表
 * 
 * 功能：获取所有解析过的视频任务列表
 * 
 * @returns {Promise<Object>} 返回Promise对象，包含：
 *   - success {boolean} 是否成功
 *   - data {Array} 视频任务列表
 *   - message {string} 成功或错误消息
 */
export const getDownloadList = () => {
  return request({
    url: '/api/downloadList',
    method: 'post'
  });
};

/**
 * 获取储存的cookie
 * 
 * 功能：获取已保存的网站cookies
 * 
 * @returns {Promise<Object>} 返回Promise对象，包含：
 *   - success {boolean} 是否成功
 *   - data {Object} cookies数据
 *   - message {string} 成功或错误消息
 */
export const getCookies = () => {
  return request({
    url: '/api/cookies',
    method: 'post'
  });
};

/**
 * 开始下载
 * 
 * 功能：开始下载指定ID的视频任务
 * @param {Array} ids - 任务ID数组
 * @param {Object} config - 下载配置
 *   - maxConcurrent {number} 最大并发请求数
 *   - maxRetries {number} 最大重试次数
 *   - startFragment {number} 开始片段位置序号
 *   - delaySeconds {number} 延迟开始时间（秒），0表示立即开始
 * 
 * @returns {Promise<Object>} 返回Promise对象，包含：
 *   - success {boolean} 是否成功
 *   - data {Object} 下载任务信息
 *   - message {string} 成功或错误消息
 */
export const startDownload = (ids, config) => {
  return request({
    url: '/api/startDownload',
    method: 'post',
    data: { ids, config }
  });
};

/**
 * 定时下载
 * 
 * 功能：设置指定ID的视频任务定时下载
 * @param {Array} ids - 任务ID数组
 * @param {Object} schedule - 定时配置
 *   - startTime {number} 定时开始时间的时间戳
 *   - config {Object} 下载配置
 *     - maxConcurrent {number} 最大并发请求数
 *     - maxRetries {number} 最大重试次数
 *     - startFragment {number} 开始片段位置序号
 * 
 * @returns {Promise<Object>} 返回Promise对象，包含：
 *   - success {boolean} 是否成功
 *   - data {Object} 定时任务信息
 *   - message {string} 成功或错误消息
 */
export const scheduleDownload = (ids, schedule) => {
  return request({
    url: '/api/scheduleDownload',
    method: 'post',
    data: { ids, schedule }
  });
};

/**
 * 暂停所有下载任务
 * 
 * 功能：暂停所有正在下载的任务
 * 
 * @returns {Promise<Object>} 返回Promise对象，包含：
 *   - success {boolean} 是否成功
 *   - message {string} 成功或错误消息
 */
export const pauseAllDownloads = () => {
  return request({
    url: '/api/pauseAll',
    method: 'post'
  });
};

/**
 * 继续所有下载任务
 * 
 * 功能：继续所有被暂停的下载任务
 * 
 * @returns {Promise<Object>} 返回Promise对象，包含：
 *   - success {boolean} 是否成功
 *   - message {string} 成功或错误消息
 */
export const resumeAllDownloads = () => {
  return request({
    url: '/api/resumeAll',
    method: 'post'
  });
};

/**
 * 取消下载任务
 * 
 * 功能：取消指定ID的下载任务
 * @param {string} id - 要取消的任务ID
 * 
 * @returns {Promise<Object>} 返回Promise对象，包含：
 *   - success {boolean} 是否成功
 *   - message {string} 成功或错误消息
 */
export const cancelDownload = (id) => {
  return request({
    url: '/api/cancelDownload',
    method: 'post',
    data: { id }
  });
};

/**
 * 删除已下载视频
 * 
 * 功能：删除指定ID的已下载视频
 * @param {string} id - 要删除的视频ID
 * 
 * @returns {Promise<Object>} 返回Promise对象，包含：
 *   - success {boolean} 是否成功
 *   - message {string} 成功或错误消息
 */
export const deleteDownloadedVideo = (id) => {
  return request({
    url: '/api/deleteDownloaded',
    method: 'post',
    data: { id }
  });
};

/**
 * 删除所有已下载视频
 * 
 * 功能：删除所有已下载的视频
 * 
 * @returns {Promise<Object>} 返回Promise对象，包含：
 *   - success {boolean} 是否成功
 *   - message {string} 成功或错误消息
 */
export const deleteAllDownloadedVideos = () => {
  return request({
    url: '/api/deleteAllDownloaded',
    method: 'post'
  });
};

/**
 * 删除待下载任务
 * 
 * 功能：从数据库中删除指定ID的待下载任务
 * @param {Array} ids - 要删除的任务ID数组
 * 
 * @returns {Promise<Object>} 返回Promise对象，包含：
 *   - success {boolean} 是否成功
 *   - message {string} 成功或错误消息
 */
export const deletePendingTasks = (ids) => {
  return request({
    url: '/api/deletePendingTasks',
    method: 'post',
    data: { ids }
  });
};

/**
 * 获取哔哩哔哩Cookie
 * 
 * 功能：获取服务器上保存的哔哩哔哩Cookie
 * 
 * @returns {Promise<Object>} 返回Promise对象，包含：
 *   - code {number} 状态码
 *   - exists {boolean} Cookie是否存在
 *   - cookie {string} Cookie字符串内容
 *   - updatedAt {string} 最后更新时间
 */
export const getBilibiliCookie = () => {
  return request({
    url: '/api/bilibili/cookie',
    method: 'get'
  });
};

/**
 * 更新哔哩哔哩Cookie
 * 
 * 功能：更新服务器上的哔哩哔哩Cookie
 * @param {string} cookie - 新的哔哩哔哩Cookie字符串
 * 
 * @returns {Promise<Object>} 返回Promise对象，包含：
 *   - code {number} 状态码
 *   - message {string} 成功或错误消息
 *   - updatedAt {string} 更新时间
 */
export const updateBilibiliCookie = (cookie) => {
  return request({
    url: '/api/bilibili/cookie',
    method: 'post',
    data: { cookie }
  });
}; 