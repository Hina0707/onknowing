const pdfAssets = new URL('./vendor/pdfjs/', import.meta.url);
let pdfModule;

function loadPdfModule() {
  pdfModule ??= import('./vendor/pdfjs/pdf.min.mjs').then(module => {
    module.GlobalWorkerOptions.workerSrc = new URL('pdf.worker.min.mjs', pdfAssets).href;
    return module;
  });
  return pdfModule;
}

export function validSourcePage(page, pageCount) {
  return Number.isInteger(page) && page >= 1 && page <= pageCount;
}

export function containsSourceQuote(text, quote) {
  const canonical = value => value.normalize('NFC').replace(/[\s\u00ad\u200b\ufeff]+/gu, '');
  const match = canonical(quote);
  return match.length > 0 && canonical(text).includes(match);
}

export function createSourcePreview(file) {
  const isPdf = /\.pdf$/i.test(file.name);
  let objectUrl;
  let documentPromise;
  let loadingTask;
  let disposed = false;

  function original(page = 0) {
    objectUrl ??= URL.createObjectURL(file);
    return isPdf && page > 0 ? objectUrl + '#page=' + page : objectUrl;
  }

  function openDocument() {
    documentPromise ??= Promise.all([loadPdfModule(), file.arrayBuffer()]).then(([pdfjs, data]) => {
      if (disposed) throw new Error('The source file has changed.');
      loadingTask = pdfjs.getDocument({
        data: new Uint8Array(data),
        cMapUrl: new URL('cmaps/', pdfAssets).href,
        cMapPacked: true,
        standardFontDataUrl: new URL('standard_fonts/', pdfAssets).href,
        wasmUrl: new URL('wasm/', pdfAssets).href,
        iccUrl: new URL('iccs/', pdfAssets).href,
        disableWorkerRendering: true
      });
      return loadingTask.promise;
    });
    return documentPromise;
  }

  async function previewPdf(pageNumber, quote = '') {
    const pdf = await openDocument();
    if (!validSourcePage(pageNumber, pdf.numPages)) return { pageCount: pdf.numPages };
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const scale = Math.min(1000 / viewport.width, 1600 / viewport.height);
    const fitted = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(fitted.width));
    canvas.height = Math.max(1, Math.ceil(fitted.height));
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', '원본 PDF ' + pageNumber + '쪽');
    const textPromise = quote
      ? page.getTextContent().then(({ items }) => containsSourceQuote(items.map(item => item.str ?? '').join(' '), quote))
        .catch(() => false)
      : Promise.resolve(false);
    const [, quoteMatched] = await Promise.all([page.render({ canvas, viewport: fitted }).promise, textPromise]);
    return { pageCount: pdf.numPages, canvas, quoteMatched };
  }

  function dispose() {
    disposed = true;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    if (loadingTask) loadingTask.destroy().catch(() => {});
  }

  return { isPdf, original, previewPdf, dispose };
}
