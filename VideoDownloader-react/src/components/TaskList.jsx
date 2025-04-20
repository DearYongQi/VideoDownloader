import React, { useState, useEffect } from 'react';
import { List, Button, Checkbox, Modal, Form, InputNumber, Empty, Tooltip, ConfigProvider, Space, Row, Col, Divider, Badge } from 'antd';
import { 
  DownloadOutlined, 
  CheckOutlined, 
  UnorderedListOutlined, 
  CloseCircleOutlined,
  InfoCircleOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import { formatDate } from '../utils';
import '../styles/TaskList.scss';

/**
 * TaskList - 任务列表组件
 * 
 * 功能：显示待下载的任务列表，提供选择、立即下载和定时下载功能
 * 
 * 参数：
 * @param {Array} tasks - 任务列表数据
 * @param {boolean} loading - 是否加载中
 * @param {Array} selectedIds - 已选择的任务ID列表
 * @param {boolean} isSelectMode - 是否处于选择模式
 * @param {function} onToggleSelect - 切换选择单个任务的回调
 * @param {function} onToggleSelectMode - 切换选择模式的回调
 * @param {function} onStartDownload - 开始下载的回调
 * @param {function} onScheduleDownload - 设置定时下载的回调
 * @param {function} onCancelDownload - 取消下载的回调
 * @param {function} onDeleteTasks - 删除任务的回调
 * @param {Object} messageApi - Ant Design message API实例
 * 
 * 返回：渲染任务列表和相关操作按钮、模态框
 */
const TaskList = ({
  tasks,
  loading,
  selectedIds,
  isSelectMode,
  onToggleSelect,
  onToggleSelectMode,
  onStartDownload,
  onScheduleDownload,
  onCancelDownload,
  onDeleteTasks,
  messageApi
}) => {
  const [startModalVisible, setStartModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [isDarkMode, setIsDarkMode] = useState(false);

  // 监听系统主题变化
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    setIsDarkMode(mediaQuery.matches);
    
    const handler = (e) => setIsDarkMode(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  /**
   * 处理删除任务
   * 
   * 功能：显示确认对话框并调用删除任务回调
   * 返回：无
   */
  const handleDeleteTasks = () => {
    if (!selectedIds || selectedIds.length === 0) {
      messageApi?.warning('请先选择要删除的任务');
      return;
    }

    Modal.confirm({
      title: '确认删除',
      icon: <ExclamationCircleOutlined />,
      content: `确定要删除选中的 ${selectedIds.length} 个任务吗？此操作不可恢复！`,
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          const result = await onDeleteTasks();
          if (result) {
            messageApi?.success(`已删除 ${selectedIds.length} 个任务`);
          }
        } catch (error) {
          console.error('删除任务失败:', error);
          messageApi?.error('删除任务失败: ' + (error.message || '未知错误'));
        }
      }
    });
  };

  /**
   * 处理下载
   * 
   * 功能：验证表单并调用开始下载回调
   * 返回：无
   */
  const handleDownload = async () => {
    try {
      const values = await form.validateFields();

      // 计算定时任务的总延迟秒数
      const hours = parseInt(values.hours || 0);
      const minutes = parseInt(values.minutes || 0);
      const seconds = parseInt(values.seconds || 0);
      
      // 计算总延迟秒数并添加到配置中
      const totalDelaySeconds = hours * 3600 + minutes * 60 + seconds;

      // 创建完整的配置对象
      const config = {
        maxConcurrent: values.maxConcurrent,
        maxRetries: values.maxRetries,
        startFragment: values.startFragment,
        delaySeconds: totalDelaySeconds  // 添加延迟时间（秒）
      };
      
      // 调用下载接口
      const result = await onStartDownload(config);
      
      if (result) {
        if (totalDelaySeconds > 0) {
          const timeText = [];
          if (hours > 0) timeText.push(`${hours}小时`);
          if (minutes > 0) timeText.push(`${minutes}分钟`);
          if (seconds > 0) timeText.push(`${seconds}秒`);
          
          messageApi?.success(`已设置${timeText.join('')}后开始下载`);
        } else {
          messageApi?.success('下载任务已开始');
        }
        setStartModalVisible(false);
      }
    } catch (error) {
      console.error('表单验证失败:', error);
    }
  };

  /**
   * 处理取消下载
   * @param {string} id - 任务ID
   */
  const handleCancelDownload = async (id) => {
    try {
      const result = await onCancelDownload(id);
      if (result) {
        messageApi.success('已取消下载任务');
      }
    } catch (error) {
      console.error('取消下载失败:', error);
    }
  };
  
  /**
   * 渲染列表项
   * 
   * 功能：根据任务数据渲染单个列表项
   * @param {Object} item - 任务数据
   * 返回：列表项组件
   */
  const renderItem = (item) => {
    // 确保item存在且有效
    if (!item || !item._id) {
      console.warn('任务列表项无效:', item);
      return null;
    }
    
    // 安全地获取数据，提供默认值
    const title = item.title || '未命名任务';
    const source = item.source || '未知来源';
    const time = item.time ? formatDate(item.time) : '未知时间';
    const timeDisplay = time.split(' ')[0] || time;
    
    const isSelected = selectedIds.includes(item._id);
    
    // 处理列表项点击 - 在选择模式下点击整个项目可选择/取消选择
    const handleItemClick = () => {
      if (isSelectMode) {
        onToggleSelect(item._id);
      }
    };
    
    // 处理复选框点击 - 阻止事件冒泡
    const handleCheckboxClick = (e) => {
      e.stopPropagation();
    };
    
    const handleCheckboxChange = (e) => {
      e.stopPropagation();
      onToggleSelect(item._id);
    };
    
    return (
      <List.Item 
        className={`task-item ${isSelected && isSelectMode ? 'selected' : ''}`}
        onClick={handleItemClick}
      >
        <div className="item-container">
          {isSelectMode && (
            <Checkbox
              checked={isSelected}
              onChange={handleCheckboxChange}
              onClick={handleCheckboxClick}
              className="select-checkbox"
            />
          )}
          <div className="item-content">
            <div className="item-title">{title}</div>
            <div className="item-meta">
              <span className="item-source">{source}</span>
              <Tooltip title={time}>
                <span className="item-time">{timeDisplay}</span>
              </Tooltip>
            </div>
          </div>
          {!isSelectMode && item.state === 2 && (
            <Space className="item-actions">
              <Tooltip title="取消下载">
                <Button 
                  type="text" 
                  icon={<CloseCircleOutlined />} 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCancelDownload(item._id);
                  }}
                />
              </Tooltip>
            </Space>
          )}
        </div>
      </List.Item>
    );
  };

  return (
    <div className="task-list-container">
      <div className="list-header">
        <h3>
          任务列表
          {tasks && tasks.length > 0 && <Badge count={tasks.length} color="var(--primary-color)" className="count-badge" />}
        </h3>
        <div className="header-actions">
          <Space>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={() => setStartModalVisible(true)}
              disabled={!tasks || tasks.length === 0}
              className="action-button"
            >
              <span className="button-text">开始下载{selectedIds.length > 0 ? ` (${selectedIds.length}个)` : ''}</span>
            </Button>
            {isSelectMode && (
              <Button
                danger
                icon={<DeleteOutlined />}
                onClick={handleDeleteTasks}
                disabled={selectedIds.length === 0}
                className="action-button"
                style={{ marginLeft: '2px', marginRight: '2px' }}
              >
                <span className="button-text">删除选中</span>
              </Button>
            )}
            <Button
              icon={isSelectMode ? <CheckOutlined /> : <UnorderedListOutlined />}
              onClick={onToggleSelectMode}
              disabled={!tasks || tasks.length === 0}
              className="action-button"
            >
              <span className="button-text">{isSelectMode ? '完成' : '选择'}</span>
            </Button>
          </Space>
        </div>
      </div>

      <List
        className="task-list"
        loading={loading}
        dataSource={tasks}
        renderItem={renderItem}
        locale={{
          emptyText: <Empty description="暂无解析任务" />
        }}
      />

      {/* 下载配置弹窗 */}
      <Modal
        title="下载配置"
        open={startModalVisible}
        onOk={handleDownload}
        onCancel={() => setStartModalVisible(false)}
        width={500}
        className="download-config-modal"
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            maxConcurrent: 15,
            maxRetries: 2,
            startFragment: 0,
            hours: 0,
            minutes: 0,
            seconds: 0
          }}
        >
          <Row gutter={[16, 0]}>
            <Col xs={24} md={12}>
              <Form.Item
                name="maxConcurrent"
                label="最大并发请求数"
                rules={[{ required: true, message: '请输入最大并发请求数' }]}
              >
                <InputNumber min={1} max={50} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="maxRetries"
                label="最大重试次数"
                rules={[{ required: true, message: '请输入最大重试次数' }]}
              >
                <InputNumber min={0} max={10} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item
            name="startFragment"
            label="跳过开头多少秒"
            rules={[{ required: false, message: '请输入跳过开头的秒数' }]}
          >
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          
          <Divider />
          <div className="schedule-time-section">
            <h4 style={{ marginBottom: '16px' }}>定时下载</h4>
            <Row gutter={[16, 16]}>
              <Col xs={24} sm={8} md={8} lg={8}>
                <Form.Item
                  name="hours"
                  label="小时"
                  rules={[{ required: false, message: '请输入小时' }]}
                >
                  <InputNumber min={0} max={24} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8} md={8} lg={8}>
                <Form.Item
                  name="minutes"
                  label="分钟"
                  rules={[{ required: false, message: '请输入分钟' }]}
                >
                  <InputNumber min={0} max={59} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={8} md={8} lg={8}>
                <Form.Item
                  name="seconds"
                  label="秒"
                  rules={[{ required: false, message: '请输入秒' }]}
                >
                  <InputNumber min={0} max={59} style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default TaskList; 