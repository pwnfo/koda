const ENCODINGS = ["plain", "url", "urlDouble", "base64", "base32", "hex", "json"];
const TARGETS = ["targetGet", "targetLocalStorage", "targetSessionStorage", "targetCookies"];

function encodingId(enc) {
  return "enc" + enc.charAt(0).toUpperCase() + enc.slice(1);
}

function loadOptions() {
  chrome.storage.sync.get(null, (s) => {
    ENCODINGS.forEach(enc => {
      const el = document.getElementById(encodingId(enc));
      if (el) el.checked = s[enc] !== false;
    });

    const partial = s.partialSearch === true;
    document.getElementById("partialSearchTrue").checked = partial;
    document.getElementById("partialSearchFalse").checked = !partial;

    TARGETS.forEach(t => {
      const el = document.getElementById(t);
      if (el) el.checked = s[t] !== false;
    });
  });
}

document.getElementById("saveButton").addEventListener("click", () => {
  const settings = {};

  ENCODINGS.forEach(enc => {
    const el = document.getElementById(encodingId(enc));
    if (el) settings[enc] = el.checked;
  });

  settings.partialSearch = document.getElementById("partialSearchTrue").checked;

  TARGETS.forEach(t => {
    const el = document.getElementById(t);
    if (el) settings[t] = el.checked;
  });

  chrome.storage.sync.set(settings, () => {
    const status = document.getElementById("status");
    status.textContent = "Options saved successfully.";
    status.style.color = "var(--accent-color)";
    setTimeout(() => { status.textContent = ""; }, 2000);
  });
});

document.addEventListener("DOMContentLoaded", loadOptions);
