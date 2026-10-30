# 微信小程序开发与 CI 上传

## 本地开发

用微信开发者工具导入本目录，在项目详情中填写自己的 AppID，并创建被 Git 忽略的 `config/config.local.js`：

```javascript
module.exports = {
  apiUrl: 'https://你的后端域名',
  appid: '你的小程序AppID',
  debug: true
};
```

原生小程序不会自动读取 `.env`。配置模块虽然兼容存在 `process.env` 的构建环境，本地开发仍应使用上面的配置文件。

在微信后台将 API HTTPS 域名加入 request 合法域名。开发者工具的域名校验设置不能代替真机配置。

客户端先使用 `wx.login`，将登录码发送至 `/api/miniprogram-session`；服务端向微信验证后返回一小时的短期凭证。凭证仅保存在内存中，过期时客户端重新登录。不要将 AppSecret 或上传私钥写入小程序代码。

后端 Cloudflare 环境需配置 `WECHAT_APPID`、`WECHAT_APPSECRET`、`APP_SIGNING_SECRET`，以及 Face++ 凭证。`WECHAT_APPSECRET` 是微信 AppSecret，与 CI 上传私钥是两个不同凭证。旧变量 `WECHAT_PRIVATE_KEY` 暂时仅作为 AppSecret 的兼容别名，建议迁移。

选图时会预检查图片；分析接口还会检查实际收到的图片，前端的“已通过”状态不能跳过服务端检查。

## GitHub Actions

工作流为 `.github/workflows/deploy-miniprogram.yml`。修改本目录并推送 main，或手动运行，会上传代码版本；微信审核与发布仍需要在微信后台完成。

GitHub Actions Secrets：

| 名称 | 内容 |
| --- | --- |
| `WECHAT_APPID` | 小程序 AppID |
| `API_BASE_URL` | 后端 HTTPS 根地址，不含 `/api` |
| `WECHAT_UPLOAD_KEY` | 微信下载的小程序代码上传私钥原始文本，保留换行，不做 Base64 编码 |

工作流生成只含公开配置的 `config.local.js`，同步 `project.config.json` 的 AppID，将上传私钥以受限权限写入临时文件，并在结束时删除。该私钥也被排除在小程序打包范围和 Git 跟踪范围之外。

Cloudflare 的 `WECHAT_APPSECRET`、`APP_SIGNING_SECRET` 不需要提供给小程序 CI。GitHub Secrets 中设置变量也不会自动写入 Cloudflare；后端密钥需要单独配置。

## 上线前联调

1. 使用真实微信登录码确认登录及过期重试。
2. 确认内容安全接口权限、额度和图片格式要求。
3. 确认评分、气质、双人分析和错误提示。
4. 使用真机 HTTPS 域名验证，不仅依赖开发者工具。
5. 确认上传包不含私钥，日志不含后端凭证。
