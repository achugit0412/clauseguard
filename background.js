const BACKEND_URL = "http://localhost:8000/analyze";

// Color mapping for badge
const BADGE_COLORS = {
  high: "#ef4444",
  medium: "#f97316",
  low: "#10b981"
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "ANALYZE_LEGAL_TEXT") {
    const tabId = sender.tab ? sender.tab.id : null;
    const pageUrl = request.url;

    console.log(`[ClauseGuard Background] Initiating analysis request for tab ${tabId} (${pageUrl})`);

    fetch(BACKEND_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: request.text,
        url: pageUrl
      })
    })
    .then(async (res) => {
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Server returned ${res.status}: ${errText}`);
      }
      return res.json();
    })
    .then((data) => {
      console.log(`[ClauseGuard Background] Received analysis output:`, data);

      // Cache result in storage for tab & popup
      const cachePayload = {
        data: data,
        timestamp: Date.now(),
        url: pageUrl
      };

      if (tabId) {
        chrome.storage.local.set({ [`tab_${tabId}`]: cachePayload, "latest_analysis": cachePayload });

        // Update badge
        const count = data.clauses ? data.clauses.length : 0;
        const risk = (data.risk_score || "low").toLowerCase();
        
        chrome.action.setBadgeText({ tabId: tabId, text: count > 0 ? `${count}` : "✓" });
        chrome.action.setBadgeBackgroundColor({ tabId: tabId, color: BADGE_COLORS[risk] || "#64748b" });
      }

      sendResponse({ success: true, data: data });
    })
    .catch((err) => {
      console.error("[ClauseGuard Background] Error fetching analysis:", err);
      sendResponse({ success: false, error: err.message });
    });

    return true; // Keep message channel open for async sendResponse
  }

  if (request.action === "GET_CACHED_ANALYSIS") {
    const tabId = request.tabId;
    const key = tabId ? `tab_${tabId}` : "latest_analysis";
    chrome.storage.local.get([key, "latest_analysis"], (items) => {
      const cached = items[key] || items["latest_analysis"];
      sendResponse({ success: !!cached, data: cached ? cached.data : null });
    });
    return true;
  }
});
