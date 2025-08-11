(function () {
  function logEl() {
    return document.getElementById('log');
  }
  function appendLog(msg) {
    const el = logEl();
    if (!el) return;
    el.textContent += (el.textContent ? "\n" : "") + msg;
    el.scrollTop = el.scrollHeight;
  }

  // On Brands page
  document.querySelectorAll('.bulk-brand').forEach(btn => {
    btn.addEventListener('click', function () {
      const brand = this.getAttribute('data-brand');
      if (!brand) return;
      // start SSE
      if (window.es) window.es.close();
      appendLog(`Starting bulk insert for brand: ${decodeURIComponent(brand)}`);
      window.es = new EventSource(`/brands/${brand}/bulk/stream`);
      this.setAttribute('disabled', 'disabled');
      window.es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.started) {
            appendLog(`Job started for brand: ${decodeURIComponent(brand)}`);
          } else if (data.page) {
            if (data.error) {
              appendLog(`[page ${data.page}] ERROR on ${data.currentSlug}: ${data.error}`);
            } else if (data.done) {
              appendLog(`DONE. Inserted ${data.totalInserted} of ${data.totalModels} models.`);
            } else {
              appendLog(`[page ${data.page}] Inserted: ${data.currentSlug} (${data.title}) — total: ${data.totalInserted}`);
            }
          } else if (data.keepalive) {
            // keep-alive ping
          }
        } catch (err) {
          appendLog('Event parse error: ' + err.message);
        }
      };
      window.es.onerror = (e) => {
        appendLog('SSE connection closed.');
        this.removeAttribute('disabled');
        window.es && window.es.close();
      };
    });
  });
})();
