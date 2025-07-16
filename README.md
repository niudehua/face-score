# Face Score

这是一个基于 [Cloudflare Pages](https://pages.cloudflare.com/) 的人脸评分 API 项目，使用了 Face++（旷视）接口。

## 功能简介
- 提供 API 接口，根据上传的人脸图片返回 Face++ 的颜值分数。
- 支持本地开发和 Cloudflare Pages 部署。

## 环境变量配置

本项目依赖 Face++ 的 API Key 和 Secret。你需要在本地开发和部署时配置以下环境变量：

- `FACEPP_KEY`：你的 Face++ API Key
- `FACEPP_SECRET`：你的 Face++ API Secret

### 如何申请 Face++ API Key 和 Secret

1. 访问 [Face++ 官网](https://www.faceplusplus.com/) 并注册账号。
2. 登录后，进入 [控制台](https://console.faceplusplus.com/)。
3. 在左侧菜单选择“API Key 管理”或“控制台首页”，点击“创建新的 API Key”。
4. 填写应用名称、用途等信息，提交后即可获得 `API Key` 和 `API Secret`。
5. 复制这两个值，分别配置到本地 `.dev.vars` 文件或 Cloudflare Pages 环境变量中。

### 本地开发环境配置

在项目根目录下新建 `.dev.vars` 文件，内容如下：

```
FACEPP_KEY=你的key
FACEPP_SECRET=你的secret
```

Cloudflare Pages 本地开发（如使用 `wrangler pages dev`）会自动加载 `.dev.vars` 文件并注入到 `context.env`，无需修改代码。

### 生产环境配置

在 Cloudflare Pages 的项目设置中，添加环境变量：
- `FACEPP_KEY`
- `FACEPP_SECRET`

## 本地开发

1. 安装 [Wrangler CLI](https://developers.cloudflare.com/pages/framework-guides/deploy-a-full-stack-app/#set-up-your-local-environment)：
   ```bash
   npm install -g wrangler
   ```
2. 启动本地开发服务器：
   ```bash
   wrangler pages dev
   ```
3. 访问本地地址进行测试。

## API 使用说明

- **POST** `/api/score`
- 请求体（JSON）：
  ```json
  {
    "image": "base64字符串",
    "debug": true
  }
  ```
- 返回：
  ```json
  {
    "score": 80.5,
    "logs": ["...debug日志..."]
  }
  ```

## 相关链接
- [Cloudflare Pages 文档](https://developers.cloudflare.com/pages/)
- [Face++ 官方文档](https://console.faceplusplus.com.cn/documents/5679127)
