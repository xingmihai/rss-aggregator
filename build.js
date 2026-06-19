// build.js - 抓取 RSS 并生成静态 JSON
const RSS_URLS = (process.env.RSS_URLS || 'https://www.xmhai.cn/rss.xml').split(',').map(u => u.trim());

async function fetchRSS(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RSS Aggregator)' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function extractTag(xml, tag) {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*(?:<(?!\/${tag}>)[^<]*)*)<\/${tag}>`);
  const match = xml.match(regex);
  return match ? match[1].trim() : '';
}

function decodeHtml(text) {
  const entities = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
  return text.replace(/&[^;]+;/g, e => entities[e] || e);
}

function cleanContent(html) {
  return decodeHtml(html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());
}

function formatDate(str) {
  try { return new Date(str).toISOString().split('T')[0]; } 
  catch { return str; }
}

function parseRSS(xml, feedTitle) {
  const channel = xml.match(/<channel>([\s\S]*?)<\/channel>/)?.[1] || '';
  const feed = {
    title: extractTag(channel, 'title') || '未知',
    link: extractTag(channel, 'link') || '#',
    description: extractTag(channel, 'description') || ''
  };

  const articles = [];
  const regex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = regex.exec(channel)) !== null) {
    const item = match[1];
    articles.push({
      title: decodeHtml(extractTag(item, 'title') || '无标题'),
      auther: feed.title,  // 修正拼写
      date: formatDate(extractTag(item, 'pubDate') || ''),
      link: extractTag(item, 'link') || '#',
      content: cleanContent(extractTag(item, 'description') || '')
    });
  }

  return articles;
}

async function main() {
  const fs = await import('fs');

  // 确保输出目录存在
  if (!fs.existsSync('public')) fs.mkdirSync('public', { recursive: true });

  const allArticles = [];

  // 并行抓取所有 RSS
  const results = await Promise.allSettled(
    RSS_URLS.map(async url => {
      try {
        const xml = await fetchRSS(url);
        return parseRSS(xml);
      } catch (err) {
        console.error(`Failed: ${url}`, err.message);
        return [];
      }
    })
  );

  results.forEach(r => {
    if (r.status === 'fulfilled') allArticles.push(...r.value);
  });

  // 按日期排序，取前 20 篇
  allArticles.sort((a, b) => new Date(b.date) - new Date(a.date));
  const top20 = allArticles.slice(0, 20);

  // 写入 JSON
  fs.writeFileSync('public/articles.json', JSON.stringify(top20, null, 2));
  console.log(`✅ Generated articles.json with ${top20.length} articles`);
}

main().catch(console.error);