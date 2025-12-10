// app.js
App({
  onLaunch() {
    // 小程序初始化时执行
    console.log('颜值打分机小程序启动');
  },
  globalData: {
    // 全局数据
    apiUrl: 'https://face-score.niudehua.cn/api/score' // 实际部署的API地址
  }
})