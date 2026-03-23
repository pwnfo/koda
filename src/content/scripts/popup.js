let searchInProgress = false;
let searchResultsReceived = false;
let currentTabId = null;
let currentUrl = null;

document.getElementById("optionsBtn").addEventListener("click", () => {
  chrome.tabs.create({ url: "content/options.html" });
});

function showTopBar(message, duration = 2000) {
  const bar = document.getElementById("topBar");
  bar.textContent = message;
  bar.classList.add("show");
  setTimeout(() => bar.classList.remove("show"), duration);
}

function getActiveTab(cb) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) cb(tabs[0]);
  });
}

function sendInspect(xpath) {
  getActiveTab((tab) => {
    chrome.tabs.sendMessage(tab.id, { action: "inspect", xpath });
  });
  showTopBar("Check console for details (F12)");
}

// build a finding-item element
function createFindingItem(result) {
  const xpath = escapeHtml(result.xpath);
  const item = document.createElement("div");
  item.className = "finding-item";
  item.setAttribute("data-xpath", result.xpath);
  item.innerHTML = `
    <div class="result-header">
      <span class="result-encoding">${result.encoding.toUpperCase()}</span>
      <span class="result-context">${result.context}</span>
    </div>
    <div class="xpath-container">
      <span class="xpath-link" title="${xpath}">${xpath}</span>
    </div>
  `;

  item.querySelector(".xpath-link").addEventListener("click", (e) => {
    e.stopPropagation();
    sendInspect(result.xpath);
  });

  return item;
}

function setupMessageListener(statusEl, resultsList) {
  chrome.runtime.onMessage.addListener(function listener(msg) {
    if (msg.action === "partialResults") {
      searchResultsReceived = true;
      renderPartialResults(msg.results, resultsList);
    } else if (msg.action === "searchComplete") {
      searchInProgress = false;
      const count = resultsList.querySelectorAll(".finding-item").length;
      statusEl.textContent = `Search complete. Found ${count} reflections.`;
      saveResultsToStorage(resultsList.innerHTML);
      chrome.runtime.onMessage.removeListener(listener);
    }
  });
}

async function saveResultsToStorage(html) {
  const minHtml = html.replace(/\n+/g, "").replace(/>\s+</g, "><").replace(/\s{2,}/g, " ").trim();
  const data = await chrome.storage.session.get({ tabHtml: {} });
  data.tabHtml[currentTabId] = minHtml;
  await chrome.storage.session.set({ tabHtml: data.tabHtml });
}

async function loadResultsFromStorage() {
  const data = await chrome.storage.session.get({ tabHtml: {} });
  return (data.tabHtml || {})[currentTabId] || null;
}

function clearTabResults() {
  chrome.storage.session.get({ tabHtml: {} }, (data) => {
    const tabHtml = data.tabHtml || {};
    delete tabHtml[currentTabId];
    chrome.storage.session.set({ tabHtml });
  });
}

document.getElementById("searchBtn").addEventListener("click", async () => {
  const statusEl = document.getElementById("status");
  const resultsList = document.getElementById("resultsList");

  if (searchInProgress) return;

  searchInProgress = true;
  searchResultsReceived = false;

  clearTabResults();
  resultsList.innerHTML = "";
  statusEl.innerHTML = "<div id='loading-container'><span>Scanning...</span></div>";

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    statusEl.textContent = "Error: No active tab found.";
    searchInProgress = false;
    return;
  }

  if (currentTabId === tab.id && currentUrl !== tab.url) {
    clearTabResults();
    resultsList.innerHTML = "";
  }

  currentTabId = tab.id;
  currentUrl = tab.url;

  setupMessageListener(statusEl, resultsList);

  chrome.tabs.sendMessage(tab.id, { action: "search", tabId: tab.id }, () => {
    if (chrome.runtime.lastError) {
      setTimeout(() => {
        if (searchInProgress && !searchResultsReceived) {
          statusEl.textContent = "Search completed with no results.";
          searchInProgress = false;
        }
      }, 15000);
    }
  });
});

function renderPartialResults(results, resultsList) {
  if (!resultsList) resultsList = document.getElementById("resultsList");

  results.forEach(result => {
    const groupKey = `${result.source}:${result.inputName}:${result.original}`;
    let group = resultsList.querySelector(`[data-group-key="${groupKey}"]`);

    if (!group) {
      const li = document.createElement("li");
      li.className = "result-item collapsed";
      li.setAttribute("data-group-key", groupKey);

      const header = document.createElement("div");
      header.className = "group-header";
      header.style.flexDirection = "column";
      header.style.alignItems = "flex-start";
      header.innerHTML = `
        <div class="result-container">
          <span class="result-container-src">${result.source}: <span>${result.inputName}</span></span>
          <span class="finding-count">1</span>
        </div>
        <div class="result-content">${escapeHtml(result.original)}</div>
      `;

      const content = document.createElement("div");
      content.className = "group-content";
      content.appendChild(createFindingItem(result));

      header.addEventListener("click", () => li.classList.toggle("collapsed"));

      li.appendChild(header);
      li.appendChild(content);
      resultsList.appendChild(li);
    } else {
      const content = group.querySelector(".group-content");
      const findingCount = group.querySelector(".finding-count");

      const isDuplicate = Array.from(content.querySelectorAll(".finding-item")).some(
        item => item.getAttribute("data-xpath") === result.xpath
      );

      if (!isDuplicate) {
        content.appendChild(createFindingItem(result));
        findingCount.textContent = parseInt(findingCount.textContent) + 1;
      }
    }
  });
}

function escapeHtml(text) {
  if (!text) return "";
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

document.addEventListener("DOMContentLoaded", async () => {
  const resultsList = document.getElementById("resultsList");

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  currentTabId = tab.id;
  currentUrl = tab.url;

  const savedHtml = await loadResultsFromStorage();
  if (savedHtml) {
    resultsList.innerHTML = savedHtml;
    attachEventListeners(resultsList);
  }
});

function attachEventListeners(container) {
  container.querySelectorAll(".group-header").forEach(header => {
    header.addEventListener("click", function () {
      this.closest(".result-item").classList.toggle("collapsed");
    });
  });

  container.querySelectorAll(".xpath-link").forEach(link => {
    link.addEventListener("click", (e) => {
      e.stopPropagation();
      sendInspect(link.getAttribute("title"));
    });
  });
}
