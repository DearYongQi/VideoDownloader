import React, { useState } from 'react';
import { Input, Button, Alert, Space, Typography, Tag } from 'antd';
import { SearchOutlined, ClearOutlined } from '@ant-design/icons';
import '../styles/InputBox.scss';

const { TextArea } = Input;
const { Text } = Typography;

/**
 * InputBox - 视频链接输入框组件
 * 
 * 功能：提供输入视频链接的界面，自动检测并提取URL，提供解析和清除功能
 * 
 * 参数：
 * @param {string} input - 输入的文本内容
 * @param {function} onInputChange - 输入变化时的回调函数
 * @param {function} onParse - 解析视频按钮点击时的回调函数
 * @param {function} onClear - 清除按钮点击时的回调函数
 * @param {string} extractedUrl - 从输入中提取的URL
 * @param {string} urlType - URL类型（bilibili/douyin/kuaishou/generic）
 * @param {boolean} loading - 是否正在加载中
 * @param {string} error - 错误信息
 * 
 * 返回：渲染输入框、URL信息、错误提示和操作按钮
 */
const InputBox = ({
  input,
  onInputChange,
  onParse,
  onClear,
  extractedUrl,
  urlType,
  loading,
  error
}) => {
  const [isFocused, setIsFocused] = useState(false);
  
  const handleFocus = () => setIsFocused(true);
  const handleBlur = () => setIsFocused(false);
  
  /**
   * 处理键盘按下事件
   * 支持Ctrl+Enter快速解析
   */
  const handleKeyDown = (e) => {
    // 如果按下Ctrl+Enter且有有效的URL，则触发解析
    if (e.ctrlKey && e.key === 'Enter' && extractedUrl) {
      e.preventDefault();
      onParse();
    }
  };
  
  /**
   * 渲染URL类型标签
   * 
   * 功能：根据URL类型显示对应平台的标签
   * 返回：标签组件或null
   */
  const renderUrlTypeTag = () => {
    if (!extractedUrl) return null;
    
    const typeColors = {
      bilibili: '#FB7299',
      douyin: '#000000',
      kuaishou: '#FF4E33',
      generic: '#4096ff'
    };
    
    const typeNames = {
      bilibili: '哔哩哔哩',
      douyin: '抖音',
      kuaishou: '快手',
      generic: '网页'
    };
    
    return (
      <Tag color={typeColors[urlType] || typeColors.generic}>
        {typeNames[urlType] || '未知来源'}
      </Tag>
    );
  };

  return (
    <div className={`input-box ${isFocused ? 'focused' : ''}`}>
      <TextArea
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        placeholder="请粘贴视频分享链接或网址...（支持Ctrl+Enter快速解析）"
        autoSize={{ minRows: 3, maxRows: 8 }}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
      />
      
      {extractedUrl && (
        <div className="extracted-url">
          <Space>
            {renderUrlTypeTag()}
            <Text ellipsis={{ tooltip: extractedUrl }}>{extractedUrl}</Text>
          </Space>
        </div>
      )}
      
      {error && (
        <Alert 
          message={error} 
          type="error" 
          showIcon 
          className="error-alert"
        />
      )}
      
      <div className="buttons">
        <Button 
          type="primary"
          icon={<SearchOutlined />}
          onClick={onParse}
          loading={loading}
          disabled={!extractedUrl}
          className="action-button"
        >
          <span className="button-text">解析视频</span>
        </Button>
        <Button 
          icon={<ClearOutlined />}
          onClick={onClear}
        >
          清除
        </Button>
      </div>
    </div>
  );
};

export default InputBox; 