(function () {
  const confirmDialog = (message) => {
    if (window.PlatformDialog && typeof window.PlatformDialog.confirm === 'function') {
      return window.PlatformDialog.confirm(message);
    }
    return Promise.resolve(false);
  };

  const containerId = 'campaigns-table-container';
  const toastStackId = 'floating-toast-stack';

  const openModal = (name) => {
    const modal = document.querySelector(`[data-modal="${name}"]`);
    if (!modal) return;
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.documentElement.classList.add('modal-open');
  };

  const closeModal = (modal) => {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.modal-backdrop.is-open')) {
      document.documentElement.classList.remove('modal-open');
    }
  };

  const replaceTable = (html) => {
    const container = document.getElementById(containerId);
    if (container) {
      container.outerHTML = html;
    }
    consumeInlineNotices();
  };

  const getToastStack = () => {
    let stack = document.getElementById(toastStackId);
    if (!stack) {
      stack = document.createElement('div');
      stack.id = toastStackId;
      stack.className = 'floating-toast-stack';
      document.body.appendChild(stack);
    }
    return stack;
  };

  const showToast = (message, tone = 'success') => {
    const stack = getToastStack();
    const toast = document.createElement('div');
    toast.className = `floating-toast floating-toast--${tone}`;
    toast.textContent = message;
    stack.appendChild(toast);
    window.setTimeout(() => toast.classList.add('is-visible'), 10);
    window.setTimeout(() => {
      toast.classList.remove('is-visible');
      window.setTimeout(() => toast.remove(), 220);
    }, 2500);
  };

  const consumeInlineNotices = () => {
    const container = document.getElementById(containerId);
    if (!container) return;
    const notices = container.querySelectorAll('.notice');
    if (!notices.length) return;

    notices.forEach((notice) => {
      const tone = notice.classList.contains('notice--error')
        ? 'error'
        : notice.classList.contains('notice--info')
          ? 'info'
          : 'success';
      showToast(notice.textContent.trim(), tone);
    });

    const stackGap = container.querySelector('.stack-gap');
    if (stackGap) {
      stackGap.remove();
    }
  };

  const submitAjaxForm = async (form) => {
    const response = await fetch(form.action, {
      method: form.method || 'POST',
      body: new FormData(form),
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    if (!response.ok) {
      throw new Error('Falha ao atualizar campanhas.');
    }
    replaceTable(await response.text());
  };

  const resetForm = (form) => {
    if (!form) return;
    form.reset();
    const selectEls = form.querySelectorAll('select');
    selectEls.forEach((select) => {
      if (select.options.length) {
        select.selectedIndex = 0;
      }
    });
    const asyncSelects = form.querySelectorAll('[data-company-async-select]');
    asyncSelects.forEach((root) => {
      if (typeof root.__companySelectReset === 'function') {
        root.__companySelectReset();
      }
    });
  };

  const setButtonLoading = (button) => {
    if (!button || button.disabled) return null;
    const original = button.textContent || '';
    button.textContent = button.getAttribute('data-loading-text') || 'Salvando...';
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    return () => {
      button.textContent = original;
      button.disabled = false;
      button.removeAttribute('aria-busy');
    };
  };

  const initCompanyAsyncSelects = () => {
    const roots = document.querySelectorAll('[data-company-async-select]');
    roots.forEach((selectRoot) => {
      if (selectRoot.dataset.companySelectBound === '1') return;
      selectRoot.dataset.companySelectBound = '1';

      const trigger = selectRoot.querySelector('[data-company-select-trigger]');
      const label = selectRoot.querySelector('[data-company-select-label]');
      const valueInput = selectRoot.querySelector('[data-company-select-value]');
      const dropdown = selectRoot.querySelector('[data-company-select-dropdown]');
      const list = selectRoot.querySelector('[data-company-select-list]');
      const searchInput = selectRoot.querySelector('[data-company-search]');
      const optionsUrl = selectRoot.dataset.companyOptionsUrl || '';
      const pageSize = Number(selectRoot.dataset.pageSize || '10');

      if (!trigger || !label || !valueInput || !dropdown || !list || !optionsUrl) {
        return;
      }

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
          if (searchInput) searchInput.focus();
          if (page === 0 && !loading) {
            resetAndLoad();
          }
        } else {
          dropdown.style.display = '';
        }
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
            setOpen(false);
          });
          item.appendChild(button);
          list.appendChild(item);
        });
      };

      const loadNextPage = async () => {
        if (loading || !hasNext) return;
        loading = true;
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
          if (!response.ok) throw new Error('request_failed');
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
          loading = false;
        }
      };

      const resetAndLoad = () => {
        page = 0;
        hasNext = true;
        seenIds.clear();
        loadNextPage();
      };

      selectRoot.__companySelectReset = () => {
        page = 0;
        hasNext = true;
        seenIds.clear();
        currentQuery = '';
        if (searchInput) searchInput.value = '';
        list.innerHTML = '';
        valueInput.value = '';
        label.textContent = 'Selecione';
      };

      selectRoot.__companySelectSetValue = (id, name) => {
        valueInput.value = id || '';
        label.textContent = name || 'Selecione';
        trigger.classList.remove('company-select__trigger--error');
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
          if (debounceTimer) clearTimeout(debounceTimer);
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
    });
  };

  document.addEventListener('click', (event) => {
    const openButton = event.target.closest('[data-open-modal]');
    if (openButton) {
      openModal(openButton.getAttribute('data-open-modal'));
      initCompanyAsyncSelects();
      return;
    }

    const qrButton = event.target.closest('[data-open-qr]');
    if (qrButton) {
      const modal = document.querySelector('[data-modal="qr-preview-modal"]');
      if (!modal) return;
      const img = modal.querySelector('[data-qr-image]');
      const loading = modal.querySelector('[data-qr-loading]');
      const download = modal.querySelector('[data-qr-download]');
      const url = qrButton.getAttribute('data-qr-url') || '';
      if (!img || !loading || !download) return;

      img.style.display = 'none';
      img.removeAttribute('src');
      loading.style.display = 'block';
      download.setAttribute('href', url || '#');

      if (url) {
        img.onload = () => {
          loading.style.display = 'none';
          img.style.display = 'block';
        };
        img.onerror = () => {
          loading.textContent = 'Nao foi possivel carregar o QR Code.';
        };
        img.src = url;
      } else {
        loading.textContent = 'QR Code indisponivel.';
      }

      openModal('qr-preview-modal');
      return;
    }

    const editButton = event.target.closest('[data-open-edit-campaign]');
    if (editButton) {
      const editForm = document.querySelector('[data-edit-campaign-form]');
      if (!editForm) return;
      editForm.action = editButton.dataset.updateUrl || '';
      editForm.querySelector('#edit_campaign_title').value = editButton.dataset.title || '';
      const asyncSelect = editForm.querySelector('[data-company-async-select]');
      if (asyncSelect && typeof asyncSelect.__companySelectSetValue === 'function') {
        asyncSelect.__companySelectSetValue(
          editButton.dataset.companyId || '',
          editButton.dataset.companyName || 'Selecione'
        );
      }
      editForm.querySelector('#edit_campaign_start').value = editButton.dataset.startDate || '';
      editForm.querySelector('#edit_campaign_end').value = editButton.dataset.endDate || '';
      editForm.querySelector('#edit_campaign_status').value = editButton.dataset.status || '';
      editForm.dataset.responseCount = editButton.dataset.responseCount || '0';
      editForm.dataset.employeeCount = editButton.dataset.employeeCount || '0';
      const forceField = editForm.querySelector('input[name="force_finish"]');
      if (forceField) {
        forceField.value = '';
      }
      openModal('edit-campaign-modal');
      return;
    }

    const closeButton = event.target.closest('[data-close-modal]');
    if (closeButton) {
      const modal = closeButton.closest('.modal-backdrop');
      if (modal) closeModal(modal);
      return;
    }

    const backdrop = event.target.closest('.modal-backdrop');
    if (backdrop && event.target === backdrop) {
      closeModal(backdrop);
    }
  });

  document.addEventListener('submit', async (event) => {
    const form = event.target;
    const shouldHandle =
      form.matches('[data-campaign-create-form]') ||
      form.matches('[data-edit-campaign-form]') ||
      form.matches('[data-campaign-delete-form]');
    if (!shouldHandle) return;
    if (event.defaultPrevented) return;

    event.preventDefault();

    if (form.matches('[data-edit-campaign-form]')) {
      const statusField = form.querySelector('#edit_campaign_status');
      const statusValue = (statusField?.value || '').toUpperCase();
      const responsesCount = Number.parseInt(form.dataset.responseCount || '0', 10) || 0;
      const employeeCount = Number.parseInt(form.dataset.employeeCount || '0', 10) || 0;
      const hasPendingResponses = responsesCount !== employeeCount;
      const forceField = form.querySelector('input[name="force_finish"]');

      if (forceField) {
        forceField.value = '';
      }

      if (statusValue === 'FINISHED' && hasPendingResponses) {
        const confirmed = await confirmDialog(
          'Ainda há funcionários que não responderam ao questionário. Deseja encerrar mesmo assim?'
        );
        if (!confirmed) {
          return;
        }
        if (forceField) {
          forceField.value = '1';
        }
      }
    }
    const restoreButton = setButtonLoading(event.submitter);
    try {
      await submitAjaxForm(form);
      document.querySelectorAll('.modal-backdrop.is-open').forEach((modal) => closeModal(modal));
      if (form.matches('[data-campaign-create-form]')) {
        resetForm(form);
      }
    } catch (error) {
      form.submit();
      return;
    } finally {
      if (restoreButton) restoreButton();
    }
  });

  consumeInlineNotices();
  initCompanyAsyncSelects();
})();
