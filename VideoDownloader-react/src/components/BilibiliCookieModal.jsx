import React, { useState, useEffect } from 'react';
import { Modal, Input, Button, message, Space } from 'antd';
import { getBilibiliCookie, updateBilibiliCookie } from '../api';
import '../styles/BilibiliCookieModal.scss';

/**
 * 哔哩哔哩Cookie管理弹窗组件
 * 
 * 功能：显示、替换和清除哔哩哔哩Cookie
 * 
 * @param {Object} props
 * @param {boolean} props.visible - 控制弹窗显示与否
 * @param {function} props.onClose - 关闭弹窗的回调函数
 */
const BilibiliCookieModal = ({ visible, onClose }) => {
  const [cookie, setCookie] = useState('');
  const [loading, setLoading] = useState(false);
  const [messageApi, contextHolder] = message.useMessage();

  // 加载Cookie
  useEffect(() => {
    if (visible) {
      fetchCookie();
    }
  }, [visible]);

  // 获取Cookie
  const fetchCookie = async () => {
    try {
      setLoading(true);
      const response = await getBilibiliCookie();
      if (response && response.code === 200 && response.exists) {
        setCookie(response.cookie || '');
      } else {
        setCookie('');
      }
    } catch (error) {
      console.error('获取Cookie失败:', error);
      messageApi.error('获取Cookie失败');
      setCookie('');
    } finally {
      setLoading(false);
    }
  };

  // 替换Cookie
  const handleReplace = async () => {
    try {
      setLoading(true);
      const response = await updateBilibiliCookie(cookie);
      if (response && response.code === 200) {
        messageApi.success(response.message || 'Cookie更新成功');
        onClose();
      } else {
        messageApi.error(response.error || 'Cookie更新失败');
      }
    } catch (error) {
      console.error('更新Cookie失败:', error);
      messageApi.error('更新Cookie失败: ' + (error.message || '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  // 清除输入框内容
  const handleClear = () => {
    setCookie('');
  };

  return (
    <>
      {contextHolder}
      <Modal
        title="哔哩哔哩Cookie管理"
        open={visible}
        onCancel={onClose}
        footer={null}
        width={600}
        className="bilibili-cookie-modal"
      >
        <div className="cookie-form">
          <p className="cookie-tip">当前Cookie（注意：这里仅存储Cookie字符串，非实际Cookie值）</p>
          <Input.TextArea
            value={cookie}
            onChange={(e) => setCookie(e.target.value)}
            placeholder="请输入哔哩哔哩Cookie"
            rows={6}
            disabled={loading}
          />
          <div className="button-group">
            <Space>
              <Button 
                type="primary" 
                onClick={handleReplace} 
                loading={loading}
                disabled={!cookie}
              >
                替换
              </Button>
              <Button onClick={handleClear} disabled={loading || !cookie}>
                清除
              </Button>
            </Space>
          </div>
        </div>
      </Modal>
    </>
  );
};

export default BilibiliCookieModal; 