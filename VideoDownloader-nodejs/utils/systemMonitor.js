const os = require('os');
const si = require('systeminformation');
const piTemp = require('pi-temperature');

/**
 * 获取系统状态信息
 * 支持Mac和Raspberry Pi (树莓派)
 * @returns {Promise<Object>} 系统状态对象
 */
async function getSystemStatus() {
    try {
        // 获取CPU信息
        const cpuLoad = await si.currentLoad();

        // 获取内存信息
        const memInfo = await si.mem();

        // 获取网络信息
        const networkStats = await si.networkStats();

        // 获取硬盘信息
        const fsSize = await si.fsSize();

        // 系统状态信息
        const status = {
            cpu: cpuLoad.currentLoad.toFixed(2),
            memory: {
                total: memInfo.total,
                used: memInfo.used
            },
            disk: {
                total: 0,
                used: 0,
                free: 0
            },
            network: {
                rx_speed: 0, // 下载速度
                tx_speed: 0  // 上传速度
            }
        };

        // 填充硬盘信息
        if (fsSize && fsSize.length > 0) {
            // 查找主硬盘（通常是根分区或系统盘）
            let rootDisk = fsSize.find(disk =>
                disk.mount === '/' ||
                disk.mount === '/System/Volumes/Data' ||
                disk.mount.startsWith('/Volumes') ||
                disk.mount === 'C:' ||
                disk.mount === '/'
            );

            // 如果找不到主硬盘，使用容量最大的一个
            if (!rootDisk && fsSize.length > 0) {
                rootDisk = fsSize.reduce((max, disk) =>
                    disk.size > max.size ? disk : max, fsSize[0]);
            }

            if (rootDisk) {
                status.disk.total = rootDisk.size;     // 总存储大小
                status.disk.used = rootDisk.used;      // 已使用大小
                status.disk.free = rootDisk.available; // 可用大小
            }
        }

        // 填充网络速度数据
        if (networkStats && networkStats.length > 0) {
            // 获取主网络接口（通常是第一个非0速度的接口）
            let mainInterface = networkStats[0];
            for (const iface of networkStats) {
                if (iface.rx_sec > 0 || iface.tx_sec > 0) {
                    mainInterface = iface;
                    break;
                }
            }
            status.network.rx_speed = mainInterface.rx_sec || 0; // 下载速度 bytes/sec
            status.network.tx_speed = mainInterface.tx_sec || 0; // 上传速度 bytes/sec
        }

        // 获取温度
        const isPi = os.platform() === 'linux' &&
            (os.release().includes('raspbian') || os.release().includes('raspberry') || os.release().includes('rpt-rpi'));

        if (isPi) {
            return new Promise((resolve) => {
                piTemp.measure((err, temp) => {
                    status.temperature = err ? 0 : temp;
                    resolve(status);
                });
            });
        } else {
            status.temperature = 0;
            return status;
        }
    } catch (error) {
        return {
            cpu: '0',
            memory: {
                total: 0,
                used: 0
            },
            disk: {
                total: 0,
                used: 0,
                free: 0
            },
            network: {
                rx_speed: 0,
                tx_speed: 0
            },
            temperature: 0
        };
    }
}

/**
 * 向WebSocket客户端发送系统状态
 * @param {WebSocket} ws - WebSocket连接
 */
async function sendSystemStatus(ws) {
    if (ws.readyState === 1) { // OPEN
        const status = await getSystemStatus();
        ws.send(JSON.stringify({
            type: 'system_status',
            data: status
        }));
    }
}

module.exports = {
    getSystemStatus,
    sendSystemStatus
}; 