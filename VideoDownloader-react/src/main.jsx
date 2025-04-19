import React from 'react'
import { createRoot } from 'react-dom/client'
import '@ant-design/v5-patch-for-react-19';
import './index.css'
import App from './App.jsx'

// 创建一个错误边界组件
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("React错误:", error);
    console.error("组件堆栈:", errorInfo.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ 
          padding: '20px', 
          color: 'red', 
          border: '1px solid red',
          margin: '20px',
          borderRadius: '5px'
        }}>
          <span role="img" aria-label="error" style={{ fontSize: '48px', display: 'block', marginBottom: '20px' }}>
            😢
          </span>
          <h2>应用发生错误</h2>
          <p>{String(this.state.error)}</p>
        </div>
      );
    }

    return this.props.children;
  }
}

const root = createRoot(document.getElementById('root'));

root.render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
