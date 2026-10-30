# 萌牛测颜 🐱

一个基于 Cloudflare Pages 和微信小程序的趣味人脸分析项目。用户可以上传照片体验颜值评分、气质解读和双人 CP 匹配；网页端还提供照片管理入口。

> 分析结果由第三方人脸识别与生成式 AI 服务产生，仅供娱乐，不代表客观审美、性格判断或专业建议。请只上传本人或已获授权的照片。

## 功能

- **颜值评分**：Face++ 提供人脸属性和颜值分，Workers AI 生成趣味点评。
- **气质解读**：根据检测到的人脸属性生成娱乐性报告；接口为 `/api/fortune`。
- **CP 匹配**：分别分析两张照片并生成匹配结果；接口为 `/api/couple`。
- **分析档案**：配置 D1 和 R2 后，可按颜值评分、气质解读或 CP 匹配查看分析历史；同一张照片可以关联多条分析记录。
- **照片管理**：删除单条分析记录时会检查共享引用；仍被其他分析使用的照片会继续保留在 R2。
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
| 持久化 | Cloudflare D1（分析记录）、R2（图片）、KV（会话与限流，按需绑定） |
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
| `/api/miniprogram-session` | POST | 微信登录码换取短期凭证 |
| `/api/security` | POST | 小程序图片预检查，需短期凭证 |
| `/api/turnstile` | GET | 获取 Turnstile 站点配置 |
| `/api/images` | GET、DELETE | 管理照片记录 |
| `/api/image` | GET | 通过管理员会话或短期签名链接读取图片 |
| `/api/auth/github` | GET | 发起 GitHub OAuth 登录 |
| `/api/auth/github/callback` | GET | OAuth 回调 |
| `/api/auth` | GET、DELETE | 检查会话、退出登录 |
| `/api/cleanup` | POST | 清理过期记录和图片，需管理员会话或维护令牌 |
| `/api/verify` | GET | 查看数据保留及清理统计，需管理员会话或维护令牌 |

## 本地开发

### 环境要求

- Node.js 22 或 24（本地回归测试也兼容当前仓库使用的 Node.js 20）
- Python 3（仅 SQLite 回归测试使用；应用运行不依赖 Python）
- npm
- Cloudflare Wrangler CLI（可通过 `npx wrangler` 临时运行）
- 微信开发者工具（开发小程序时需要）

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 Cloudflare 本地变量

复制 `.dev.vars.example` 为 `.dev.vars`（后者已被 Git 忽略），填写服务端密钥，例如：

```dotenv
FACEPP_KEY=你的Face++API_Key
FACEPP_SECRET=你的Face++API_Secret

# 网页端 Turnstile（生产网页请求必需）
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

默认情况下可在 `http://localhost:8788` 打开网页。仅本地开发且未配置 Turnstile 时，可在 `.dev.vars` 显式设置 `ALLOW_INSECURE_LOCAL_DEV=true`；该开关只在 localhost、127.0.0.1 或 IPv6 回环地址生效，不影响管理员鉴权。若仓库所用 Wrangler 版本的命令参数或项目配置不同，请以 `npx wrangler pages dev --help` 和 Cloudflare Pages 配置为准。后端至少需要 Face++ 密钥；AI 绑定缺失时部分接口会使用默认文案或报告。

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
| `TURNSTILE_SITE_KEY` | Variable | 生产网页必需，Turnstile 站点 Key |
| `TURNSTILE_SECRET_KEY` | Secret | 生产网页必需，Turnstile 服务端校验密钥 |
| `OAUTH_GITHUB_CLIENT_ID` | Variable | GitHub OAuth 应用 ID |
| `OAUTH_GITHUB_CLIENT_SECRET` | Secret | GitHub OAuth 应用密钥 |
| `ALLOWED_GITHUB_USERS` | Variable | 允许登录的 GitHub 用户名单 |
| `WECHAT_APPID` | Variable | 微信小程序安全检查配置 |
| `WECHAT_APPSECRET` | Secret | 微信 AppSecret，用于登录码交换与内容安全，不是 CI 上传私钥 |
| `APP_SIGNING_SECRET` | Secret | 独立随机值，至少 32 字符；小程序凭证及短期图片链接签名 |
| `MAINTENANCE_TOKEN` | Secret | 独立随机值，至少 32 字符；定时维护接口认证 |
| `ALLOW_INSECURE_LOCAL_DEV` | Variable | 仅回环地址本地开发可跳过未配置的 Turnstile，默认关闭 |
| `REQUIRE_IMAGE_SECURITY` | Variable | 设为 `true` 强制网页内容安全检查；小程序始终强制检查 |

`PROMPT_SCORE`、`PROMPT_TEMPERAMENT`、`PROMPT_COUPLE` 可用于覆盖默认提示词。D1、R2 未绑定时，分析接口仍可返回分析结果，但照片/记录持久化与管理功能不可用。当前使用 `score_analyses`、`fortune_analyses`、`couple_matches` 三张表，按需自动创建。旧 `face_scores`、`face_analyses` 数据没有自动迁移或兼容展示；升级前先备份，再根据实际旧表结构单独迁移，旧图片不要直接清理。

## 小程序 CI 上传

仓库包含 [小程序 CI 部署指南](face-score-miniprogram/CI-DEPLOY-GUIDE.md)。其中提到的 GitHub Actions 工作流和 Secret 名称应与实际仓库配置核对；不要将小程序上传私钥写进代码或提交到仓库。

## 图片与数据说明

分析流程会把用户提交的图片发送给 Face++；若绑定 R2，图片会保存到 `FACE_IMAGES`，若同时绑定 D1，分析元数据会保存到 `FACE_SCORE_DB`。照片管理接口需要会话验证。清理接口按 6 个月保留期限处理旧记录；上传及删除失败的图片候选存入持久化删除队列，任务重试前会再次检查是否仍有分析引用。仅绑定 R2 而无 D1 的图片没有记录或清理队列，建议同时绑定。部署者应确认第三方服务的数据处理条款，并向用户清楚说明图片用途、保存期限和删除方式。

## 访问权限及升级注意事项

- 管理员必须通过 GitHub OAuth 登录，并列入 `ALLOWED_GITHUB_USERS`；每次访问会重新检查允许列表。`BYPASS_AUTH` 已不再生效。OAuth 使用短期 state Cookie、KV 状态和 PKCE 校验。
- 档案是管理员可查看的全站档案，不是普通用户个人空间。
- 图片读取需要管理员 Cookie 或与图片标识绑定的 15 分钟签名链接；新响应设置 `private, no-store`。数据库保存不带签名的稳定地址，管理员预览不受链接到期影响。未配置签名密钥时，返回的稳定图片地址仅管理员能打开；网页和小程序选图预览仍使用本地照片。
- 签名链接是短期访问凭证，持有者在到期前可读取指定图片，请勿公开分享。旧版本曾将图片响应缓存一年，新代码无法撤回浏览器已保存的副本；已有 CDN/外部缓存需由部署者另行核查清理。
- 小程序不再仅凭 `app_type` 或请求头跳过验证，必须先通过微信登录码换取服务端签名凭证。网页和小程序后端应同步升级。
- 小程序始终进行服务端内容检查；网页在配置微信 AppID/AppSecret 或 `REQUIRE_IMAGE_SECURITY=true` 时也会检查。仅未配置微信安全服务且未强制启用的网页允许只做人机验证。
- `WECHAT_PRIVATE_KEY` 暂时兼容为 AppSecret 的旧变量名；请迁移到 `WECHAT_APPSECRET`。真正的小程序上传私钥只放在 GitHub Actions 的 `WECHAT_UPLOAD_KEY`。
- `RATE_LIMIT_KV` 计数为读后写，并非原子全局限额；无 KV 时仅按实例内存限流。存储故障时返回 503。需要严格跨实例额度控制时，应额外配置 Cloudflare 平台限流规则或原子计数服务。
- 图片引用检查与 R2 删除仍跨多个服务，没有全局事务；高并发上传和删除同一照片时需要进一步加锁。旧表迁移应在恢复定时清理前完成。
- 以前的 OAuth/上传工作流可能把凭证写入日志。此次已删除输出，但历史日志和真实密钥没有自动清理或轮换，应由维护者核查。

## 配置与定时维护

`wrangler.toml` 是已跟踪的 Pages 基础配置，不包含真实密钥。完整绑定结构见 `wrangler.example.toml`；使用 Wrangler 管理绑定时，复制示例并填入真实资源 ID/名称。生产环境的配置应在部署前核对，GitHub Actions 的环境变量不会自动成为 Pages 运行时 Secret。

为避免覆盖控制台绑定，部署工作流会在临时目录只暂存 `public/` 与 `functions/` 后上传，运行时绑定由现有 Pages 控制台管理。若改用配置文件管理，应准备好完整绑定后修改工作流，不要混用两种管理方式。

定时维护工作流每天北京时间 18:00 运行。Cloudflare 和 GitHub Actions 都必须配置同一个 `MAINTENANCE_TOKEN`，GitHub 还需 `API_BASE_URL`。维护请求为：

```bash
curl --fail-with-body -X POST \
  -H "Authorization: Bearer $MAINTENANCE_TOKEN" \
  "$API_BASE_URL/api/cleanup"

curl --fail-with-body \
  -H "Authorization: Bearer $MAINTENANCE_TOKEN" \
  "$API_BASE_URL/api/verify?action=retention"
```

`GET /api/cleanup` 返回 405，不执行删除。维护令牌不要放在 URL 参数中。

## 本地验证

```bash
npm test
```

测试使用 Node 内置测试器、Web Crypto 和 Python 标准库 SQLite；不请求真实第三方接口，不安装额外测试依赖。覆盖人脸属性兼容、鉴权、签名链接、OAuth state/PKCE、微信登录及安全检查、小程序令牌续期、限流和共享照片删除重试。云端 Face++/Workers AI 返回、微信权限与额度、Cloudflare 资源绑定、HTTPS OAuth 回调和真机效果仍需实际环境联调。

协议参考：[Face++ 返回属性示例](https://www.faceplusplus.com/demo/v2.html?language=en&module=FaceAttributes)、[GitHub OAuth](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)、[D1 批量事务](https://developers.cloudflare.com/d1/worker-api/d1-database/)。Face++ 请求参数 `smiling` 对应响应 `smile`；代码兼容这两个字段，不能仅凭命名不同认定真实服务必然报错。

## 许可证

本项目采用 [MIT License](LICENSE)。
