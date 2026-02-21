(function () {
  if (!window.__masterDashboardChartsBound) {
    window.__masterDashboardChartsBound = true;
  }

  const segColors = [
    '#4f46e5', '#0ea5e9', '#22c55e', '#f59e0b',
    '#ef4444', '#8b5cf6', '#0f766e', '#db2777',
  ];

  let historyChart = null;
  let activeController = null;
  let requestToken = 0;
  let inFlight = false;
  let lastLoadStart = 0;
  let chartReadyAttempts = 0;

  const clearLoaders = () => {
    document.querySelectorAll('[data-md-loading].is-visible')
      .forEach(el => el.classList.remove('is-visible'));
    const trigger = document.querySelector('[data-company-select-trigger]');
    if (trigger) trigger.classList.remove('is-loading');
  };

  const initCharts = () => {
    const content = document.querySelector('.content[data-page="master-dashboard"]');
    if (!content) return;
    clearLoaders();
    const metricsUrl = content.getAttribute('data-master-metrics-url') || '';
    const select = document.getElementById('master_company_id');
    if (!metricsUrl || !select) { delete content.dataset.masterChartsInit; return; }

    const historyCanvas = document.getElementById('master-eval-history');
    const segmentList   = document.getElementById('master-segment-list');
    if (!historyCanvas || !segmentList) { delete content.dataset.masterChartsInit; return; }

    if (typeof Chart === 'undefined') {
      chartReadyAttempts += 1;
      if (chartReadyAttempts < 30) { delete content.dataset.masterChartsInit; setTimeout(initCharts, 300); }
      return;
    }
    if (content.dataset.masterChartsInit === '1') return;
    content.dataset.masterChartsInit = '1';
    chartReadyAttempts = 0;

    if (activeController) { try { activeController.abort(); } catch (_) {} activeController = null; inFlight = false; }

    const historyLoading  = document.querySelector('[data-md-loading="history"]');
    const segmentsLoading = document.querySelector('[data-md-loading="segments"]');

    const hideLoading = () => {
      clearLoaders();
      if (historyLoading)  historyLoading.classList.remove('is-visible');
      if (segmentsLoading) segmentsLoading.classList.remove('is-visible');
    };

    const renderHistory = (labels, values) => {
      const emptyEl = document.getElementById('md-history-empty');
      if (historyChart) historyChart.destroy();
      if (!labels.length) {
        if (emptyEl) emptyEl.style.display = 'flex';
        historyCanvas.style.display = 'none';
        return;
      }
      if (emptyEl) emptyEl.style.display = 'none';
      historyCanvas.style.display = '';
      historyChart = new Chart(historyCanvas, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Avaliações',
            data: values,
            fill: true,
            tension: 0.4,
            borderColor: '#4f46e5',
            backgroundColor: 'rgba(79,70,229,.12)',
            pointBackgroundColor: '#4f46e5',
            pointRadius: 4,
            pointHoverRadius: 6,
            borderWidth: 2.5,
          }],
        },
        options: {
          responsive: true,
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: ctx => ' ' + ctx.parsed.y + ' avaliações' } },
          },
          scales: {
            y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: 'rgba(0,0,0,.05)' } },
            x: { grid: { display: false } },
          },
        },
      });
    };

    const renderSegments = (labels, values) => {
      if (!labels.length) {
        segmentList.innerHTML = '<div class="md-chart-empty" style="display:flex;">Sem dados para esta empresa.</div>';
        return;
      }
      const maxVal = Math.max(...values, 1);
      segmentList.innerHTML = labels.map((label, idx) => {
        const pct   = Number(values[idx] || 0).toFixed(1);
        const width = ((Number(values[idx] || 0) / maxVal) * 100).toFixed(1);
        const color = segColors[idx % segColors.length];
        return (
          '<div class="md-seg-item">' +
            '<div class="md-seg-row">' +
              '<span class="md-seg-label">' + label + '</span>' +
              '<span class="md-seg-pct">' + pct + '%</span>' +
            '</div>' +
            '<div class="md-seg-track">' +
              '<div class="md-seg-fill" style="width:' + width + '%;background:' + color + ';"></div>' +
            '</div>' +
          '</div>'
        );
      }).join('');
    };

    const loadMetrics = async (companyId, attempt = 0) => {
      if (!companyId) { hideLoading(); return; }
      if (typeof Chart === 'undefined') {
        if (attempt < 8) setTimeout(() => loadMetrics(companyId, attempt + 1), 200);
        else hideLoading();
        return;
      }
      if (activeController) activeController.abort();
      activeController = new AbortController();
      const token = ++requestToken;
      inFlight = true;
      lastLoadStart = Date.now();
      if (historyLoading)  historyLoading.classList.add('is-visible');
      if (segmentsLoading) segmentsLoading.classList.add('is-visible');
      const timeoutId = setTimeout(() => {
        if (token !== requestToken) return;
        try { activeController.abort(); } catch (_) {}
        inFlight = false; hideLoading();
        renderHistory([], []); renderSegments([], []);
      }, 6000);
      try {
        const resp = await fetch(metricsUrl + '?company_id=' + encodeURIComponent(companyId), { signal: activeController.signal });
        if (!resp.ok) return;
        const data = await resp.json();
        if (token !== requestToken) return;
        renderHistory(data.history.labels || [], data.history.values || []);
        renderSegments(data.segments.labels || [], data.segments.values || []);
      } catch (err) {
        if (err && err.name === 'AbortError') return;
        renderHistory([], []); renderSegments([], []);
      } finally {
        clearTimeout(timeoutId); inFlight = false; hideLoading();
      }
    };

    select.addEventListener('change', () => loadMetrics(select.value));
    hideLoading();
    window.addEventListener('pagehide', hideLoading);
    document.addEventListener('visibilitychange', () => { if (document.hidden) hideLoading(); });
    window.addEventListener('focus', hideLoading);
    setInterval(() => {
      if (!inFlight) { hideLoading(); return; }
      if (Date.now() - lastLoadStart > 7000) hideLoading();
    }, 2000);
  };

  const observeContent = () => {
    const observer = new MutationObserver(() => {
      const content = document.querySelector('.content[data-page="master-dashboard"]');
      if (!content || content.dataset.masterChartsInit !== '1') initCharts();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  };

  document.addEventListener('DOMContentLoaded', initCharts);
  window.addEventListener('page:load', initCharts);
  document.addEventListener('htmx:afterSwap', initCharts);
  document.addEventListener('htmx:beforeSwap', () => {
    const content = document.querySelector('.content[data-page="master-dashboard"]');
    if (content) delete content.dataset.masterChartsInit;
    if (activeController) { try { activeController.abort(); } catch (_) {} activeController = null; inFlight = false; }
    clearLoaders();
  });
  observeContent();
  initCharts();
})();
