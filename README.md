# VideoDownloader 视频下载工具

VideoDownloader是一个功能强大的视频下载工具，支持从多个平台下载视频内容，提供友好的用户界面和高效的下载管理功能。该项目由前端（React）和后端（Node.js）两部分组成，实现了视频链接解析、下载队列管理、定时任务和系统监控等功能，并支持多端适配。

![2025-04-19-20-41-30.png](https://i.postimg.cc/t4sj6GLf/2025-04-19-20-41-30.png)

## 功能特点

### 多平台支持
- **通用网页解析**：支持通过puppeteer解析各类网页中的视频链接
- **哔哩哔哩（Bilibili）**：支持哔哩哔哩视频下载，包含Cookie管理功能
- **抖音（Douyin）**：支持抖音视频的解析和下载
- **快手（Kuaishou）**：支持快手视频的解析和下载
- **其他视频平台**：支持多种常见视频格式(.mp4, .m3u8等)的直接下载

### 核心功能
- **智能视频解析**：自动检测并解析网页中的视频链接
- **下载队列管理**：有序处理多个下载任务，支持优先级调整
- **下载进度监控**：实时显示下载进度和状态
- **历史记录管理**：查看和管理已下载的视频内容
- **定时任务**：支持设置定时下载任务
- **系统监控**：实时监控系统资源使用情况（CPU、内存、温度等）树莓派要监控温度需要开启root用户，否则监控温度模块会报错

### 用户界面特点
- **响应式设计**：适配不同设备和屏幕尺寸
- **深色/浅色模式**：根据系统主题自动切换界面模式
- **操作便捷**：提供批量操作功能，如批量下载、批量删除
- **实时状态更新**：通过WebSocket实现实时状态更新

## 技术架构

### 前端（VideoDownloader-react）
- **框架**：React 19
- **UI组件库**：Ant Design 5.x
- **构建工具**：Vite
- **状态管理**：React Hooks
- **网络通信**：Axios、WebSocket
- **样式处理**：SCSS
- **通知系统**：react-toastify

### 后端（VideoDownloader-nodejs）
- **框架**：Express.js
- **网络通信**：WebSocket (ws)
- **数据库**：NeDB (轻量级NoSQL数据库)
- **网页解析**：Puppeteer、Cheerio
- **视频处理**：fluent-ffmpeg、ffmpeg-static
- **并发控制**：p-queue
- **系统监控**：systeminformation、pi-temperature

## 安装指南

### 环境要求
- Node.js 14.x 或更高版本
- npm 或 yarn 包管理器

### 后端安装
```bash
# 进入后端目录
cd VideoDownloader-nodejs

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 或启动生产服务器
npm start
```

### 前端安装
```bash
# 进入前端目录
cd VideoDownloader-react

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build
```

## 使用说明

### 基本使用流程
1. 启动后端服务器和前端应用
2. 在输入框中粘贴要下载的视频链接
3. 点击"解析"按钮，系统会自动识别视频来源并解析
4. 解析成功后，视频将显示在待下载列表中
5. 选择要下载的视频，点击"下载"按钮开始下载
6. 下载进度会实时显示在下载进度区域
7. 下载完成的视频将移至已下载列表

### 特殊功能
- **哔哩哔哩下载**：需要先设置有效的Cookie，点击左上角的哔哩哔哩字设置
- **批量操作**：可以选择多个视频进行批量下载或删除
- **定时任务**：可以设置定时下载任务，系统会在指定时间自动执行
- **视频管理**：可以查看、播放和删除已下载的视频

## 项目结构

### 后端结构
- `app.js`：应用入口文件，配置Express服务器和WebSocket
- `router/`：路由处理目录
  - `bilibili/`：哔哩哔哩相关API
  - `douyin/`：抖音相关API
  - `kuaishou/`：快手相关API
  - `piPuppeteer/`：通用网页解析API
  - `videoAPI/`：视频处理相关API
  - `downloadList/`：下载列表管理API
- `utils/`：工具函数目录
  - `downloadQueue.js`：下载队列管理
  - `scheduleManager.js`：定时任务管理
  - `systemMonitor.js`：系统监控功能
- `db/`：数据库相关代码
- `video/`：下载的视频存储目录

### 前端结构
- `src/App.jsx`：应用主组件
- `src/components/`：UI组件目录
  - `InputBox.jsx`：链接输入框组件
  - `VideoParser.jsx`：视频解析组件
  - `TaskList.jsx`：待下载任务列表组件
  - `DownloadProgress.jsx`：下载进度显示组件
  - `DownloadedList.jsx`：已下载视频列表组件
  - `SystemMonitor.jsx`：系统监控组件
  - `BilibiliCookieModal.jsx`：哔哩哔哩Cookie管理组件
- `src/api/`：API调用函数
- `src/hooks/`：自定义React Hooks
- `src/utils/`：工具函数
- `src/styles/`：样式文件

## 注意事项
- 该工具仅用于个人学习和研究使用
- 请遵守相关法律法规和视频平台的使用条款
- 不要过度频繁地请求同一平台，以避免IP被封
- 下载的视频文件可能占用较大存储空间，请确保有足够的磁盘空间
