# 萌牛测颜 🐱

一个基于 Cloudflare Pages 和微信小程序的趣味人脸分析项目。用户可以上传照片体验颜值评分、气质解读和双人 CP 匹配；网页端还提供照片管理入口。

> 分析结果由第三方人脸识别与生成式 AI 服务产生，仅供娱乐，不代表客观审美、性格判断或专业建议。请只上传本人或已获授权的照片。

## 功能

- **颜值评分**：Face++ 提供人脸属性和颜值分，Workers AI 生成趣味点评。
- **气质解读**：根据检测到的人脸属性生成娱乐性报告；接口为 `/api/fortune`。
- **CP 匹配**：分别分析两张照片并生成匹配结果；接口为 `/api/couple`。
- **照片与记录管理**：配置 D1 和 R2 后，可浏览、删除照片记录，并按保留策略清理旧数据。
- **安全检查**：上传前可通过安全检查接口检查图片内容。
- **网页端与微信小程序**：网页静态文件位于 `public/`，小程序代码位于 `face-score-miniprogram/`。
- **管理登录**：支持 GitHub OAuth 登录，并通过允许用户配置限制可登录账号。

## 技术栈

| 部分 | 技术 |
| --- | --- |
| 网页前端 | HTML、CSS、JavaScript（`public/`） |
| 小程序 | 微信小程序原生框架（`face-score-miniprogram/`） |
| API | Cloudflare Pages Functions（`functions/api/`） |
| 人脸属性 | Face++ Detect API |
| 文本生成 | Cloudflare Workers AI（默认模型 `@cf/meta/llama-3-8b-instruct`） |
| 持久化 | Cloudflare D1、R2、KV（按需绑定） |
| 人机验证 | Cloudflare Turnstile（网页端按配置启用） |

## 目录结构

```text
.
├── functions/
│   ├── api/                 # Pages Functions API 路由
│   └── lib/                 # 数据库、存储、验证、限流、提示词等共享模块
├── face-score-miniprogram/  # 微信小程序
├── public/                  # 网页端和静态资源
├── wrangler.toml            # Cloudflare 配置（本地文件可能被 Git 忽略）
└── package.json
```

主要 API：

| 路径 | 方法 | 用途 |
| --- | --- | --- |
| `/api/score` | POST | 人脸颜值评分 |
| `/api/fortune` | POST | 气质解读报告 |
| `/api/couple` | POST | 双人匹配分析 |
| `/api/security` | POST | 图片安全检查 |
| `/api/turnstile` | GET | 获取 Turnstile 站点配置 |
| `/api/images` | GET、DELETE | 管理照片记录 |
| `/api/image` | GET | 读取 R2 中的图片 |
| `/api/auth/github` | GET | 发起 GitHub OAuth 登录 |
| `/api/auth/github/callback` | GET | OAuth 回调 |
| `/api/auth` | GET、DELETE | 检查会话、退出登录 |
| `/api/cleanup` | GET | 清理过期记录和图片 |
| `/api/verify` | GET | 校验/查看存储配置状态 |

## 本地开发

### 环境要求

- Node.js（建议使用当前受支持的 LTS 版本）
- npm
- Cloudflare Wrangler CLI（可通过 `npx wrangler` 临时运行）
- 微信开发者工具（开发小程序时需要）

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 Cloudflare 本地变量

在仓库根目录创建 `.dev.vars`（该文件已被 Git 忽略），填写服务端密钥，例如：

```dotenv
FACEPP_KEY=你的Face++API_Key
FACEPP_SECRET=你的Face++API_Secret

# 网页端 Turnstile（可选）
TURNSTILE_SECRET_KEY=你的Turnstile密钥
TURNSTILE_SITE_KEY=你的Turnstile站点Key

# 如需 GitHub OAuth 管理登录
OAUTH_GITHUB_CLIENT_ID=你的GitHub_OAuth_Client_ID
OAUTH_GITHUB_CLIENT_SECRET=你的GitHub_OAuth_Client_Secret
ALLOWED_GITHUB_USERS=你的GitHub用户名
```

不要把 `.dev.vars`、API 密钥、OAuth 密钥或小程序上传私钥提交到版本库。AI、D1、R2、KV 等绑定应在 Wrangler/Cloudflare 项目配置中设置，具体字段以当前 Cloudflare Pages 配置为准。

### 3. 启动 Pages 本地开发服务器

```bash
npx wrangler pages dev public
```

默认情况下可在 `http://localhost:8788` 打开网页。若仓库所用 Wrangler 版本的命令参数或项目配置不同，请以 `npx wrangler pages dev --help` 和 Cloudflare Pages 配置为准。后端至少需要 Face++ 密钥；AI 绑定缺失时部分接口会使用默认文案或报告。

### 4. 配置并运行小程序

用微信开发者工具导入 `face-score-miniprogram/` 目录。根据开发环境配置 API 地址和小程序 AppID：

- API 地址通过构建环境变量 `API_BASE_URL` 提供，或在本地创建被忽略的 `face-score-miniprogram/config/config.local.js` 覆盖。
- AppID 可由 `APPID` 提供；开发者工具项目也需配置正确的 AppID。
- 本地配置示例：

```javascript
module.exports = {
  apiUrl: 'http://127.0.0.1:8788',
  appid: '你的小程序AppID'
};
```

小程序上传流程还会调用 `/api/security`。部署前请确认 API 地址已加入微信小程序的合法域名；真机环境通常需要 HTTPS。

## Cloudflare 部署配置

后端读取以下环境变量或绑定名称。生产环境请在 Cloudflare Pages 项目的 Settings 中设置变量、密钥及绑定，不要只依赖本地 `.dev.vars`。

| 名称 | 类型 | 用途 |
| --- | --- | --- |
| `FACEPP_KEY`、`FACEPP_SECRET` | Secret | Face++ API 凭证，评分、气质和 CP 分析必需 |
| `AI` | Workers AI binding | 生成点评和报告 |
| `AI_MODEL_ID` | Variable | 可选，覆盖默认 Workers AI 模型 |
| `FACEPP_API_URL` | Variable | 可选，覆盖 Face++ Detect API 地址 |
| `FACE_SCORE_DB` | D1 binding | 可选，分析记录及照片管理数据 |
| `FACE_IMAGES` | R2 binding | 可选，上传图片存储 |
| `RATE_LIMIT_KV` | KV binding | 可选，跨实例限流计数；未绑定时使用进程内存计数 |
| `SESSION_KV` | KV binding | GitHub OAuth 会话存储 |
| `TURNSTILE_SITE_KEY` | Variable | 网页端 Turnstile 站点密钥 |
| `TURNSTILE_SECRET_KEY` | Secret | 网页请求的 Turnstile 校验密钥 |
| `OAUTH_GITHUB_CLIENT_ID` | Variable | GitHub OAuth 应用 ID |
| `OAUTH_GITHUB_CLIENT_SECRET` | Secret | GitHub OAuth 应用密钥 |
| `ALLOWED_GITHUB_USERS` | Variable | 允许登录的 GitHub 用户名单 |
| `WECHAT_APPID` | Variable | 微信小程序安全检查配置 |
| `WECHAT_PRIVATE_KEY` | Secret | 微信小程序安全检查所需私钥 |
| `BYPASS_AUTH` | Variable | 仅限受控预览/调试环境的登录绕过开关 |

`PROMPT_SCORE`、`PROMPT_TEMPERAMENT`、`PROMPT_COUPLE` 可用于覆盖默认提示词。D1、R2 未绑定时，分析接口仍可返回分析结果，但照片/记录持久化与管理功能不可用。数据库表会由代码在首次写入时创建。

## 小程序 CI 上传

仓库包含 [小程序 CI 部署指南](face-score-miniprogram/CI-DEPLOY-GUIDE.md)。其中提到的 GitHub Actions 工作流和 Secret 名称应与实际仓库配置核对；不要将小程序上传私钥写进代码或提交到仓库。

## 图片与数据说明

分析流程会把用户提交的图片发送给 Face++；若绑定 R2，图片会保存到 `FACE_IMAGES`，若同时绑定 D1，分析元数据会保存到 `FACE_SCORE_DB`。照片管理接口需要会话验证。清理接口会按代码中配置的保留期限处理旧记录。部署者应确认第三方服务的数据处理条款，并向用户清楚说明图片用途、保存期限和删除方式。

## 已知配置注意事项

- README 中记录的默认模型和 API 行为以代码当前默认值为准，Cloudflare 服务端配置可能覆盖这些值。
- `wrangler.toml` 在此仓库的 `.gitignore` 中被忽略；请确认本地/CI 部署环境已准备好有效的 Wrangler 配置及必要绑定。
- 安全检查、限流和 Turnstile 的生效情况取决于相应密钥和绑定。小程序请求有单独的 Turnstile 分支，生产防刷策略应结合部署环境实际验证。
- 仓库中的 `SECURITY.md` 目前仍含通用模板内容，漏洞报告渠道和受支持版本尚需维护者补充。

## 许可证

本项目采用 [MIT License](LICENSE)。
