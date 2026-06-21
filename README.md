# 颜究所 🐱

**科学颜值打分 vs 玄学 AI 看相，一切尽在该小程序！**

本项目基于 [Cloudflare Pages](https://pages.cloudflare.com/) 构建，巧妙融合了 **Face++（旷视）** 的精准视觉能力与 **Cloudflare AI (Llama-3)** 的强大语言理解能力。这不仅仅是一个简单的打分工具，更是一个集娱乐、社交、玄学于一体的 AI 互动实验场。

---

## ✨ 核心玩法

### 1. 🌸 颜值评分 (Scientific Mode)

**"科学、客观、猫言猫语"**
上传照片，AI 猫猫会根据面部黄金比例打出 0-100 的颜值分，并附带一句 "猫里猫气" 的超萌点评。

- **技术点**: Face++ Beauty Score + Llama-3 "Cat Persona" Prompt

### 2. 🔮 AI 看相 (Mystical Mode) [NEW!]

**"大师亲批，天机泄露"**
切换到玄学模式，AI 化身 "麻衣神相" 传人。它不看颜值高低，只看面相吉凶！

- **气色分析**: 结合皮肤状态健康度。
- **眼神定力**: 分析眼睛闭合度与注视方向。
- **人缘桃花**: 微表情笑容分析。
- **技术点**: Face++ Attributes -> Feature Mapping -> Llama-3 "Fortune Teller" Prompt

---

## 🚀 未来计划 (Roadmap)

我们正在酝酿更多新奇功能：

- [ ] **CP 契合度测试**: 两人同框，测测你们是 "天生一对" 还是 "欢喜冤家"。
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
│   │   ├── score.js       # 颜值评分接口
│   │   └── fortune.js     # [NEW] AI看相接口
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
