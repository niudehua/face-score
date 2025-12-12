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
        this.showToast('照片选择成功！', 'success')
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
      this.showToast('喵～先选张照片才能开始哦！', 'none')
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
        // --- 看相模式逻辑 ---
        if (data.comment) {
          let msg = `🔮 ${data.title || '大师亲批'} 🔮\n\n`;
          msg += data.comment;
          this.setData({ result: msg });
        } else {
          this.setData({ result: '大师有些累了，请稍后再试喵～' });
        }

      } else {
        // --- 评分模式逻辑 ---
        if (data.score !== undefined && data.score !== null) {
          const score = Number(data.score.toFixed(1))
          let msg = `颜值分数：${score} / 100 🐾\n\n`

          // 如果后端返回了AI生成的点评，就优先显示
          if (data.comment) {
            msg += `猫猫点评：${data.comment}\n\n`
          } else {
            // 后端没返回AI文案，就走本地逻辑兜底
            if (score < 40) {
              msg += '🐱 喵呜，内在美才是最最重要的！抱抱～'
            } else if (score < 50) {
              msg += '💫 你有那种治愈系的可爱气质，慢慢展现更迷人喵～'
            } else if (score < 60) {
              msg += '✨ 中等颜值，但有特别的小闪光点，越看越舒服～'
            } else if (score < 70) {
              msg += '😻 哇，已经很有吸引力啦，有点明星气场呢！'
            } else if (score < 80) {
              msg += '🌟 超棒！你走在街上绝对是回头率超高的小猫猫！'
            } else {
              msg += '🔥 绝绝子！你的颜值突破天际，猫猫都要尖叫啦！'
            }
          }

          this.setData({
            result: msg
          })
        } else {
          this.setData({
            result: '检测失败，喵呜～换张更清晰的照片试试吧？'
          })
        }
      }

    } catch (err) {
      console.error('API请求错误:', err)
      this.setData({
        result: '出错了喵～请稍后再试一下！'
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
      // 假设 apiUrl 是完整路径 (如 .../api/score)，我们需要根据 path 调整
      // 如果 path 是 /api/fortune，我们将 apiUrl 中的 score 替换为 fortune
      let url = app.globalData.apiUrl;
      if (path.includes('fortune')) {
        url = url.replace(/score$/, 'fortune');
      }

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
      this.showToast('还没有评分结果呢～', 'none')
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
        this.showToast('图片保存成功！', 'success')
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
      title: '快来试试颜值打分机！',
      path: '/pages/index/index',
      imageUrl: this.data.previewUrl || '/favicon.png',
      desc: '让AI猫猫帮你评分，看看你的颜值有多高！'
    }
  },

  // 分享到朋友圈
  onShareTimeline() {
    return {
      title: '快来试试颜值打分机！',
      query: '',
      imageUrl: this.data.previewUrl || '/favicon.png'
    }
  }
})