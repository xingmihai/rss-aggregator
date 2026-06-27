const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { XMLParser } = require('fast-xml-parser');
const he = require('he');

const DEFAULT_TEST_SOURCE = 'https://www.xmhai.cn/rss.xml';
const DEFAULT_DESCRIPTION = '一个零成本、无限制的 RSS 聚合方案，使用 GitHub Actions 定时抓取多个 RSS 源，生成静态 JSON 文件，通过 Cloudflare Pages 全球 CDN 分发。';
const OUTPUT_FILES = {
  articles: 'articles.json',
  buildReport: 'build-report.json',
  cache: 'feed-cache.json',
  siteConfig: 'site-config.json',
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  cdataPropName: '#cdata',
  textNodeName: '#text',
  parseTagValue: false,
  trimValues: true,
});

function parseList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePositiveInt(value, fallback) {
  const parsed = parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getRuntimeConfig(env = process.env) {
  const repo = env.SITE_REPO || env.GITHUB_REPOSITORY || '';
  const workflowFile = env.WORKFLOW_FILENAME || 'fetch-rss.yml';
  const outputDir = path.resolve(__dirname, env.OUTPUT_DIR || 'docs');

  return {
    rssUrls: parseList(env.RSS_URLS),
    maxArticles: parsePositiveInt(env.MAX_ARTICLES, 20),
    defaultUA: env.RSS_USER_AGENT || 'Mozilla/5.0 (compatible; RSS Aggregator/1.0)',
    fetchTimeout: parsePositiveInt(env.FETCH_TIMEOUT_MS, 12000),
    outputDir,
    siteTitle: env.SITE_TITLE || 'RSS 聚合器',
    siteDescription: env.SITE_DESCRIPTION || DEFAULT_DESCRIPTION,
    siteUrl: env.SITE_URL || '',
    repo,
    repoUrl: repo ? `https://github.com/${repo}` : '',
    repoApiBase: repo ? `https://api.github.com/repos/${repo}` : '',
    workflowFile,
  };
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function hashValue(value) {
  return crypto.createHash('sha1').update(value).digest('hex');
}

function hashJson(value) {
  return hashValue(JSON.stringify(value));
}

function getSafeFileName(url) {
  try {
    const urlObj = new URL(url);
    let name = `${urlObj.hostname}${urlObj.pathname}`.replace(/[^a-zA-Z0-9_\-.]/g, '_');
    if (name.length > 100) name = name.substring(0, 100);
    return `${name}.json`;
  } catch {
    const hash = Buffer.from(url).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 20);
    return `rss_${hash}.json`;
  }
}

async function fetchRSS(url, options = {}) {
  const {
    fetchImpl = global.fetch,
    timeout = 12000,
    userAgent = 'Mozilla/5.0 (compatible; RSS Aggregator/1.0)',
    cacheEntry = null,
  } = options;

  if (typeof fetchImpl !== 'function') {
    throw new Error('当前运行环境不支持 fetch');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const headers = {
    'User-Agent': userAgent,
    Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
  };

  if (cacheEntry?.etag) headers['If-None-Match'] = cacheEntry.etag;
  if (cacheEntry?.lastModified) headers['If-Modified-Since'] = cacheEntry.lastModified;

  try {
    const res = await fetchImpl(url, { headers, signal: controller.signal });

    if (res.status === 304) {
      return {
        status: 'not_modified',
        etag: cacheEntry?.etag || '',
        lastModified: cacheEntry?.lastModified || '',
      };
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const xmlText = await res.text();

    return {
      status: 'fetched',
      xmlText,
      etag: res.headers?.get?.('etag') || cacheEntry?.etag || '',
      lastModified: res.headers?.get?.('last-modified') || cacheEntry?.lastModified || '',
      responseHash: hashValue(xmlText),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

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

function cleanContent(html) {
  if (!html) return '';
  let text = html.replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '');
  text = he.decode(text, { isAttributeValue: false, strict: false });
  text = text.replace(/<[^>]*>/g, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

function formatDate(str) {
  if (!str) return '';
  try {
    const date = new Date(str);
    if (Number.isNaN(date.getTime())) return str;
    return date.toISOString();
  } catch {
    return str;
  }
}

function extractLink(linkObj) {
  if (!linkObj) return '#';
  if (typeof linkObj === 'string') return linkObj;
  if (Array.isArray(linkObj)) {
    const firstHref = linkObj.map(extractLink).find((item) => item && item !== '#');
    return firstHref || '#';
  }
  if (typeof linkObj === 'object') {
    if (linkObj['@_href']) return String(linkObj['@_href']);
    if (linkObj['#text']) return String(linkObj['#text']);
  }
  return '#';
}

function normalizeArticle(item) {
  const title = typeof item?.title === 'string' ? he.decode(item.title).trim() : '无标题';
  const author = typeof item?.author === 'string' && item.author.trim() ? item.author.trim() : '未知来源';
  const link = typeof item?.link === 'string' && item.link.trim() ? item.link.trim() : '#';
  const content = typeof item?.content === 'string' ? item.content.trim() : '';
  const date = item?.date ? formatDate(item.date) : '';

  return {
    title: title || '无标题',
    author,
    auther: author,
    date: date || '未知时间',
    link,
    content,
  };
}

function parseRSS2(xmlObj) {
  const channel = xmlObj.rss?.channel;
  if (!channel) return { feed: null, articles: [] };

  const feedTitle = extractText(channel.title) || '未知来源';
  const items = channel.item || [];
  const itemList = Array.isArray(items) ? items : [items];

  const articles = itemList.map((item) => normalizeArticle({
    title: extractText(item.title) || '无标题',
    author: feedTitle,
    date: extractText(item.pubDate) || extractText(item['dc:date']) || '',
    link: extractLink(item.link),
    content: cleanContent(extractText(item['content:encoded']) || extractText(item.description) || ''),
  }));

  return { feed: { title: feedTitle }, articles };
}

function parseAtom(xmlObj) {
  const feed = xmlObj.feed;
  if (!feed) return { feed: null, articles: [] };

  const feedTitle = extractText(feed.title) || '未知来源';
  const entries = feed.entry || [];
  const entryList = Array.isArray(entries) ? entries : [entries];

  const articles = entryList.map((entry) => normalizeArticle({
    title: extractText(entry.title) || '无标题',
    author: extractText(entry.author?.name) || feedTitle,
    date: extractText(entry.updated) || extractText(entry.published) || '',
    link: extractLink(entry.link),
    content: cleanContent(extractText(entry.content) || extractText(entry.summary) || ''),
  }));

  return { feed: { title: feedTitle }, articles };
}

function parseRDF(xmlObj) {
  const rdf = xmlObj['rdf:RDF'];
  if (!rdf) return { feed: null, articles: [] };

  const channel = rdf.channel;
  const items = rdf.item || [];
  const feedTitle = extractText(channel?.title) || '未知来源';
  const itemList = Array.isArray(items) ? items : [items];

  const articles = itemList.map((item) => normalizeArticle({
    title: extractText(item.title) || '无标题',
    author: feedTitle,
    date: extractText(item['dc:date']) || '',
    link: extractLink(item.link),
    content: cleanContent(extractText(item.description) || ''),
  }));

  return { feed: { title: feedTitle }, articles };
}

function parseFeed(xmlText) {
  try {
    const xmlObj = parser.parse(xmlText);
    if (xmlObj.rss) return parseRSS2(xmlObj);
    if (xmlObj.feed) return parseAtom(xmlObj);
    if (xmlObj['rdf:RDF']) return parseRDF(xmlObj);
    throw new Error('无法识别的 Feed 格式');
  } catch (err) {
    throw new Error(`XML 解析失败: ${err.message}`);
  }
}

function sortArticles(articles) {
  return articles.sort((a, b) => {
    const timeA = a.date ? new Date(a.date).getTime() : 0;
    const timeB = b.date ? new Date(b.date).getTime() : 0;
    const tA = Number.isNaN(timeA) ? 0 : timeA;
    const tB = Number.isNaN(timeB) ? 0 : timeB;
    return tB - tA;
  });
}

function buildSiteConfig(config) {
  const repo = config.repo || '';
  const repoUrl = config.repoUrl || '';
  const repoApiBase = config.repoApiBase || '';
  const workflowFile = config.workflowFile || 'fetch-rss.yml';
  const workflowRunsApi = repoApiBase ? `${repoApiBase}/actions/workflows/${workflowFile}/runs?per_page=50` : '';
  const workflowJobsApiBase = repoApiBase ? `${repoApiBase}/actions/runs` : '';
  const workflowRunUrlBase = repoUrl ? `${repoUrl}/actions/runs` : '';

  return {
    generatedAt: new Date().toISOString(),
    site: {
      title: config.siteTitle,
      description: config.siteDescription,
      url: config.siteUrl,
    },
    github: {
      repo,
      repoUrl,
      repoApiBase,
      workflowFile,
      workflowRunsApi,
      workflowJobsApiBase,
      workflowRunUrlBase,
      editReadmeUrl: repoUrl ? `${repoUrl}/edit/main/README.md` : '',
    },
    data: {
      articles: `/docs/${OUTPUT_FILES.articles}`,
      buildReport: `/docs/${OUTPUT_FILES.buildReport}`,
      siteConfig: `/docs/${OUTPUT_FILES.siteConfig}`,
    },
  };
}

async function processFeed(url, options) {
  const {
    outputDir,
    cacheEntry,
    fetchImpl,
    userAgent,
    fetchTimeout,
  } = options;

  const fileName = getSafeFileName(url);
  const singleSourcePath = path.join(outputDir, fileName);
  const startedAt = new Date().toISOString();
  const startedMs = Date.now();

  try {
    const fetchResult = await fetchRSS(url, {
      fetchImpl,
      timeout: fetchTimeout,
      userAgent,
      cacheEntry,
    });

    let articles;
    let feed;
    let status = 'success';

    if (fetchResult.status === 'not_modified') {
      if (!cacheEntry?.articles || !cacheEntry?.feed) {
        throw new Error('RSS 返回 304，但本地缓存缺失');
      }
      articles = cacheEntry.articles.map(normalizeArticle);
      feed = cacheEntry.feed;
      status = 'cached';
    } else {
      const parsed = parseFeed(fetchResult.xmlText);
      articles = parsed.articles.map(normalizeArticle);
      feed = parsed.feed;
    }

    writeJson(singleSourcePath, articles);

    const now = new Date().toISOString();
    const nextCacheEntry = {
      url,
      fileName,
      feed: { title: feed?.title || '未知来源' },
      articles,
      articleHash: hashJson(articles),
      etag: fetchResult.etag || cacheEntry?.etag || '',
      lastModified: fetchResult.lastModified || cacheEntry?.lastModified || '',
      responseHash: fetchResult.responseHash || cacheEntry?.responseHash || '',
      lastSuccessAt: now,
      updatedAt: now,
    };

    return {
      articles,
      cacheEntry: nextCacheEntry,
      report: {
        url,
        title: nextCacheEntry.feed.title,
        fileName,
        status,
        articleCount: articles.length,
        durationMs: Date.now() - startedMs,
        lastAttemptAt: now,
        lastSuccessAt: now,
        usedCache: status !== 'success',
        error: null,
      },
    };
  } catch (err) {
    if (cacheEntry?.articles?.length && cacheEntry?.feed) {
      const fallbackArticles = cacheEntry.articles.map(normalizeArticle);
      writeJson(singleSourcePath, fallbackArticles);

      return {
        articles: fallbackArticles,
        cacheEntry: {
          ...cacheEntry,
          updatedAt: new Date().toISOString(),
        },
        report: {
          url,
          title: cacheEntry.feed.title || '未知来源',
          fileName,
          status: 'stale',
          articleCount: fallbackArticles.length,
          durationMs: Date.now() - startedMs,
          lastAttemptAt: new Date().toISOString(),
          lastSuccessAt: cacheEntry.lastSuccessAt || startedAt,
          usedCache: true,
          error: err.message,
        },
      };
    }

    return {
      articles: [],
      cacheEntry: cacheEntry || null,
      report: {
        url,
        title: cacheEntry?.feed?.title || '未知来源',
        fileName,
        status: 'failed',
        articleCount: 0,
        durationMs: Date.now() - startedMs,
        lastAttemptAt: new Date().toISOString(),
        lastSuccessAt: cacheEntry?.lastSuccessAt || '',
        usedCache: false,
        error: err.message,
      },
    };
  }
}

function createBuildReport(config, sourceReports, allArticles, topArticles) {
  const summary = {
    sourceCount: sourceReports.length,
    successCount: sourceReports.filter((item) => item.status === 'success').length,
    cachedCount: sourceReports.filter((item) => item.status === 'cached').length,
    staleCount: sourceReports.filter((item) => item.status === 'stale').length,
    failedCount: sourceReports.filter((item) => item.status === 'failed').length,
    totalArticles: allArticles.length,
    outputArticles: topArticles.length,
    maxArticles: config.maxArticles,
  };

  return {
    generatedAt: new Date().toISOString(),
    summary,
    site: {
      title: config.siteTitle,
      repo: config.repo,
      workflowFile: config.workflowFile,
    },
    sources: sourceReports,
  };
}

async function buildFeeds(options = {}) {
  const config = {
    ...getRuntimeConfig(),
    ...options,
  };

  if (!Array.isArray(config.rssUrls) || config.rssUrls.length === 0) {
    console.warn('⚠️  未配置 RSS_URLS 环境变量，将使用默认测试源');
    config.rssUrls = [DEFAULT_TEST_SOURCE];
  }

  ensureDir(config.outputDir);

  const cachePath = path.join(config.outputDir, OUTPUT_FILES.cache);
  const previousCache = options.previousCache || readJson(cachePath, {});
  const fetchImpl = options.fetchImpl || global.fetch;

  console.log(`📡 开始抓取 ${config.rssUrls.length} 个 RSS 源...`);

  const results = await Promise.all(
    config.rssUrls.map(async (url) => {
      console.log(`  ↓ 抓取中: ${url}`);
      const result = await processFeed(url, {
        outputDir: config.outputDir,
        cacheEntry: previousCache[url] || null,
        fetchImpl,
        userAgent: config.defaultUA,
        fetchTimeout: config.fetchTimeout,
      });

      const statusLabel = {
        success: '✅ 已更新',
        cached: '♻️  未变化',
        stale: '⚠️  回退缓存',
        failed: '❌ 失败',
      }[result.report.status] || result.report.status;

      console.log(`  ${statusLabel}: ${result.report.title} (${result.report.articleCount} 篇)`);
      if (result.report.error) {
        console.log(`     ↳ ${result.report.error}`);
      }

      return result;
    })
  );

  const nextCache = {};
  const sourceReports = [];
  const allArticles = [];

  results.forEach((result, index) => {
    const url = config.rssUrls[index];
    if (result.cacheEntry) nextCache[url] = result.cacheEntry;
    sourceReports.push(result.report);
    allArticles.push(...result.articles);
  });

  sortArticles(allArticles);
  const topArticles = allArticles.slice(0, config.maxArticles).map(normalizeArticle);
  const buildReport = createBuildReport(config, sourceReports, allArticles, topArticles);
  const siteConfig = buildSiteConfig(config);

  writeJson(path.join(config.outputDir, OUTPUT_FILES.articles), topArticles);
  writeJson(path.join(config.outputDir, OUTPUT_FILES.buildReport), buildReport);
  writeJson(path.join(config.outputDir, OUTPUT_FILES.cache), nextCache);
  writeJson(path.join(config.outputDir, OUTPUT_FILES.siteConfig), siteConfig);

  return {
    config,
    allArticles,
    topArticles,
    buildReport,
    siteConfig,
    cache: nextCache,
  };
}

async function main() {
  const result = await buildFeeds();
  const { summary } = result.buildReport;

  console.log(`\n🎉 完成！成功更新 ${summary.successCount} 个，命中缓存 ${summary.cachedCount} 个`);
  console.log(`⚠️  使用旧缓存 ${summary.staleCount} 个，彻底失败 ${summary.failedCount} 个`);
  console.log(`📝 共聚合 ${summary.totalArticles} 篇文章，保留最新 ${summary.outputArticles} 篇`);
  console.log(`💾 输出目录: ${result.config.outputDir}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('❌ 执行失败:', err);
    process.exit(1);
  });
}

module.exports = {
  OUTPUT_FILES,
  buildFeeds,
  buildSiteConfig,
  cleanContent,
  extractLink,
  extractText,
  fetchRSS,
  formatDate,
  getRuntimeConfig,
  getSafeFileName,
  normalizeArticle,
  parseAtom,
  parseFeed,
  parseRDF,
  parseRSS2,
  processFeed,
  readJson,
  sortArticles,
  writeJson,
};
