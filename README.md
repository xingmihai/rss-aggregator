# RSS 聚合器

一个零成本、无限制的 RSS 聚合方案，使用 GitHub Actions 定时抓取多个 RSS 源，生成静态 JSON 文件，通过 Cloudflare Pages 全球 CDN 分发。

## 为什么不用 Cloudflare Workers？

| 对比项 | Cloudflare Workers Free | 本方案 |
|--------|------------------------|--------|
| 每日请求限制 | 10 万次 | **无限制** |
| CPU 时间限制 | 10 毫秒/请求 | **无限制** |
| 成本 | 免费但有额度 | **完全免费** |
| 实时性 | 实时 | 最多延迟 15 分钟 |

对于 RSS 阅读场景，15 分钟延迟完全可以接受。

## 项目结构

```
rss-aggregator/
├── .github/
│   └── workflows/
│       └── fetch-rss.yml      # GitHub Actions 工作流配置
├── public/                     # Cloudflare Pages 输出目录
│   └── articles.json           # 自动生成的 RSS 聚合数据
├── build.js                    # RSS 抓取与解析脚本
└── README.md
```

## 快速开始

### 1. Fork 或创建仓库

在 GitHub 上新建一个公开仓库（如 `rss-aggregator`），将本项目文件上传。

### 2. 配置 RSS 源

进入仓库 **Settings → Secrets and variables → Actions → New repository secret**：

- **Name**: `RSS_URLS`
- **Value**: 你的 RSS 源地址，多个用逗号分隔

示例：
```
https://www.xmhai.cn/rss.xml,https://example.com/feed.xml
```

### 3. 手动触发首次运行

进入仓库 **Actions → Fetch RSS → Run workflow**，手动运行一次，生成初始的 `articles.json`。

### 4. 部署到 Cloudflare Pages

#### 方式一：Git 集成（推荐）

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com) → **Pages**
2. **Create a project** → **Connect to Git**
3. 选择你的仓库
4. 构建设置：
   - **Build command**: 留空（不需要构建）
   - **Build output directory**: `public`
5. 保存部署

#### 方式二：Direct Upload

如果你不想连接 GitHub，可以在 Actions 中直接推送到 Pages（需配置 `CLOUDFLARE_API_TOKEN`）。

### 5. 获取 API 地址

部署完成后，你的 RSS API 地址为：

```
https://<你的项目名>.<用户名>.pages.dev/articles.json
```

前端调用示例：

```javascript
fetch('https://rss-aggregator.yourname.pages.dev/articles.json')
  .then(r => r.json())
  .then(articles => {
    articles.forEach(article => {
      console.log(article.title, article.date);
    });
  });
```

## 数据格式

`articles.json` 返回数组，每篇文章包含：

```json
[
  {
    "title": "文章标题",
    "author": "来源站点名称",
    "date": "2026-06-20",
    "link": "https://example.com/article",
    "content": "文章摘要内容..."
  }
]
```

- 最多返回 **20 篇** 最新文章
- 按发布日期倒序排列
- 单个 RSS 源失败不影响其他源

## 定时频率

默认每 **15 分钟** 抓取一次，可在 `.github/workflows/fetch-rss.yml` 中修改：

```yaml
on:
  schedule:
    - cron: '*/15 * * * *'   # 每15分钟
    # - cron: '0 * * * *'    # 每小时
    # - cron: '0 */6 * * *'  # 每6小时
```

## 支持的 RSS 格式

目前支持标准 RSS 2.0 格式（`<channel>` + `<item>`）。如需支持 Atom 或其他格式，可在 `build.js` 中扩展解析逻辑。

## 注意事项

1. **GitHub Actions 免费额度**：公开仓库每月 2000 分钟，本任务每次约 10-30 秒，完全够用
2. **空提交优化**：如果 RSS 内容无变化，不会生成新的 commit，避免无意义部署
3. **RSS 源稳定性**：某个源抓取失败会记录错误，不影响其他源和整体输出

## License

MIT
