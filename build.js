// build.js - 抓取 RSS 并生成静态 JSON
const RSS_URLS = (process.env.RSS_URLS || 'https://www.xmhai.cn/rss.xml').split(',').map(u => u.trim());

async function fetchRSS(url) {
  // 设置超时，防止某一个恶意的 RSS 源挂起导致整个 GitHub Action 踩坑超时
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 10000); // 10秒超时

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RSS Aggregator; +https://github.com/xingmihai)' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(id);
  }
}

// 增强的标签提取，兼容 CDATA 结构
function extractTag(xml, tag) {
  const regex = new RegExp(`<${tag}[^>]*>([\s\S]*?)<\/${tag}>`);
  const match = xml.match(regex);
  if (!match) return '';
  
  let content = match[1].trim();
  // 如果包裹了 CDATA，提取 CDATA 内部真正的文本
  const cdataRegex = /<!\[CDATA\[([\s\S]*?)\]\]>/;
  const cdataMatch = content.match(cdataRegex);
  return cdataMatch ? cdataMatch[1].trim() : content;
}

function decodeHtml(text) {
  const entities = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" };
  return text.replace(/&[^;]+;/g, e => entities[e] || e);
}

function cleanContent(html) {
  if (!html) return '';
  // 移除脚本和样式标签及其内容（防止 XSS 或垃圾数据）
  let clean = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
  // 移除所有 HTML 标签
  clean = clean.replace(/<[^>]*>/g, '');
  // 解码 HTML 实体并压缩空白字符
  return decodeHtml(clean).replace(/\s+/g, ' ').trim();
}

function parseRSS(xml) {
  const channel = xml.match(/<channel>([\s\S]*?)<\/channel>/)?.[1] || '';
  const feedTitle = extractTag(channel, 'title') || '未知源';

  const articles = [];
  const regex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = regex.exec(channel)) !== null) {
    const item = match[1];
    const rawDate = extractTag(item, 'pubDate') || extractTag(item, 'dc:date') || '';
    
    articles.push({
      title: decodeHtml(extractTag(item, 'title') || '无标题'),
      author: feedTitle, // 修复拼写错误
      rawDate: rawDate,  // 保留原始时间或时间戳用于精确排序
      link: extractTag(item, 'link') || '#',
      content: cleanContent(extractTag(item, 'description') || extractTag(item, 'content:encoded') || '')
    });
  }

  return articles;
}

async function main() {
  const fs = await import('fs');

  if (!fs.existsSync('public')) fs.mkdirSync('public', { recursive: true });

  const allArticles = [];

  const results = await Promise.allSettled(
    RSS_URLS.map(async url => {
      try {
        const xml = await fetchRSS(url);
        return parseRSS(xml);
      } catch (err) {
        console.error(`❌ Failed to fetch/parse: ${url} ->`, err.message);
        return [];
      }
    })
  );

  results.forEach(r => {
    if (r.status === 'fulfilled') allArticles.push(...r.value);
  });

  // 1. 精确排序：转换为时间戳对比，避免同一天内顺序错乱
  allArticles.sort((a, b) => {
    const timeA = a.rawDate ? new Date(a.rawDate).getTime() : 0;
    const timeB = b.rawDate ? new Date(b.rawDate).getTime() : 0;
    return timeB - timeA;
  });

  // 2. 截取前 20 篇并格式化最终对外的日期
  const top20 = allArticles.slice(0, 20).map(item => {
    let formattedDate = item.rawDate;
    try {
      if (item.rawDate) {
        formattedDate = new Date(item.rawDate).toISOString().split('T')[0];
      }
    } catch {
      // 保持原样
    }
    
    // 剔除不需要暴露给前端的 rawDate
    return {
      title: item.title,
      author: item.author,
      date: formattedDate || '未知时间',
      link: item.link,
      content: item.content.substring(0, 200) // 限制长文本，防止生成的 JSON 过大
    };
  });

  fs.writeFileSync('public/articles.json', JSON.stringify(top20, null, 2));
  console.log(`✅ Generated articles.json with ${top20.length} articles`);
}

main().catch(console.error);
