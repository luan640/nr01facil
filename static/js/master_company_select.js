(() => {
  const initCompanySelect = () => {
    const form = document.querySelector('[data-company-select-form]');
    if (!form || form.dataset.companySelectBound === '1') return;

    const selectRoot = form.querySelector('[data-company-select]');
    const trigger = form.querySelector('[data-company-select-trigger]');
    const label = form.querySelector('[data-company-select-label]');
    const valueInput = form.querySelector('[data-company-select-value]');
    const dropdown = form.querySelector('[data-company-select-dropdown]');
    const list = form.querySelector('[data-company-select-list]');
    const searchInput = form.querySelector('[data-company-search]');
    const optionsUrl = form.dataset.companyOptionsUrl;
    const pageSize = Number(form.dataset.pageSize || '10');

    if (!selectRoot || !trigger || !label || !valueInput || !dropdown || !list || !optionsUrl) {
      return;
    }

    form.dataset.companySelectBound = '1';

    let page = 0;
    let loading = false;
    let hasNext = true;
    const seenIds = new Set();
    let currentQuery = '';
    let debounceTimer = null;

  const setOpen = (isOpen) => {
    selectRoot.classList.toggle('is-open', isOpen);
    trigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    if (isOpen) {
      dropdown.style.display = 'block';
      if (searchInput) {
        searchInput.focus();
      }
      if (page === 0 && !loading) {
        resetAndLoad();
      }
    } else {
      dropdown.style.display = '';
    }
  };

  const setLoadingState = (isLoading) => {
    loading = isLoading;
  };

  const setListMessage = (message) => {
    list.innerHTML = '';
    const item = document.createElement('li');
    item.className = 'company-select__empty';
    item.textContent = message;
    list.appendChild(item);
  };

  const setBottomLoading = (isLoading) => {
    const existing = list.querySelector('[data-company-loading]');
    if (isLoading) {
      if (existing) return;
      const item = document.createElement('li');
      item.className = 'company-select__empty';
      item.dataset.companyLoading = '1';
      item.textContent = 'Carregando...';
      list.appendChild(item);
    } else if (existing) {
      existing.remove();
    }
  };

  const appendCompanies = (companies) => {
    companies.forEach((company) => {
      const id = String(company.id);
      if (seenIds.has(id)) return;
      seenIds.add(id);

      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'company-select__option';
      button.dataset.companyId = id;
      button.textContent = company.name;
      button.addEventListener('click', () => {
        valueInput.value = id;
        label.textContent = company.name;
        trigger.classList.remove('company-select__trigger--error');
        trigger.classList.add('is-loading');
        const chartsSection = document.querySelector('.master-charts');
        if (chartsSection) {
          chartsSection.querySelectorAll('[data-master-loading]').forEach((el) => {
            el.classList.add('is-visible');
          });
        }
        valueInput.dispatchEvent(new Event('change', { bubbles: true }));
        setOpen(false);
      });
      item.appendChild(button);
      list.appendChild(item);
    });
  };

  const loadNextPage = async () => {
    if (loading || !hasNext) return;
    setLoadingState(true);

    try {
      const nextPage = page + 1;
      if (nextPage === 1) {
        setListMessage('Carregando...');
      } else {
        setBottomLoading(true);
      }
      const response = await fetch(
        `${optionsUrl}?page=${encodeURIComponent(nextPage)}&page_size=${encodeURIComponent(pageSize)}&q=${encodeURIComponent(currentQuery)}`,
        {
          headers: { 'X-Requested-With': 'XMLHttpRequest' },
          credentials: 'same-origin',
        }
      );
      if (!response.ok) {
        throw new Error('request_failed');
      }
      const payload = await response.json();
      const companies = Array.isArray(payload.companies) ? payload.companies : [];

      if (nextPage === 1) {
        list.innerHTML = '';
        if (companies.length === 0) {
          setListMessage('Sem empresas');
        }
      }

      appendCompanies(companies);

      page = payload.page || nextPage;
      hasNext = Boolean(payload.has_next);
    } catch (err) {
      if (page === 0) {
        setListMessage('Erro ao carregar');
      }
    } finally {
      setBottomLoading(false);
      setLoadingState(false);
    }
  };

  const resetAndLoad = () => {
    page = 0;
    hasNext = true;
    seenIds.clear();
    loadNextPage();
  };

    trigger.addEventListener('click', () => {
      setOpen(!selectRoot.classList.contains('is-open'));
    });

    document.addEventListener('click', (event) => {
      if (!selectRoot.contains(event.target)) {
        setOpen(false);
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    });

    if (searchInput) {
      searchInput.addEventListener('input', () => {
        const nextQuery = searchInput.value.trim();
        if (nextQuery === currentQuery) return;
        currentQuery = nextQuery;
        if (debounceTimer) {
          clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
          resetAndLoad();
        }, 300);
      });
    }

    list.addEventListener('scroll', () => {
      if (!hasNext || loading) return;
      const threshold = 32;
      if (list.scrollTop + list.clientHeight >= list.scrollHeight - threshold) {
        loadNextPage();
      }
    });

    form.addEventListener('submit', (event) => {
      if (!valueInput.value) {
        event.preventDefault();
        trigger.classList.add('company-select__trigger--error');
        setOpen(true);
      }
    });
  };

  document.addEventListener('DOMContentLoaded', initCompanySelect);
  window.addEventListener('page:load', initCompanySelect);
  document.addEventListener('htmx:afterSwap', initCompanySelect);
})();
