(function () {
  if (window.__masterTechnicalModalsBound) {
    return;
  }
  window.__masterTechnicalModalsBound = true;

  const containerId = 'technical-table-container';
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

  const setLoadingState = (form, isLoading) => {
    if (!form) return;
    const button = form.querySelector('button[type="submit"]');
    if (!button) return;
    if (isLoading) {
      const loadingText = button.getAttribute('data-loading-text') || 'Salvando...';
      if (!button.dataset.originalText) {
        button.dataset.originalText = button.textContent || '';
      }
      button.textContent = loadingText;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      return;
    }
    if (button.dataset.originalText) {
      button.textContent = button.dataset.originalText;
    }
    button.disabled = false;
    button.removeAttribute('aria-busy');
  };

  const restoreSubmitButton = (form) => {
    setLoadingState(form, false);
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
      throw new Error('Falha ao atualizar responsaveis tecnicos.');
    }
    replaceTable(await response.text());
  };

  document.addEventListener('click', (event) => {
    const openButton = event.target.closest('[data-open-modal]');
    if (openButton) {
      openModal(openButton.getAttribute('data-open-modal'));
      return;
    }

    const editButton = event.target.closest('[data-open-edit-technical]');
    if (editButton) {
      const editForm = document.querySelector('[data-technical-edit-form]');
      if (!editForm) return;
      editForm.action = editButton.dataset.updateUrl || '';
      editForm.querySelector('#edit_tech_name').value = editButton.dataset.name || '';
      editForm.querySelector('#edit_tech_education').value = editButton.dataset.education || '';
      editForm.querySelector('#edit_tech_registration').value = editButton.dataset.registration || '';
      editForm.querySelector('#edit_tech_order').value = editButton.dataset.order || '0';
      const activeInput = editForm.querySelector('[data-edit-technical-active]');
      if (activeInput) {
        activeInput.checked = (editButton.dataset.active || '').toLowerCase() === 'true';
      }
      restoreSubmitButton(editForm);
      openModal('edit-technical-modal');
      return;
    }

    const closeButton = event.target.closest('[data-close-modal]');
    if (closeButton) {
      const modal = closeButton.closest('.modal-backdrop');
      if (modal) {
        const form = modal.querySelector('form');
        restoreSubmitButton(form);
        closeModal(modal);
      }
      return;
    }

    const backdrop = event.target.closest('.modal-backdrop');
    if (backdrop && event.target === backdrop) {
      if (backdrop.hasAttribute('data-no-backdrop-close')) {
        return;
      }
      const form = backdrop.querySelector('form');
      restoreSubmitButton(form);
      closeModal(backdrop);
    }
  });

  document.addEventListener('submit', async (event) => {
    const form = event.target;
    const shouldHandle =
      form.matches('[data-technical-create-form]') ||
      form.matches('[data-technical-edit-form]') ||
      form.matches('[data-technical-toggle-form]') ||
      form.matches('[data-technical-remove-form]');
    if (!shouldHandle) return;
    if (event.defaultPrevented) return;

    event.preventDefault();
    const shouldSetLoading =
      form.matches('[data-technical-create-form]') ||
      form.matches('[data-technical-edit-form]');
    if (shouldSetLoading) {
      setLoadingState(form, true);
    }
    try {
      await submitAjaxForm(form);
      document.querySelectorAll('.modal-backdrop.is-open').forEach((modal) => closeModal(modal));
    } catch (error) {
      form.submit();
    } finally {
      if (shouldSetLoading) {
        restoreSubmitButton(form);
      }
    }
  });

  const runPageHooks = () => {
    consumeInlineNotices();
  };

  const setupConsultancyLogoCropper = () => {
    const logoInput = document.getElementById('consultancy_logo');
    const consultancyForm = document.querySelector('[data-consultancy-profile-form]');
    const cropModal = document.querySelector('[data-modal="consultancy-logo-crop-modal"]');
    const canvas = cropModal ? cropModal.querySelector('[data-logo-crop-canvas]') : null;
    const zoomInput = cropModal ? cropModal.querySelector('[data-logo-crop-zoom]') : null;
    const applyButton = cropModal ? cropModal.querySelector('[data-logo-crop-apply]') : null;
    const cancelButtons = cropModal ? cropModal.querySelectorAll('[data-logo-crop-cancel]') : [];
    const logoPreview = document.querySelector('[data-consultancy-logo-preview]');
    if (!logoInput || !cropModal || !canvas || !zoomInput || !applyButton) return;

    const ctx = canvas.getContext('2d');
    const state = {
      image: null,
      imageUrl: '',
      sourceFileName: '',
      dragging: false,
      startX: 0,
      startY: 0,
      scale: 1,
      minScale: 1,
      maxScale: 3,
      offsetX: 0,
      offsetY: 0,
      hasPendingCrop: false,
    };

    const closeCropper = () => {
      closeModal(cropModal);
    };

    const resetCropper = () => {
      if (state.imageUrl) {
        URL.revokeObjectURL(state.imageUrl);
      }
      state.image = null;
      state.imageUrl = '';
      state.sourceFileName = '';
      state.dragging = false;
    };

    const render = () => {
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#f6f9ff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (!state.image) return;

      const diameter = Math.min(canvas.width, canvas.height) - 24;
      const radius = diameter / 2;
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      const drawWidth = state.image.width * state.scale;
      const drawHeight = state.image.height * state.scale;
      ctx.drawImage(
        state.image,
        centerX - drawWidth / 2 + state.offsetX,
        centerY - drawHeight / 2 + state.offsetY,
        drawWidth,
        drawHeight,
      );
      ctx.restore();

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#1e4f8f';
      ctx.stroke();
    };

    const clampOffsets = () => {
      if (!state.image) return;
      const diameter = Math.min(canvas.width, canvas.height) - 24;
      const drawWidth = state.image.width * state.scale;
      const drawHeight = state.image.height * state.scale;
      const maxX = Math.max((drawWidth - diameter) / 2, 0);
      const maxY = Math.max((drawHeight - diameter) / 2, 0);
      state.offsetX = Math.min(maxX, Math.max(-maxX, state.offsetX));
      state.offsetY = Math.min(maxY, Math.max(-maxY, state.offsetY));
    };

    const openForFile = (file) => {
      if (!file || !file.type.startsWith('image/')) return;
      resetCropper();

      state.sourceFileName = file.name || 'consultoria-logo.png';
      state.imageUrl = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        state.image = image;
        state.minScale = Math.max(canvas.width / image.width, canvas.height / image.height);
        state.maxScale = Math.max(3, state.minScale * 3);
        state.scale = state.minScale;
        state.offsetX = 0;
        state.offsetY = 0;
        zoomInput.min = String(state.minScale);
        zoomInput.max = String(state.maxScale);
        zoomInput.value = String(state.minScale);
        render();
        openModal('consultancy-logo-crop-modal');
      };
      image.src = state.imageUrl;
    };

    const pointerPosition = (event) => {
      const point = event.touches && event.touches[0] ? event.touches[0] : event;
      return { x: point.clientX, y: point.clientY };
    };

    const beginDrag = (event) => {
      if (!state.image) return;
      const point = pointerPosition(event);
      state.dragging = true;
      state.startX = point.x;
      state.startY = point.y;
      canvas.classList.add('is-dragging');
    };

    const moveDrag = (event) => {
      if (!state.dragging) return;
      const point = pointerPosition(event);
      state.offsetX += point.x - state.startX;
      state.offsetY += point.y - state.startY;
      state.startX = point.x;
      state.startY = point.y;
      clampOffsets();
      render();
      if (event.cancelable) event.preventDefault();
    };

    const endDrag = () => {
      state.dragging = false;
      canvas.classList.remove('is-dragging');
    };

    const applyCrop = () => {
      if (!state.image) return;
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = 512;
      exportCanvas.height = 512;
      const exportCtx = exportCanvas.getContext('2d');
      if (!exportCtx) return;

      const ratio = exportCanvas.width / canvas.width;
      const centerX = exportCanvas.width / 2;
      const centerY = exportCanvas.height / 2;
      const radius = (Math.min(exportCanvas.width, exportCanvas.height) - 24 * ratio) / 2;
      const drawWidth = state.image.width * state.scale * ratio;
      const drawHeight = state.image.height * state.scale * ratio;
      const offsetX = state.offsetX * ratio;
      const offsetY = state.offsetY * ratio;

      exportCtx.clearRect(0, 0, exportCanvas.width, exportCanvas.height);
      exportCtx.save();
      exportCtx.beginPath();
      exportCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      exportCtx.closePath();
      exportCtx.clip();
      exportCtx.drawImage(
        state.image,
        centerX - drawWidth / 2 + offsetX,
        centerY - drawHeight / 2 + offsetY,
        drawWidth,
        drawHeight,
      );
      exportCtx.restore();

      exportCanvas.toBlob((blob) => {
        if (!blob) return;
        const baseName = state.sourceFileName.replace(/\.[^.]+$/, '') || 'consultoria-logo';
        const croppedFile = new File([blob], `${baseName}-crop.png`, { type: 'image/png' });
        const transfer = new DataTransfer();
        transfer.items.add(croppedFile);
        logoInput.files = transfer.files;
        state.hasPendingCrop = false;

        if (logoPreview) {
          logoPreview.src = URL.createObjectURL(croppedFile);
          logoPreview.style.borderRadius = '999px';
          logoPreview.style.width = '56px';
          logoPreview.style.height = '56px';
          logoPreview.style.objectFit = 'cover';
        }

        closeCropper();
      }, 'image/png');
    };

    logoInput.addEventListener('change', (event) => {
      const file = event.target.files && event.target.files[0] ? event.target.files[0] : null;
      if (!file) return;
      state.hasPendingCrop = true;
      openForFile(file);
    });

    zoomInput.addEventListener('input', () => {
      if (!state.image) return;
      state.scale = Number(zoomInput.value || state.minScale);
      clampOffsets();
      render();
    });

    canvas.addEventListener('mousedown', beginDrag);
    canvas.addEventListener('mousemove', moveDrag);
    window.addEventListener('mouseup', endDrag);
    canvas.addEventListener('touchstart', beginDrag, { passive: true });
    canvas.addEventListener('touchmove', moveDrag, { passive: false });
    window.addEventListener('touchend', endDrag, { passive: true });
    applyButton.addEventListener('click', applyCrop);
    cancelButtons.forEach((button) => {
      button.addEventListener('click', () => {
        logoInput.value = '';
        state.hasPendingCrop = false;
        closeCropper();
      });
    });

    if (consultancyForm) {
      consultancyForm.addEventListener('submit', (event) => {
        if (!state.hasPendingCrop) return;
        event.preventDefault();
        openModal('consultancy-logo-crop-modal');
      });
    }
  };

  window.addEventListener('page:load', runPageHooks);
  runPageHooks();
  setupConsultancyLogoCropper();
})();
