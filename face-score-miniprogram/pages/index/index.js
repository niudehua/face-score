// index.js
const app = getApp()

Page({
  data: {
    previewUrl: '',
    previewShow: false,
    tempFilePath: '',
    submitting: false,
    result: '',
    toastVisible: false,
    toastMessage: '',
    mode: 'score' // score | fortune
  },

  // 切换模式
  switchMode(e) {
    const mode = e.currentTarget.dataset.mode
    if (this.data.mode === mode) return

    this.setData({
      mode,
      result: '' // 切换模式时清空结果
    })
  },

  // 显示提示信息
  showToast(message, icon = 'none') {
    wx.showToast({
      title: message,
      icon: icon,
      duration: 2000
    })
  },

  // 选择图片
  chooseImage() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0]
        this.setData({
          previewUrl: tempFilePath,
          previewShow: true,
          tempFilePath: tempFilePath,
          result: ''
        })
        this.showToast('照片选择成功', 'success')
      }
    })
  },

  // 清空预览
  clearPreview() {
    this.setData({
      previewUrl: '',
      previewShow: false,
      tempFilePath: '',
      result: ''
    })
    this.showToast('已清空照片', 'success')
  },

  // 转换图片为Base64
  imageToBase64(filePath) {
    return new Promise((resolve, reject) => {
      wx.getFileSystemManager().readFile({
        filePath: filePath,
        encoding: 'base64',
        success: (res) => {
          resolve(res.data)
        },
        fail: (err) => {
          reject(err)
        }
      })
    })
  },

  // 提交评分
  async submitScore() {
    if (!this.data.tempFilePath) {
      this.showToast('请先选择一张照片', 'none')
      return
    }

    this.setData({
      submitting: true,
      result: ''
    })

    try {
      // 转换为Base64
      const base64Data = await this.imageToBase64(this.data.tempFilePath)

      // 根据模式选择API
      const isFortune = this.data.mode === 'fortune'
      const res = await this.callScoreAPI(base64Data, isFortune ? '/api/fortune' : '/api/score')

      const data = res.data;

      if (isFortune) {
        // --- 气质解读模式逻辑 ---
        if (data.comment) {
          let msg = `✨ ${data.title || '气质分析报告'} ✨\n\n`;
          msg += data.comment;
          this.setData({ result: msg });
        } else {
          this.setData({ result: '分析暂时繁忙，请稍后再试' });
        }

      } else {
        // --- 评分模式逻辑 ---
        if (data.score !== undefined && data.score !== null) {
          const score = Number(data.score.toFixed(1))
          let msg = `综合评分：${score} / 100\n\n`

          // 如果后端返回了AI生成的点评，就优先显示
          if (data.comment) {
            msg += `分析点评：${data.comment}\n\n`
          } else {
            // 后端没返回文案，就走本地逻辑兜底
            if (score < 40) {
              msg += '内在美是最宝贵的财富。'
            } else if (score < 50) {
              msg += '你有独特的个人气质，自信最美。'
            } else if (score < 60) {
              msg += '气质清新，给人的感觉很舒适。'
            } else if (score < 70) {
              msg += '很有吸引力，散发着独特的魅力。'
            } else if (score < 80) {
              msg += '非常出众！你的气质在人群中很亮眼。'
            } else {
              msg += '完美！无论是颜值还是气质都无可挑剔。'
            }
          }

          this.setData({
            result: msg
          })
        } else {
          this.setData({
            result: '检测失败，请换张清晰的照片试试'
          })
        }
      }

    } catch (err) {
      console.error('API请求错误:', err)
      this.setData({
        result: '出错了，请稍后重试！'
      })
    } finally {
      this.setData({
        submitting: false
      })
    }
  },

  // 调用评分API
  callScoreAPI(base64Data, path = '/api/score') {
    return new Promise((resolve, reject) => {
      let url = app.globalData.apiUrl;

      // 智能处理 API URL
      if (url.endsWith('/api/score')) {
        // 情况1：配置的是完整 API 路径 (旧配置兼容)
        if (path.includes('fortune')) {
          url = url.replace('score', 'fortune');
        }
      } else {
        // 情况2：配置的是域名/BaseURL (标准配置)
        // 去除末尾斜杠
        url = url.replace(/\/$/, '');
        // 拼接路径
        url = url + path;
      }

      console.log('API Request URL:', url); // Debug log

      wx.request({
        url: url,
        method: 'POST',
        header: {
          'Content-Type': 'application/json',
          'X-App-Type': 'miniprogram' // 添加请求头标识
        },
        data: {
          image: base64Data,
          app_type: 'miniprogram' // 添加请求体标识
        },
        success: (res) => {
          resolve(res)
        },
        fail: (err) => {
          reject(err)
        }
      })
    })
  },

  // 分享结果
  shareResult() {
    wx.showShareMenu({
      withShareTicket: true,
      menus: ['shareAppMessage', 'shareTimeline']
    })
    this.showToast('分享功能已打开', 'success')
  },

  // 保存图片
  saveResult() {
    if (!this.data.result) {
      this.showToast('还没有评分结果', 'none')
      return
    }

    wx.showLoading({
      title: '保存中...',
      mask: true
    })

    // 这里简化处理，实际可以使用canvas生成带结果的图片
    wx.saveImageToPhotosAlbum({
      filePath: this.data.previewUrl,
      success: () => {
        wx.hideLoading()
        this.showToast('图片保存成功', 'success')
      },
      fail: (err) => {
        wx.hideLoading()
        console.error('保存图片失败:', err)
        if (err.errMsg.indexOf('auth deny') > -1) {
          this.showToast('需要授权才能保存图片', 'none')
          wx.openSetting({
            success: (settingRes) => {
              if (settingRes.authSetting['scope.writePhotosAlbum']) {
                this.saveResult()
              }
            }
          })
        } else {
          this.showToast('保存失败，请稍后重试', 'none')
        }
      }
    })
  },

  // 分享给朋友
  onShareAppMessage() {
    return {
      title: '快来试试面部气质测评！',
      path: '/pages/index/index',
      imageUrl: this.data.previewUrl || '/favicon.png',
      desc: '颜值评分 & 气质解读，快来测测吧！'
    }
  },

  // 分享到朋友圈
  onShareTimeline() {
    return {
      title: '快来试试面部气质测评！',
      query: '',
      imageUrl: this.data.previewUrl || '/favicon.png'
    }
  }
})