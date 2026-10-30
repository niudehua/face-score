const config = require('./config/index');

App({
  onLaunch() { console.log('萌牛测颜小程序启动'); },
  globalData: { config, apiUrl: config.apiUrl },
  // Tokens stay in memory, never in logs or source control. Concurrent callers share login.
  async getSessionToken() {
    if (this.sessionToken && Date.now() < this.sessionExpiresAt) return this.sessionToken;
    if (this.sessionPromise) return this.sessionPromise;
    this.sessionPromise = (async () => {
      if (!this.globalData.apiUrl) throw new Error('小程序 API 地址未配置');
      const login = await new Promise((resolve, reject) => wx.login({ success: resolve, fail: reject }));
      if (!login.code) throw new Error('微信登录失败，请重试');
      const response = await new Promise((resolve, reject) => wx.request({
        url: this.globalData.apiUrl.replace(/\/$/, '') + '/api/miniprogram-session',
        method: 'POST', header: { 'Content-Type': 'application/json' }, data: { code: login.code },
        success: resolve, fail: reject
      }));
      if (response.statusCode !== 200 || !response.data.token) throw new Error(response.data?.error || '小程序登录失败');
      this.sessionToken = response.data.token;
      this.sessionExpiresAt = Date.now() + Math.max(0, response.data.expires_in - 60) * 1000;
      return this.sessionToken;
    })();
    try { return await this.sessionPromise; } finally { this.sessionPromise = null; }
  },
  async apiRequest(path, data, retry = true) {
    const token = await this.getSessionToken();
    const response = await new Promise((resolve, reject) => wx.request({
      url: this.globalData.apiUrl.replace(/\/$/, '') + path,
      method: 'POST', timeout: 60000,
      header: { 'Content-Type': 'application/json', 'X-App-Type': 'miniprogram', Authorization: 'Bearer ' + token },
      data: { ...data, app_type: 'miniprogram' }, success: resolve, fail: reject
    }));
    if (response.statusCode === 401 && retry) {
      this.sessionToken = null;
      return this.apiRequest(path, data, false);
    }
    if (response.statusCode < 200 || response.statusCode >= 300) throw new Error(response.data?.error || response.data?.message || '请求失败，请稍后重试');
    return response;
  }
});
