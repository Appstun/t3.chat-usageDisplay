const eleXPath = "/html/body/div/div[2]/div[2]/div/div[4]/div/div/div/div";
const fetchUsageDelay_sec = 15;

async function getUsageData() {
  const reqData = { 0: { json: { sessionId: null }, meta: { values: { sessionId: ["undefined"] } } } };
  const url = `https://t3.chat/api/trpc/getCustomerData?batch=1&input=${encodeURIComponent(JSON.stringify(reqData))}`;
  const resp = await fetch(url);
  if (!resp.ok) return null;

  const json = await resp.json();
  return json[0].result.data.json.usagePeriodPercentage;
}

async function setUsageInElement(ele) {
  ele.style.fontSize = "11px";
  ele.textContent = `Credits left: ${(100 - (await getUsageData())).toFixed(2)}%`;
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
