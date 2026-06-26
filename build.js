// build.js - 抓取 RSS 并生成静态 JSON（终极优化版）
const fs = require('fs');
const path = require('path');
const { XMLParser } = require('fast-xml-parser');
const he = require('he');

// ========== 配置 ==========
const RSS_URLS = (process.env.RSS_URLS || '').split(',').map(u => u.trim()).filter(Boolean);
const MAX_ARTICLES = parseInt(process.env.MAX_ARTICLES || '20', 10);
const DEFAULT_UA = 'Mozilla/5.0 (compatible; RSS Aggregator/1.0)';
const FETCH_TIMEOUT = 12000; // 12秒请求超时限制

// XML 解析器配置
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  cdataPropName: '#cdata',
  textNodeName: '#text',
  parseTagValue: false,
  trimValues: true,
});

// ========== 工具函数 ==========

/**
 * 生成安全的文件名（基于 URL）
 */
function getSafeFileName(url) {
  try {
    const urlObj = new URL(url);
    // 使用 hostname + pathname 生成唯一文件名，替换非法字符
    let name = urlObj.hostname + urlObj.pathname;
    name = name.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    // 限制长度，避免文件名过长
    if (name.length > 100) {
      name = name.substring(0, 100);
    }
    return name + '.json';
  } catch {
    // 如果 URL 解析失败，使用简单的哈希方式
    const hash = Buffer.from(url).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
    return `rss_${hash}.json`;
  }
}

/**
 * 抓取 RSS 内容（带超时保护）
 */
async function fetchRSS(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': DEFAULT_UA },
      signal: controller.signal, // 绑定超时信号
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timeoutId); // 务必清除定时器
  }
}

/**
 * 提取并清理文本内容（处理 CDATA 和嵌套）
 */
function extractText(obj) {
  if (obj == null) return '';
  if (typeof obj === 'string') return obj;
  if (typeof obj === 'object') {
    if (obj['#cdata'] != null) return String(obj['#cdata']);
    if (obj['#text'] != null) return String(obj['#text']);
    const keys = Object.keys(obj);
    if (keys.length > 0) return extractText(obj[keys[0]]);
  }
  return String(obj);
}

/**
 * 清理 HTML 标签并解码实体
 */
function cleanContent(html) {
  if (!html) return '';
  // 移除潜在的 script/style 标签及内容，防止垃圾数据或安全隐患
  let text = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
  // 先解码 HTML 实体
  text = he.decode(text, { isAttributeValue: false, strict: false });
  // 移除 HTML 标签
  text = text.replace(/<[^>]*>/g, ' ');
  // 合并空白字符
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * 格式化日期为 ISO 字符串
 */
function formatDate(str) {
  if (!str) return '';
  try {
    const date = new Date(str);
    if (isNaN(date.getTime())) return str;
    return date.toISOString();
  } catch {
    return str;
  }
}

/**
 * 从 link 对象/字符串中提取 URL
 */
function extractLink(linkObj) {
  if (!linkObj) return '#';
  if (typeof linkObj === 'string') return linkObj;
  if (typeof obj === 'object') {
    if (linkObj['@_href']) return linkObj['@_href'];
    if (linkObj['#text']) return linkObj['#text'];
  }
  return '#';
}

// ========== RSS / Atom 解析 ==========

function parseRSS2(xmlObj) {
  const channel = xmlObj.rss?.channel;
  if (!channel) return { feed: null, articles: [] };

  const feedTitle = extractText(channel.title) || '未知来源';
  const items = channel.item || [];
  const itemList = Array.isArray(items) ? items : [items];

  const articles = itemList.map(item => {
    const title = extractText(item.title) || '无标题';
    const link = extractLink(item.link);
    const pubDate = extractText(item.pubDate) || extractText(item['dc:date']) || '';
    const description = extractText(item['content:encoded']) || extractText(item.description) || '';

    return {
      title: he.decode(title),
      author: feedTitle,
      auther: feedTitle, // 向后兼容
      date: formatDate(pubDate),
      link,
      content: cleanContent(description),
    };
  });

  return { feed: { title: feedTitle }, articles };
}

function parseAtom(xmlObj) {
  const feed = xmlObj.feed;
  if (!feed) return { feed: null, articles: [] };

  const feedTitle = extractText(feed.title) || '未知来源';
  const entries = feed.entry || [];
  const entryList = Array.isArray(entries) ? entries : [entries];

  const articles = entryList.map(entry => {
    const title = extractText(entry.title) || '无标题';
    const link = extractLink(entry.link);
    const updated = extractText(entry.updated) || extractText(entry.published) || '';
    const content = extractText(entry.content) || extractText(entry.summary) || '';
    const authorName = extractText(entry.author?.name) || feedTitle;

    return {
      title: he.decode(title),
      author: authorName,
      auther: authorName,
      date: formatDate(updated),
      link,
      content: cleanContent(content),
    };
  });

  return { feed: { title: feedTitle }, articles };
}

function parseFeed(xmlText) {
  try {
    const xmlObj = parser.parse(xmlText);

    if (xmlObj.rss) return parseRSS2(xmlObj);
    if (xmlObj.feed) return parseAtom(xmlObj);

    if (xmlObj['rdf:RDF']) {
      const channel = xmlObj['rdf:RDF'].channel;
      const items = xmlObj['rdf:RDF'].item || [];
      const feedTitle = extractText(channel?.title) || '未知来源';
      const itemList = Array.isArray(items) ? items : [items];

      const articles = itemList.map(item => ({
        title: he.decode(extractText(item.title) || '无标题'),
        author: feedTitle,
        auther: feedTitle,
        date: formatDate(extractText(item['dc:date']) || ''),
        link: extractLink(item.link),
        content: cleanContent(extractText(item.description) || ''),
      }));

      return { feed: { title: feedTitle }, articles };
    }

    throw new Error('无法识别的 Feed 格式');
  } catch (err) {
    throw new Error(`XML 解析失败: ${err.message}`);
  }
}

// ========== 主函数 ==========

async function main() {
  if (RSS_URLS.length === 0) {
    console.warn('⚠️  未配置 RSS_URLS 环境变量，将使用默认测试源');
    RSS_URLS.push('https://www.xmhai.cn/rss.xml');
  }

  console.log(`📡 开始抓取 ${RSS_URLS.length} 个 RSS 源...`);

  const outputDir = path.join(__dirname, 'docs');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const allArticles = [];
  let successCount = 0;
  let failCount = 0;

  const results = await Promise.allSettled(
    RSS_URLS.map(async (url) => {
      try {
        console.log(`  ↓ 抓取中: ${url}`);
        const xml = await fetchRSS(url);
        const { articles, feed } = parseFeed(xml);
        console.log(`  ✅ ${feed?.title || '未知'}: ${articles.length} 篇`);

        // ========== 新增：每个源单独保存 JSON ==========
        const safeFileName = getSafeFileName(url);
        const singleSourcePath = path.join(outputDir, safeFileName);
        const singleSourceData = articles.map(item => ({
          title: item.title,
          author: item.author,
          auther: item.auther,
          date: item.date || '未知时间',
          link: item.link,
          content: item.content,
        }));
        fs.writeFileSync(singleSourcePath, JSON.stringify(singleSourceData, null, 2));
        console.log(`     💾 已保存单独文件: ${safeFileName} (${singleSourceData.length} 篇)`);
        // ================================================

        successCount++;
        return articles;
      } catch (err) {
        console.error(`  ❌ 失败: ${url} - ${err.message}`);
        failCount++;
        return [];
      }
    })
  );

  results.forEach((r) => {
    if (r.status === 'fulfilled') {
      allArticles.push(...r.value);
    }
  });

  // 排序健壮性优化：处理不合法的日期，避免 NaN 导致排序混乱
  allArticles.sort((a, b) => {
    const timeA = a.date ? new Date(a.date).getTime() : 0;
    const timeB = b.date ? new Date(b.date).getTime() : 0;
    const tA = isNaN(timeA) ? 0 : timeA;
    const tB = isNaN(timeB) ? 0 : timeB;
    return tB - tA;
  });

  // 截取并优化最终的字段（切除过长文本，防止前端加载的 JSON 太大）
  const topArticles = allArticles.slice(0, MAX_ARTICLES).map(item => ({
    title: item.title,
    author: item.author,
    auther: item.auther,
    date: item.date || '未知时间',
    link: item.link,
    content: item.content,
  }));

  const outputPath = path.join(outputDir, 'articles.json');
  fs.writeFileSync(outputPath, JSON.stringify(topArticles, null, 2));

  console.log(`\n🎉 完成！成功 ${successCount} 个，失败 ${failCount} 个`);
  console.log(`📝 共聚合 ${allArticles.length} 篇文章，保留最新 ${topArticles.length} 篇`);
  console.log(`💾 聚合输出文件: ${outputPath}`);
  console.log(`📁 各源单独文件保存在: ${outputDir}`);
}

main().catch((err) => {
  console.error('❌ 执行失败:', err);
  process.exit(1);
});
