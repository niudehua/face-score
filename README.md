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
│   └── api/
│       ├── score.js       # 主要 API 逻辑（D1 数据存储）
│       ├── image.js       # 图片获取 API
│       ├── cleanup.js     # 数据清理任务（自动删除6个月前数据）
│       └── verify.js      # 数据验证和统计 API
├── public/
│   └── index.html        # 静态页面（如有）
├── .dev.vars             # 本地开发环境变量
├── .gitignore            # Git 忽略文件
├── README.md             # 项目说明
└── ...
```

## 🔑 环境变量配置

本项目依赖以下环境变量和资源绑定：

### 环境变量
- `FACEPP_KEY`：Face++ API Key
- `FACEPP_SECRET`：Face++ API Secret

### Cloudflare 资源绑定
- `AI`：Cloudflare AI 绑定（自动提供，无需手动设置）
- `FACE_SCORE_DB`：Cloudflare D1 数据库绑定（用于存储评分记录）
- `FACE_IMAGES`：Cloudflare R2 存储桶绑定（用于存储人脸图片）

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

### 1. 颜值评分 API

#### 请求
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

#### 返回
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
