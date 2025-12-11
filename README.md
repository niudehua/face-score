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
- Cloudflare D1（SQLite 数据库）
- Cloudflare R2（对象存储）

## 📁 目录结构

```
face-score/
├── functions/
│   ├── api/
│   │   ├── score.js       # 主要 API 逻辑（D1 数据存储）
│   │   ├── image.js       # 图片获取 API
│   │   ├── images.js      # 照片列表和批量删除 API
│   │   ├── auth.js        # 登录鉴权 API
│   │   ├── cleanup.js     # 数据清理任务（自动删除6个月前数据）
│   │   └── verify.js      # 数据验证和统计 API
│   └── lib/
│       ├── db.js          # D1 数据库操作模块
│       ├── storage.js     # R2 存储操作模块
│       └── rate-limit.js  # 请求限流模块
├── public/
│   ├── index.html        # 首页
│   ├── login.html        # 登录页面
│   ├── images.html       # 照片列表管理页面
│   └── images.js         # 照片列表管理页面 JS
├── .dev.vars             # 本地开发环境变量
├── .gitignore            # Git 忽略文件
├── README.md             # 项目说明
└── wrangler.toml         # Wrangler 配置文件
```

## 🔑 环境变量配置

本项目依赖以下环境变量和资源绑定：

### 环境变量
- `FACEPP_KEY`：Face++ API Key
- `FACEPP_SECRET`：Face++ API Secret
- `TURNSTILE_SITE_KEY`：Cloudflare Turnstile 客户端站点密钥（可选，用于前端验证）
- `TURNSTILE_SECRET_KEY`：Cloudflare Turnstile 服务器端密钥（可选，用于后端验证）
- `ADMIN_USERNAME`：管理员用户名（用于管理页面登录）
- `ADMIN_PASSWORD`：管理员密码（用于管理页面登录）

### Cloudflare 资源绑定
- `AI`：Cloudflare AI 绑定（自动提供，无需手动设置）
- `FACE_SCORE_DB`：Cloudflare D1 数据库绑定（用于存储评分记录）
- `R2_BUCKET`：Cloudflare R2 存储桶绑定（用于存储人脸图片）
- `RATE_LIMIT_KV`：Cloudflare KV 命名空间绑定（可选，用于请求限流）
- `SESSION_KV`：Cloudflare KV 命名空间绑定（用于登录会话管理）

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
# 可选：Turnstile 配置
TURNSTILE_SITE_KEY=你的turnstile站点密钥
TURNSTILE_SECRET_KEY=你的turnstile服务器密钥
```

Cloudflare Pages 本地开发（如使用 `wrangler pages dev`）会自动加载 `.dev.vars` 文件并注入到 `context.env`，无需修改代码。

### 生产环境配置

在 Cloudflare Pages 的项目设置中，添加环境变量：
- `FACEPP_KEY`
- `FACEPP_SECRET`
- `TURNSTILE_SITE_KEY`（可选，用于前端 Turnstile 验证）
- `TURNSTILE_SECRET_KEY`（可选，用于后端 Turnstile 验证）

### Cloudflare Turnstile 配置

1. 登录 Cloudflare 控制台，进入你的域名管理页面
2. 点击左侧菜单中的 "Turnstile" 选项
3. 点击 "Add a site" 添加你的网站
4. 配置 Turnstile 设置：
   - 选择 "Managed" 模式
   - 选择 "Non-interactive" 或 "Invisible" 样式
   - 添加你的域名到允许列表
5. 保存设置后，复制生成的 "Site key" 和 "Secret key"
6. 将这两个密钥分别配置到环境变量 `TURNSTILE_SITE_KEY` 和 `TURNSTILE_SECRET_KEY` 中

### 前端 Turnstile 配置

1. 在 `public/index.html` 文件中，找到以下代码行：
   ```html
   <div class="cf-turnstile" data-sitekey="YOUR_TURNSTILE_SITE_KEY" data-theme="light"></div>
   ```

2. 将 `YOUR_TURNSTILE_SITE_KEY` 替换为你从 Cloudflare 控制台获取的 "Site key"

3. 保存文件并部署到 Cloudflare Pages

### 本地开发测试

在本地开发时，你可以：
1. 暂时注释掉 Turnstile 相关代码
2. 或者使用 Cloudflare 提供的测试站点密钥
3. 或者从环境变量中动态获取站点密钥（进阶用法）

### Cloudflare KV 配置（用于限流）

1. 登录 Cloudflare 控制台
2. 点击左侧菜单中的 "Workers & Pages" 选项
3. 选择 "KV" 标签页
4. 点击 "Create namespace" 创建一个新的命名空间
5. 命名为 "RATE_LIMIT_KV"（或自定义名称）
6. 在 Pages 项目的 "Settings" -> "Functions" -> "KV Namespace Bindings" 中添加绑定：
   - 变量名：`RATE_LIMIT_KV`
   - KV 命名空间：选择你创建的命名空间
   - 环境：Production 和 Preview（根据需要）

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

### 1. 颜值评分 API

#### 请求
- **POST** `/api/score`
- Content-Type: `application/json`

#### 请求体参数
| 字段                | 类型   | 必填 | 说明                 |
| ------------------- | ------ | ---- | -------------------- |
| image               | string | 是   | 图片的 Base64 字符串 |
| debug               | bool   | 否   | 是否返回调试日志     |
| turnstile_response  | string | 否   | Cloudflare Turnstile 响应令牌（当启用 Turnstile 验证时必填） |

**示例：**
```json
{
  "image": "base64字符串",
  "debug": true,
  "turnstile_response": "0.mZ...（Turnstile响应令牌）"
}
```

#### Turnstile 验证说明

当服务器配置了 `TURNSTILE_SECRET_KEY` 环境变量时，`/api/score` 端点会要求提供有效的 Turnstile 响应令牌。

您可以通过以下方式提供 Turnstile 令牌：
1. 在请求体中添加 `turnstile_response` 字段
2. 在请求头中添加 `X-Turnstile-Response` 头
3. 在 URL 查询参数中添加 `turnstile_response` 参数

### 2. 图片获取 API

#### 请求
- **GET** `/api/image?md5={md5值}`

#### 参数
| 字段 | 类型   | 必填 | 说明          |
| ---- | ------ | ---- | ------------- |
| md5  | string | 是   | 图片的 MD5 值 |

#### 返回
- 成功：返回 JPEG 图片二进制数据
- 失败：返回 JSON 格式错误信息

### 3. 数据清理 API

#### 请求
- **GET** `/api/cleanup`

#### 返回
| 字段         | 类型   | 说明                 |
| ------------ | ------ | -------------------- |
| success      | bool   | 清理任务是否成功     |
| message      | string | 清理结果消息         |
| deletedCount | number | 删除的记录数量       |
| cutoffDate   | string | 清理截止日期（ISO格式）|
| logs         | array  | 清理过程日志         |

### 4. 数据验证与统计 API

#### 请求
- **GET** `/api/verify?action={action}`

#### 参数
| 字段  | 类型   | 必填 | 说明                                  |
| ----- | ------ | ---- | ------------------------------------- |
| action| string | 否   | 验证操作类型：retention（默认）、stats、cleanup-status |

#### 操作类型说明
- `retention`：验证数据保留策略（检查是否有超过6个月的记录）
- `stats`：获取数据库统计信息（总记录数、最新/最早记录等）
- `cleanup-status`：获取清理状态（待删除记录数等）

#### 返回示例（retention）
```json
{
  "success": true,
  "action": "retention",
  "compliant": true,
  "message": "数据保留策略符合要求",
  "statistics": {
    "totalRecords": 100,
    "recentRecords": 100,
    "oldRecords": 0,
    "oldestRecord": "2024-01-01T12:00:00.000Z",
    "newestRecord": "2024-06-30T12:00:00.000Z",
    "cutoffDate": "2024-01-01T00:00:00.000Z"
  },
  "logs": ["...日志信息..."]
}
```

### 5. 登录 API

#### 请求
- **POST** `/api/auth/login`
- Content-Type: `application/json`

#### 请求体参数
| 字段     | 类型   | 必填 | 说明       |
| -------- | ------ | ---- | ---------- |
| username | string | 是   | 用户名     |
| password | string | 是   | 密码       |

**示例：**
```json
{
  "username": "admin",
  "password": "password"
}
```

#### 返回
| 字段    | 类型   | 说明                 |
| ------- | ------ | -------------------- |
| success | bool   | 登录是否成功         |
| message | string | 登录结果消息         |

### 6. 登录状态验证 API

#### 请求
- **GET** `/api/auth`

#### 返回
| 字段    | 类型   | 说明                 |
| ------- | ------ | -------------------- |
| success | bool   | 验证是否成功         |
| message | string | 验证结果消息         |
| data    | object | 用户信息             |

### 7. 登出 API

#### 请求
- **DELETE** `/api/auth`

#### 返回
| 字段    | 类型   | 说明                 |
| ------- | ------ | -------------------- |
| success | bool   | 登出是否成功         |
| message | string | 登出结果消息         |

### 8. 照片列表 API

#### 请求
- **GET** `/api/images`
- 需登录

#### 参数
| 字段     | 类型   | 必填 | 说明                 |
| -------- | ------ | ---- | -------------------- |
| page     | number | 否   | 页码，默认1          |
| limit    | number | 否   | 每页数量，默认10，范围1-100 |
| sort_by  | string | 否   | 排序字段，可选值：timestamp、score，默认timestamp |
| order    | string | 否   | 排序方向，可选值：asc、desc，默认desc |
| date_from| string | 否   | 开始时间，ISO格式    |
| date_to  | string | 否   | 结束时间，ISO格式    |

#### 返回
| 字段       | 类型   | 说明                 |
| ---------- | ------ | -------------------- |
| data       | array  | 照片列表             |
| pagination | object | 分页信息             |

### 9. 批量删除照片 API

#### 请求
- **DELETE** `/api/images`
- Content-Type: `application/json`
- 需登录

#### 请求体参数
| 字段 | 类型   | 必填 | 说明                 |
| ---- | ------ | ---- | -------------------- |
| ids  | array  | 是   | 要删除的照片ID列表   |

**示例：**
```json
{
  "ids": ["id1", "id2", "id3"]
}
```

#### 返回
| 字段          | 类型   | 说明                 |
| ------------- | ------ | -------------------- |
| success       | bool   | 删除是否成功         |
| message       | string | 删除结果消息         |
| deletedFromD1 | number | 从D1数据库删除的数量 |
| deletedFromR2 | number | 从R2存储删除的数量   |
| totalRequested| number | 请求删除的总数量     |

## 🔒 管理页面

### 访问地址

- **管理页面**：`/images.html`
- 需登录后访问

### 功能说明

1. **照片列表展示**：
   - 支持分页显示照片
   - 支持按时间或颜值排序
   - 支持按日期范围筛选

2. **批量删除功能**：
   - 支持勾选单张或多张照片
   - 支持全选/取消全选
   - 删除时同时删除D1数据库记录和R2存储的图片文件

3. **自定义分页数量**：
   - 支持选择每页显示10、20、50或100张照片
   - 照片大小会根据分页数量自动调整
   - 每页显示更多照片时，照片会自动缩小以适应布局

4. **总条数显示**：
   - 显示当前筛选条件下的总照片数量
   - 实时更新

### 登录管理

- **登录页面**：`/login.html`
- 用户名和密码从环境变量 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 获取
- 登录后会话有效期为7天，自动续期

## 🔒 限流说明

所有 API 端点都实施了基于 IP 的请求限流：

| API 端点 | 限流规则 |
|---------|--------|
| `/api/score` | 每 IP 每分钟 10 次请求 |
| `/api/image` | 每 IP 每分钟 50 次请求 |
| `/api/images` | 每 IP 每分钟 50 次请求 |
| `/api/cleanup` | 每 IP 每分钟 5 次请求 |
| `/api/verify` | 每 IP 每分钟 5 次请求 |
| `/api/auth` | 每 IP 每分钟 20 次请求 |

限流响应头：
- `X-RateLimit-Limit`：每分钟允许的最大请求数
- `X-RateLimit-Remaining`：当前窗口剩余的请求数
- `X-RateLimit-Reset`：当前窗口重置剩余时间（秒）
- `Retry-After`：请求被限流时，建议重试时间（秒）

## 📊 核心功能说明

1. **人脸检测**：调用 Face++ API 检测图片中的人脸
2. **颜值评分**：根据性别返回相应的颜值分数
3. **面部分析**：提取年龄、性别、表情、皮肤状态等多种面部特征
4. **AI 趣味点评**：使用 Llama 3 模型生成俏皮、接地气的颜值评价
5. **数据持久化**：使用 Cloudflare D1 数据库存储评分记录
6. **自动数据清理**：定期删除超过6个月的旧数据
7. **数据验证**：提供 API 验证数据保留策略合规性

## 💾 D1 数据库实现

### 数据库 schema

```sql
CREATE TABLE IF NOT EXISTS face_scores (
  id TEXT PRIMARY KEY,
  score REAL NOT NULL,
  comment TEXT NOT NULL,
  gender TEXT NOT NULL,
  age INTEGER NOT NULL,
  timestamp TEXT NOT NULL,
  image_url TEXT NOT NULL,
  md5 TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 索引设计
CREATE INDEX IF NOT EXISTS idx_face_scores_md5 ON face_scores(md5);
CREATE INDEX IF NOT EXISTS idx_face_scores_timestamp ON face_scores(timestamp);
CREATE INDEX IF NOT EXISTS idx_face_scores_created_at ON face_scores(created_at);
```

### 数据保留策略

- **保留期限**：仅保留最近6个月的数据
- **清理方式**：自动清理超过6个月的旧记录
- **清理机制**：通过 `/api/cleanup` API 执行
- **建议调度**：每周在非高峰时段执行

### 清理机制说明

1. **事务支持**：使用事务确保数据完整性
2. **安全措施**：
   - 自动计算截止日期（6个月前）
   - 执行前统计待删除记录数量
   - 事务回滚机制防止数据损坏
3. **日志记录**：详细记录清理过程和结果
4. **性能优化**：使用索引加速查询和删除操作

## 🧪 数据验证与监控

### 验证 API

1. **数据保留验证**：`GET /api/verify?action=retention`
   - 检查是否存在超过6个月的记录
   - 验证数据保留策略合规性
   - 返回详细的记录统计信息

2. **数据库统计**：`GET /api/verify?action=stats`
   - 总记录数
   - 最新/最早记录时间
   - 今日记录数
   - 本月记录数

3. **清理状态检查**：`GET /api/verify?action=cleanup-status`
   - 待删除记录数量
   - 下次清理截止日期

### 监控建议

- **定期检查**：每周执行一次数据保留验证
- **清理监控**：监控清理任务的执行结果
- **日志分析**：定期检查数据库操作日志
- **性能监控**：关注数据库查询和写入性能

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
