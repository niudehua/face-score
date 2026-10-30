# 私人 ChatGPT MCP 接入指南

这是仅供指定 GitHub 本人账号使用的远程 MCP 服务。它复用 Face++，只返回检测数据和解释边界；ChatGPT 在当前会话中生成中文文案，不额外调用 OpenAI API，也不消耗 Workers AI 文案额度。Face++、Cloudflare Functions、D1/KV 仍有各自的额度或费用。

## 功能与数据流

| 工具 | 输入 | 返回 |
| --- | --- | --- |
| `analyze_face` | 一张仅含一张人脸的照片 | 第三方娱乐颜值分、微笑、表情和拍摄状态 |
| `analyze_temperament` | 一张仅含一张人脸的照片 | 表情与拍摄状态，供描述照片印象，不推断性格、健康或运势 |
| `analyze_couple` | 两张各仅含一张人脸的照片 | 两人的检测数据，供比较合照氛围，不测量真实恋爱关系或相容性 |

ChatGPT 通过 `_meta["openai/fileParams"]` 将用户选择的文件传入 `photos` 数组。每个文件对象为 `{ download_url, file_id, mime_type?, file_name? }`。只接受 HTTPS 临时下载地址和 JPEG/PNG，每张最多 2 MiB。不接受本地路径，不让模型臆造 Base64 或文件链接。

后端从允许的文件 CDN 下载图片；已配置微信内容检查时，会先向微信检查实际图片，再向 Face++ 检测；返回有限属性给 ChatGPT。MCP 不调用网页分析接口，避免重复登录验证、保存照片或调用 Workers AI。

本项目不会将 MCP 照片或结果写入 R2、D1 分析档案或日志。D1 只新增 OAuth 状态、授权码摘要和令牌摘要；ChatGPT 和第三方图片处理服务的数据处理遵循其各自规则。调用前应明确授权将本人或已获授权的照片交给这些服务。不会返回 Face++ 的 `face_token` 或原始下载链接。

## Cloudflare Production 配置

现有绑定与凭证仍需可用：`FACE_SCORE_DB`（D1）、`SESSION_KV`、Face++ Key/Secret、GitHub OAuth Client ID/Secret、`ALLOWED_GITHUB_USERS`、`APP_SIGNING_SECRET`。不需要为 MCP 再申请微信登录，也不要求 AI/R2 绑定。

在 Production 的 Variables and Secrets 增加：

| 名称 | 类型 | 填写方式 |
| --- | --- | --- |
| `MCP_ENABLED` | 文本 | 首次配置先保持 `false`，配置齐全后改成 `true` 并部署 |
| `MCP_ORIGIN` | 文本 | 精确的生产 HTTPS 根地址，例如 `https://你的域名`；无结尾 `/`，须与现有 GitHub OAuth 回调的站点一致 |
| `MCP_OWNER_GITHUB_USER` | 文本 | 仅一个 GitHub 用户名，例如 `niudehua`；此账号也必须在 `ALLOWED_GITHUB_USERS` 中 |
| `MCP_CLIENT_ID` | 文本 | 例如 `face-score-personal`；这是本服务给 ChatGPT 的 OAuth 客户端标识，不是 GitHub Client ID |
| `MCP_CLIENT_SECRET` | 密钥 | 独立随机密钥，至少 32 字符、无空白；用 `openssl rand -hex 32` 在本机生成并保管，不要放进代码或聊天 |
| `MCP_REDIRECT_URI` | 文本 | 从 ChatGPT 的 MCP 管理界面复制精确 OAuth 回调地址；支持 `https://chatgpt.com/connector_platform_oauth_redirect` 或界面显示的 `https://chatgpt.com/connector/oauth/具体ID` |
| `MCP_FILE_HOSTS` | 文本 | 可选；默认 `files.oaiusercontent.com,files.openai.com`。文件服务实际使用其他主机时，核对为 ChatGPT 签发的文件下载域名后再逐个补充，逗号分隔，无协议/路径，不支持通配符 |

不要复用 `MAINTENANCE_TOKEN`、微信 AppSecret 或 GitHub Client Secret 作为 MCP Client Secret。

现有 GitHub OAuth 回调保持 `/api/auth/github/callback`。MCP 通过现有 GitHub 登录完成身份验证，再返回独立授权页；不更改旧档案登录流程。MCP 固定单人限制独立于管理员名单，即使其他管理员能登录档案，也不能授权 MCP。

本实现选择“预配置 OAuth 客户端”，不开放匿名动态注册（DCR）或 CIMD。ChatGPT 连接时必须填写下述 Client ID/Secret；不能选择无认证，也不能把 Secret 写在 MCP URL 中。

## 部署与连接

1. 检查本次代码和测试，再部署到与 `MCP_ORIGIN` 一致的 Cloudflare Pages 生产站点。当前工作流“部署网页与 API（Cloudflare）”会打包新增 Functions 路由。首次认证时 D1 按需创建 `mcp_oauth_flows`、`mcp_oauth_codes`、`mcp_oauth_tokens`，不迁移或修改分析记录。
2. 先验证 `https://你的域名/.well-known/oauth-authorization-server` 和 `https://你的域名/.well-known/oauth-protected-resource/mcp` 返回 JSON。访问 `/mcp` 未认证时应为 401，带 `WWW-Authenticate`，不应返回照片或工具结果。
3. 在 ChatGPT 网页版打开 [Plugins](https://chatgpt.com/plugins)，点击加号 → Add custom MCP server（添加自定义 MCP 服务），添加名称“萌牛测颜（私人）”，URL 填 `https://你的域名/mcp`，认证选择 OAuth。
4. 在 OAuth 高级设置中填写 `MCP_CLIENT_ID` 和 `MCP_CLIENT_SECRET` 的值。这里是本服务的凭证，不是 GitHub OAuth 的凭证。若界面显示专属回调地址，先同步到 Cloudflare `MCP_REDIRECT_URI` 并重新部署，再继续连接。
5. 跳转 GitHub 后使用本人账号登录，在本服务授权页核对账号与图片传输说明，手动点击“允许连接”。授权只允许 `face:analyze`，不包含档案、删除或维护权限。
6. 成功连接后应出现三个分析工具。在对话中明确选择照片和该应用，例如：“请用萌牛测颜分析这张本人照片，我同意将它发送给 Face++（以及已配置的微信内容检查），给我一句友好的娱乐点评。”

是否能创建自定义 MCP 取决于 ChatGPT 账号及工作区策略。若你的界面没有 OAuth 客户端 ID/Secret 输入，不要改成无认证；先核对当前账号的接入方式。本地测试通过不代表已完成真实 ChatGPT OAuth 联调。

## 测试与排错

```bash
npm test
```

本地测试使用模拟图片/第三方返回和真实 SQLite SQL，不读取 `.dev.vars`，不发送真实照片、不调用付费接口。覆盖 PKCE S256、一次性授权确认、账号限制、scope/resource 绑定、客户端认证、刷新轮换/重放撤销、下载域名/重定向/流式大小限制和三工具传输。

部署后分别用本人照片测试三项，确认只出现检测结果及 ChatGPT 文案。测试期间不要贴真实 OAuth Secret、Bearer Token 或完整签名下载 URL。

| 现象 | 检查 |
| --- | --- |
| 503 私人 MCP 尚未启用/配置不完整 | Production 的 `MCP_ENABLED`、上述参数、D1/KV 与既有 GitHub 登录是否配置且部署生效 |
| 客户端/回调地址不匹配 | ChatGPT Client ID、Cloudflare ID 和精确回调 URL 是否一致；不要填写 GitHub Client ID |
| 仅指定账号可授权 | 当前 GitHub 账号是否等于 `MCP_OWNER_GITHUB_USER` |
| 401 访问令牌无效 | 重新连接；管理员 Cookie、维护令牌、小程序令牌不能替代 MCP OAuth token |
| 下载域名未被允许 | 错误只显示主机名，不输出临时 URL；确认它是 ChatGPT 实际文件 CDN 后将精确域名加入 `MCP_FILE_HOSTS`，重新部署 |
| 照片链接已失效 | 在 ChatGPT 重新上传/选择照片，使用新的临时链接 |
| 仅支持 JPEG/PNG 或超过 2 MiB | 转换格式、压缩后重新上传；不要传网页截图 HTML 或文件路径 |
| 内容安全暂时不可用 | 检查既有微信 AppSecret/权限/配额；MCP 不会通过关闭检查放行 |
| 服务返回 JSON-RPC 错误 | 使用 Streamable HTTP；POST Content-Type 为 application/json，Accept 同时包含 application/json 与 text/event-stream |

默认文件主机仅是保守允许列表，真实 ChatGPT 文件 CDN 可能不同，需根据实际连接验证；不会自动放行任意 URL。所有下载禁止自动重定向，禁止 IP 字面量、localhost 等目的地，单张下载与检测分别有超时限制。没有配置内容检查时，MCP 的行为与现有网页相同：`REQUIRE_IMAGE_SECURITY=true` 强制检查；提供微信 AppID/AppSecret 时自动检查。

## 凭证周期与关闭

OAuth access token 有效期一小时，refresh token 有效期七天并在使用时轮换。凭证只在 D1 存储 SHA-256 摘要；授权码有效两分钟，一次性消费；授权请求十分钟过期。旧 refresh token 重放会撤销同一授权下的全部令牌。过期 OAuth 行会在新的授权开始时清理，不混入照片清理任务。

- 临时停止全部访问：将 `MCP_ENABLED=false` 并部署。
- 使全部现有 MCP 凭证失效：更换 `MCP_CLIENT_SECRET`，同步 ChatGPT 客户端配置后重新连接。切换 `MCP_OWNER_GITHUB_USER` 或 Client ID/Origin 同样使现有绑定失效。
- 单次授权撤销：支持标准 `/api/mcp/oauth/revoke`，需 OAuth 客户端认证，提交 access/refresh token 会撤销该授权整组凭证。ChatGPT 断开连接是否调用撤销端点取决于客户端；立即彻底关闭以服务端开关为准。

限流复用项目现有按 IP 的内存/KV 实现，并非原子全局计费上限；ChatGPT 出口可能共享 IP。需要更严格控制费用时在 Cloudflare 配置平台限流/配额。整个服务是自建 OAuth 的个人使用实现，尚未进行独立安全审计，不适合直接开放给公众或多租户。

## 协议依据

- [ChatGPT 添加自定义 MCP 服务](https://developers.openai.com/api/docs/guides/custom-mcp-server)：插件创建入口、静态 OAuth 客户端配置与会话使用方式。
- [OpenAI MCP OAuth 认证](https://developers.openai.com/plugins/build/auth)：受保护资源发现、PKCE、预配置客户端、issuer 与 resource 绑定。
- [OpenAI 文件工具参数](https://developers.openai.com/plugins/reference#file-inputs)：`openai/fileParams` 和四字段文件对象。
- [MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)：无会话 JSON 响应，未提供 SSE GET 流时返回 405。
