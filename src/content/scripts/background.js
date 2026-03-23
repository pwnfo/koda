// default settings on first install
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(null, (s) => {
    if (Object.keys(s).length === 0) {
      chrome.storage.sync.set({
        plain: true, url: true, urlDouble: true,
        base64: true, base32: true, hex: true, json: true,
        partialSearch: false,
        targetGet: true, targetLocalStorage: true,
        targetSessionStorage: true, targetCookies: true
      });
    }
  });
});

// cleanup cached html on tab close
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.session.get({ tabHtml: {} }, (data) => {
    const tabHtml = data.tabHtml || {};
    delete tabHtml[tabId];
    chrome.storage.session.set({ tabHtml });
  });
});

// message relay between content script and popup/devtools
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === "partialResults" || req.action === "searchComplete") {
    if (req.tabId) chrome.tabs.sendMessage(req.tabId, req);
    sendResponse({ success: true });
  }

  if (req.action === "inspectElement") {
    const tabId = chrome.devtools?.inspectedWindow ? undefined : req.tabId;
    if (tabId) {
      chrome.tabs.sendMessage(tabId, { action: "inspect", xpath: req.xpath });
    }
    sendResponse({ success: true });
  }
});
