const eleXPath = "/html/body/div/main/div[3]/div[2]/div/div[2]/div/form/div[3]";
const fetchUsageDelay_sec = 15;
let lastUsageEle = null;

async function getUsageData() {
  const reqData = { 0: { json: { sessionId: null }, meta: { values: { sessionId: ["undefined"] } } } };
  const url = `https://t3.chat/api/trpc/getCustomerData?batch=1&input=${encodeURIComponent(JSON.stringify(reqData))}`;
  const resp = await fetch(url);
  if (!resp.ok) return null;

  const json = await resp.json();
  return json[0].result.data.json.usagePeriodPercentage;
}

async function setUsageInElement(parentEle) {
  if (!lastUsageEle) {
    lastUsageEle = document.createElement("div");
    parentEle.insertBefore(lastUsageEle, parentEle.lastChild);
  }

  const usage = await getUsageData();
  lastUsageEle.className = "mt-2 inline-flex px-2 text-xs font-medium text-muted-foreground";

  if (typeof usage !== "number") {
    lastUsageEle.textContent = "";
    return;
  }

  const creditsLeft = (100 - usage).toFixed(2);
  lastUsageEle.textContent = `Credits left: ${creditsLeft}%`;
}

function getElementByXPath(xpath) {
  var result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
  if (result && result.singleNodeValue) return result.singleNodeValue;
  return null;
}

setTimeout(() => {
  console.log("T3Chat usage display script loaded. Activating in 3 seconds...");
  setTimeout(() => {
    let element = getElementByXPath(eleXPath);
    if (element) setUsageInElement(element);
    let counter = 0;
    setInterval(() => {
      let elementN = getElementByXPath(eleXPath);
      if ((elementN && counter >= fetchUsageDelay_sec) || (elementN && !element)) {
        setUsageInElement(elementN);
        counter = 0;
      }
      element = elementN;
      counter++;
    }, 1000);
  }, 3000);
}, 1000);
