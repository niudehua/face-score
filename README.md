# 颜究所 🐱

**颜值评分 + 气质解读，探索你的独特魅力！**

本项目基于 [Cloudflare Pages](https://pages.cloudflare.com/) 构建，巧妙融合了 **Face++（旷视）** 的精准视觉能力与 **Cloudflare AI (Llama-3)** 的强大语言理解能力。这不仅仅是一个简单的打分工具，更是一个集颜值分析、气质洞察于一体的 AI 互动实验场。

---

## ✨ 核心玩法

### 1. 🌸 颜值评分 (Scientific Mode)

**"科学、客观、猫言猫语"**
上传照片，AI 猫猫会根据面部黄金比例打出 0-100 的颜值分，并附带一句 "猫里猫气" 的超萌点评。

- **技术点**: Face++ Beauty Score + Llama-3 "Cat Persona" Prompt

### 2. ✨ 气质解读 (Temperament Mode)

**"洞察内在，解读你的独特气质"**
上传照片，AI 深度分析你的面部特征，解读你的气质类型和性格特质。

- **气质类型**: 高冷御姐、邻家女孩、阳光少年、文艺青年等。
- **性格特质**: 通过面部特征推断性格倾向。
- **魅力标签**: 为你打上独特的魅力关键词。
- **技术点**: Face++ Attributes -> Feature Mapping -> Llama-3 "Temperament Analyst" Prompt

---

## 🚀 即将上线 (Coming Soon)

### 💑 CP 契合度测试
**"天生一对" 还是 "欢喜冤家"？**
上传两人合照，AI 将从面部特征、气质匹配度等多个维度分析你们的契合指数，看看是否命中注定！

## 📋 未来计划 (Roadmap)

我们正在酝酿更多新奇功能：

- [ ] **前世今生 (Celebrity Twin)**: 测测你撞脸哪位历史人物或当红明星？
- [ ] **AI 造型师**: 根据脸型推荐最适合的眼镜、发型。
- [ ] **表情包大作战**: 跟随指令做表情，看谁模仿最像！

---

## 🛠️ 技术栈

- **Frontend**: 微信小程序 (WXML, WXSS, JS)
- **Backend**: Cloudflare Pages Functions (Serverless)
- **AI Engine**: Cloudflare Workers AI (@cf/meta/llama-3-8b-instruct)
- **Vision API**: Face++ Detect API
- **Database**: Cloudflare D1 (SQLite) - 存储评分记录
- **Storage**: Cloudflare R2 - 存储用户上传的图片

## 📁 目录结构

```text
face-score/
├── face-score-miniprogram/ # 微信小程序前端代码
│   ├── pages/             # 页面文件
│   └── config/            # 配置文件
├── functions/              # Cloudflare Workers 后端代码
│   ├── api/
│   │   ├── score.js           # 颜值评分接口
│   │   └── temperament.js     # 气质解读接口
│   └── lib/               # 共享工具库
├── public/                 # 静态资源
└── README.md               # 项目说明
```

## ⚡️ 快速开始

### 1. 环境变量配置

本项目依赖 Face++ 和 Cloudflare AI。请在本地新建 `.dev.vars` 文件：

```ini
FACEPP_KEY=你的Face++Key
FACEPP_SECRET=你的Face++Secret
# 如果已配置 D1/R2/Turnstile，也需再此添加
```

### 2. 小程序配置

- 修改 `face-score-miniprogram/project.config.json` 中的 `appid` 为你自己的。

- 如果本地开发，请在 `face-score-miniprogram/config/` 下创建 `config.local.js` (已忽略提交) 配置本地 API 地址。

```javascript
// face-score-miniprogram/config/config.local.js
module.exports = {
  apiUrl: 'http://127.0.0.1:8787'
};
```

### 3. 启动后端

```bash
npm install
npx wrangler pages dev
```

### 4. 启动前端

使用 **微信开发者工具** 导入 `face-score-miniprogram` 目录即可。

---

## 📝 许可证

[MIT](LICENSE)
