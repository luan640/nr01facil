(function () {
  const initReportsCompare = () => {
    const content = document.querySelector('.content[data-page="reports-compare"]');
    if (!content || content.dataset.reportsCompareBound === '1') return;

    const companySelect = content.querySelector('[data-company-select]');
    if (!companySelect) return;

    content.dataset.reportsCompareBound = '1';

    const reportSelects = content.querySelectorAll('[data-report-select]');
    const form = companySelect.closest('form');

    const disableReportSelects = (placeholder) => {
      reportSelects.forEach((select) => {
        select.innerHTML = `<option value="">${placeholder}</option>`;
        select.disabled = true;
      });
    };

    const enableReportSelects = (campaigns) => {
      reportSelects.forEach((select) => {
        select.innerHTML = '<option value="">Selecione</option>';
        campaigns.forEach((campaign) => {
          const option = document.createElement('option');
          option.value = String(campaign.id);
          option.textContent = campaign.label;
          select.appendChild(option);
        });
        select.disabled = false;
      });
    };

    const initialCompanyId = companySelect.value || '';
    if (!initialCompanyId) {
      disableReportSelects('Selecione');
    }

    companySelect.addEventListener('change', async () => {
      const companyId = companySelect.value;
      if (!companyId) {
        disableReportSelects('Selecione');
        return;
      }

      disableReportSelects('Carregando...');

      try {
        const response = await fetch(
          `${window.location.pathname}?load_campaigns=1&company_id=${encodeURIComponent(companyId)}`,
          {
            headers: { 'X-Requested-With': 'XMLHttpRequest' },
            credentials: 'same-origin',
          }
        );
        if (!response.ok) throw new Error('load_failed');
        const data = await response.json();
        const campaigns = Array.isArray(data.campaigns) ? data.campaigns : [];
        enableReportSelects(campaigns);
      } catch (error) {
        disableReportSelects('Erro ao carregar');
      }
    });

    if (form) {
      form.addEventListener('submit', () => {
        const submitBtn = form.querySelector('[data-compare-submit]');
        if (!submitBtn) return;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Carregando...';
      });
    }
  };

  document.addEventListener('DOMContentLoaded', initReportsCompare);
  window.addEventListener('page:load', initReportsCompare);
  document.addEventListener('htmx:afterSwap', initReportsCompare);
})();
