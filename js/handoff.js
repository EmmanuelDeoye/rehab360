// js/handoff.js
// Small shared utility that lets one page (e.g. ask.html) hand a bit of
// text and/or a file over to another page (e.g. doc.html) across a full
// page navigation, using sessionStorage as the carrier.

(function () {
  const KEY = 'rehablix_handoff_v1';
  const MAX_AGE_MS = 10 * 60 * 1000; // payload expires after 10 minutes

  const RehablixHandoff = {
    /**
     * @param {string} targetPage e.g. "doc.html"
     * @param {{text?:string, fileName?:string, fileMime?:string, fileDataUrl?:string, note?:string}} payload
     */
    send(targetPage, payload) {
      const data = Object.assign({ targetPage, ts: Date.now() }, payload);
      try {
        sessionStorage.setItem(KEY, JSON.stringify(data));
        return true;
      } catch (err) {
        // Likely quota exceeded (large file). Retry without the file so
        // the text still makes it across.
        console.warn('[handoff] storage full, dropping file payload:', err);
        try {
          const { fileDataUrl, ...rest } = data;
          sessionStorage.setItem(KEY, JSON.stringify(rest));
        } catch (err2) {
          console.warn('[handoff] failed even without file:', err2);
        }
        return false;
      }
    },

    /**
     * Reads and clears the pending payload if it matches expectedPage.
     * @param {string} expectedPage
     * @returns {object|null}
     */
    consume(expectedPage) {
      let raw;
      try {
        raw = sessionStorage.getItem(KEY);
      } catch (err) {
        return null;
      }
      if (!raw) return null;
      sessionStorage.removeItem(KEY);
      try {
        const data = JSON.parse(raw);
        if (Date.now() - (data.ts || 0) > MAX_AGE_MS) return null;
        if (expectedPage && data.targetPage !== expectedPage) return null;
        return data;
      } catch (err) {
        return null;
      }
    },

    /**
     * Convenience: populate a textarea/input and a file input from a
     * consumed payload. Dispatches input/change events so the target
     * page's own listeners pick up the new values.
     */
    applyTo(data, { textFieldId, fileFieldId } = {}) {
      if (!data) return;
      if (textFieldId && data.text) {
        const el = document.getElementById(textFieldId);
        if (el) {
          el.value = data.text;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      if (fileFieldId && data.fileDataUrl && data.fileName) {
        const fileEl = document.getElementById(fileFieldId);
        if (fileEl && typeof DataTransfer !== 'undefined') {
          fetch(data.fileDataUrl)
            .then((r) => r.blob())
            .then((blob) => {
              try {
                const file = new File([blob], data.fileName, { type: data.fileMime || blob.type });
                const dt = new DataTransfer();
                dt.items.add(file);
                fileEl.files = dt.files;
                fileEl.dispatchEvent(new Event('change', { bubbles: true }));
              } catch (err) {
                console.warn('[handoff] could not attach file:', err);
              }
            })
            .catch((err) => console.warn('[handoff] could not fetch file data:', err));
        }
      }
    }
  };

  window.RehablixHandoff = RehablixHandoff;
})();
