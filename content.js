(() => {
  if (window._VAR) return; 
  window._VAR = true;

  // Add highlight styles
  const style = document.createElement('style');
  style.textContent = `
    .var-highlight {
      outline: 2px solid #ff2022 !important;
      outline-offset: 2px !important;
      box-shadow: 0 0 0 2px rgba(255, 21, 25, 1) !important;
      transition: outline 0.2s ease !important;
      animation: var-pulse 1s ease-out !important;
    }
    @keyframes var-pulse {
      0% { outline-color: rgba(255, 32, 34, 1); outline-offset: 2px; }
      50% { outline-color: rgba(255, 32, 34, 0.5); outline-offset: 4px; }
      100% { outline-color: rgba(255, 32, 34, 1); outline-offset: 2px; }
    }
  `;
  document.head.appendChild(style);

  const MAX_STEPS = 1000;

  // Utility: get best CSS selector 
  function getCSSSelector(el) {
    if (!el || !el.tagName) return '';
    if (el.id) return `#${el.id}`;
    if (el.name) return `[name="${el.name}"]`;
    // build a selector using tag.class:nth-of-type fallback
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.body) {
      let part = cur.tagName.toLowerCase();
      if (cur.className) {
        const cls = String(cur.className).trim().split(/\s+/)[0];
        if (cls) part += `.${cls}`;
      }
      parts.unshift(part);
      cur = cur.parentElement;
    }
    return parts.length ? parts.join(' > ') : el.tagName.toLowerCase();
  }

  // Utility: XPath (id prioritized)
  function getXPath(el) {
    if (!el) return '';
    if (el.id) return `//*[@id="${el.id}"]`;
    return getAbsoluteXPath(el);
  }

  // Absolute XPath (walk from document root)
  function getAbsoluteXPath(el) {
    if (el === document.body) return '/html/body';
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1) {
      let index = 1;
      let sibling = node.previousElementSibling;
      while (sibling) {
        if (sibling.tagName === node.tagName) index++;
        sibling = sibling.previousElementSibling;
      }
      const tag = node.tagName.toLowerCase();
      parts.unshift(`${tag}[${index}]`);
      node = node.parentElement;
    }
    return '/' + parts.join('/');
  }

  // get simple text
  function getElementText(el) {
    try {
      const text = (el.innerText || el.textContent || '').trim();
      if (text.length > 100) return text.substr(0, 100) + '...';
      return text;
    } catch (e) {
      return '';
    }
  }

  // mask sensitive values
  function maskValue(el, value) {
    try {
      if (el.type && el.type.toLowerCase() === 'password') return '••••••';
      // mask if field has autocomplete='cc-number' or name contains 'card' etc.
      const name = (el.name || '').toLowerCase();
      if (name.includes('password') || name.includes('pass') || name.includes('cc') || el.autocomplete === 'cc-number') {
        return '••••••';
      }
      return value;
    } catch (e) { return value; }
  }

 
  function getDataTestId(el) {
    if (!el || !el.getAttribute) return '';
    
    try {
      // First, check if the element itself has data-test-id
      const dataTestId = el.getAttribute('data-test-id');
      if (dataTestId) return dataTestId;
      
      // If not found on the element, check parent elements (walking up the DOM tree)
      let parent = el.parentElement;
      while (parent && parent !== document.body) {
        const parentDataTestId = parent.getAttribute('data-test-id');
        if (parentDataTestId) return parentDataTestId;
        parent = parent.parentElement;
      }
      
      // If still not found, check direct children
      const children = el.children;
      if (children && children.length > 0) {
        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          const childDataTestId = child.getAttribute('data-test-id');
          if (childDataTestId) return childDataTestId;
        }
      }
      
      return '';
    } catch (e) {
      return '';
    }
  }

  // push step to storage
  async function pushStep(step) {
    // Check if recording is enabled
    const { isRecording = false } = await chrome.storage.local.get('isRecording');
    if (!isRecording) return; // Don't record if recording is disabled

    const data = await chrome.storage.local.get({ steps: [] });
    const steps = data.steps || [];
    step.stepNumber = steps.length + 1;
    steps.push(step);
    if (steps.length > MAX_STEPS) steps.shift(); // keep size bounded
    await chrome.storage.local.set({ steps });
    // optional console log for debugging
    console.log('Recorded step:', step);
  }

  // capture screenshot (if html2canvas available)
  async function captureScreenshot() {
    try {
      if (window.html2canvas) {
        const canvas = await window.html2canvas(document.documentElement);
        return canvas.toDataURL('image/png');
      }
    } catch (e) {
      console.warn('Screenshot failed', e);
    }
    return null;
  }

  // common handler builder
  function recordAction({ actionType, el, value }) {
    const step = {
      actionType,
      elementTag: el ? el.tagName.toLowerCase() : '',
      elementText: el ? getElementText(el) : '',
      elementId: el && el.id ? el.id : '',
      elementName: el && el.name ? el.name : '',
      elementClass: el && el.className ? el.className : '',
      cssSelector: el ? getCSSSelector(el) : '',
      xpath: el ? getXPath(el) : '',
      fullXpath: el ? getAbsoluteXPath(el) : '',
      dataTestId: el ? getDataTestId(el) : '',
      value: el ? maskValue(el, value ?? '') : (value ?? ''),
      pageUrl: location.href,
      timestamp: new Date().toISOString(),
      screenshot: '' // optionally filled
    };

    // take screenshot but don't block UI too long
    captureScreenshot().then(img => {
      if (img) step.screenshot = img;
      pushStep(step);
    }).catch(() => {
      pushStep(step);
    });
  }

  // click handler
  document.addEventListener('click', (e) => {
    const el = e.target;
    // skip if element is part of extension popup frame or shadow roots (very rough)
    if (el.closest && el.closest('iframe') && el.closest('iframe').src && el.closest('iframe').src.startsWith('chrome-extension://')) return;
    const text = getElementText(el);
    recordAction({ actionType: 'click', el, value: text });
  }, true);

  // double click
  document.addEventListener('dblclick', (e) => {
    const el = e.target;
    recordAction({ actionType: 'doubleclick', el });
  }, true);

  let currentInput = null;

// Input typing
document.addEventListener('focus', (e) => {
  const el = e.target;
  if (!el) return;
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable) {
    currentInput = el;
  }
}, true);

document.addEventListener('blur', (e) => {
  const el = e.target;
  if (currentInput && el === currentInput) {
    const value = el.value ?? el.textContent ?? '';
    recordAction({ actionType: 'input', el, value });
    currentInput = null;
  }
}, true);


  // change (selects, checkboxes)
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!el) return;
    // for select, file inputs, checkboxes
    if (el.tagName.toLowerCase() === 'select') {
      const text = (el.options && el.selectedIndex >= 0) ? el.options[el.selectedIndex].text : '';
      recordAction({ actionType: 'select', el, value: text });
    } else if (el.type === 'file') {
      const files = el.files ? Array.from(el.files).map(f => f.name).join(', ') : '';
      recordAction({ actionType: 'fileupload', el, value: files });
    } else if (el.type === 'checkbox' || el.type === 'radio') {
      recordAction({ actionType: 'check', el, value: el.checked });
    } else {
      const value = el.value ?? '';
      recordAction({ actionType: 'change', el, value });
    }
  }, true);

  // form submit
  document.addEventListener('submit', (e) => {
    const el = e.target;
    recordAction({ actionType: 'submit', el });
  }, true);

  // navigation detection (hashchange + popstate)
  window.addEventListener('hashchange', () => {
    recordAction({ actionType: 'navigation', el: null, value: location.href });
  });
  window.addEventListener('popstate', () => {
    recordAction({ actionType: 'navigation', el: null, value: location.href });
  });

  // optional: record initial page load
  recordAction({ actionType: 'navigation', el: null, value: location.href });
})();

// =============== HIGHLIGHT STYLE ===============
const style = document.createElement('style');
style.textContent = `
  .tcstudio-highlight {
    outline: 2px solid #ff2022 !important;
    outline-offset: 2px !important;
    box-shadow: 0 0 0 2px rgba(255, 32, 34, 0.8) !important;
    transition: outline 0.2s ease-in-out !important;
    animation: tcstudio-pulse 1s ease-out;
  }
  @keyframes tcstudio-pulse {
    0% { outline-color: rgba(255, 32, 34, 1); outline-offset: 2px; }
    50% { outline-color: rgba(255, 32, 34, 0.5); outline-offset: 4px; }
    100% { outline-color: rgba(255, 32, 34, 1); outline-offset: 2px; }
  }
`;
document.head.appendChild(style);

// highlight helper (only when recording is ON)
async function highlightElement(el) {
  if (!el || !el.classList) return;
  const { isRecording = false } = await chrome.storage.local.get('isRecording');
  if (!isRecording) return;

  // remove highlight from all previous
  document.querySelectorAll('.tcstudio-highlight').forEach(elem => {
    elem.classList.remove('tcstudio-highlight');
  });

  el.classList.add('tcstudio-highlight');
  setTimeout(() => {
    el.classList.remove('tcstudio-highlight');
  }, 1000);
}

// =============== CLICK HIGHLIGHT ===============
document.addEventListener('click', async (e) => {
  const el = e.target;
  if (!el) return;
  await highlightElement(el);
}, true);

// =============== INPUT HIGHLIGHT (AFTER TYPING) ===============
const typingTimers = new WeakMap();
document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el) return;
  const value = el.value ?? el.textContent ?? '';

  clearTimeout(typingTimers.get(el));
  const t = setTimeout(async () => {
    const { isRecording = false } = await chrome.storage.local.get('isRecording');
    if (!isRecording) return;

    // record the action
    recordAction({ actionType: 'input', el, value });

    // highlight element after typing done
    await highlightElement(el);
    typingTimers.delete(el);
  }, 400);
  typingTimers.set(el, t);
}, true);


