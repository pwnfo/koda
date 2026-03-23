const Encoders = {
  plain: (v) => [v],
  url: (v) => [encodeURIComponent(v)],
  urlDouble: (v) => [encodeURIComponent(encodeURIComponent(v))],
  base64: (v) => { try { return [btoa(v)]; } catch { return []; } },
  base32: (v) => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = 0, value = 0, out = "";
    for (let i = 0; i < v.length; i++) {
      value = (value << 8) | v.charCodeAt(i);
      bits += 8;
      while (bits >= 5) { out += chars[(value >>> (bits - 5)) & 31]; bits -= 5; }
    }
    if (bits > 0) out += chars[(value << (5 - bits)) & 31];
    return [out];
  },
  hex: (v) => {
    let h = "";
    for (let i = 0; i < v.length; i++) h += v.charCodeAt(i).toString(16).padStart(2, "0");
    return [h];
  },
  json: (v) => { try { return [JSON.stringify(v).slice(1, -1)]; } catch { return []; } }
};

const MIN_LEN = 3;

// collect storage items from a web storage api
function collectStorage(storage, source) {
  const items = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    const val = storage.getItem(key);
    if (val && typeof val === "string" && val.length >= MIN_LEN) {
      items.push({ source, inputName: key || "unknown", value: val });
    }
  }
  return items;
}

function getInputs(cfg) {
  const inputs = [];

  if (cfg.targetGet !== false) {
    for (const [k, v] of new URLSearchParams(location.search).entries()) {
      if (v && v.length >= MIN_LEN) inputs.push({ source: "GET", inputName: k || "unknown", value: v });
    }

    const hash = location.hash.slice(1);
    if (hash) {
      new URLSearchParams(hash).forEach((v, k) => {
        if (v && v.length >= MIN_LEN) inputs.push({ source: "HASH", inputName: k || "unknown", value: v });
      });
      if (!hash.includes("=") && hash.length >= MIN_LEN) {
        inputs.push({ source: "HASH", inputName: "fragment", value: hash });
      }
    }
  }

  if (cfg.targetLocalStorage !== false) inputs.push(...collectStorage(localStorage, "LocalStorage"));
  if (cfg.targetSessionStorage !== false) inputs.push(...collectStorage(sessionStorage, "SessionStorage"));

  if (cfg.targetCookies !== false) {
    for (const cookie of document.cookie.split(";")) {
      const eq = cookie.indexOf("=");
      if (eq > -1) {
        const name = cookie.substring(0, eq).trim();
        const val = cookie.substring(eq + 1);
        if (val && val.length >= MIN_LEN) {
          inputs.push({ source: "Cookie", inputName: name || "unknown", value: val });
        }
      }
    }
  }

  return inputs;
}

function getXPath(el) {
  if (el.id) return `//*[@id="${el.id}"]`;
  if (el === document.body) return "/html/body";

  const parent = el.parentNode;
  if (!parent || parent.nodeType !== 1) return "";

  let idx = 0;
  for (const sib of parent.childNodes) {
    if (sib === el) return (getXPath(parent) || "") + "/" + el.tagName.toLowerCase() + "[" + (idx + 1) + "]";
    if (sib.nodeType === 1 && sib.tagName === el.tagName) idx++;
  }
}

function searchReflections(cfg = {}) {
  const inputs = getInputs(cfg);
  const active = Object.keys(Encoders).filter(e => cfg[e] !== false);
  const partial = cfg.partialSearch === true;
  const MAX = 500;
  const variants = [];
  const results = [];

  // build search variants
  for (const input of inputs) {
    for (const enc of active) {
      for (const v of Encoders[enc](input.value)) {
        if (v && v.length >= MIN_LEN) variants.push({ v, input, enc });
      }
    }
  }

  // match helper
  const matches = (haystack, needle) => partial ? haystack.includes(needle) : haystack.trim() === needle;

  // scan text nodes
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode()) && results.length < MAX) {
    for (const { v, input, enc } of variants) {
      if (matches(node.textContent, v)) {
        results.push({
          source: input.source, inputName: input.inputName, original: input.value,
          encoding: enc, variant: v, xpath: getXPath(node.parentElement), context: "text node"
        });
        if (results.length >= MAX) break;
      }
    }
  }

  // scan attributes
  for (const el of document.querySelectorAll("*")) {
    if (results.length >= MAX) break;
    for (const { v, input, enc } of variants) {
      for (const attr of el.attributes) {
        if (matches(attr.value, v)) {
          results.push({
            source: input.source, inputName: input.inputName, original: input.value,
            encoding: enc, variant: v, xpath: getXPath(el), context: `attribute (${attr.name})`
          });
          if (results.length >= MAX) break;
        }
      }
      if (results.length >= MAX) break;
    }
  }

  return results;
}

function inspectElement(xpath) {
  try {
    const res = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    const el = res.singleNodeValue;
    if (!el) return;

    const target = el.nodeType === 3 ? el.parentElement : el;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    console.log(`%c[Koda Scanner] Inspected Element (${xpath}):`, "color: #f2a20e; font-weight: bold;", target);
    if (typeof inspect !== "undefined") inspect(target);
  } catch (e) {
    console.error("[Koda Scanner] inspect error:", e);
  }
}

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === "search") {
    const tabId = req.tabId;
    chrome.storage.sync.get(null, (settings) => {
      const results = searchReflections(settings);

      for (let i = 0; i < results.length; i += 10) {
        chrome.runtime.sendMessage({
          action: "partialResults", results: results.slice(i, i + 10), tabId
        }).catch(() => {});
      }

      chrome.runtime.sendMessage({
        action: "searchComplete", totalResults: results.length, tabId
      }).catch(() => {});

      sendResponse({ success: true });
    });
    return true;
  }

  if (req.action === "inspect") {
    inspectElement(req.xpath);
    sendResponse({ success: true });
  }
});
