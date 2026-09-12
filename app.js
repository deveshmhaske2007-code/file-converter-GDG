/**
 * PixelForge Studio — Client-Side Image & PDF Converter Engine
 * 100% Client-Side Processing (HTML5 Canvas, jsPDF, JSZip, Vanilla ES6+)
 */

(() => {
  'use strict';

  // --- Global Application State ---
  const state = {
    files: [], // Array of { id, file, name, baseName, size, sizeFormatted, type, originalExt, dataUrl, width, height, rotation: 0 }
    targetFormat: 'pdf', // 'pdf' | 'png' | 'jpg' | 'webp'
    quality: 0.85, // 0.10 to 1.00
    pdfOrientation: 'portrait', // 'portrait' | 'landscape'
    pdfMargin: 'small', // 'none' | 'small' | 'medium'
    pdfMergeMode: 'combine', // 'combine' | 'separate'
    pdfFit: 'contain', // 'contain' | 'cover'
    isProcessing: false,
    cancelRequested: false,
    currentRoute: 'converter',
  };

  // --- DOM Element Cache ---
  const dom = {
    // Navigation & Routing
    navLinks: document.querySelectorAll('.nav-link, .mobile-nav-link'),
    mobileMenuBtn: document.getElementById('mobileMenuBtn'),
    mobileDrawer: document.getElementById('mobileDrawer'),
    viewConverter: document.getElementById('view-converter'),
    viewHowItWorks: document.getElementById('view-how-it-works'),
    viewPrivacy: document.getElementById('view-privacy'),
    presetBanner: document.getElementById('presetBanner'),
    presetIcon: document.getElementById('presetIcon'),
    presetTitle: document.getElementById('presetTitle'),
    presetDesc: document.getElementById('presetDesc'),
    presetDismissBtn: document.getElementById('presetDismissBtn'),

    // Dropzone & File Ingestion
    dropzone: document.getElementById('dropzone'),
    fileInput: document.getElementById('fileInput'),
    browseBtn: document.getElementById('browseBtn'),

    // Global Conversion Controls
    outputFormat: document.getElementById('outputFormat'),
    qualityControlGroup: document.getElementById('qualityControlGroup'),
    qualitySlider: document.getElementById('qualitySlider'),
    qualityValue: document.getElementById('qualityValue'),
    qualityTier: document.getElementById('qualityTier'),

    // PDF Configuration Panel
    pdfSettingsPanel: document.getElementById('pdfSettingsPanel'),
    pdfOrientationControl: document.getElementById('pdfOrientationControl'),
    pdfMarginsControl: document.getElementById('pdfMarginsControl'),
    pdfMergeModeControl: document.getElementById('pdfMergeModeControl'),
    pdfFitControl: document.getElementById('pdfFitControl'),

    // Queue & Preview
    queueSection: document.getElementById('queueSection'),
    emptyGuide: document.getElementById('emptyGuide'),
    previewGrid: document.getElementById('previewGrid'),
    queueCountPill: document.getElementById('queueCountPill'),
    queueTotalSize: document.getElementById('queueTotalSize'),
    addMoreBtn: document.getElementById('addMoreBtn'),
    clearAllBtn: document.getElementById('clearAllBtn'),

    // Action Bar
    actionSummaryHeading: document.getElementById('actionSummaryHeading'),
    actionSummarySub: document.getElementById('actionSummarySub'),
    bottomClearBtn: document.getElementById('bottomClearBtn'),
    convertBtn: document.getElementById('convertBtn'),
    convertBtnText: document.getElementById('convertBtnText'),

    // Progress Modal
    progressModal: document.getElementById('progressModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalSubtitle: document.getElementById('modalSubtitle'),
    progressBarFill: document.getElementById('progressBarFill'),
    progressPercent: document.getElementById('progressPercent'),
    progressItemStatus: document.getElementById('progressItemStatus'),
    cancelProgressBtn: document.getElementById('cancelProgressBtn'),

    // Lightbox Modal
    lightboxModal: document.getElementById('lightboxModal'),
    lightboxFilename: document.getElementById('lightboxFilename'),
    lightboxDimensions: document.getElementById('lightboxDimensions'),
    lightboxImage: document.getElementById('lightboxImage'),
    lightboxCloseBtn: document.getElementById('lightboxCloseBtn'),

    // Toast Container
    toastContainer: document.getElementById('toastContainer'),
  };

  // --- Utility Functions ---

  /** Format raw byte count into readable KB / MB string */
  function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /** Generate unique ID for queue items */
  function generateId() {
    return 'pf_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
  }

  /** Clean and extract base filename without extension */
  function getBaseName(filename) {
    const lastDot = filename.lastIndexOf('.');
    return lastDot === -1 ? filename : filename.substring(0, lastDot);
  }

  /** Extract file extension */
  function getFileExtension(filename) {
    const lastDot = filename.lastIndexOf('.');
    return lastDot === -1 ? '' : filename.substring(lastDot + 1).toLowerCase();
  }

  /** Trigger browser download for a Blob */
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 200);
  }

  /** Display non-intrusive toast notification */
  function showToast(message, type = 'info', duration = 3500) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'fa-info-circle';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'warning') icon = 'fa-triangle-exclamation';
    if (type === 'error') icon = 'fa-circle-xmark';

    toast.innerHTML = `
      <i class="fa-solid ${icon} toast-icon"></i>
      <span class="toast-message">${escapeHtml(message)}</span>
    `;

    dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-fade-out');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, duration);
  }

  /** Escape HTML to prevent XSS in dynamic templates */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- Router & Presets System ---

  const presets = {
    'image-to-pdf': {
      title: 'Image to PDF Mode',
      desc: 'Combine multiple images into one high-quality PDF or save as separate pages.',
      icon: 'fa-file-pdf',
      targetFormat: 'pdf',
    },
    'jpg-to-png': {
      title: 'JPG to PNG Mode',
      desc: 'Convert lossy JPG images into lossless PNG images with 100% fidelity.',
      icon: 'fa-image',
      targetFormat: 'png',
    },
    'webp-to-jpg': {
      title: 'WEBP to JPG Mode',
      desc: 'Transform next-gen WEBP visual files into universally compatible JPGs.',
      icon: 'fa-wand-magic-sparkles',
      targetFormat: 'jpg',
    },
  };

  function handleRoute() {
    const hash = window.location.hash.replace('#', '') || 'converter';
    state.currentRoute = hash;

    // Update active state on navigation links
    dom.navLinks.forEach(link => {
      const target = link.getAttribute('data-nav');
      if (target === hash) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    // Close mobile drawer on route change
    dom.mobileDrawer.classList.remove('open');

    // Switch main view section
    dom.viewConverter.classList.remove('active');
    dom.viewHowItWorks.classList.remove('active');
    dom.viewPrivacy.classList.remove('active');

    if (hash === 'how-it-works') {
      dom.viewHowItWorks.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (hash === 'privacy') {
      dom.viewPrivacy.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Otherwise, we are in Studio view (#converter or specific presets)
    dom.viewConverter.classList.add('active');

    if (presets[hash]) {
      const preset = presets[hash];
      dom.presetBanner.style.display = 'flex';
      dom.presetTitle.textContent = preset.title;
      dom.presetDesc.textContent = preset.desc;
      dom.presetIcon.innerHTML = `<i class="fa-solid ${preset.icon}"></i>`;

      // Pre-configure the tool
      state.targetFormat = preset.targetFormat;
      dom.outputFormat.value = preset.targetFormat;
      updateControlVisibility();
      updateSummary();
    } else {
      dom.presetBanner.style.display = 'none';
    }
  }

  // --- UI Updates & Control Handlers ---

  function updateControlVisibility() {
    const isPdf = state.targetFormat === 'pdf';
    dom.pdfSettingsPanel.style.display = isPdf ? 'block' : 'none';

    // PNG does not support lossy compression slider in Canvas
    const isPng = state.targetFormat === 'png';
    dom.qualityControlGroup.style.opacity = isPng ? '0.45' : '1';
    dom.qualityControlGroup.style.pointerEvents = isPng ? 'none' : 'auto';
    if (isPng) {
      dom.qualityTier.textContent = 'Lossless';
      dom.qualityValue.textContent = '100%';
    } else {
      updateQualityBadge();
    }
  }

  function updateQualityBadge() {
    const q = Math.round(state.quality * 100);
    dom.qualityValue.textContent = `${q}%`;

    let tier = 'Balanced';
    if (q <= 35) tier = 'Maximum Compression';
    else if (q <= 70) tier = 'Standard';
    else if (q <= 90) tier = 'High Quality';
    else tier = 'Lossless / Ultra';

    dom.qualityTier.textContent = tier;
  }

  function updateSummary() {
    const count = state.files.length;
    const totalBytes = state.files.reduce((acc, f) => acc + f.size, 0);

    dom.queueCountPill.textContent = `${count} ${count === 1 ? 'file' : 'files'}`;
    dom.queueTotalSize.textContent = `${formatBytes(totalBytes)} total`;

    const formatNames = {
      pdf: 'PDF Document',
      png: 'PNG Image',
      jpg: 'JPEG Image',
      webp: 'WEBP Modern',
    };

    const targetName = formatNames[state.targetFormat] || state.targetFormat.toUpperCase();
    dom.actionSummaryHeading.textContent = `Ready to convert ${count} ${count === 1 ? 'file' : 'files'} to ${targetName}`;

    if (state.targetFormat === 'pdf') {
      const modeText = state.pdfMergeMode === 'combine' ? 'Combine in 1 PDF' : 'Separate PDFs';
      dom.actionSummarySub.textContent = `Settings: ${modeText} • ${capitalize(state.pdfOrientation)} • Margins: ${capitalize(state.pdfMargin)}`;
    } else if (state.targetFormat === 'png') {
      dom.actionSummarySub.textContent = `Settings: Lossless PNG • ${count > 1 ? 'Bundled in .ZIP' : 'Direct Download'}`;
    } else {
      const q = Math.round(state.quality * 100);
      dom.actionSummarySub.textContent = `Settings: Quality ${q}% • ${count > 1 ? 'Bundled in .ZIP' : 'Direct Download'}`;
    }

    dom.convertBtnText.textContent = count > 1 && (state.targetFormat !== 'pdf' || state.pdfMergeMode === 'separate')
      ? `Convert & Download ZIP (${count})`
      : `Convert & Download (${count})`;
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // --- File Ingestion & Reading ---

  const SUPPORTED_MIME_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    'image/bmp',
  ];

  const SUPPORTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'bmp'];

  function isFileSupported(file) {
    if (file.type && SUPPORTED_MIME_TYPES.includes(file.type.toLowerCase())) {
      return true;
    }
    const ext = getFileExtension(file.name);
    return SUPPORTED_EXTENSIONS.includes(ext);
  }

  async function handleFiles(fileList) {
    if (!fileList || fileList.length === 0) return;

    const filesArray = Array.from(fileList);
    const validFiles = filesArray.filter(isFileSupported);

    if (validFiles.length === 0) {
      showToast('Unsupported file format. Please upload JPG, PNG, WEBP, GIF, SVG, or BMP.', 'warning');
      return;
    }

    if (validFiles.length < filesArray.length) {
      showToast(`Skipped ${filesArray.length - validFiles.length} unsupported file(s).`, 'warning');
    }

    let addedCount = 0;

    for (const file of validFiles) {
      try {
        const item = await readFileAsync(file);
        state.files.push(item);
        addedCount++;
      } catch (err) {
        console.error('Failed to read file:', file.name, err);
        showToast(`Could not process "${file.name}"`, 'error');
      }
    }

    if (addedCount > 0) {
      renderQueue();
      showToast(`Added ${addedCount} image${addedCount > 1 ? 's' : ''} to queue`, 'success');
    }
  }

  function readFileAsync(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        const dataUrl = e.target.result;
        const img = new Image();

        img.onload = () => {
          resolve({
            id: generateId(),
            file: file,
            name: file.name,
            baseName: getBaseName(file.name),
            size: file.size,
            sizeFormatted: formatBytes(file.size),
            type: file.type || 'image/unknown',
            originalExt: getFileExtension(file.name).toUpperCase(),
            dataUrl: dataUrl,
            width: img.naturalWidth || img.width,
            height: img.naturalHeight || img.height,
            rotation: 0,
          });
        };

        img.onerror = () => {
          reject(new Error('Failed to load image element'));
        };

        img.src = dataUrl;
      };

      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }

  // --- Queue & Grid Rendering ---

  function renderQueue() {
    const hasFiles = state.files.length > 0;
    dom.queueSection.style.display = hasFiles ? 'block' : 'none';
    dom.emptyGuide.style.display = hasFiles ? 'none' : 'block';

    if (!hasFiles) {
      dom.previewGrid.innerHTML = '';
      return;
    }

    dom.previewGrid.innerHTML = '';

    state.files.forEach((item, index) => {
      const card = createCardElement(item, index);
      dom.previewGrid.appendChild(card);
    });

    updateSummary();
  }

  function createCardElement(item, index) {
    const card = document.createElement('div');
    card.className = 'preview-card';
    card.setAttribute('data-id', item.id);

    const isFirst = index === 0;
    const isLast = index === state.files.length - 1;

    card.innerHTML = `
      <div class="card-sequence-badge">#${index + 1}</div>
      <div class="thumbnail-wrapper" title="Click to view full preview">
        <img src="${item.dataUrl}" alt="${escapeHtml(item.name)}" class="thumbnail-img" style="transform: rotate(${item.rotation}deg);" />
        <div class="thumbnail-hover-overlay">
          <i class="fa-solid fa-magnifying-glass-plus"></i>
        </div>
      </div>
      <div class="card-details">
        <div class="card-filename" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
        <div class="card-meta-row">
          <span class="card-meta-dim">${item.width} &times; ${item.height}</span>
          <span class="card-meta-format">${escapeHtml(item.originalExt)}</span>
          <span class="card-meta-size">${item.sizeFormatted}</span>
        </div>
      </div>
      <div class="card-toolbar">
        <div class="card-tool-group">
          <button type="button" class="card-action-btn btn-rot-left" title="Rotate 90° Counter-Clockwise">
            <i class="fa-solid fa-rotate-left"></i>
          </button>
          <button type="button" class="card-action-btn btn-rot-right" title="Rotate 90° Clockwise">
            <i class="fa-solid fa-rotate-right"></i>
          </button>
        </div>
        <div class="card-tool-group">
          <button type="button" class="card-action-btn btn-move-up" title="Move Up" ${isFirst ? 'disabled' : ''}>
            <i class="fa-solid fa-chevron-up"></i>
          </button>
          <button type="button" class="card-action-btn btn-move-down" title="Move Down" ${isLast ? 'disabled' : ''}>
            <i class="fa-solid fa-chevron-down"></i>
          </button>
          <button type="button" class="card-action-btn btn-del" title="Remove File">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>
    `;

    // Click thumbnail to inspect in lightbox
    const thumbWrapper = card.querySelector('.thumbnail-wrapper');
    thumbWrapper.addEventListener('click', () => openLightbox(item));

    // Toolbar actions
    const btnRotLeft = card.querySelector('.btn-rot-left');
    btnRotLeft.addEventListener('click', () => rotateItem(item.id, -90));

    const btnRotRight = card.querySelector('.btn-rot-right');
    btnRotRight.addEventListener('click', () => rotateItem(item.id, 90));

    const btnMoveUp = card.querySelector('.btn-move-up');
    btnMoveUp.addEventListener('click', () => moveItem(item.id, 'up'));

    const btnMoveDown = card.querySelector('.btn-move-down');
    btnMoveDown.addEventListener('click', () => moveItem(item.id, 'down'));

    const btnDel = card.querySelector('.btn-del');
    btnDel.addEventListener('click', () => removeItem(item.id));

    return card;
  }

  // --- Card Action Operations ---

  function rotateItem(id, deg) {
    const item = state.files.find(f => f.id === id);
    if (!item) return;

    item.rotation = (item.rotation + deg + 360) % 360;

    // Smooth inline update without re-rendering entire grid
    const card = dom.previewGrid.querySelector(`[data-id="${id}"]`);
    if (card) {
      const img = card.querySelector('.thumbnail-img');
      if (img) {
        img.style.transform = `rotate(${item.rotation}deg)`;
      }
    }
  }

  function moveItem(id, direction) {
    const index = state.files.findIndex(f => f.id === id);
    if (index === -1) return;

    if (direction === 'up' && index > 0) {
      const temp = state.files[index];
      state.files[index] = state.files[index - 1];
      state.files[index - 1] = temp;
      renderQueue();
    } else if (direction === 'down' && index < state.files.length - 1) {
      const temp = state.files[index];
      state.files[index] = state.files[index + 1];
      state.files[index + 1] = temp;
      renderQueue();
    }
  }

  function removeItem(id) {
    const index = state.files.findIndex(f => f.id === id);
    if (index === -1) return;

    state.files.splice(index, 1);
    renderQueue();
    showToast('File removed from queue', 'info', 2000);
  }

  function clearAll() {
    if (state.files.length === 0) return;
    const count = state.files.length;
    state.files = [];
    renderQueue();
    showToast(`Cleared ${count} file${count > 1 ? 's' : ''}`, 'info');
  }

  // --- Lightbox Functions ---

  function openLightbox(item) {
    dom.lightboxFilename.textContent = item.name;
    const rot = item.rotation % 180 !== 0;
    const dispW = rot ? item.height : item.width;
    const dispH = rot ? item.width : item.height;
    dom.lightboxDimensions.innerHTML = `${dispW} &times; ${dispH} px (${item.rotation}&deg;)`;
    dom.lightboxImage.src = item.dataUrl;
    dom.lightboxImage.style.transform = `rotate(${item.rotation}deg)`;
    dom.lightboxModal.classList.add('active');
  }

  function closeLightbox() {
    dom.lightboxModal.classList.remove('active');
  }

  // --- HTML5 Canvas Transformation Engine ---

  /**
   * Renders an item onto an offscreen canvas with full matrix rotation,
   * handles transparency alpha, and exports a Blob with compression.
   */
  function renderToCanvas(item, targetMimeType, quality) {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        try {
          const rotation = item.rotation % 360;
          const isRotated90or270 = rotation === 90 || rotation === 270;

          const canvas = document.createElement('canvas');
          const finalWidth = isRotated90or270 ? item.height : item.width;
          const finalHeight = isRotated90or270 ? item.width : item.height;

          canvas.width = finalWidth;
          canvas.height = finalHeight;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Failed to obtain canvas 2D rendering context'));
            return;
          }

          // Enable high-quality interpolation
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // When target is JPEG, fill with solid white background to avoid transparent alpha turning black
          if (targetMimeType === 'image/jpeg') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }

          // Matrix transformation for rotation
          ctx.save();
          ctx.translate(canvas.width / 2, canvas.height / 2);
          ctx.rotate((rotation * Math.PI) / 180);
          ctx.drawImage(img, -item.width / 2, -item.height / 2);
          ctx.restore();

          // Export to Blob and DataURL
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error('Canvas toBlob exported null'));
                return;
              }
              const dataUrl = canvas.toDataURL(targetMimeType, quality);
              resolve({
                blob: blob,
                dataUrl: dataUrl,
                width: finalWidth,
                height: finalHeight,
              });
            },
            targetMimeType,
            quality
          );
        } catch (err) {
          reject(err);
        }
      };

      img.onerror = () => reject(new Error('Failed to load image for canvas transformation'));
      img.src = item.dataUrl;
    });
  }

  // --- PDF Generation Pipeline (jsPDF) ---

  async function generatePdfPipeline() {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) {
      throw new Error('jsPDF library failed to load from CDN. Please check your internet connection.');
    }

    const isCombine = state.pdfMergeMode === 'combine';

    // Margin mapping in mm
    const marginMap = {
      none: 0,
      small: 10,
      medium: 20,
    };
    const margin = marginMap[state.pdfMargin] ?? 10;

    // A4 dimensions in mm
    const pageW = state.pdfOrientation === 'portrait' ? 210 : 297;
    const pageH = state.pdfOrientation === 'portrait' ? 297 : 210;

    const usableW = pageW - margin * 2;
    const usableH = pageH - margin * 2;

    if (isCombine) {
      // Single combined multi-page PDF
      const doc = new jsPDF({
        orientation: state.pdfOrientation,
        unit: 'mm',
        format: 'a4',
      });

      for (let i = 0; i < state.files.length; i++) {
        if (state.cancelRequested) return false;

        const item = state.files[i];
        updateProgress(
          Math.round(((i + 0.5) / state.files.length) * 100),
          `Rendering page ${i + 1} of ${state.files.length}: ${item.name}...`
        );

        // Always render through canvas to incorporate rotation & compression
        const rendered = await renderToCanvas(item, 'image/jpeg', state.quality);

        if (i > 0) {
          doc.addPage('a4', state.pdfOrientation);
        }

        // Calculate aspect ratio fit
        let renderW, renderH;
        const imgRatio = rendered.width / rendered.height;
        const pageRatio = usableW / usableH;

        if (state.pdfFit === 'cover') {
          // Stretch/Fill printable area
          renderW = usableW;
          renderH = usableH;
        } else {
          // Fit preserving aspect ratio
          if (imgRatio > pageRatio) {
            renderW = usableW;
            renderH = usableW / imgRatio;
          } else {
            renderH = usableH;
            renderW = usableH * imgRatio;
          }
        }

        // Center on page
        const posX = margin + (usableW - renderW) / 2;
        const posY = margin + (usableH - renderH) / 2;

        doc.addImage(rendered.dataUrl, 'JPEG', posX, posY, renderW, renderH, undefined, 'FAST');
      }

      if (state.cancelRequested) return false;

      updateProgress(98, 'Packaging PDF document...');
      doc.save('converted_studio_document.pdf');
      return true;

    } else {
      // Separate PDFs mode
      const pdfBlobs = [];

      for (let i = 0; i < state.files.length; i++) {
        if (state.cancelRequested) return false;

        const item = state.files[i];
        updateProgress(
          Math.round(((i + 0.5) / state.files.length) * 100),
          `Generating PDF ${i + 1} of ${state.files.length}: ${item.name}...`
        );

        const doc = new jsPDF({
          orientation: state.pdfOrientation,
          unit: 'mm',
          format: 'a4',
        });

        const rendered = await renderToCanvas(item, 'image/jpeg', state.quality);

        let renderW, renderH;
        const imgRatio = rendered.width / rendered.height;
        const pageRatio = usableW / usableH;

        if (state.pdfFit === 'cover') {
          renderW = usableW;
          renderH = usableH;
        } else {
          if (imgRatio > pageRatio) {
            renderW = usableW;
            renderH = usableW / imgRatio;
          } else {
            renderH = usableH;
            renderW = usableH * imgRatio;
          }
        }

        const posX = margin + (usableW - renderW) / 2;
        const posY = margin + (usableH - renderH) / 2;

        doc.addImage(rendered.dataUrl, 'JPEG', posX, posY, renderW, renderH, undefined, 'FAST');

        const pdfBlob = doc.output('blob');
        pdfBlobs.push({
          name: `${item.baseName}.pdf`,
          blob: pdfBlob,
        });
      }

      if (state.cancelRequested) return false;

      if (pdfBlobs.length === 1) {
        downloadBlob(pdfBlobs[0].blob, pdfBlobs[0].name);
      } else {
        updateProgress(95, 'Compressing individual PDFs into ZIP archive...');
        await bundleAndDownloadZip(pdfBlobs, 'converted_pdfs.zip');
      }

      return true;
    }
  }

  // --- Batch Image Conversion Pipeline (Canvas + JSZip) ---

  async function generateImagePipeline() {
    const mimeTypes = {
      png: 'image/png',
      jpg: 'image/jpeg',
      webp: 'image/webp',
    };

    const targetMime = mimeTypes[state.targetFormat] || 'image/jpeg';
    const targetExt = state.targetFormat === 'jpg' ? 'jpg' : state.targetFormat;
    const outputBlobs = [];

    for (let i = 0; i < state.files.length; i++) {
      if (state.cancelRequested) return false;

      const item = state.files[i];
      updateProgress(
        Math.round(((i + 0.5) / state.files.length) * 100),
        `Converting ${i + 1} of ${state.files.length}: ${item.name}...`
      );

      const rendered = await renderToCanvas(item, targetMime, state.quality);
      outputBlobs.push({
        name: `${item.baseName}.${targetExt}`,
        blob: rendered.blob,
      });
    }

    if (state.cancelRequested) return false;

    if (outputBlobs.length === 1) {
      updateProgress(100, 'Downloading converted image...');
      downloadBlob(outputBlobs[0].blob, outputBlobs[0].name);
    } else {
      updateProgress(90, 'Packing images into ZIP archive...');
      await bundleAndDownloadZip(outputBlobs, `converted_${targetExt}_images.zip`);
    }

    return true;
  }

  /** Package multiple blobs into a single .zip file using JSZip */
  async function bundleAndDownloadZip(fileEntries, zipFilename) {
    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip library is not loaded. Please verify CDN script tag.');
    }

    const zip = new JSZip();
    const usedNames = new Set();

    fileEntries.forEach((entry, idx) => {
      let finalName = entry.name;
      // Handle duplicate file names in batch
      if (usedNames.has(finalName)) {
        const dot = finalName.lastIndexOf('.');
        const base = dot !== -1 ? finalName.substring(0, dot) : finalName;
        const ext = dot !== -1 ? finalName.substring(dot) : '';
        finalName = `${base}_${idx + 1}${ext}`;
      }
      usedNames.add(finalName);
      zip.file(finalName, entry.blob);
    });

    const zipBlob = await zip.generateAsync(
      { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
      (metadata) => {
        updateProgress(90 + Math.round(metadata.percent * 0.1), `Zipping archive: ${Math.round(metadata.percent)}%`);
      }
    );

    downloadBlob(zipBlob, zipFilename);
  }

  // --- Master Conversion Controller ---

  async function startConversion() {
    if (state.isProcessing) return;
    if (state.files.length === 0) {
      showToast('Please add at least one image to convert.', 'warning');
      return;
    }

    state.isProcessing = true;
    state.cancelRequested = false;

    // Show Progress Modal
    dom.progressModal.classList.add('active');
    updateProgress(0, 'Initializing conversion pipeline...');

    try {
      let success = false;

      if (state.targetFormat === 'pdf') {
        success = await generatePdfPipeline();
      } else {
        success = await generateImagePipeline();
      }

      if (success) {
        updateProgress(100, 'Done!');
        setTimeout(() => {
          dom.progressModal.classList.remove('active');
          showToast('Conversion completed successfully!', 'success');
        }, 600);
      } else {
        dom.progressModal.classList.remove('active');
        showToast('Conversion cancelled by user.', 'info');
      }
    } catch (err) {
      console.error('Conversion Pipeline Error:', err);
      dom.progressModal.classList.remove('active');
      showToast(`Conversion failed: ${err.message || 'Unknown error'}`, 'error', 5000);
    } finally {
      state.isProcessing = false;
      state.cancelRequested = false;
    }
  }

  function updateProgress(percent, statusMessage) {
    const clamped = Math.max(0, Math.min(100, percent));
    dom.progressBarFill.style.width = `${clamped}%`;
    dom.progressPercent.textContent = `${clamped}%`;
    if (statusMessage) {
      dom.progressItemStatus.textContent = statusMessage;
    }
  }

  function cancelConversion() {
    if (!state.isProcessing) return;
    state.cancelRequested = true;
    dom.progressItemStatus.textContent = 'Cancelling...';
  }

  // --- Setup Event Listeners ---

  function setupEventListeners() {
    // 1. SPA Router Hash Change
    window.addEventListener('hashchange', handleRoute);

    // 2. Mobile Menu Drawer Toggle
    dom.mobileMenuBtn.addEventListener('click', () => {
      dom.mobileDrawer.classList.toggle('open');
    });

    // 3. Preset Banner Dismiss
    dom.presetDismissBtn.addEventListener('click', () => {
      dom.presetBanner.style.display = 'none';
    });

    // 4. File Picker Trigger
    dom.browseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dom.fileInput.click();
    });

    dom.addMoreBtn.addEventListener('click', () => {
      dom.fileInput.click();
    });

    dom.fileInput.addEventListener('change', (e) => {
      handleFiles(e.target.files);
      // Reset input value so same files can be re-selected if removed
      dom.fileInput.value = '';
    });

    // 5. Drag & Drop on Dropzone
    dom.dropzone.addEventListener('click', () => {
      dom.fileInput.click();
    });

    dom.dropzone.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dom.dropzone.classList.add('dragover');
    });

    dom.dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dom.dropzone.classList.add('dragover');
    });

    dom.dropzone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Only remove if leaving the dropzone boundary
      if (!dom.dropzone.contains(e.relatedTarget)) {
        dom.dropzone.classList.remove('dragover');
      }
    });

    dom.dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      dom.dropzone.classList.remove('dragover');
      if (e.dataTransfer && e.dataTransfer.files) {
        handleFiles(e.dataTransfer.files);
      }
    });

    // Prevent default window drag/drop opening file in browser
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());

    // 6. Clipboard Paste Support (Ctrl+V screenshots!)
    window.addEventListener('paste', (e) => {
      if (!e.clipboardData || !e.clipboardData.items) return;
      const items = e.clipboardData.items;
      const pastedFiles = [];

      for (let i = 0; i < items.length; i++) {
        if (items[i].kind === 'file' && items[i].type.startsWith('image/')) {
          const blob = items[i].getAsFile();
          if (blob) {
            // Assign a helpful friendly filename for pasted images
            const ext = blob.type.split('/')[1] || 'png';
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(11, 19);
            const renamedFile = new File([blob], `pasted_screenshot_${timestamp}.${ext}`, { type: blob.type });
            pastedFiles.push(renamedFile);
          }
        }
      }

      if (pastedFiles.length > 0) {
        handleFiles(pastedFiles);
        showToast(`Pasted ${pastedFiles.length} image from clipboard!`, 'success');
      }
    });

    // 7. Output Format Selector
    dom.outputFormat.addEventListener('change', (e) => {
      state.targetFormat = e.target.value;
      updateControlVisibility();
      updateSummary();
    });

    // 8. Quality Slider
    dom.qualitySlider.addEventListener('input', (e) => {
      state.quality = parseInt(e.target.value, 10) / 100;
      updateQualityBadge();
      updateSummary();
    });

    // 9. PDF Segmented Controls
    setupSegmentedControl(dom.pdfOrientationControl, (val) => {
      state.pdfOrientation = val;
      updateSummary();
    });

    setupSegmentedControl(dom.pdfMarginsControl, (val) => {
      state.pdfMargin = val;
      updateSummary();
    });

    setupSegmentedControl(dom.pdfMergeModeControl, (val) => {
      state.pdfMergeMode = val;
      updateSummary();
    });

    setupSegmentedControl(dom.pdfFitControl, (val) => {
      state.pdfFit = val;
      updateSummary();
    });

    // 10. Clear Buttons
    dom.clearAllBtn.addEventListener('click', clearAll);
    dom.bottomClearBtn.addEventListener('click', clearAll);

    // 11. Primary Convert Button
    dom.convertBtn.addEventListener('click', startConversion);

    // 12. Progress Modal Cancel Button
    dom.cancelProgressBtn.addEventListener('click', cancelConversion);

    // 13. Lightbox Close
    dom.lightboxCloseBtn.addEventListener('click', closeLightbox);
    dom.lightboxModal.addEventListener('click', (e) => {
      if (e.target === dom.lightboxModal) closeLightbox();
    });

    // 14. Keyboard shortcuts (Escape closes modals)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeLightbox();
      }
    });
  }

  function setupSegmentedControl(container, onChange) {
    const buttons = container.querySelectorAll('.segment-btn');
    buttons.forEach((btn) => {
      btn.addEventListener('click', () => {
        buttons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const val = btn.getAttribute('data-value');
        onChange(val);
      });
    });
  }

  // --- App Initialization ---
  function init() {
    setupEventListeners();
    updateControlVisibility();
    handleRoute();
    updateSummary();
    console.log('%cPixelForge Studio Initialized', 'color: #6366f1; font-weight: bold; font-size: 14px;');
  }

  // Start app when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
