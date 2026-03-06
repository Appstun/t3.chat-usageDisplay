const eleXPath = "/html/body/div/main/div[3]/div[2]/div/div[2]/div/form/div[3]";
const fetchUsageDelay_sec = 15;
let isUsageFetchRunning = false;
const usageDisplaySelector = '[data-t3-usage-display="1"]';
const uiTickMs = 250;
const fetchIntervalMs = fetchUsageDelay_sec * 1000;
const parentLookupIntervalMs = 2000;
let lastFetchTimestamp = 0;
let lastUsageText = "";
let cachedUsageParent = null;
let nextParentLookupAt = 0;

async function getUsageData() {
  const reqData = { 0: { json: { sessionId: null }, meta: { values: { sessionId: ["undefined"] } } } };
  const url = `https://t3.chat/api/trpc/getCustomerData?batch=1&input=${encodeURIComponent(JSON.stringify(reqData))}`;
  const resp = await fetch(url);
  if (!resp.ok) return null;

  const json = await resp.json();
  return json[0].result.data.json.usagePeriodPercentage;
}

function ensureUsageElement(parentEle) {
  if (!parentEle) return;

  let usageEle = parentEle.querySelector(usageDisplaySelector);
  if (usageEle) return usageEle;

  usageEle = document.createElement("div");
  usageEle.dataset.t3UsageDisplay = "1";
  usageEle.className = "mt-2 inline-flex px-2 text-sm font-medium text-muted-foreground";
  usageEle.textContent = lastUsageText;
  parentEle.insertBefore(usageEle, parentEle.lastChild);

  return usageEle;
}

async function setUsageInElement(parentEle) {
  const usageEle = ensureUsageElement(parentEle);
  if (!parentEle || !usageEle) return;

  const usage = await getUsageData();

  if (typeof usage !== "number") {
    lastUsageText = "";
    usageEle.textContent = "";
    return;
  }

  const creditsLeft = (100 - usage).toFixed(2);
  lastUsageText = `Credits left: ${creditsLeft}%`;
  usageEle.textContent = lastUsageText;
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
