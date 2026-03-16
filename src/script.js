const eleXPath = "/html/body/div/main/div[3]/div[2]/div/div[2]/div/form/div[3]";
const fetchUsageDelay_sec = 15;
let isUsageFetchRunning = false;
const usageDisplaySelector = '[data-t3-usage-display="1"]';
const uiTickMs = 250;
const fetchIntervalMs = fetchUsageDelay_sec * 1000;
const parentLookupIntervalMs = 2000;
let lastFetchTimestamp = 0;
let lastUsageText = "";
let lastUsageSourceLabel = "";
let lastUsageTooltip = "";
let lastUsageData = null;
let cachedUsageParent = null;
let nextParentLookupAt = 0;
let usageTooltipWrapper = null;
let usageTooltipContent = null;
let usageTooltipAnchor = null;
let usageTooltipRefreshIntervalId = null;

function formatUsageValue(usageValue) {
  if (typeof usageValue !== "number") return "n/a";
  return `${usageValue.toFixed(2)}% used`;
}

function parseTimestampMs(rawTs) {
  if (typeof rawTs === "number" && Number.isFinite(rawTs)) {
    return rawTs < 1_000_000_000_000 ? rawTs * 1000 : rawTs;
  }

  if (typeof rawTs === "string" && rawTs.trim()) {
    const asNumber = Number(rawTs);
    if (!Number.isNaN(asNumber)) {
      return asNumber < 1_000_000_000_000 ? asNumber * 1000 : asNumber;
    }

    const parsed = Date.parse(rawTs);
    if (!Number.isNaN(parsed)) return parsed;
  }

  return null;
}

function formatCountdownHms(targetTsMs) {
  if (typeof targetTsMs !== "number") return "n/a";

  const diffSec = Math.max(0, Math.floor((targetTsMs - Date.now()) / 1000));
  const hours = Math.floor(diffSec / 3600);
  const minutes = Math.floor((diffSec % 3600) / 60);
  const seconds = diffSec % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function buildUsageTooltipText() {
  if (!lastUsageData) return "";

  const resetTsMs = parseTimestampMs(lastUsageData.usageFourHourNextResetAt);
  const hourResetText = formatCountdownHms(resetTsMs);

  return [
    `4 hour: ${formatUsageValue(lastUsageData.usage4Hour)}`,
    `Month: ${formatUsageValue(lastUsageData.usageMonth)}`,
    `Period: ${formatUsageValue(lastUsageData.usagePeriod)}`,
    `4h reset: ${hourResetText}`,
  ].join("\n");
}

function renderUsageTooltipRows() {
  if (!usageTooltipContent) return;

  usageTooltipContent.replaceChildren();
  const lines = lastUsageTooltip.split("\n").filter(Boolean);

  for (const line of lines) {
    const [rawKey, ...rawValueParts] = line.split(":");
    const key = rawKey ? rawKey.trim() : "";
    const value = rawValueParts.join(":").trim();
    const isResetRow = key.toLowerCase().includes("reset");

    const lineEle = document.createElement("div");
    lineEle.className = "flex items-center justify-between gap-4";
    if (isResetRow) {
      lineEle.className += " mt-1 pt-1 border-t border-chat-border/40";
    }

    const keyEle = document.createElement("span");
    keyEle.className = "text-left whitespace-nowrap";
    keyEle.textContent = key || line;

    const valueEle = document.createElement("span");
    valueEle.className = "text-right tabular-nums min-w-[9ch]";
    valueEle.textContent = value;

    lineEle.appendChild(keyEle);
    lineEle.appendChild(valueEle);
    usageTooltipContent.appendChild(lineEle);
  }
}

async function getUsageData() {
  const reqData = { 0: { json: { sessionId: null }, meta: { values: { sessionId: ["undefined"] } } } };
  const url = `https://t3.chat/api/trpc/getCustomerData?batch=1&input=${encodeURIComponent(JSON.stringify(reqData))}`;
  const resp = await fetch(url);
  if (!resp.ok) return null;

  const json = (await resp.json())[0].result.data.json;
  return {
    usagePeriodPercentage: json.usagePeriodPercentage,
    usageMonthPercentage: json.usageMonthPercentage,
    usageFourHourPercentage: json.usageFourHourPercentage,
    usageFourHourNextResetAt: json.usageFourHourNextResetAt,
  };
}

function ensureUsageTooltipElements() {
  if (usageTooltipWrapper && usageTooltipContent) return;

  usageTooltipWrapper = document.createElement("div");
  usageTooltipWrapper.setAttribute("data-radix-popper-content-wrapper", "");
  usageTooltipWrapper.style.position = "fixed";
  usageTooltipWrapper.style.left = "0px";
  usageTooltipWrapper.style.top = "0px";
  usageTooltipWrapper.style.transform = "translate(-9999px, -9999px)";
  usageTooltipWrapper.style.minWidth = "max-content";
  usageTooltipWrapper.style.zIndex = "50";
  usageTooltipWrapper.style.pointerEvents = "none";

  usageTooltipContent = document.createElement("div");
  usageTooltipContent.dataset.side = "top";
  usageTooltipContent.dataset.align = "center";
  usageTooltipContent.dataset.state = "closed";
  usageTooltipContent.className =
    "z-50 overflow-hidden rounded-md border border-chat-border/40 bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-md";

  usageTooltipWrapper.appendChild(usageTooltipContent);
  document.body.appendChild(usageTooltipWrapper);
}

function updateTooltipPosition(anchorEle) {
  if (!anchorEle || !usageTooltipWrapper || !usageTooltipContent) return;

  const margin = 8;
  const anchorRect = anchorEle.getBoundingClientRect();
  const tooltipRect = usageTooltipWrapper.getBoundingClientRect();

  let x = anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2;
  x = Math.max(margin, Math.min(x, window.innerWidth - tooltipRect.width - margin));

  let y = anchorRect.top - tooltipRect.height - margin;
  let side = "top";

  if (y < margin) {
    y = anchorRect.bottom + margin;
    side = "bottom";
  }

  usageTooltipContent.dataset.side = side;
  usageTooltipWrapper.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

function showUsageTooltip(anchorEle) {
  if (!anchorEle || !lastUsageData) return;

  ensureUsageTooltipElements();
  if (!usageTooltipWrapper || !usageTooltipContent) return;

  usageTooltipAnchor = anchorEle;
  lastUsageTooltip = buildUsageTooltipText();
  renderUsageTooltipRows();

  usageTooltipContent.dataset.state = "delayed-open";
  updateTooltipPosition(anchorEle);

  if (usageTooltipRefreshIntervalId) clearInterval(usageTooltipRefreshIntervalId);
  usageTooltipRefreshIntervalId = setInterval(() => {
    if (!usageTooltipAnchor || !lastUsageData) return;

    lastUsageTooltip = buildUsageTooltipText();
    renderUsageTooltipRows();
    updateTooltipPosition(usageTooltipAnchor);
  }, 1000);
}

function hideUsageTooltip() {
  if (!usageTooltipWrapper || !usageTooltipContent) return;

  if (usageTooltipRefreshIntervalId) {
    clearInterval(usageTooltipRefreshIntervalId);
    usageTooltipRefreshIntervalId = null;
  }

  usageTooltipAnchor = null;
  usageTooltipContent.dataset.state = "closed";
  usageTooltipWrapper.style.transform = "translate(-9999px, -9999px)";
}

function bindUsageTooltipEvents(usageEle) {
  if (!usageEle || usageEle.dataset.t3UsageTooltipBound === "1") return;

  usageEle.dataset.t3UsageTooltipBound = "1";
  usageEle.addEventListener("mouseenter", () => showUsageTooltip(usageEle));
  usageEle.addEventListener("mouseleave", hideUsageTooltip);
  usageEle.addEventListener("focus", () => showUsageTooltip(usageEle));
  usageEle.addEventListener("blur", hideUsageTooltip);
}

window.addEventListener(
  "scroll",
  () => {
    if (!usageTooltipAnchor) return;
    updateTooltipPosition(usageTooltipAnchor);
  },
  true,
);

window.addEventListener("resize", () => {
  if (!usageTooltipAnchor) return;
  updateTooltipPosition(usageTooltipAnchor);
});

function renderUsageText(usageEle) {
  if (!usageEle) return;

  usageEle.replaceChildren();
  if (!lastUsageText) return;

  usageEle.appendChild(document.createTextNode(lastUsageText));
  if (!lastUsageSourceLabel) return;

  const label = document.createElement("span");
  label.className = "text-xs px-2 font-medium text-muted-foreground";
  label.textContent = `(${lastUsageSourceLabel})`;
  usageEle.appendChild(label);
}

function ensureUsageElement(parentEle) {
  if (!parentEle) return;

  let usageEle = parentEle.querySelector(usageDisplaySelector);
  if (usageEle) return usageEle;

  usageEle = document.createElement("div");
  usageEle.dataset.t3UsageDisplay = "1";
  usageEle.className = "mt-2 inline-flex px-2 text-sm font-medium text-muted-foreground";
  usageEle.tabIndex = 0;
  bindUsageTooltipEvents(usageEle);
  renderUsageText(usageEle);
  parentEle.insertBefore(usageEle, parentEle.lastChild);

  return usageEle;
}

async function setUsageInElement(parentEle) {
  const usageEle = ensureUsageElement(parentEle);
  if (!parentEle || !usageEle) return;

  const usage = await getUsageData();

  const usage4Hour = usage?.usageFourHourPercentage;
  const usageMonth = usage?.usageMonthPercentage;
  const usagePeriod = usage?.usagePeriodPercentage;

  let activeUsage = null;
  let sourceLabel = "";

  if (typeof usage4Hour === "number" && usage4Hour < 100) {
    activeUsage = usage4Hour;
    sourceLabel = "4 hour";
  } else if (typeof usageMonth === "number") {
    activeUsage = usageMonth;
    sourceLabel = "month";
  } else if (typeof usagePeriod === "number") {
    activeUsage = usagePeriod;
    sourceLabel = "period";
  }

  if (typeof activeUsage !== "number") {
    lastUsageText = "";
    lastUsageSourceLabel = "";
    lastUsageData = null;
    lastUsageTooltip = "";
    hideUsageTooltip();
    renderUsageText(usageEle);
    return;
  }

  const creditsLeft = (100 - activeUsage).toFixed(2);
  lastUsageText = `Credits left: ${creditsLeft}%`;
  lastUsageSourceLabel = sourceLabel;
  lastUsageData = {
    usage4Hour,
    usageMonth,
    usagePeriod,
    usageFourHourNextResetAt: usage?.usageFourHourNextResetAt,
  };
  lastUsageTooltip = buildUsageTooltipText();
  renderUsageText(usageEle);

  if (usageTooltipAnchor === usageEle) showUsageTooltip(usageEle);
}

function getElementByXPath(xpath) {
  var result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
  if (result && result.singleNodeValue) return result.singleNodeValue;
  return null;
}

function getUsageParentElement() {
  if (cachedUsageParent && cachedUsageParent.isConnected) return cachedUsageParent;

  const now = Date.now();
  if (now < nextParentLookupAt) return null;

  nextParentLookupAt = now + parentLookupIntervalMs;

  const xpathElement = getElementByXPath(eleXPath);
  if (xpathElement) {
    cachedUsageParent = xpathElement;
    return xpathElement;
  }

  // Fallback: find the input form with model picker and then pick the menu/action bar row.
  const modelTrigger = document.querySelector("button.chat-input-model-trigger");
  const form = modelTrigger ? modelTrigger.closest("form") : null;
  if (!form) return null;

  const childDivs = Array.from(form.children).filter((child) => child.tagName === "DIV");
  const actionBar = childDivs.find((child) => child.className.includes("flex-row-reverse") && child.className.includes("justify-between"));

  cachedUsageParent = actionBar || null;
  return cachedUsageParent;
}

console.log("T3Chat usage display script loaded. Activating...");

setTimeout(() => {
  setInterval(async () => {
    const parentEle = getUsageParentElement();
    if (!parentEle) return;

    // Re-attach fast; cached text is restored immediately after DOM re-renders.
    ensureUsageElement(parentEle);

    const now = Date.now();
    if (isUsageFetchRunning || now - lastFetchTimestamp < fetchIntervalMs) return;

    isUsageFetchRunning = true;
    try {
      await setUsageInElement(parentEle);
      lastFetchTimestamp = Date.now();
    } finally {
      isUsageFetchRunning = false;
    }
  }, uiTickMs);
});
