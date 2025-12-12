// app.js
// 引入配置文件
const config = require('./config/index');

App({
  onLaunch() {
    // 小程序初始化时执行
    console.log('AI 喵相馆小程序启动');
    console.log('当前环境配置:', config);
  },
  globalData: {
    // 全局数据
    config: config, // 完整配置
    apiUrl: config.apiUrl // 从配置文件获取API地址
  }
})