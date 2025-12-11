# 微信小程序CI部署指南

## 1. 环境变量配置

### 1.1 本地开发环境

在微信开发工具中，你必须通过以下方式配置环境变量：

1. 开启环境变量功能：
   - 点击「详情」→「本地设置」
   - 勾选「启用自定义处理命令」和「启用环境变量」

2. 创建 `.env` 文件：
   ```
   # 开发环境
   NODE_ENV=development
   APPID=你的开发环境appid
   API_URL=你的开发环境API地址
   ```

### 1.2 GitHub Secrets配置

**所有敏感信息必须配置在GitHub Secrets中，没有硬编码默认值！**

在GitHub仓库的「Settings」→「Secrets and variables」→「Actions」中配置以下Secrets：

| 名称 | 类型 | 描述 | 必填 |
|------|------|------|------|
| WECHAT_APPID | Secret | 微信小程序appid | 是 |
| WECHAT_PRIVATE_KEY | Secret | Base64编码的私钥内容 | 是 |
| API_URL | Secret | 后端API地址 | 是 |

## 2. 如何获取配置值

### 2.1 获取WECHAT_APPID

1. 登录微信公众平台
2. 进入「开发」→「开发管理」
3. 复制「AppID」

### 2.2 获取WECHAT_PRIVATE_KEY

1. 登录微信公众平台
2. 进入「开发」→「开发管理」→「开发设置」
3. 找到「小程序代码上传」
4. 点击「生成」或「下载」私钥文件（.p12格式）
5. 将私钥文件转换为Base64编码：
   - 在命令行中执行：
     ```bash
     # Linux/Mac
     base64 private.p12 > private.base64
     
     # Windows
     certutil -encode private.p12 private.base64
     ```
   - 复制文件内容作为WECHAT_PRIVATE_KEY值

## 3. GitHub Actions部署

### 3.1 触发条件

- 代码提交到 `main` 分支
- 修改了 `face-score-miniprogram/` 目录下的文件

### 3.2 部署流程

1. 检出代码
2. 设置Node.js环境
3. 安装miniprogram-ci
4. 配置私钥
5. 上传小程序代码
6. 清理临时文件

### 3.3 查看部署日志

- 进入GitHub仓库的「Actions」页面
- 点击对应的「部署微信小程序」工作流
- 查看详细日志

## 4. 本地调试

### 4.1 开发工具中运行

1. 打开微信开发者工具
2. 导入小程序项目
3. 选择「face-score-miniprogram」目录
4. 使用配置的appid登录
5. 运行小程序

### 4.2 环境切换

在开发工具中，你可以通过修改 `.env` 文件切换环境：

```bash
# 开发环境
NODE_ENV=development

# 生产环境
NODE_ENV=production
```

## 5. 常见问题

### 5.1 部署失败

- 检查私钥是否正确
- 检查appid是否匹配
- 查看GitHub Actions日志
- 检查IP白名单设置

### 5.2 环境变量不生效

- 确保开启了环境变量功能
- 重新构建项目
- 检查配置文件路径

### 5.3 私钥错误

- 确保私钥是Base64编码
- 确保私钥没有过期
- 确保私钥与appid匹配

## 6. 版本管理

- 版本号由GitHub SHA自动生成
- 版本描述为提交信息
- 支持手动触发部署

## 7. 安全注意事项

- 私钥必须通过GitHub Secrets管理
- 禁止硬编码敏感信息
- 定期轮换私钥
- 限制IP白名单

## 8. 联系方式

如有问题，请联系项目管理员。
