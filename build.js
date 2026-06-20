// build.js - 抓取 RSS 并生成静态 JSON
const RSS_URLS = (process.env.RSS_URLS || 'https://www.xmhai.cn/rss.xml').split(',').map(u => u.trim());

async function fetchRSS(url) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 10000); // 10秒超时

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RSS Aggregator)' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(id);
  }
}

// 安全的单标签提取，绝不使用全局 /g，防止指针错乱
function extractTag(source, tag) {
  if (!source) return '';
  // 兼容带有命名空间的标签，如 <content:encoded> 或 <dc:date>
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
  const match = source.match(regex);
  if (!match) return '';
  
  let content = match[1].trim();
  // 解开 CDATA 包裹
  if (content.startsWith('<![CDATA[')) {
    content = content.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
  }
  return content;
}

function decodeHtml(text) {
  if (!text) return '';
  const entities = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" };
  return text.replace(/&[^;]+;/g, e => entities[e] || e);
}

function cleanContent(html) {
  if (!html) return '';
  let clean = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
  clean = clean.replace(/<[^>]*>/g, '');
  return decodeHtml(clean).replace(/\s+/g, ' ').trim();
}

function parseRSS(xml) {
  // 1. 提取源网站标题
  let feedTitle = extractTag(xml, 'title') || '未知源';

  const articles = [];
  
  // 2. 兼容判断：到底是 RSS 还是 Atom 格式
  let items = [];
  const isAtom = xml.includes('<entry>');
  
  if (isAtom) {
    // Atom 格式 (如 GitHub Releases RSS)
    items = xml.split('<entry>').slice(1); // 丢弃头部，留下每个条目
  } else {
    // 标准 RSS 格式
    items = xml.split('<item>').slice(1);
  }

  // 3. 遍历切分好的字符串，安全提取
  for (const itemXml of items) {
    // 兼容不同协议的时间和正文标签
    const title = extractTag(itemXml, 'title') || '无标题';
    const link = extractTag(itemXml, 'link') || '#';
    const rawDate = isAtom ? extractTag(itemXml, 'updated') : (extractTag(itemXml, 'pubDate') || extractTag(itemXml, 'dc:date'));
    const content = extractTag(itemXml, 'description') || extractTag(itemXml, 'content:encoded') || extractTag(itemXml, 'summary') || extractTag(itemXml, 'content');

    articles.push({
      title: decodeHtml(title),
      author: feedTitle,
      rawDate: rawDate,
      link: link,
      content: cleanContent(content)
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
        const parsed = parseRSS(xml);
        console.log(`📡 Fetched ${url}, found ${parsed.length} articles`);
        return parsed;
      } catch (err) {
        console.error(`❌ Failed to fetch/parse: ${url} ->`, err.message);
        return [];
      }
    })
  );

  results.forEach(r => {
    if (r.status === 'fulfilled') allArticles.push(...r.value);
  });

  // 按时间戳降序排序
  allArticles.sort((a, b) => {
    const timeA = a.rawDate ? new Date(a.rawDate).getTime() : 0;
    const timeB = b.rawDate ? new Date(b.rawDate).getTime() : 0;
    return timeB - timeA;
  });

  // 格式化输出前 20 篇
  const top20 = allArticles.slice(0, 20).map(item => {
    let formattedDate = '未知时间';
    if (item.rawDate) {
      try {
        formattedDate = new Date(item.rawDate).toISOString().split('T')[0];
      } catch {
        formattedDate = item.rawDate.split(' ')[0] || '未知时间';
      }
    }
    
    return {
      title: item.title,
      author: item.author,
      date: formattedDate,
      link: item.link,
      content: item.content.substring(0, 200)
    };
  });

  fs.writeFileSync('public/articles.json', JSON.stringify(top20, null, 2));
  console.log(`✅ Generated articles.json with ${top20.length} articles`);
}

main().catch(console.error);
