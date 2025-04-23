// WebSocket连接管理
class WebSocketService {
  constructor() {
    this.socket = null;
    this.listeners = {
      message: [],
      connection: [],
      error: [],
      close: []
    };
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectTimeout = null;
    this.isConnected = false;
  }

  connect() {
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      return;
    }

    // 获取WebSocket连接URL
    // 开发环境使用本地地址，生产环境使用相对路径
    const wsUrl = import.meta.env.DEV 
      ? 'ws://localhost:86/ws'  // 开发环境直接连接后端
      : `ws://${window.location.host}/ws`;  // 生产环境使用当前域名

    console.log('正在连接WebSocket:', wsUrl);
    this.socket = new WebSocket(wsUrl);
    
    this.socket.onopen = () => {
      console.log('WebSocket连接已建立');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.notifyListeners('connection', true);
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.notifyListeners('message', data);
      } catch (error) {
        console.error('解析WebSocket消息出错:', error);
      }
    };

    this.socket.onerror = (error) => {
      console.error('WebSocket错误:', error);
      this.notifyListeners('error', error);
    };

    this.socket.onclose = () => {
      console.log('WebSocket连接已关闭');
      this.isConnected = false;
      this.notifyListeners('close', null);
      this.attemptReconnect();
    };
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`尝试重新连接... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = setTimeout(() => {
        this.connect();
      }, 3000); // 3秒后尝试重连
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    clearTimeout(this.reconnectTimeout);
  }

  addEventListener(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
    return () => this.removeEventListener(event, callback);
  }

  removeEventListener(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  notifyListeners(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }
}

// 创建单例实例
const wsService = new WebSocketService();

export default wsService; 