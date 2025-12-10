# Face Score

基于 [Cloudflare Pages](https://pages.cloudflare.com/) 的人脸颜值评分 API 项目，集成 [Face++（旷视）](https://www.faceplusplus.com/) 人脸检测与美学评分能力，并使用 Cloudflare AI 服务生成趣味颜值点评。

## 🎯 项目概述

本项目提供一个简单易用的 HTTP API，用户上传人脸图片（Base64），即可获得 Face++ 返回的颜值分数，以及 AI 生成的趣味性颜值点评。适用于娱乐、社交、照片筛选等场景。

## 🔍 在线体验

- **示例网站**: [颜值打分机](https://face-score.niudehua.cn/)
- **功能**: 上传照片，AI 猫猫帮你评分并生成趣味点评

## 📱 应用场景
- 个人娱乐或社交平台的颜值打分功能
- 照片筛选、相册美化推荐
- AI 互动小程序、表情包生成等
- 社交分享、互动娱乐应用

## 🛠️ 技术栈
- Cloudflare Pages Functions（Serverless）
- Node.js (ESM)
- Face++ 人脸检测 API
- Cloudflare AI (@cf/meta/llama-3-8b-instruct)

## 📁 目录结构

```
face-score/
├── functions/
│   └── api/
│       └── score.js      # 主要 API 逻辑
├── public/
│   └── index.html        # 静态页面（如有）
├── .dev.vars             # 本地开发环境变量
├── .gitignore            # Git 忽略文件
├── README.md             # 项目说明
└── ...
```

## 🔑 环境变量配置

本项目依赖以下环境变量：

- `FACEPP_KEY`：Face++ API Key
- `FACEPP_SECRET`：Face++ API Secret
- `AI`：Cloudflare AI 绑定（自动提供，无需手动设置）

### 如何申请 Face++ API Key 和 Secret

1. 访问 [Face++ 官网](https://www.faceplusplus.com/) 并注册账号。
2. 登录后，进入 [控制台](https://console.faceplusplus.com/)。
3. 在左侧菜单选择"API Key 管理"或"控制台首页"，点击"创建新的 API Key"。
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

## 💻 本地开发与调试

1. 安装 [Wrangler CLI](https://developers.cloudflare.com/pages/framework-guides/deploy-a-full-stack-app/#set-up-your-local-environment)：
   ```bash
   npm install -g wrangler
   ```
2. 启动本地开发服务器：
   ```bash
   wrangler pages dev
   ```
3. 访问本地地址（如 http://localhost:8788）进行测试。

## 🚀 部署到 Cloudflare Pages

1. 推送代码到 GitHub/GitLab 等代码仓库。
2. 在 Cloudflare Pages 新建项目，选择对应仓库。
3. 在"设置"->"环境变量"中添加 `FACEPP_KEY` 和 `FACEPP_SECRET`。
4. 部署即可自动生效。

## 📚 API 文档

### 请求
- **POST** `/api/score`
- Content-Type: `application/json`

#### 请求体参数
| 字段    | 类型   | 必填 | 说明                 |
| ------- | ------ | ---- | -------------------- |
| image   | string | 是   | 图片的 Base64 字符串 |
| debug   | bool   | 否   | 是否返回调试日志     |

**示例：**
```json
{
  "image": "base64字符串",
  "debug": true
}
```

### 返回
| 字段    | 类型   | 说明                 |
| ------- | ------ | -------------------- |
| score   | number | 颜值分数（0-100）    |
| comment | string | AI 生成的颜值点评    |
| logs    | array  | 调试日志（debug=true）|
| error   | string | 错误信息（如有）     |
| detail  | string | 错误详情（如有）     |

**成功示例：**
```json
{
  "score": 80.5,
  "comment": "这位小哥哥颜值简直爆表！五官立体得像被精雕细琢过，笑容自带治愈属性，眼睛里好像藏着星星，绝对是人群中的焦点~",
  "logs": ["...debug日志..."]
}
```

**错误示例：**
```json
{
  "error": "没有检测到人脸喵～",
  "logs": ["...debug日志..."]
}
```

## 📊 核心功能说明

1. **人脸检测**：调用 Face++ API 检测图片中的人脸
2. **颜值评分**：根据性别返回相应的颜值分数
3. **面部分析**：提取年龄、性别、表情、皮肤状态等多种面部特征
4. **AI 趣味点评**：使用 Llama 3 模型生成俏皮、接地气的颜值评价

## ❓ 常见问题 FAQ

- **Q: 为什么接口返回"没有检测到人脸"？**
  - A: 请确保上传的图片为清晰的人脸正面照，且为有效的 Base64 编码。
- **Q: 本地调试时提示密钥未设置？**
  - A: 请检查 `.dev.vars` 文件内容及路径，重启本地服务。
- **Q: 如何切换 Face++ 区域或 API 地址？**
  - A: 如需自定义 API 地址，可在代码中将 URL 抽为环境变量。
- **Q: AI 点评的风格可以自定义吗？**
  - A: 可以，修改 `score.js` 文件中的 prompt 提示词即可调整生成风格。

## 🤝 贡献指南

欢迎提交 Issue 或 PR 参与改进！

1. Fork 本仓库并新建分支
2. 提交修改并发起 Pull Request
3. 代码合并后自动部署

## 🔗 相关链接
- [示例网站](https://face-score.niudehua.cn/)
- [Cloudflare Pages 文档](https://developers.cloudflare.com/pages/)
- [Face++ 官方文档](https://console.faceplusplus.com.cn/documents/5679127)
- [Cloudflare AI 文档](https://developers.cloudflare.com/workers-ai/)

## 📝 许可证

[MIT](LICENSE)
