    // ===== Theme =====
    const themeToggle = document.getElementById('themeToggle');
    const themeIcon = document.getElementById('themeIcon');
    const html = document.documentElement;

    function getStoredTheme() { try { return localStorage.getItem('theme'); } catch(e) { return null; } }
    function setStoredTheme(theme) { try { localStorage.setItem('theme', theme); } catch(e) {} }
    function getPreferredTheme() {
      const stored = getStoredTheme();
      if (stored) return stored;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    function applyTheme(theme) {
      html.setAttribute('data-theme', theme);
      themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
    applyTheme(getPreferredTheme());
    themeToggle.addEventListener('click', () => {
      const current = html.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      setStoredTheme(next);
    });

    // ===== Reading Progress Bar =====
    const readingProgress = document.getElementById('readingProgress');
    function updateReadingProgress() {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      readingProgress.style.width = progress + '%';
    }
    window.addEventListener('scroll', updateReadingProgress, { passive: true });

    // ===== Toast =====
    function showToast(message, type) {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.className = 'toast ' + (type || '');
      requestAnimationFrame(() => toast.classList.add('show'));
      setTimeout(() => toast.classList.remove('show'), 2500);
    }

    // ===== Page Router =====
    const pageHome = document.getElementById('page-home');
    const pageArticles = document.getElementById('page-articles');
    const navLinks = document.querySelectorAll('.nav-links a[data-page]');
    let currentPage = 'home';

    function switchPage(page) {
      // Ensure global access for inline handlers
      window.switchPage = switchPage;
      if (page === currentPage) return;

      const pageWorkflow = document.getElementById('page-workflow');

      const pageMap = { home: pageHome, articles: pageArticles, workflow: pageWorkflow };
      const fromPage = pageMap[currentPage];
      const toPage = pageMap[page];
      const footerContent = document.getElementById('footerContent');

      fromPage.classList.add('exit');
      fromPage.classList.remove('active');

      setTimeout(() => {
        fromPage.classList.remove('exit');
        fromPage.style.display = 'none';
        toPage.style.display = 'block';

        if (page === 'home') {
          footerContent.innerHTML = '<p>This site is open source. <a href="https://github.com/xingmihai/rss-aggregator/edit/main/README.md">Improve this page</a>.</p>';
        } else if (page === 'workflow') {
          footerContent.innerHTML = '<p><span id="footerHomeLink" style="cursor:pointer;color:var(--text-secondary);">RSS 聚合器</span> · 工作流状态实时同步</p>';
          setTimeout(() => {
            const fh = document.getElementById('footerHomeLink');
            if (fh) fh.addEventListener('click', () => switchPage('home'));
          }, 0);
        } else {
          footerContent.innerHTML = '<p><span id="footerHomeLink" style="cursor:pointer;color:var(--text-secondary);">RSS 聚合器</span> · 数据每 15 分钟自动更新</p>';
        setTimeout(() => {
          const fh = document.getElementById('footerHomeLink');
          if (fh) fh.addEventListener('click', () => switchPage('home'));
        }, 0);
        }

        requestAnimationFrame(() => {
          toPage.classList.add('active');
        });

        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 300);

      navLinks.forEach(link => {
        link.classList.toggle('active', link.dataset.page === page);
      });
      document.getElementById('backToHome').style.display = page === 'articles' ? 'inline-flex' : 'none';
      document.getElementById('backToHomeWorkflow').style.display = page === 'workflow' ? 'inline-flex' : 'none';


      currentPage = page;

      if (page === 'articles' && !articlesLoaded) {
        setTimeout(() => loadArticles(), 350);
      }
      if (page === 'workflow' && !wfLoaded) {
        setTimeout(() => loadWorkflows(), 350);
      }
    }

    navLinks.forEach(link => {
      link.addEventListener('click', () => {
        const page = link.dataset.page;
        if (page) switchPage(page);
      });
    });

    document.getElementById('homeLink').addEventListener('click', () => switchPage('home'));
    document.getElementById('gotoArticles').addEventListener('click', () => switchPage('articles'));
    document.getElementById('gotoWorkflow').addEventListener('click', () => switchPage('workflow'));
    document.getElementById('backToHome').addEventListener('click', () => switchPage('home'));
    document.getElementById('backToHomeWorkflow').addEventListener('click', () => switchPage('home'));

    // ===== Articles =====
    const articleList = document.getElementById('articleList');
    const articleCount = document.getElementById('articleCount');
    const searchInput = document.getElementById('searchInput');
    const sourceFilter = document.getElementById('sourceFilter');
    const filterBar = document.getElementById('filterBar');
    const statsPanel = document.getElementById('statsPanel');
    const chartsContainer = document.getElementById('chartsContainer');
    const viewToggle = document.getElementById('viewToggle');

    let allArticles = [];
    let currentFilter = '';
    let currentSource = '';
    let articlesLoaded = false;
    let currentView = 'card';

    function formatDate(dateStr) {
      if (!dateStr) return '';
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      const now = new Date();
      const diff = now - date;
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      if (days === 0) {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        if (hours === 0) {
          const mins = Math.floor(diff / (1000 * 60));
          return mins <= 1 ? '刚刚' : mins + ' 分钟前';
        }
        return hours + ' 小时前';
      }
      if (days === 1) return '昨天';
      if (days < 7) return days + ' 天前';
      if (days < 30) return Math.floor(days / 7) + ' 周前';
      return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).replace(/\//g, '-');
    }

    function formatDateFull(dateStr) {
      if (!dateStr) return '';
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return dateStr;
      return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/\//g, '-');
    }

    function stripHtml(html) {
      const tmp = document.createElement('div');
      tmp.innerHTML = html;
      return tmp.textContent || tmp.innerText || '';
    }

    function truncate(text, max) {
      if (!text) return '';
      text = stripHtml(text).trim();
      if (text.length <= max) return text;
      return text.substring(0, max) + '...';
    }

    function getSources(articles) {
      const sources = new Set();
      articles.forEach(a => sources.add(a.author || a.auther || '未知来源'));
      return Array.from(sources).sort();
    }

    function populateSourceFilter(sources) {
      sourceFilter.innerHTML = '<option value="">全部来源</option>';
      sources.forEach(src => {
        const opt = document.createElement('option');
        opt.value = src;
        opt.textContent = src;
        sourceFilter.appendChild(opt);
      });
    }

    function getFaviconUrl(link) {
      try {
        const urlObj = new URL(link);
        return 'https://favicon.im/' + urlObj.hostname;
      } catch(e) {
        return 'https://favicon.im/example.com';
      }
    }

    // ===== Share Functions =====
    function shareToX(title, link) {
      const text = encodeURIComponent(title);
      const url = encodeURIComponent(link);
      window.open('https://x.com/intent/tweet?text=' + text + '&url=' + url, '_blank', 'noopener');
    }

    function shareToWeibo(title, link) {
      const text = encodeURIComponent(title);
      const url = encodeURIComponent(link);
      window.open('https://service.weibo.com/share/share.php?title=' + text + '&url=' + url, '_blank', 'noopener');
    }

    async function copyLink(link) {
      try {
        await navigator.clipboard.writeText(link);
        showToast('链接已复制到剪贴板', 'success');
      } catch (err) {
        const textarea = document.createElement('textarea');
        textarea.value = link;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('链接已复制到剪贴板', 'success');
      }
    }

    function getShareButtons(title, link) {
      return '<div class="article-share">' +
        '<button class="share-btn x" onclick="event.preventDefault();event.stopPropagation();shareToX(' + JSON.stringify(title).replace(/"/g, '&quot;') + ',' + JSON.stringify(link).replace(/"/g, '&quot;') + ')" title="分享到 X">𝕏 分享</button>' +
        '<button class="share-btn weibo" onclick="event.preventDefault();event.stopPropagation();shareToWeibo(' + JSON.stringify(title).replace(/"/g, '&quot;') + ',' + JSON.stringify(link).replace(/"/g, '&quot;') + ')" title="分享到微博">📢 微博</button>' +
        '<button class="share-btn copy" onclick="event.preventDefault();event.stopPropagation();copyLink(' + JSON.stringify(link).replace(/"/g, '&quot;') + ')" title="复制链接">📋 复制</button>' +
      '</div>';
    }

    // ===== Stats & Charts =====
    function updateStats(articles) {
      const total = articles.length;
      const sources = getSources(articles);
      const today = new Date().toDateString();
      const todayCount = articles.filter(a => {
        const d = new Date(a.date);
        return !isNaN(d) && d.toDateString() === today;
      }).length;

      const latest = articles.length > 0 ? articles[0].date : null;
      const latestStr = latest ? formatDate(latest) : '--';

      document.getElementById('statTotal').textContent = total;
      document.getElementById('statSources').textContent = sources.length;
      document.getElementById('statToday').textContent = todayCount;
      document.getElementById('statLatest').textContent = latestStr;

      statsPanel.style.display = 'grid';
    }

    function getSourceCounts(articles) {
      const counts = {};
      articles.forEach(a => {
        const src = a.author || a.auther || '未知来源';
        counts[src] = (counts[src] || 0) + 1;
      });
      return Object.entries(counts).sort((a, b) => b[1] - a[1]);
    }

    function getSourceColors(count) {
      const colors = [
        '#58a6ff', '#a371f7', '#3fb950', '#d29922', '#f85149',
        '#79c0ff', '#d2a8ff', '#56d364', '#e3b341', '#ffa198',
        '#2f81f7', '#8957e5', '#238636', '#9e6a03', '#da3633'
      ];
      return colors.slice(0, count);
    }

    function renderPieChart(sourceCounts) {
      const container = document.getElementById('pieChart');
      if (!sourceCounts.length) { container.innerHTML = ''; return; }

      const total = sourceCounts.reduce((s, [,c]) => s + c, 0);
      const colors = getSourceColors(sourceCounts.length);
      const isMobile = window.innerWidth <= 640;

      // Compact pie with padding for percentage labels
      const padding = 20;
      const pieSize = isMobile ? 110 : 130;
      const cx = pieSize / 2;
      const cy = pieSize / 2;
      const r = isMobile ? 38 : 46;
      const labelR = isMobile ? 50 : 58;

      // Legend below pie - 2 columns
      const legendItemH = 18;
      const legendCols = 2;
      const legendRows = Math.ceil(sourceCounts.length / legendCols);
      const legendPadding = 8;
      const legendH = legendRows * legendItemH + legendPadding * 2;
      const svgW = isMobile ? 280 : 320;
      const svgH = pieSize + padding * 2 + legendH;

      let svg = '<svg class="svg-chart" viewBox="0 0 ' + svgW + ' ' + svgH + '" style="width:100%;max-width:320px;margin:0 auto;display:block;">';
      // Translate to add padding around pie
      svg += '<g transform="translate(0, ' + padding + ')">';
      let currentAngle = -Math.PI / 2;

      sourceCounts.forEach(([name, count], i) => {
        const angle = (count / total) * 2 * Math.PI;
        const x1 = cx + r * Math.cos(currentAngle);
        const y1 = cy + r * Math.sin(currentAngle);
        const x2 = cx + r * Math.cos(currentAngle + angle);
        const y2 = cy + r * Math.sin(currentAngle + angle);
        const largeArc = angle > Math.PI ? 1 : 0;
        const path = 'M ' + cx + ' ' + cy + ' L ' + x1 + ' ' + y1 + ' A ' + r + ' ' + r + ' 0 ' + largeArc + ' 1 ' + x2 + ' ' + y2 + ' Z';
        const midAngle = currentAngle + angle / 2;
        const lx = cx + labelR * Math.cos(midAngle);
        const ly = cy + labelR * Math.sin(midAngle);
        const pct = Math.round((count / total) * 100);

        svg += '<path class="svg-chart-pie-segment" d="' + path + '" fill="' + colors[i] + '" data-name="' + name + '" data-count="' + count + '" data-pct="' + pct + '"/>';
        if (pct >= 5) {
          svg += '<text x="' + lx + '" y="' + ly + '" text-anchor="middle" dominant-baseline="middle" fill="#fff" font-size="8" font-weight="600">' + pct + '%</text>';
        }
        currentAngle += angle;
      });

      svg += '</g>';
      // Legend below pie - 2 columns
      const legendY = pieSize + padding * 2 + legendPadding;
      const colWidth = svgW / legendCols;
      const maxLabelLen = isMobile ? 7 : 10;
      sourceCounts.forEach(([name, count], i) => {
        const col = i % legendCols;
        const row = Math.floor(i / legendCols);
        const x = col * colWidth + 10;
        const y = legendY + row * legendItemH;
        const displayName = name.length > maxLabelLen ? name.substring(0, maxLabelLen) + '...' : name;
        svg += '<rect x="' + x + '" y="' + (y - 5) + '" width="7" height="7" fill="' + colors[i] + '" rx="2"/>';
        svg += '<text x="' + (x + 11) + '" y="' + (y + 1) + '" class="svg-chart-legend" font-size="10">' + displayName + ' (' + count + ')</text>';
      });

      svg += '</svg>';
      container.innerHTML = svg;
    }

    function renderBarChart(sourceCounts) {
      const container = document.getElementById('barChart');
      if (!sourceCounts.length) { container.innerHTML = ''; return; }

      const isMobile = window.innerWidth <= 640;
      const maxCount = Math.max(...sourceCounts.map(([,c]) => c));
      const colors = getSourceColors(sourceCounts.length);
      const barHeight = isMobile ? 20 : 24;
      const gap = isMobile ? 8 : 10;
      const chartHeight = sourceCounts.length * (barHeight + gap) + 20;
      const chartWidth = isMobile ? 340 : 400;
      const labelWidth = isMobile ? 70 : 100;
      const barMaxWidth = chartWidth - labelWidth - (isMobile ? 30 : 40);

      let svg = '<svg class="svg-chart" viewBox="0 0 ' + chartWidth + ' ' + chartHeight + '" style="width:100%;max-width:500px;">';

      sourceCounts.forEach(([name, count], i) => {
        const y = 10 + i * (barHeight + gap);
        const barW = (count / maxCount) * barMaxWidth;
        const color = colors[i];

        svg += '<text x="8" y="' + (y + barHeight / 2 + 4) + '" text-anchor="start" class="svg-chart-label">' + name + '</text>';
        svg += '<rect x="' + (labelWidth + 8) + '" y="' + y + '" width="' + barW + '" height="' + barHeight + '" rx="4" class="svg-chart-bar" fill="' + color + '"/>';
        svg += '<text x="' + (labelWidth + 8 + barW + 6) + '" y="' + (y + barHeight / 2 + 4) + '" class="svg-chart-value">' + count + '</text>';
      });

      svg += '</svg>';
      container.innerHTML = svg;
    }

    function renderFreqChart(articles) {
      const container = document.getElementById('freqChart');
      if (!articles.length) { container.innerHTML = ''; return; }

      const days = 7;
      const now = new Date();
      const dayLabels = [];
      const dayData = [];
      const sources = getSources(articles);
      const colors = getSourceColors(sources.length);
      const sourceDayCounts = {};

      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const label = (d.getMonth() + 1) + '/' + d.getDate();
        dayLabels.push(label);
        dayData.push(d.toDateString());
      }

      sources.forEach(src => {
        sourceDayCounts[src] = dayData.map(dayStr => {
          return articles.filter(a => {
            const ad = new Date(a.date);
            return (a.author || a.auther || '未知来源') === src && !isNaN(ad) && ad.toDateString() === dayStr;
          }).length;
        });
      });

      const isMobile = window.innerWidth <= 640;
      const maxVal = Math.max(1, ...Object.values(sourceDayCounts).flat());

      // Chart dimensions - fixed for 7 days
      const chartW = isMobile ? 340 : 600;
      const chartPlotH = isMobile ? 140 : 170;
      const padL = isMobile ? 28 : 36;
      const padR = isMobile ? 8 : 12;
      const padT = isMobile ? 8 : 12;
      const padB = isMobile ? 28 : 32;
      const plotW = chartW - padL - padR;
      const plotH = chartPlotH - padT - padB;
      const groupW = plotW / dayLabels.length;
      const barW = Math.max(4, (groupW / (sources.length + 1)) - 2);

      // Legend area below chart - single row, centered
      const legendItemW = isMobile ? 90 : 120;
      const legendH = 28;
      const chartH = chartPlotH + legendH;

      let svg = '<svg class="svg-chart" viewBox="0 0 ' + chartW + ' ' + chartH + '" style="width:100%;">';

      // Grid lines
      for (let i = 0; i <= 4; i++) {
        const y = padT + (plotH / 4) * i;
        const val = Math.round(maxVal * (1 - i / 4));
        svg += '<line x1="' + padL + '" y1="' + y + '" x2="' + (chartW - padR) + '" y2="' + y + '" class="svg-chart-gridline"/>';
        svg += '<text x="' + (padL - 4) + '" y="' + (y + 3) + '" text-anchor="end" class="svg-chart-label" font-size="9">' + val + '</text>';
      }

      // Bars
      dayLabels.forEach((label, dayIdx) => {
        const gx = padL + dayIdx * groupW;
        sources.forEach((src, srcIdx) => {
          const count = sourceDayCounts[src][dayIdx];
          if (count > 0) {
            const bh = (count / maxVal) * plotH;
            const bx = gx + (groupW - sources.length * barW) / 2 + srcIdx * barW;
            const by = padT + plotH - bh;
            svg += '<rect x="' + bx + '" y="' + by + '" width="' + barW + '" height="' + bh + '" rx="2" fill="' + colors[srcIdx] + '" opacity="0.85"/>';
          }
        });
        // X label - always show for 7 days
        svg += '<text x="' + (gx + groupW / 2) + '" y="' + (chartPlotH - 6) + '" text-anchor="middle" class="svg-chart-label" font-size="9">' + label + '</text>';
      });

      // Legend - single row, evenly spaced, no overlap
      const legendY = chartPlotH + 14;
      const totalLegendW = sources.length * legendItemW;
      const startX = (chartW - totalLegendW) / 2;
      sources.forEach((src, i) => {
        const lx = startX + i * legendItemW;
        const maxNameLen = isMobile ? 5 : 8;
        const displayName = src.length > maxNameLen ? src.substring(0, maxNameLen) + '...' : src;
        svg += '<rect x="' + lx + '" y="' + (legendY - 5) + '" width="8" height="8" fill="' + colors[i] + '" rx="2"/>';
        svg += '<text x="' + (lx + 12) + '" y="' + (legendY + 2) + '" class="svg-chart-legend" font-size="10">' + displayName + '</text>';
      });

      svg += '</svg>';
      container.innerHTML = svg;
    }

    function renderCharts(articles) {
      const sourceCounts = getSourceCounts(articles);
      renderPieChart(sourceCounts);
      renderBarChart(sourceCounts);
      renderFreqChart(articles);
      chartsContainer.style.display = 'grid';

      // Render new features
      renderSourceHealth(articles);
      renderTrendChart(articles);
      renderTagCloud(articles);

      // Trigger scroll reveal
      setTimeout(initScrollReveal, 100);
    }

    // ===== Scroll Reveal =====
    function initScrollReveal() {
      const reveals = document.querySelectorAll('.reveal, .reveal-scale');
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
          }
        });
      }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

      reveals.forEach(el => observer.observe(el));
    }

    // ===== Source Health =====
    function renderSourceHealth(articles) {
      const container = document.getElementById('sourceHealth');
      const sources = getSources(articles);
      const now = new Date();
      const threeDays = 3 * 24 * 60 * 60 * 1000;
      const week = 7 * 24 * 60 * 60 * 1000;

      const healthData = sources.map(src => {
        const srcArticles = articles.filter(a => (a.author || a.auther || '未知来源') === src);
        const latest = srcArticles.length > 0 ? new Date(srcArticles[0].date) : null;
        if (!latest || isNaN(latest)) return { name: src, status: 'unknown', diff: Infinity };
        const diff = now - latest;
        let status = 'active';
        if (diff > week) status = 'error';
        else if (diff > threeDays) status = 'warning';
        return { name: src, status, diff, count: srcArticles.length };
      });

      const html = healthData.map(h => {
        const statusText = h.status === 'active' ? '正常' : h.status === 'warning' ? '3天未更新' : '7天未更新';
        const statusClass = h.status === 'active' ? 'active' : h.status === 'warning' ? 'warning' : 'error';
        return '<div class="health-item">' +
          '<span class="health-dot ' + statusClass + '"></span>' +
          '<span class="health-name">' + h.name + '</span>' +
          '<span class="health-status">' + statusText + ' · ' + h.count + '篇</span>' +
        '</div>';
      }).join('');

      container.innerHTML = html;
      document.getElementById('sourceHealthContainer').style.display = 'block';
    }

    // ===== Trend Chart (30 days) =====
    function renderTrendChart(articles) {
      const container = document.getElementById('trendChart');
      if (!articles.length) { container.innerHTML = ''; return; }

      const days = 30;
      const now = new Date();
      const dayLabels = [];
      const dayCounts = [];

      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const label = (d.getMonth() + 1) + '/' + d.getDate();
        dayLabels.push(label);
        const dayStr = d.toDateString();
        dayCounts.push(articles.filter(a => {
          const ad = new Date(a.date);
          return !isNaN(ad) && ad.toDateString() === dayStr;
        }).length);
      }

      const maxVal = Math.max(1, ...dayCounts);
      const isMobile = window.innerWidth <= 640;
      const chartW = isMobile ? 340 : 600;
      const chartH = isMobile ? 160 : 200;
      const padL = isMobile ? 28 : 40;
      const padR = isMobile ? 8 : 16;
      const padT = isMobile ? 12 : 16;
      const padB = isMobile ? 28 : 32;
      const plotW = chartW - padL - padR;
      const plotH = chartH - padT - padB;
      const stepX = plotW / (dayLabels.length - 1);

      let svg = '<svg class="svg-chart" viewBox="0 0 ' + chartW + ' ' + chartH + '" style="width:100%;">';

      // Grid lines
      for (let i = 0; i <= 4; i++) {
        const y = padT + (plotH / 4) * i;
        const val = Math.round(maxVal * (1 - i / 4));
        svg += '<line x1="' + padL + '" y1="' + y + '" x2="' + (chartW - padR) + '" y2="' + y + '" class="svg-chart-gridline"/>';
        svg += '<text x="' + (padL - 4) + '" y="' + (y + 3) + '" text-anchor="end" class="svg-chart-label" font-size="9">' + val + '</text>';
      }

      // Area fill
      let areaPath = 'M ' + padL + ' ' + (padT + plotH);
      const points = [];
      dayCounts.forEach((count, i) => {
        const x = padL + i * stepX;
        const y = padT + plotH - (count / maxVal) * plotH;
        points.push({x, y});
        areaPath += ' L ' + x + ' ' + y;
      });
      areaPath += ' L ' + (padL + plotW) + ' ' + (padT + plotH) + ' Z';

      svg += '<path d="' + areaPath + '" fill="var(--accent-soft)" opacity="0.5"/>';

      // Line
      let linePath = '';
      points.forEach((p, i) => {
        linePath += (i === 0 ? 'M' : 'L') + ' ' + p.x + ' ' + p.y;
      });
      svg += '<path d="' + linePath + '" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';

      // Points
      points.forEach((p, i) => {
        if (dayCounts[i] > 0) {
          svg += '<circle cx="' + p.x + '" cy="' + p.y + '" r="3" fill="var(--accent)" stroke="var(--bg-primary)" stroke-width="2"/>';
        }
      });

      // X labels - show every 5th day on mobile
      dayLabels.forEach((label, i) => {
        const show = !isMobile || i % 5 === 0 || i === dayLabels.length - 1;
        if (show) {
          const x = padL + i * stepX;
          svg += '<text x="' + x + '" y="' + (chartH - 8) + '" text-anchor="middle" class="svg-chart-label" font-size="9">' + label + '</text>';
        }
      });

      svg += '</svg>';
      container.innerHTML = svg;
      document.getElementById('trendContainer').style.display = 'block';
    }

    // ===== Tag Cloud =====
    function renderTagCloud(articles) {
      const container = document.getElementById('tagCloud');
      if (!articles.length) { container.innerHTML = ''; return; }

      // Extract keywords from titles
      const stopWords = new Set(['的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这', '那', '吗', '吧', '呢', '啊', '哦', '嗯', '与', '及', '等', '或', '但', '而', '为', '以', '被', '让', '从', '把', '给', '向', '对', '关于', '如何', '什么', '怎么', '为什么', '还是', '或者', '以及', '并且', '不过', '然后', '因为', '所以', '如果', '虽然', '但是', 'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can', 'shall', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while', 'about', 'against', 'among', 'around', 'behind', 'beyond', 'despite', 'except', 'following', 'like', 'near', 'off', 'over', 'past', 'since', 'till', 'upon', 'within', 'without']);

      const wordCounts = {};
      articles.forEach(a => {
        const title = (a.title || '').replace(/[^一-龥a-zA-Z0-9]/g, ' ');
        const words = title.split(/\s+/).filter(w => w.length >= 2 && !stopWords.has(w.toLowerCase()));
        words.forEach(w => {
          wordCounts[w] = (wordCounts[w] || 0) + 1;
        });
      });

      const sorted = Object.entries(wordCounts).sort((a, b) => b[1] - a[1]).slice(0, 20);
      if (!sorted.length) { container.innerHTML = ''; return; }

      const maxCount = sorted[0][1];
      const html = sorted.map(([word, count]) => {
        const size = 0.8 + (count / maxCount) * 0.15; // 0.8 - 0.95em
        const opacity = 0.6 + (count / maxCount) * 0.4;
        return '<button class="tag-item" onclick="filterByTag(' + JSON.stringify(word).replace(/"/g, '&quot;') + ')" style="font-size:' + size.toFixed(2) + 'em;opacity:' + opacity.toFixed(2) + '">' +
          word + '<span class="tag-count">' + count + '</span></button>';
      }).join('');

      container.innerHTML = html;
      document.getElementById('tagCloudContainer').style.display = 'block';
    }

    function filterByTag(tag) {
      searchInput.value = tag;
      currentFilter = tag;
      filterArticles();
      showToast('已筛选标签: ' + tag, 'success');
    }

    // ===== Render Articles =====
    function renderCardView(articles) {
      if (!articles || articles.length === 0) {
        articleList.innerHTML = '<div class="empty-state"><div class="icon">📭</div><div>暂无文章，请检查 RSS 源配置。</div></div>';
        articleCount.textContent = '';
        return;
      }

      articleCount.textContent = '共 ' + articles.length + ' 篇';

      const html = articles.map((article, index) => {
        const title = article.title || '无标题';
        const author = article.author || article.auther || '未知来源';
        const date = formatDate(article.date);
        const link = article.link || '#';
        const summary = truncate(article.content, 120);
        const faviconUrl = getFaviconUrl(link);

        return '<a href="' + link + '" target="_blank" rel="noopener" class="article-card" style="animation-delay:' + (index * 0.05) + 's">' +
          '<div class="article-card-header">' +
            '<div class="article-title">' + title + '</div>' +
            '<span class="article-external">↗</span>' +
          '</div>' +
          '<div class="article-meta">' +
            '<span class="article-source">' +
              '<span class="source-favicon-wrap"><img src="' + faviconUrl + '" alt="" class="source-favicon" data-favicon></span>' +
              author + '</span>' +
            '<span class="article-date">' + date + '</span>' +
          '</div>' +
          (summary ? '<div class="article-summary">' + summary + '</div>' : '') +
          getShareButtons(title, link) +
        '</a>';
      }).join('');

      articleList.innerHTML = '<div class="article-list">' + html + '</div>';

      requestAnimationFrame(() => {
        document.querySelectorAll('.article-card').forEach((card, i) => {
          setTimeout(() => card.classList.add('visible'), i * 50);
        });
        document.querySelectorAll('[data-favicon]').forEach(img => {
          img.onerror = function() { this.style.opacity = 0; };
        });
      });
    }

    function renderTimelineView(articles) {
      if (!articles || articles.length === 0) {
        articleList.innerHTML = '<div class="empty-state"><div class="icon">📭</div><div>暂无文章，请检查 RSS 源配置。</div></div>';
        articleCount.textContent = '';
        return;
      }

      articleCount.textContent = '共 ' + articles.length + ' 篇';

      // Group by date
      const groups = {};
      articles.forEach(a => {
        const d = new Date(a.date);
        const key = !isNaN(d) ? d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }) : '未知日期';
        if (!groups[key]) groups[key] = [];
        groups[key].push(a);
      });

      let html = '<div class="timeline-view">';
      Object.entries(groups).forEach(([dateKey, items]) => {
        html += '<div class="timeline-group">';
        items.forEach((article, idx) => {
          const title = article.title || '无标题';
          const author = article.author || article.auther || '未知来源';
          const link = article.link || '#';
          const summary = truncate(article.content, 100);
          const faviconUrl = getFaviconUrl(link);

          html += '<div class="timeline-item" style="animation-delay:' + (idx * 0.05) + 's">' +
            '<div class="timeline-date">' + dateKey + ' · ' + formatDateFull(article.date) + '</div>' +
            '<div class="timeline-content">' +
              '<div class="timeline-title"><a href="' + link + '" target="_blank" rel="noopener">' + title + '</a></div>' +
              '<div class="timeline-meta">' +
                '<span class="article-source">' +
                  '<span class="source-favicon-wrap"><img src="' + faviconUrl + '" alt="" class="source-favicon" data-favicon></span>' +
                  author + '</span>' +
              '</div>' +
              (summary ? '<div class="article-summary" style="margin-top:6px;font-size:13px;">' + summary + '</div>' : '') +
              getShareButtons(title, link) +
            '</div>' +
          '</div>';
        });
        html += '</div>';
      });
      html += '</div>';

      articleList.innerHTML = html;

      requestAnimationFrame(() => {
        document.querySelectorAll('.timeline-item').forEach((item, i) => {
          setTimeout(() => item.classList.add('visible'), i * 60);
        });
        document.querySelectorAll('[data-favicon]').forEach(img => {
          img.onerror = function() { this.style.opacity = 0; };
        });
      });
    }

    function renderArticles(articles) {
      if (currentView === 'card') {
        renderCardView(articles);
      } else {
        renderTimelineView(articles);
      }
    }

    function filterArticles() {
      let filtered = allArticles;
      if (currentSource) {
        filtered = filtered.filter(a => (a.author || a.auther || '未知来源') === currentSource);
      }
      if (currentFilter) {
        const kw = currentFilter.toLowerCase();
        filtered = filtered.filter(a => {
          const title = (a.title || '').toLowerCase();
          const content = stripHtml(a.content || '').toLowerCase();
          const author = (a.author || a.auther || '').toLowerCase();
          return title.includes(kw) || content.includes(kw) || author.includes(kw);
        });
      }
      renderArticles(filtered);
      if (currentFilter || currentSource) {
        articleCount.textContent = '共 ' + allArticles.length + ' 篇 · 显示 ' + filtered.length + ' 篇';
      }
    }

    searchInput.addEventListener('input', (e) => {
      currentFilter = e.target.value.trim();
      filterArticles();
    });

    sourceFilter.addEventListener('change', (e) => {
      currentSource = e.target.value;
      filterArticles();
    });

    // View Toggle
    viewToggle.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', () => {
        viewToggle.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentView = btn.dataset.view;
        filterArticles();
      });
    });

    function showError() {
      hideSkeleton();
      articleList.innerHTML = '<div class="error-state">' +
        '<div style="font-size:48px;margin-bottom:12px;">⚠️</div>' +
        '<div style="font-size:16px;font-weight:600;margin-bottom:4px;">加载失败</div>' +
        '<div style="font-size:14px;color:var(--text-muted);">请检查网络连接或 RSS 源配置</div>' +
        '<button class="retry-btn" onclick="loadArticles()">重新加载</button>' +
      '</div>';
      articleCount.textContent = '';
    }

    function showSkeleton() {
      // Stats skeleton
      const statsSkeleton = '<div class="skeleton-stats">' +
        '<div class="skeleton-stat"><div class="skeleton-stat-line1"></div><div class="skeleton-stat-line2"></div></div>' +
        '<div class="skeleton-stat"><div class="skeleton-stat-line1"></div><div class="skeleton-stat-line2"></div></div>' +
        '<div class="skeleton-stat"><div class="skeleton-stat-line1"></div><div class="skeleton-stat-line2"></div></div>' +
        '<div class="skeleton-stat"><div class="skeleton-stat-line1"></div><div class="skeleton-stat-line2"></div></div>' +
      '</div>';

      // Charts skeleton
      const chartsSkeleton = '<div class="chart-grid">' +
        '<div class="skeleton-chart"><div class="skeleton-chart-inner"></div></div>' +
        '<div class="skeleton-chart"><div class="skeleton-chart-inner"></div></div>' +
        '<div class="skeleton-chart" style="grid-column:1/-1;"><div class="skeleton-chart-inner"></div></div>' +
      '</div>';

      // Articles skeleton
      const articlesSkeleton = '<div class="article-list">' +
        Array(6).fill('<div class="skeleton-card"><div class="skeleton-line" style="width:70%;margin-bottom:12px;"></div><div class="skeleton-line" style="width:40%;margin-bottom:8px;"></div><div class="skeleton-line" style="width:90%;"></div></div>').join('') +
      '</div>';

      statsPanel.style.display = 'none';
      chartsContainer.style.display = 'none';

      // Insert skeleton before articleList
      const skeletonWrapper = document.createElement('div');
      skeletonWrapper.id = 'skeletonWrapper';
      skeletonWrapper.innerHTML = statsSkeleton + chartsSkeleton + articlesSkeleton;
      articleList.parentNode.insertBefore(skeletonWrapper, articleList);

      articleList.style.display = 'none';
      filterBar.style.display = 'none';
      viewToggle.style.display = 'none';
    }

    function hideSkeleton() {
      const skeletonWrapper = document.getElementById('skeletonWrapper');
      if (skeletonWrapper) skeletonWrapper.remove();
      articleList.style.display = '';
      statsPanel.style.display = 'grid';
      chartsContainer.style.display = 'grid';
      filterBar.style.display = 'flex';
      viewToggle.style.display = 'flex';
    }

    async function loadArticles() {
      showSkeleton();
      try {
        const response = await fetch('/docs/articles.json');
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const articles = await response.json();
        allArticles = articles || [];
        populateSourceFilter(getSources(allArticles));
        updateStats(allArticles);
        renderCharts(allArticles);
        hideSkeleton();
        renderArticles(allArticles);
        articlesLoaded = true;
      } catch (err) {
        console.error('Failed to load articles:', err);
        showError();
      }
    }

    // ===== Back to top =====
    const backToTop = document.getElementById('backToTop');
    window.addEventListener('scroll', () => {
      backToTop.classList.toggle('visible', window.scrollY > 400);
    });
    backToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    // ===== Smooth scroll for anchors =====
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function(e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    // ===== Copy buttons =====
    document.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        const wrapper = btn.closest('.code-block-wrapper');
        const code = wrapper.querySelector('pre code').textContent;
        try {
          await navigator.clipboard.writeText(code);
          const original = btn.textContent;
          btn.textContent = '已复制!';
          btn.classList.add('copied');
          setTimeout(() => { btn.textContent = original; btn.classList.remove('copied'); }, 2000);
        } catch (err) {
          const original = btn.textContent;
          btn.textContent = '复制失败';
          setTimeout(() => { btn.textContent = original; }, 2000);
        }
      });
    });
  

    // ===== Workflow Status Page =====
    const workflowList = document.getElementById('workflowList');
    const workflowCount = document.getElementById('workflowCount');
    const workflowStats = document.getElementById('workflowStats');
    const workflowFilterBar = document.getElementById('workflowFilterBar');
    const wfSearchInput = document.getElementById('wfSearchInput');
    const wfStatusFilter = document.getElementById('wfStatusFilter');
    const wfEventFilter = document.getElementById('wfEventFilter');
    const workflowPagination = document.getElementById('workflowPagination');

    let allWorkflows = [];
    let wfCurrentPage = 1;
    let wfPageSize = 20;
    let wfLoaded = false;
    let wfCurrentFilter = '';
    let wfCurrentStatus = '';
    let wfCurrentEvent = '';

    function formatWorkflowDate(isoStr) {
      if (!isoStr) return '--';
      const date = new Date(isoStr);
      if (isNaN(date.getTime())) return isoStr;
      const now = new Date();
      const diff = now - date;
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      if (days === 0) {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        if (hours === 0) {
          const mins = Math.floor(diff / (1000 * 60));
          return mins <= 1 ? '刚刚' : mins + ' 分钟前';
        }
        return hours + ' 小时前';
      }
      if (days === 1) return '昨天 ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      if (days < 7) return days + ' 天前';
      return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/\//g, '-');
    }

    function formatDuration(created, updated) {
      if (!created || !updated) return '--';
      const start = new Date(created);
      const end = new Date(updated);
      const diff = end - start;
      if (diff < 0 || isNaN(diff)) return '--';
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      if (mins === 0) return secs + 's';
      return mins + 'm ' + secs + 's';
    }

    function getStatusText(status, conclusion) {
      if (status === 'in_progress') return '运行中';
      if (status === 'queued') return '排队中';
      if (status === 'waiting') return '等待中';
      if (conclusion === 'success') return '成功';
      if (conclusion === 'failure') return '失败';
      if (conclusion === 'cancelled') return '已取消';
      if (conclusion === 'skipped') return '已跳过';
      if (conclusion === 'timed_out') return '超时';
      return conclusion || status;
    }

    function getStatusClass(status, conclusion) {
      if (status === 'in_progress') return 'in_progress';
      if (conclusion === 'success') return 'success';
      if (conclusion === 'failure') return 'failure';
      if (conclusion === 'cancelled') return 'cancelled';
      return 'failure';
    }

    function getEventText(event) {
      const map = { 'schedule': '⏰ 定时', 'workflow_dispatch': '👆 手动', 'push': '⬆️ 推送', 'pull_request': '🔀 PR' };
      return map[event] || event;
    }

    function getEventIcon(event) {
      const map = { 'schedule': '⏰', 'workflow_dispatch': '👆', 'push': '⬆️', 'pull_request': '🔀' };
      return map[event] || '⚡';
    }

    function updateWorkflowStats(runs) {
      const total = runs.length;
      const completed = runs.filter(r => r.status === 'completed');
      const successCount = completed.filter(r => r.conclusion === 'success').length;
      const successRate = completed.length > 0 ? Math.round((successCount / completed.length) * 100) : 0;

      let totalDuration = 0;
      let durationCount = 0;
      runs.forEach(r => {
        if (r.created_at && r.updated_at) {
          const d = new Date(r.updated_at) - new Date(r.created_at);
          if (d > 0) { totalDuration += d; durationCount++; }
        }
      });
      const avgDuration = durationCount > 0 ? Math.round(totalDuration / durationCount / 1000) : 0;
      const avgMins = Math.floor(avgDuration / 60);
      const avgSecs = avgDuration % 60;
      const avgStr = avgMins > 0 ? avgMins + 'm ' + avgSecs + 's' : avgSecs + 's';

      const lastRun = runs.length > 0 ? formatWorkflowDate(runs[0].created_at) : '--';

      document.getElementById('wfTotalRuns').textContent = total;
      document.getElementById('wfSuccessRate').textContent = successRate + '%';
      document.getElementById('wfAvgDuration').textContent = avgStr;
      document.getElementById('wfLastRun').textContent = lastRun;

      workflowStats.style.display = 'grid';
      // 手动触发 reveal 动画
      requestAnimationFrame(() => {
        workflowStats.querySelectorAll('.reveal').forEach((el, i) => {
          setTimeout(() => el.classList.add('visible'), i * 80);
        });
      });
    }

    function renderWorkflowRuns(runs, append) {
      if (!runs || runs.length === 0) {
        if (!append) {
          workflowList.innerHTML = '<div class="workflow-empty"><div class="icon">📭</div><div>暂无工作流运行记录</div></div>';
          workflowCount.textContent = '';
        }
        workflowPagination.style.display = 'none';
        return;
      }

      workflowCount.textContent = '共 ' + runs.length + ' 次运行';

      const html = runs.map((run, index) => {
        const statusClass = getStatusClass(run.status, run.conclusion);
        const statusText = getStatusText(run.status, run.conclusion);
        const duration = formatDuration(run.run_started_at || run.created_at, run.updated_at);
        const dateStr = formatWorkflowDate(run.created_at);
        const eventText = getEventText(run.event);
        const commitMsg = run.head_commit ? run.head_commit.message : '无提交信息';
        const branch = run.head_branch || 'main';
        const runUrl = run.html_url || '#';

        return '<div class="workflow-card" data-run-id="' + run.id + '" onclick="toggleWorkflowDetail(' + run.id + ', event)" style="animation-delay:' + (index * 0.04) + 's">' +
          '<div class="workflow-card-header">' +
            '<span class="workflow-status ' + statusClass + '" title="' + statusText + '"></span>' +
            '<span class="workflow-run-number">#' + run.run_number + '</span>' +
            '<span class="workflow-title">' + (run.display_title || run.name || 'Fetch RSS') + '</span>' +
            '<span class="workflow-chevron">▼</span>' +
          '</div>' +
          '<div class="workflow-meta">' +
            '<span class="workflow-meta-item"><span class="meta-icon">' + getEventIcon(run.event) + '</span>' + eventText + '</span>' +
            '<span class="workflow-branch">' + branch + '</span>' +
            '<span class="workflow-meta-item workflow-duration">⏱️ ' + duration + '</span>' +
            '<span class="workflow-meta-item">🕐 ' + dateStr + '</span>' +
          '</div>' +
          '<div class="workflow-commit-msg">💬 ' + commitMsg + '</div>' +
          '<div class="workflow-detail" id="wf-detail-' + run.id + '"></div>' +
        '</div>';
      }).join('');

      if (append) {
        const list = workflowList.querySelector('.workflow-list');
        if (list) {
          const temp = document.createElement('div');
          temp.innerHTML = '<div class="workflow-list">' + html + '</div>';
          list.append(...temp.firstChild.children);
        }
      } else {
        workflowList.innerHTML = '<div class="workflow-list">' + html + '</div>';
      }

      requestAnimationFrame(() => {
        document.querySelectorAll('.workflow-card').forEach((card, i) => {
          setTimeout(() => card.classList.add('visible'), i * 40);
        });
      });
    }

    function toggleWorkflowDetail(runId, event) {
      event.preventDefault();
      event.stopPropagation();
      const card = document.querySelector('.workflow-card[data-run-id="' + runId + '"]');
      const detail = document.getElementById('wf-detail-' + runId);
      if (!card || !detail) return;

      const isOpen = detail.classList.contains('open');

      // Close all other cards
      document.querySelectorAll('.workflow-detail.open').forEach(d => {
        if (d !== detail) {
          d.classList.remove('open');
          d.innerHTML = '';
          delete d.dataset.loaded;
          d.closest('.workflow-card').classList.remove('expanded');
        }
      });

      if (isOpen) {
        detail.classList.remove('open');
        card.classList.remove('expanded');
        detail.innerHTML = '';
        delete detail.dataset.loaded;
      } else {
        card.classList.add('expanded');
        detail.classList.add('open');
        if (!detail.dataset.loaded) {
          loadWorkflowDetail(runId);
        }
      }
    }

    async function loadWorkflowDetail(runId) {
      const detail = document.getElementById('wf-detail-' + runId);
      if (!detail) return;
      detail.innerHTML = '<div class="detail-loading"><div class="spinner"></div><span>正在加载运行详情...</span></div>';

      try {
        const response = await fetch('https://api.github.com/repos/xingmihai/rss-aggregator/actions/runs/' + runId + '/jobs');
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        detail.dataset.loaded = 'true';
        renderWorkflowDetail(runId, data);
      } catch (err) {
        console.error('Failed to load workflow detail:', err);
        detail.innerHTML = '<div class="detail-error">⚠️ 加载详情失败，请检查网络连接</div>';
      }
    }

    function renderWorkflowDetail(runId, data) {
      const detail = document.getElementById('wf-detail-' + runId);
      const run = allWorkflows.find(r => r.id === runId);
      if (!detail) return;

      const jobs = data.jobs || [];
      const runUrl = run && run.html_url ? run.html_url : 'https://github.com/xingmihai/rss-aggregator/actions/runs/' + runId;

      // Summary
      let html = '<div class="detail-summary">';
      html += '<div class="detail-summary-item"><div class="detail-summary-label">运行编号</div><div class="detail-summary-value">#' + (run ? run.run_number : runId) + '</div></div>';
      html += '<div class="detail-summary-item"><div class="detail-summary-label">触发事件</div><div class="detail-summary-value">' + (run ? getEventText(run.event) : '--') + '</div></div>';
      html += '<div class="detail-summary-item"><div class="detail-summary-label">分支</div><div class="detail-summary-value">' + (run ? (run.head_branch || 'main') : '--') + '</div></div>';
      html += '<div class="detail-summary-item"><div class="detail-summary-label">Jobs 数量</div><div class="detail-summary-value">' + jobs.length + '</div></div>';
      html += '</div>';

      // Jobs
      if (jobs.length === 0) {
        html += '<div style="text-align:center;padding:20px 0;color:var(--text-muted);font-size:13px;">暂无 Jobs 数据</div>';
      } else {
        html += '<div class="workflow-jobs">';
        jobs.forEach((job, jobIdx) => {
          const jobStatusClass = job.status === 'in_progress' ? 'in_progress' : (job.conclusion || job.status);
          const jobDuration = formatDuration(job.started_at, job.completed_at);
          const steps = job.steps || [];
          const jobLogUrl = job.html_url || runUrl;

          html += '<div class="workflow-job">' +
            '<div class="job-header" onclick="toggleJobSteps(' + jobIdx + ', ' + runId + ', event)">' +
              '<span class="job-status ' + jobStatusClass + '"></span>' +
              '<a href="' + jobLogUrl + '" target="_blank" rel="noopener" class="job-name" onclick="event.stopPropagation()" title="查看构建日志">' + job.name + '</a>' +
              '<span class="job-duration">' + jobDuration + '</span>' +
              '<span class="job-chevron">▼</span>' +
            '</div>' +
            '<div class="job-steps" id="job-steps-' + runId + '-' + jobIdx + '">' +
              renderSteps(steps, jobLogUrl) +
            '</div>' +
          '</div>';
        });
        html += '</div>';
      }

      // Footer links
      html += '<div class="detail-footer">' +
        '<a href="' + runUrl + '" target="_blank" rel="noopener">🔗 在 GitHub 查看完整日志</a>' +
        '<a href="' + runUrl + '/logs" target="_blank" rel="noopener">📄 查看原始日志</a>' +
      '</div>';

      detail.innerHTML = html;
    }

    function toggleJobSteps(jobIdx, runId, event) {
      // 如果点击的是 Step 行或链接，不执行 Job 头部展开/收起
      if (event.target.closest('.workflow-step') || event.target.closest('a')) return;
      event.preventDefault();
      event.stopPropagation();
      const stepsPanel = document.getElementById('job-steps-' + runId + '-' + jobIdx);
      const header = event.currentTarget;
      if (!stepsPanel) return;
      const isOpen = stepsPanel.classList.contains('open');
      if (isOpen) {
        stepsPanel.classList.remove('open');
        header.classList.remove('expanded');
      } else {
        stepsPanel.classList.add('open');
        header.classList.add('expanded');
      }
    }

    function renderSteps(steps, jobLogUrl) {
      if (!steps || steps.length === 0) return '<div style="padding:8px 0;color:var(--text-muted);font-size:12px;">暂无步骤数据</div>';
      return steps.map(step => {
        let statusClass = step.status === 'in_progress' ? 'in_progress' : (step.conclusion || step.status);
        let statusIcon = '●';
        if (statusClass === 'success') statusIcon = '✓';
        else if (statusClass === 'failure') statusIcon = '✕';
        else if (statusClass === 'skipped') statusIcon = '⊘';
        else if (statusClass === 'in_progress') statusIcon = '◐';
        const stepDuration = formatDuration(step.started_at, step.completed_at);
        const stepLogUrl = jobLogUrl + '#step:' + step.number;
        return '<a href="' + stepLogUrl + '" target="_blank" rel="noopener" class="workflow-step" title="查看此步骤日志" onclick="event.stopPropagation()">' +
          '<span class="step-status ' + statusClass + '">' + statusIcon + '</span>' +
          '<span class="step-name">' + step.name + '</span>' +
          '<span class="step-duration">' + stepDuration + '</span>' +
        '</a>';
      }).join('');
    }

    
    function filterWorkflows() {
      let filtered = allWorkflows;
      if (wfCurrentStatus) {
        filtered = filtered.filter(r => {
          if (wfCurrentStatus === 'in_progress') return r.status === 'in_progress';
          return r.status === 'completed' && r.conclusion === wfCurrentStatus;
        });
      }
      if (wfCurrentEvent) {
        filtered = filtered.filter(r => r.event === wfCurrentEvent);
      }
      if (wfCurrentFilter) {
        const kw = wfCurrentFilter.toLowerCase();
        filtered = filtered.filter(r => {
          const msg = (r.head_commit && r.head_commit.message || '').toLowerCase();
          const title = (r.display_title || '').toLowerCase();
          return msg.includes(kw) || title.includes(kw) || String(r.run_number).includes(kw);
        });
      }
      renderWorkflowRuns(filtered, false);
      workflowCount.textContent = '共 ' + allWorkflows.length + ' 次 · 显示 ' + filtered.length + ' 次';
    }

    wfSearchInput.addEventListener('input', (e) => {
      wfCurrentFilter = e.target.value.trim();
      filterWorkflows();
    });
    wfStatusFilter.addEventListener('change', (e) => {
      wfCurrentStatus = e.target.value;
      filterWorkflows();
    });
    wfEventFilter.addEventListener('change', (e) => {
      wfCurrentEvent = e.target.value;
      filterWorkflows();
    });

    async function loadWorkflows() {
      workflowList.innerHTML = '<div class="loading-state"><div class="spinner"></div><span>正在加载工作流状态...</span></div>';
      try {
        const response = await fetch('https://api.github.com/repos/xingmihai/rss-aggregator/actions/workflows/fetch-rss.yml/runs?per_page=50');
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        allWorkflows = data.workflow_runs || [];
        updateWorkflowStats(allWorkflows);
        renderWorkflowRuns(allWorkflows, false);
        workflowFilterBar.style.display = 'flex';
        workflowPagination.style.display = 'none';
        wfLoaded = true;
      } catch (err) {
        console.error('Failed to load workflows:', err);
        workflowList.innerHTML = '<div class="error-state">' +
          '<div style="font-size:48px;margin-bottom:12px;">⚠️</div>' +
          '<div style="font-size:16px;font-weight:600;margin-bottom:4px;">加载失败</div>' +
          '<div style="font-size:14px;color:var(--text-muted);">无法获取 GitHub Actions 数据，请检查网络连接</div>' +
          '<button class="retry-btn" onclick="loadWorkflows()">重新加载</button>' +
        '</div>';
      }
    }

    function loadMoreWorkflows() {
      // Placeholder for pagination if needed
    }
