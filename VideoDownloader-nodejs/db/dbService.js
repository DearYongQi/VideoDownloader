const Datastore = require('nedb');
const path = require('path');
const fs = require('fs');

// 内存缓存，作为数据库的备份机制
const memoryCache = [];

// 确保数据库目录存在
const dbDir = path.join(__dirname);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// 初始化数据库
const dbPath = path.join(__dirname, 'videoList.db');
// 创建空文件，确保文件存在
if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, '', {encoding: 'utf8'});
}

// 初始化bilibiliCookie数据库
const cookieDbPath = path.join(__dirname, 'bilibiliCookie.db');
// 创建空文件，确保文件存在
if (!fs.existsSync(cookieDbPath)) {
    fs.writeFileSync(cookieDbPath, '', {encoding: 'utf8'});
}

const db = new Datastore({ 
    filename: dbPath,
    autoload: true,
    // 添加延迟写入配置，提高可靠性
    timestampData: true,
    corruptAlertThreshold: 1
});

const cookieDb = new Datastore({ 
    filename: cookieDbPath,
    autoload: true,
    timestampData: true,
    corruptAlertThreshold: 1
});

// 在启动时进行一次加载测试，确保数据库可正常访问
db.loadDatabase(err => {
    if (err) {
        console.error('数据库加载错误:', err);
    } else {
        console.log('数据库加载成功');
    }
});

/**
 * 保存视频信息到数据库
 * @param {string} title - 视频标题
 * @param {string} downloadLink - 下载链接
 * @param {string} source - 视频来源（如'douyin'、'html'等）
 * @returns {Promise<Object>} - 包含操作结果的Promise
 */
async function saveVideo(title, downloadLink, source) {
    return new Promise((resolve, reject) => {
        try {
            // 无论如何先保存到内存缓存
            const cacheEntry = {
                title,
                downloadLink,
                state: 1,
                time: Date.now(),
                source
            };
            
            // 检查缓存中是否已存在
            const existingIndex = memoryCache.findIndex(item => item.title === title);
            if (existingIndex >= 0) {
                memoryCache[existingIndex] = cacheEntry;
            } else {
                memoryCache.push(cacheEntry);
            }
            
            // 确保数据库ready，防止写入错误
            db.loadDatabase(loadErr => {
                if (loadErr) {
                    console.error('数据库加载错误，使用内存缓存:', loadErr);
                    return resolve({ inserted: true, inMemoryOnly: true });
                }
                
                // 首先检查是否已存在相同标题的记录
                db.findOne({ title }, (err, doc) => {
                    if (err) {
                        console.error('数据库查询错误，使用内存缓存:', err);
                        return resolve({ inserted: true, inMemoryOnly: true });
                    }

                    // 如果记录已存在，更新它
                    if (doc) {
                        db.update(
                            { title },
                            { $set: { downloadLink, state: 1, time: Date.now(), source } },
                            {},
                            (err) => {
                                if (err) {
                                    console.error('数据库更新错误，使用内存缓存:', err);
                                    return resolve({ inserted: false, updated: true, inMemoryOnly: true });
                                }
                                resolve({ inserted: false, updated: true, doc });
                            }
                        );
                    } else {
                        // 否则创建新记录
                        const newRecord = {
                            title,
                            downloadLink,
                            state: 1,
                            time: Date.now(),
                            source
                        };

                        db.insert(newRecord, (err, newDoc) => {
                            if (err) {
                                console.error('数据库插入错误，使用内存缓存:', err);
                                return resolve({ inserted: true, inMemoryOnly: true });
                            }
                            resolve({ inserted: true, updated: false, doc: newDoc });
                        });
                    }
                });
            });
        } catch (err) {
            console.error('数据库操作异常，使用内存缓存:', err);
            // 即使发生异常，也返回成功，因为已保存到内存缓存
            resolve({ inserted: true, inMemoryOnly: true, error: err.message });
        }
    });
}

/**
 * 根据状态查询视频列表
 * @param {number} state - 要查询的状态值
 * @returns {Promise<Array>} - 包含查询结果的Promise
 */
async function findVideosByState(state) {
    return new Promise((resolve, reject) => {
        try {
            // 确保数据库ready
            db.loadDatabase(loadErr => {
                if (loadErr) {
                    console.error('数据库加载错误，使用内存缓存查询:', loadErr);
                    // 从内存缓存中查询
                    const results = memoryCache.filter(item => item.state === state);
                    return resolve({ results, inMemoryOnly: true });
                }
                
                // 从数据库查询
                db.find({ state }, (err, docs) => {
                    if (err) {
                        console.error('数据库查询错误，使用内存缓存查询:', err);
                        // 从内存缓存中查询
                        const results = memoryCache.filter(item => item.state === state);
                        return resolve({ results, inMemoryOnly: true });
                    }
                    
                    resolve({ results: docs, inMemoryOnly: false });
                });
            });
        } catch (err) {
            console.error('数据库查询操作异常，使用内存缓存:', err);
            // 从内存缓存中查询
            const results = memoryCache.filter(item => item.state === state);
            resolve({ results, inMemoryOnly: true, error: err.message });
        }
    });
}

/**
 * 根据ID更新视频状态
 * @param {string} id - 要更新的视频ID
 * @param {number} state - 新的状态值
 * @returns {Promise<Object>} - 包含操作结果的Promise
 */
async function updateVideoState(id, state) {
    return new Promise((resolve, reject) => {
        try {
            // 确保数据库ready
            db.loadDatabase(loadErr => {
                if (loadErr) {
                    console.error('数据库加载错误，无法更新状态:', loadErr);
                    return reject(new Error('数据库加载错误，无法更新状态'));
                }
                
                // 更新数据库中的状态
                db.update(
                    { _id: id },
                    { $set: { state, updateTime: Date.now() } },
                    {},
                    (err, numAffected) => {
                        if (err) {
                            console.error('数据库更新错误:', err);
                            return reject(new Error('数据库更新错误'));
                        }
                        
                        if (numAffected === 0) {
                            return resolve({ updated: false, message: '没有找到对应ID的视频' });
                        }
                        
                        // 同时更新内存缓存
                        db.findOne({ _id: id }, (err, updatedDoc) => {
                            if (!err && updatedDoc) {
                                const cacheIndex = memoryCache.findIndex(item => item._id === id);
                                if (cacheIndex >= 0) {
                                    memoryCache[cacheIndex].state = state;
                                    memoryCache[cacheIndex].updateTime = Date.now();
                                }
                            }
                            
                            resolve({ updated: true, numAffected, doc: updatedDoc });
                        });
                    }
                );
            });
        } catch (err) {
            console.error('数据库更新操作异常:', err);
            reject(new Error(`数据库更新操作异常: ${err.message}`));
        }
    });
}

/**
 * 获取最新的视频列表
 * @param {number} limit - 要获取的最大记录数，默认为200
 * @returns {Promise<Array>} - 包含最新视频列表的Promise
 */
async function getLatestVideos(limit = 200) {
    return new Promise((resolve, reject) => {
        try {
            // 确保数据库ready
            db.loadDatabase(loadErr => {
                if (loadErr) {
                    console.error('数据库加载错误，使用内存缓存:', loadErr);
                    // 从内存缓存中获取最新记录
                    const results = [...memoryCache].sort((a, b) => b.time - a.time).slice(0, limit);
                    return resolve({ results, inMemoryOnly: true });
                }
                
                // 从数据库查询最新记录
                db.find({})
                    .sort({ time: -1 }) // 按时间降序排序
                    .limit(limit)       // 限制返回记录数
                    .exec((err, docs) => {
                        if (err) {
                            console.error('数据库查询错误，使用内存缓存:', err);
                            // 从内存缓存中获取
                            const results = [...memoryCache].sort((a, b) => b.time - a.time).slice(0, limit);
                            return resolve({ results, inMemoryOnly: true });
                        }
                        
                        resolve({ results: docs || [], inMemoryOnly: false });
                    });
            });
        } catch (err) {
            console.error('获取最新视频列表异常，使用内存缓存:', err);
            // 从内存缓存中获取
            const results = [...memoryCache].sort((a, b) => b.time - a.time).slice(0, limit);
            resolve({ results, inMemoryOnly: true, error: err.message });
        }
    });
}

/**
 * 根据ID查询视频信息
 * @param {string} id - 要查询的视频ID
 * @returns {Promise<Object|null>} - 视频信息或null
 */
async function findVideoById(id) {
    return new Promise((resolve, reject) => {
        try {
            // 确保数据库ready
            db.loadDatabase(loadErr => {
                if (loadErr) {
                    console.error('数据库加载错误，使用内存缓存查询:', loadErr);
                    // 从内存缓存中查询
                    const cachedItem = memoryCache.find(item => item._id === id);
                    return resolve(cachedItem || null);
                }
                
                // 从数据库查询
                db.findOne({ _id: id }, (err, doc) => {
                    if (err) {
                        console.error('数据库查询错误，使用内存缓存查询:', err);
                        // 从内存缓存中查询
                        const cachedItem = memoryCache.find(item => item._id === id);
                        return resolve(cachedItem || null);
                    }
                    
                    resolve(doc);
                });
            });
        } catch (err) {
            console.error('数据库查询操作异常，使用内存缓存:', err);
            // 从内存缓存中查询
            const cachedItem = memoryCache.find(item => item._id === id);
            resolve(cachedItem || null);
        }
    });
}

/**
 * 根据ID删除视频记录
 * @param {string} id - 要删除的视频ID
 * @returns {Promise<Object>} - 包含操作结果的Promise
 */
async function deleteVideoById(id) {
    return new Promise((resolve, reject) => {
        try {
            // 确保数据库ready
            db.loadDatabase(loadErr => {
                if (loadErr) {
                    console.error('数据库加载错误，无法删除记录:', loadErr);
                    return reject(new Error('数据库加载错误，无法删除记录'));
                }
                
                // 从数据库中删除记录
                db.remove({ _id: id }, {}, (err, numRemoved) => {
                    if (err) {
                        console.error('数据库删除错误:', err);
                        return reject(new Error('数据库删除错误'));
                    }
                    
                    // 同时从内存缓存中删除
                    const cacheIndex = memoryCache.findIndex(item => item._id === id);
                    if (cacheIndex >= 0) {
                        memoryCache.splice(cacheIndex, 1);
                    }
                    
                    resolve({ deleted: true, numRemoved });
                });
            });
        } catch (err) {
            console.error('数据库删除操作异常:', err);
            reject(new Error(`数据库删除操作异常: ${err.message}`));
        }
    });
}

/**
 * 获取bilibili的Cookie信息
 * @returns {Promise<Object>} - 包含Cookie信息的Promise
 */
async function getBilibiliCookie() {
    return new Promise((resolve, reject) => {
        try {
            // 确保数据库ready
            cookieDb.loadDatabase(loadErr => {
                if (loadErr) {
                    console.error('bilibili Cookie数据库加载错误:', loadErr);
                    return resolve({ cookie: '', error: true, message: '数据库加载错误' });
                }
                
                // 查询Cookie记录，通常只有一条记录
                cookieDb.findOne({ type: 'bilibiliCookie' }, (err, doc) => {
                    if (err) {
                        console.error('bilibili Cookie查询错误:', err);
                        return resolve({ cookie: '', error: true, message: '查询错误' });
                    }
                    
                    if (!doc) {
                        return resolve({ cookie: '', exists: false });
                    }
                    
                    resolve({ cookie: doc.value, exists: true, updatedAt: doc.updatedAt });
                });
            });
        } catch (err) {
            console.error('获取bilibili Cookie异常:', err);
            resolve({ cookie: '', error: true, message: err.message });
        }
    });
}

/**
 * 更新bilibili的Cookie信息
 * @param {string} cookieValue - 新的Cookie值
 * @returns {Promise<Object>} - 包含操作结果的Promise
 */
async function updateBilibiliCookie(cookieValue) {
    return new Promise((resolve, reject) => {
        try {
            // 确保数据库ready
            cookieDb.loadDatabase(loadErr => {
                if (loadErr) {
                    console.error('bilibili Cookie数据库加载错误，无法更新:', loadErr);
                    return reject(new Error('数据库加载错误，无法更新Cookie'));
                }
                
                const now = Date.now();
                
                // 查找是否已存在Cookie记录
                cookieDb.findOne({ type: 'bilibiliCookie' }, (err, doc) => {
                    if (err) {
                        console.error('bilibili Cookie查询错误:', err);
                        return reject(new Error('查询错误，无法更新Cookie'));
                    }
                    
                    if (doc) {
                        // 更新现有记录
                        cookieDb.update(
                            { type: 'bilibiliCookie' },
                            { $set: { value: cookieValue, updatedAt: now } },
                            {},
                            (updateErr, numAffected) => {
                                if (updateErr) {
                                    console.error('bilibili Cookie更新错误:', updateErr);
                                    return reject(new Error('更新Cookie失败'));
                                }
                                
                                resolve({ updated: true, updatedAt: now });
                            }
                        );
                    } else {
                        // 创建新记录
                        const newRecord = {
                            type: 'bilibiliCookie',
                            value: cookieValue,
                            createdAt: now,
                            updatedAt: now
                        };
                        
                        cookieDb.insert(newRecord, (insertErr, newDoc) => {
                            if (insertErr) {
                                console.error('bilibili Cookie插入错误:', insertErr);
                                return reject(new Error('创建Cookie记录失败'));
                            }
                            
                            resolve({ created: true, updatedAt: now });
                        });
                    }
                });
            });
        } catch (err) {
            console.error('更新bilibili Cookie异常:', err);
            reject(new Error(`更新Cookie异常: ${err.message}`));
        }
    });
}

module.exports = {
    saveVideo,
    findVideosByState,
    updateVideoState,
    getLatestVideos,
    findVideoById,
    deleteVideoById,
    getBilibiliCookie,
    updateBilibiliCookie
}; 