import React from 'react';
import { Card, Row, Col, Progress, Typography } from 'antd';
import { 
  DesktopOutlined, 
  CloudOutlined, 
  DatabaseOutlined, 
  ThunderboltOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  FireOutlined
} from '@ant-design/icons';
import '../styles/SystemMonitor.scss';

const { Text } = Typography;

// 格式化网络速度，自动选择合适的单位
const formatNetworkSpeed = (bytesPerSecond) => {
  const kb = bytesPerSecond / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(2)} KB/s`;
  }
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB/s`;
};

const SystemMonitor = ({ systemInfo }) => {

  // 计算内存使用率
  const memoryUsage = systemInfo.memory.total > 0 
    ? Math.round((systemInfo.memory.used / systemInfo.memory.total) * 100) 
    : 0;

  // 计算磁盘使用率
  const diskUsage = systemInfo.disk.total > 0 
    ? Math.round(((systemInfo.disk.total - systemInfo.disk.free) / systemInfo.disk.total) * 100) 
    : 0;

  return (
    <Card className="system-monitor" variant="borderless" size="small">
      <Row gutter={[8, 8]} justify="space-around">
        {/* CPU信息 */}
        <Col xs={12} sm={6} md={4}>
          <div className="monitor-item">
            <div className="monitor-header">
              <DesktopOutlined />
              <Text strong>CPU</Text>
            </div>
            <Progress 
              percent={systemInfo.cpu || 0} 
              size="small" 
              status="active"
              format={percent => `${percent}%`}
              showInfo={false}
            />
            <Text type="secondary" className="monitor-value">
              {systemInfo.cpu || 0}%
            </Text>
          </div>
        </Col>

        {/* GPU温度 */}
        <Col xs={12} sm={6} md={4}>
          <div className="monitor-item">
            <div className="monitor-header">
              <FireOutlined />
              <Text strong>温度</Text>
            </div>
            <Progress 
              percent={systemInfo.temperature || 0} 
              size="small" 
              status="active"
              format={percent => `${percent}°C`}
              showInfo={false}
            />
            <Text type="secondary" className="monitor-value">
              {systemInfo.temperature || 0}°C
            </Text>
          </div>
        </Col>

        {/* 内存信息 */}
        <Col xs={12} sm={6} md={4}>
          <div className="monitor-item">
            <div className="monitor-header">
              <ThunderboltOutlined />
              <Text strong>内存</Text>
            </div>
            <Progress 
              percent={memoryUsage} 
              size="small" 
              status="active"
              format={percent => `${percent}%`}
              showInfo={false}
            />
            <Text type="secondary" className="monitor-value">
              {Math.round(systemInfo.memory.used / 1024 / 1024 / 1024)}G/{Math.round(systemInfo.memory.total / 1024 / 1024 / 1024)}G
            </Text>
          </div>
        </Col>

        {/* 存储信息 */}
        <Col xs={12} sm={6} md={4}>
          <div className="monitor-item">
            <div className="monitor-header">
              <DatabaseOutlined />
              <Text strong>存储</Text>
            </div>
            <Progress 
              percent={diskUsage} 
              size="small" 
              status="active"
              format={percent => `${percent}%`}
              showInfo={false}
            />
            <Text type="secondary" className="monitor-value">
              {Math.round((systemInfo.disk.total - systemInfo.disk.free) / 1024 / 1024 / 1024)}GB/{Math.round(systemInfo.disk.total / 1024 / 1024 / 1024)}GB
            </Text>
          </div>
        </Col>

        {/* 网络信息 */}
        <Col xs={24} sm={12} md={8}>
          <div className="monitor-item">
            <div className="monitor-header">
              <CloudOutlined />
              <Text strong>网络</Text>
            </div>
            <div className="network-info">
              <Text type="secondary" className="monitor-value upload">
                <ArrowUpOutlined />
                <span className="speed-value">
                  {formatNetworkSpeed(systemInfo.network.tx_speed)}
                </span>
              </Text>
              <Text type="secondary" className="monitor-value download">
                <ArrowDownOutlined />
                <span className="speed-value">
                  {formatNetworkSpeed(systemInfo.network.rx_speed)}
                </span>
              </Text>
            </div>
          </div>
        </Col>
      </Row>
    </Card>
  );
};

export default SystemMonitor; 