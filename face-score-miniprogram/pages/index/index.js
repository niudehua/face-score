// index.js
const app = getApp()

Page({
  data: {
    previewUrl: '',
    previewShow: false,
    tempFilePath: '',
    previewUrlA: '',
    tempFilePathA: '',
    previewUrlB: '',
    tempFilePathB: '',
    submitting: false,
    result: '',
    toastVisible: false,
    toastMessage: '',
    mode: 'score',
    securityStatusA: '',
    securityStatusB: '',
    securityStatus: '',
    checkingA: false,
    checkingB: false,
    checking: false,
    mainButtonText: '上传美照'
  },

  // 切换模式
  switchMode(e) {
    const mode = e.currentTarget.dataset.mode
    if (this.data.mode === mode) return

    this.setData({
      mode,
      result: '',
      previewUrlA: '',
      tempFilePathA: '',
      previewUrlB: '',
      tempFilePathB: '',
      securityStatusA: '',
      securityStatusB: '',
      securityStatus: '',
      checkingA: false,
      checkingB: false,
      checking: false,
      previewShow: false,
      previewUrl: '',
      tempFilePath: '',
      mainButtonText: mode === 'couple' ? '上传我的照片' : '上传美照'
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

  // 选择图片（单人模式）
  async chooseImage() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const tempFilePath = res.tempFilePaths[0]
        
        const startTime = Date.now()
        this.setData({ checking: true })
        wx.showLoading({ title: '安全检查中...', mask: true })
        
        try {
          const base64Data = await this.imageToBase64(tempFilePath)
          console.log(`[安全检查][${new Date().toLocaleTimeString()}] 开始调用安全API，图片大小: ${base64Data.length / 1024} KB`)
          
          const securityResult = await this.callSecurityAPI(base64Data)
          const duration = Date.now() - startTime
          
          console.log(`[安全检查][${new Date().toLocaleTimeString()}] 检查完成，耗时: ${duration}ms`)
          console.log(`[安全检查][${new Date().toLocaleTimeString()}] 检查结果: ${securityResult.safe ? '✓ 通过' : '✗ 未通过'}`)
          console.log(`[安全检查][${new Date().toLocaleTimeString()}] 详细信息:`, securityResult)
          
          if (!securityResult.safe) {
            console.error(`[安全检查][${new Date().toLocaleTimeString()}] 内容违规被拦截: ${securityResult.message}`)
            this.setData({ securityStatus: 'rejected', checking: false })
            this.showToast('您发布的内容包含违规信息', 'none')
            return
          }
          
          console.log(`[安全检查][${new Date().toLocaleTimeString()}] ✓ 安全检查通过`)
          const buttonText = this.data.mode === 'score' ? '开始颜值测试' : '生成气质报告'
          this.setData({
            previewUrl: tempFilePath,
            previewShow: true,
            tempFilePath: tempFilePath,
            result: '',
            securityStatus: 'passed',
            checking: false,
            mainButtonText: buttonText
          })
          this.showToast('安全检查通过，照片选择成功', 'success')
        } catch (err) {
          console.error(`[安全检查][${new Date().toLocaleTimeString()}] ✗ 安全检查异常:`, err)
          this.setData({ securityStatus: 'error', checking: false })
          this.showToast('安全检查失败，请重试', 'none')
        } finally {
          wx.hideLoading()
        }
      }
    })
  },

  // 选择图片A（CP模式）
  async chooseImageA() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const tempFilePath = res.tempFilePaths[0]
        
        const startTime = Date.now()
        this.setData({ checkingA: true })
        wx.showLoading({ title: '安全检查中...', mask: true })
        
        try {
          const base64Data = await this.imageToBase64(tempFilePath)
          console.log(`[安全检查A][${new Date().toLocaleTimeString()}] 开始调用安全API，图片大小: ${base64Data.length / 1024} KB`)
          
          const securityResult = await this.callSecurityAPI(base64Data)
          const duration = Date.now() - startTime
          
          console.log(`[安全检查A][${new Date().toLocaleTimeString()}] 检查完成，耗时: ${duration}ms`)
          console.log(`[安全检查A][${new Date().toLocaleTimeString()}] 检查结果: ${securityResult.safe ? '✓ 通过' : '✗ 未通过'}`)
          console.log(`[安全检查A][${new Date().toLocaleTimeString()}] 详细信息:`, securityResult)
          
          if (!securityResult.safe) {
            console.error(`[安全检查A][${new Date().toLocaleTimeString()}] 内容违规被拦截: ${securityResult.message}`)
            this.setData({ securityStatusA: 'rejected', checkingA: false })
            this.showToast('您发布的内容包含违规信息', 'none')
            return
          }
          
          console.log(`[安全检查A][${new Date().toLocaleTimeString()}] ✓ 安全检查通过`)
          this.setData({
            previewUrlA: tempFilePath,
            tempFilePathA: tempFilePath,
            result: '',
            securityStatusA: 'passed',
            checkingA: false,
            mainButtonText: '上传TA的照片'
          })
          this.showToast('安全检查通过，第一张照片选择成功', 'success')
        } catch (err) {
          console.error(`[安全检查A][${new Date().toLocaleTimeString()}] ✗ 安全检查异常:`, err)
          this.setData({ securityStatusA: 'error', checkingA: false })
          this.showToast('安全检查失败，请重试', 'none')
        } finally {
          wx.hideLoading()
        }
      }
    })
  },

  // 选择图片B（CP模式）
  async chooseImageB() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const tempFilePath = res.tempFilePaths[0]
        
        const startTime = Date.now()
        this.setData({ checkingB: true })
        wx.showLoading({ title: '安全检查中...', mask: true })
        
        try {
          const base64Data = await this.imageToBase64(tempFilePath)
          console.log(`[安全检查B][${new Date().toLocaleTimeString()}] 开始调用安全API，图片大小: ${base64Data.length / 1024} KB`)
          
          const securityResult = await this.callSecurityAPI(base64Data)
          const duration = Date.now() - startTime
          
          console.log(`[安全检查B][${new Date().toLocaleTimeString()}] 检查完成，耗时: ${duration}ms`)
          console.log(`[安全检查B][${new Date().toLocaleTimeString()}] 检查结果: ${securityResult.safe ? '✓ 通过' : '✗ 未通过'}`)
          console.log(`[安全检查B][${new Date().toLocaleTimeString()}] 详细信息:`, securityResult)
          
          if (!securityResult.safe) {
            console.error(`[安全检查B][${new Date().toLocaleTimeString()}] 内容违规被拦截: ${securityResult.message}`)
            this.setData({ securityStatusB: 'rejected', checkingB: false })
            this.showToast('您发布的内容包含违规信息', 'none')
            return
          }
          
          console.log(`[安全检查B][${new Date().toLocaleTimeString()}] ✓ 安全检查通过`)
          this.setData({
            previewUrlB: tempFilePath,
            tempFilePathB: tempFilePath,
            result: '',
            securityStatusB: 'passed',
            checkingB: false,
            mainButtonText: '测测我们的缘分'
          })
          this.showToast('安全检查通过，第二张照片选择成功', 'success')
        } catch (err) {
          console.error(`[安全检查B][${new Date().toLocaleTimeString()}] ✗ 安全检查异常:`, err)
          this.setData({ securityStatusB: 'error', checkingB: false })
          this.showToast('安全检查失败，请重试', 'none')
        } finally {
          wx.hideLoading()
        }
      }
    })
  },

  // 清空预览（单人模式）
  clearPreview() {
    this.setData({
      previewUrl: '',
      previewShow: false,
      tempFilePath: '',
      result: '',
      mainButtonText: '上传美照'
    })
    this.showToast('已清空照片', 'success')
  },

  // 清空预览A（CP模式）
  clearPreviewA() {
    this.setData({
      previewUrlA: '',
      tempFilePathA: '',
      result: '',
      mainButtonText: '上传我的照片'
    })
    this.showToast('已清空第一张照片', 'success')
  },

  // 清空预览B（CP模式）
  clearPreviewB() {
    const buttonText = this.data.previewUrlA ? '上传TA的照片' : '上传我的照片'
    this.setData({
      previewUrlB: '',
      tempFilePathB: '',
      result: '',
      mainButtonText: buttonText
    })
    this.showToast('已清空第二张照片', 'success')
  },

  // 清空所有照片（CP模式）
  clearAllCouple() {
    this.setData({
      previewUrlA: '',
      tempFilePathA: '',
      previewUrlB: '',
      tempFilePathB: '',
      securityStatusA: '',
      securityStatusB: '',
      result: ''
    })
    this.showToast('已清空所有照片', 'success')
  },

  getMainButtonText() {
    const { mode, previewShow, previewUrlA, previewUrlB } = this.data
    
    if (mode === 'couple') {
      if (!previewUrlA) return '上传我的照片'
      if (!previewUrlB) return '上传TA的照片'
      return '测测我们的缘分'
    }
    
    if (!previewShow) return '上传美照'
    
    return mode === 'score' ? '开始颜值测试' : '生成气质报告'
  },

  handleMainAction() {
    const { mode, previewShow, previewUrlA, previewUrlB, result } = this.data
    
    if (mode === 'couple') {
      if (!previewUrlA) {
        this.chooseImageA()
      } else if (!previewUrlB) {
        this.chooseImageB()
      } else if (result) {
        this.clearAllCouple()
      } else {
        this.submitScore()
      }
      return
    }
    
    if (!previewShow) {
      this.chooseImage()
    } else if (result) {
      this.clearPreview()
    } else {
      this.submitScore()
    }
  },

  // 转换图片为Base64
  imageToBase64(filePath) {
    return new Promise((resolve, reject) => {
      wx.getLocalImgData({
        filePath: filePath,
        success: (res) => {
          let base64Data = res.data
          if (base64Data.startsWith('data:image')) {
            base64Data = base64Data.substring(base64Data.indexOf(',') + 1)
          }
          resolve(base64Data)
        },
        fail: (err) => {
          let actualPath = filePath
          
          if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
            const httpPrefix = filePath.startsWith('https://') ? 'https://' : 'http://'
            const hostPath = filePath.substring(httpPrefix.length)
            const slashIndex = hostPath.indexOf('/')
            
            if (slashIndex > -1) {
              let hostname = hostPath.substring(0, slashIndex)
              const colonIndex = hostname.indexOf(':')
              if (colonIndex > -1) {
                hostname = hostname.substring(0, colonIndex)
              }
              const pathname = hostPath.substring(slashIndex)
              
              if (hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '0.0.0.0') {
                actualPath = pathname
                if (actualPath.startsWith('/')) {
                  actualPath = actualPath.substring(1)
                }
              } else {
                reject(new Error('非本地图片无法读取'))
                return
              }
            }
          }
          
          wx.getFileSystemManager().readFile({
            filePath: actualPath,
            encoding: 'base64',
            success: (res) => {
              resolve(res.data)
            },
            fail: (err2) => {
              reject(err2)
            }
          })
        }
      })
    })
  },

  // 提交评分
  async submitScore() {
    const isCouple = this.data.mode === 'couple'

    if (isCouple) {
      if (!this.data.tempFilePathA || !this.data.tempFilePathB) {
        this.showToast('请先选择两张照片', 'none')
        return
      }

      this.setData({
        submitting: true,
        result: ''
      })

      try {
        const base64DataA = await this.imageToBase64(this.data.tempFilePathA)
        const base64DataB = await this.imageToBase64(this.data.tempFilePathB)

        const res = await this.callCoupleAPI(base64DataA, base64DataB)
        const data = res.data

        if (data.score !== undefined && data.score !== null) {
          const score = Number(data.score.toFixed(1))
          let msg = `💕 CP契合度：${score} / 100\n\n`
          msg += `等级：${data.grade || '待评估'}\n\n`
          if (data.highlights) msg += `匹配亮点：${data.highlights}\n\n`
          if (data.notes) msg += `需要注意：${data.notes}\n\n`
          if (data.tags) msg += `标签：${data.tags}`
          this.setData({ result: msg })
        } else {
          this.setData({ result: '分析失败，请重试。' })
        }

      } catch (err) {
        console.error('API请求错误:', err)
        const errorMsg = err.message || '网络信号溜去捉迷藏啦，请检查网络后再试一次喵～'
        if (errorMsg.includes('违规')) {
          this.setData({ result: errorMsg })
        } else {
          this.setData({ result: '网络信号溜去捉迷藏啦，请检查网络后再试一次喵～' })
        }
      } finally {
        this.setData({ 
          submitting: false,
          mainButtonText: '重新上传'
        })
      }
      return
    }

    if (!this.data.tempFilePath) {
      this.showToast('请先选择一张照片', 'none')
      return
    }

    this.setData({
      submitting: true,
      result: ''
    })

    try {
      const base64Data = await this.imageToBase64(this.data.tempFilePath)

      const isFortune = this.data.mode === 'fortune'
      const res = await this.callScoreAPI(base64Data, isFortune ? '/api/fortune' : '/api/score')

      const data = res.data;

      if (isFortune) {
        if (data.comment) {
          let msg = `✨ ${data.title || '气质分析报告'} ✨\n\n`;
          msg += data.comment;
          this.setData({ result: msg });
        } else {
          this.setData({ result: '美学分析师正在打盹，请稍后再次召唤喵～' });
        }

      } else {
        if (data.score !== undefined && data.score !== null) {
          const score = Number(data.score.toFixed(1))
          let msg = `综合评分：${score} / 100\n\n`

          if (data.comment) {
            msg += `分析点评：${data.comment}\n\n`
          } else {
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
            result: '喵呜？没看清呢，换张清晰的照片试试吧～'
          })
        }
      }

    } catch (err) {
      console.error('API请求错误:', err)
      const errorMsg = err.message || '网络信号溜去捉迷藏啦，请检查网络后再试一次喵～'
      if (errorMsg.includes('违规')) {
        this.setData({ result: errorMsg })
      } else {
        this.setData({ result: '网络信号溜去捉迷藏啦，请检查网络后再试一次喵～' })
      }
    } finally {
      const buttonText = this.data.mode === 'score' ? '开始颜值测试' : '生成气质报告'
      this.setData({
        submitting: false,
        mainButtonText: buttonText
      })
    }
  },

  // 调用评分API
  callScoreAPI(base64Data, path = '/api/score') {
    return new Promise((resolve, reject) => {
      let url = app.globalData.apiUrl;

      url = url.replace(/\/$/, '') + path;

      console.log('API Request URL:', url);

      wx.request({
        url: url,
        method: 'POST',
        header: {
          'Content-Type': 'application/json',
          'X-App-Type': 'miniprogram'
        },
        data: {
          image: base64Data,
          app_type: 'miniprogram'
        },
        success: (res) => {
          if (res.statusCode === 403) {
            reject(new Error(res.data?.error || res.data?.message || '您发布的内容包含违规信息'))
          } else {
            resolve(res)
          }
        },
        fail: (err) => {
          reject(err)
        }
      })
    })
  },

  // 调用CP契合度API
  callCoupleAPI(base64DataA, base64DataB) {
    return new Promise((resolve, reject) => {
      let url = app.globalData.apiUrl;
      url = url.replace(/\/$/, '') + '/api/couple';

      console.log('API Request URL:', url);

      wx.request({
        url: url,
        method: 'POST',
        header: {
          'Content-Type': 'application/json',
          'X-App-Type': 'miniprogram'
        },
        data: {
          imageA: base64DataA,
          imageB: base64DataB,
          app_type: 'miniprogram'
        },
        success: (res) => {
          if (res.statusCode === 403) {
            reject(new Error(res.data?.error || res.data?.message || '您发布的内容包含违规信息'))
          } else {
            resolve(res)
          }
        },
        fail: (err) => {
          reject(err)
        }
      })
    })
  },

  // 调用安全检查API
  callSecurityAPI(base64Data) {
    return new Promise((resolve, reject) => {
      let url = app.globalData.apiUrl;
      url = url.replace(/\/$/, '') + '/api/security';

      wx.request({
        url: url,
        method: 'POST',
        header: {
          'Content-Type': 'application/json',
          'X-App-Type': 'miniprogram'
        },
        data: {
          image: base64Data,
          app_type: 'miniprogram'
        },
        success: (res) => {
          if (res.statusCode === 200 && res.data) {
            resolve(res.data)
          } else {
            reject(new Error('安全检查失败'))
          }
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

  // 计算文本所需高度
  calculateTextHeight(ctx, text, maxWidth, lineHeight) {
    const words = text.split('')
    let line = ''
    let lineCount = 1

    for (let n = 0; n < words.length; n++) {
      if (words[n] === '\n') {
        line = ''
        lineCount++
        continue
      }
      const testLine = line + words[n]
      const metrics = ctx.measureText(testLine)
      const testWidth = metrics.width
      if (testWidth > maxWidth && n > 0) {
        line = words[n]
        lineCount++
      } else {
        line = testLine
      }
    }
    return lineCount * lineHeight
  },

  // 保存结果图片
  saveResult() {
    if (!this.data.result) {
      this.showToast('还没有评分结果', 'none')
      return
    }

    wx.showLoading({
      title: '正在生成报告...',
      mask: true
    })

    const query = wx.createSelectorQuery()
    query.select('#shareCanvas')
      .fields({ node: true, size: true })
      .exec(async (res) => {
        if (!res[0] || !res[0].node) {
          wx.hideLoading()
          this.showToast('生成失败，Canvas未找到', 'none')
          return
        }

        const canvas = res[0].node
        const ctx = canvas.getContext('2d')

        // --- 预计算高度 ---
        // 临时设置字体用于计算
        ctx.font = '14px sans-serif'
        const maxWidth = 300
        const lineHeight = 28 // 增加行高，提升阅读体验
        const textHeight = this.calculateTextHeight(ctx, this.data.result, maxWidth, lineHeight)

        // 布局参数
        const headerHeight = 375      // 图片区
        const titleAreaHeight = 80    // Logo & 分割线区
        const footerHeight = 60       // 底部 Slogan 区
        const paddingBottom = 20      // 额外底部留白

        // 总高度 = 各部分之和
        const totalHeight = headerHeight + titleAreaHeight + textHeight + footerHeight + paddingBottom

        // 设置高清 Canvas
        const dpr = 2
        canvas.width = 375 * dpr
        canvas.height = totalHeight * dpr
        ctx.scale(dpr, dpr)

        try {
          // 绘制海报
          await this.drawShareImage(canvas, ctx, totalHeight, textHeight)

          // 生成图片
          wx.canvasToTempFilePath({
            canvas: canvas,
            x: 0,
            y: 0,
            width: 375 * dpr,
            height: totalHeight * dpr,
            destWidth: 375 * dpr,
            destHeight: totalHeight * dpr,
            success: (res) => {
              this.saveImageToAlbum(res.tempFilePath)
            },
            fail: (err) => {
              console.error('生成图片失败:', err)
              wx.hideLoading()
              this.showToast('生成报告失败', 'none')
            }
          })
        } catch (error) {
          console.error('绘制失败:', error)
          wx.hideLoading()
          this.showToast('报告绘制出错', 'none')
        }
      })
  },

  // 绘制分享海报内容
  async drawShareImage(canvas, ctx, totalHeight, textHeight) {
    const w = 375
    // 注意：totalHeight 是计算出的 Logic Height

    // 1. 绘制白色背景
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, totalHeight)

    // 2. 绘制用户上传的照片
    const img = canvas.createImage()
    img.src = this.data.previewUrl
    await new Promise((resolve, reject) => {
      img.onload = resolve
      img.onerror = reject
    })

    const targetSize = 375
    const imgRatio = img.width / img.height
    let drawW, drawH, sx, sy

    if (imgRatio > 1) {
      drawH = img.height
      drawW = img.height
      sx = (img.width - img.height) / 2
      sy = 0
    } else {
      drawW = img.width
      drawH = img.width
      sx = 0
      sy = (img.height - img.width) / 2
    }

    ctx.drawImage(img, sx, sy, drawW, drawH, 0, 0, targetSize, targetSize)

    // 3. 绘制文字区域
    const textStartY = 375 + 25 // 图片下方25px开始

    // 动态文案配置
    const isScoreMode = this.data.mode === 'score'
    const titleText = isScoreMode ? '萌牛测颜 · 颜值鉴定书' : '萌牛测颜 · 气质解读报告'
    const sloganText = isScoreMode ? '—— 科学打分 · 发现你的美 ——' : '—— 面相美学 · 探索独特气质 ——'

    // 4. 绘制标题
    ctx.font = 'bold 18px sans-serif'
    ctx.fillStyle = '#333333'
    ctx.textAlign = 'center'
    ctx.fillText(titleText, w / 2, textStartY)

    // 5. 绘制分割线
    ctx.beginPath()
    ctx.moveTo(40, textStartY + 15)
    ctx.lineTo(335, textStartY + 15)
    ctx.strokeStyle = '#eeeeee'
    ctx.lineWidth = 1
    ctx.stroke()

    // 6. 绘制分析结果
    ctx.font = '14px sans-serif'
    ctx.fillStyle = '#666666'
    ctx.textAlign = 'left'

    const text = this.data.result
    const maxWidth = 300
    const lineHeight = 28 // 保持计算时的一致
    let x = 37.5
    let y = textStartY + 45

    this.wrapText(ctx, text, x, y, maxWidth, lineHeight)

    // 7. 绘制底部 Logo 或 Slogan (始终位于底部)
    ctx.font = '12px sans-serif'
    ctx.fillStyle = '#999999'
    ctx.textAlign = 'center'
    // 位于: 总高度 - 30px
    ctx.fillText(sloganText, w / 2, totalHeight - 30)
  },

  // Canvas 文字自动换行
  wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split('')
    let line = ''

    for (let n = 0; n < words.length; n++) {
      if (words[n] === '\n') {
        ctx.fillText(line, x, y)
        line = ''
        y += lineHeight
        continue
      }

      const testLine = line + words[n]
      const metrics = ctx.measureText(testLine)
      const testWidth = metrics.width

      if (testWidth > maxWidth && n > 0) {
        ctx.fillText(line, x, y)
        line = words[n]
        y += lineHeight
      } else {
        line = testLine
      }
    }
    ctx.fillText(line, x, y)
  },

  // 真正的保存逻辑
  saveImageToAlbum(filePath) {
    wx.saveImageToPhotosAlbum({
      filePath: filePath,
      success: () => {
        wx.hideLoading()
        this.showToast('报告已保存到相册', 'success')
      },
      fail: (err) => {
        wx.hideLoading()
        console.error('保存图片失败:', err)
        // 检查是否是权限问题
        if (err.errMsg.indexOf('auth deny') > -1 || err.errMsg.indexOf('authorize:fail') > -1) {
          wx.showModal({
            title: '权限提示',
            content: '需要您的授权才能保存报告到相册，是否去设置打开权限？',
            confirmText: '去设置',
            success: (res) => {
              if (res.confirm) {
                wx.openSetting({
                  success: (settingRes) => {
                    if (settingRes.authSetting['scope.writePhotosAlbum']) {
                      this.showToast('授权成功，正在保存...', 'none')
                      this.saveImageToAlbum(filePath)
                    } else {
                      this.showToast('您已拒绝授权', 'none')
                    }
                  }
                })
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