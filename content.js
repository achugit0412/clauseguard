(function () {
  console.log("[ClauseGuard Content Script] Initialized.");

  // Category title display map
  const CATEGORY_TITLES = {
    auto_renewal_cancellation: "Auto-Renewal & Cancellation",
    data_sharing_selling: "Data Sharing & Selling",
    arbitration_lawsuit_waiver: "Arbitration & Legal Waiver",
    hidden_fees_billing: "Hidden Fees & Billing",
    liability_disclaimer: "Liability Disclaimer"
  };

  // Check if page is likely a Terms of Service, Privacy Policy, or Signup page
  function isLegalPage() {
    const url = window.location.href.toLowerCase();
    const title = document.title.toLowerCase();
    const keywords = ["terms", "privacy", "policy", "eula", "consent", "tos", "signup", "register", "legal"];

    for (const kw of keywords) {
      if (url.includes(kw) || title.includes(kw)) {
        return true;
      }
    }

    // Check for legal headings or agreement buttons
    const bodyText = document.body ? document.body.innerText.toLowerCase() : "";
    if (bodyText.includes("terms of service") || bodyText.includes("privacy policy") || bodyText.includes("i agree")) {
      return true;
    }

    return false;
  }

  // Extract visible body text
  function extractLegalText() {
    // Look for dedicated legal containers first
    const targetSelectors = [
      ".tos-card", "#tos", ".terms", "#terms", ".privacy", "#privacy",
      "main", "article", "[role='main']", "#content", ".content"
    ];

    for (const sel of targetSelectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText && el.innerText.trim().length > 100) {
        return el.innerText;
      }
    }

    return document.body ? document.body.innerText : "";
  }

  // Resilient DOM Text Search and Highlight
  function applyHighlights(clauses) {
    if (!clauses || clauses.length === 0) return;

    // Find legal root container
    const rootEl = document.querySelector(".tos-card") || document.querySelector("main") || document.body;
    if (!rootEl) return;

    clauses.forEach((clause, index) => {
      const rawTargetSnippet = clause.text || "";
      const normalizedSnippet = rawTargetSnippet.replace(/\s+/g, ' ').trim();
      if (normalizedSnippet.length < 10) return;

      // Find text nodes
      const textNodes = [];
      const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, {
        acceptNode: function(node) {
          if (!node.parentElement) return NodeFilter.FILTER_REJECT;
          const tag = node.parentElement.tagName.toLowerCase();
          if (["script", "style", "noscript", "mark", "button"].includes(tag)) {
            return NodeFilter.FILTER_REJECT;
          }
          if (node.parentElement.closest(".cg-tooltip-container") || node.parentElement.closest("#clauseguard-floating-widget")) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      });

      let currentNode;
      while ((currentNode = walker.nextNode())) {
        textNodes.push(currentNode);
      }

      // Search text nodes for normalized snippet match
      for (const node of textNodes) {
        const nodeText = node.nodeValue;
        const normalizedNodeText = nodeText.replace(/\s+/g, ' ');
        const matchIndex = normalizedNodeText.toLowerCase().indexOf(normalizedSnippet.toLowerCase());

        if (matchIndex !== -1) {
          // Found match in single text node!
          const parent = node.parentNode;
          if (!parent || parent.classList.contains("cg-highlight")) continue;

          // Replace text node with highlighted mark element
          const span = document.createElement("span");
          const beforeText = nodeText.substring(0, matchIndex);
          const matchedText = nodeText.substring(matchIndex, matchIndex + normalizedSnippet.length);
          const afterText = nodeText.substring(matchIndex + normalizedSnippet.length);

          const mark = document.createElement("mark");
          const severity = (clause.severity || "medium").toLowerCase();
          mark.className = `cg-highlight cg-severity-${severity}`;
          mark.textContent = matchedText;

          // Tooltip container
          const catTitle = CATEGORY_TITLES[clause.category] || clause.category || "Legal Risk";
          const tooltip = document.createElement("div");
          tooltip.className = "cg-tooltip-container";
          tooltip.innerHTML = `
            <div class="cg-tooltip-header">
              <span class="cg-category-badge">${catTitle}</span>
              <span class="cg-severity-pill cg-pill-${severity}">${severity.toUpperCase()} RISK</span>
            </div>
            <p class="cg-tooltip-body">${clause.explanation}</p>
            <div class="cg-tooltip-footer">ClauseGuard Protection</div>
          `;
          mark.appendChild(tooltip);

          span.appendChild(document.createTextNode(beforeText));
          span.appendChild(mark);
          span.appendChild(document.createTextNode(afterText));

          parent.replaceChild(span, node);
          break; // Stop after first match for this clause
        }
      }
    });
  }

  // Inject Floating Widget at Bottom Right
  function renderFloatingWidget(analysisData) {
    // Remove existing if any
    const existing = document.getElementById("clauseguard-floating-widget");
    if (existing) existing.remove();

    const widget = document.createElement("div");
    widget.id = "clauseguard-floating-widget";

    const riskScore = (analysisData.risk_score || "low").toLowerCase();
    const clauses = analysisData.clauses || [];
    const count = clauses.length;

    let scoreLabel = "LOW RISK";
    if (riskScore === "high") scoreLabel = "HIGH RISK";
    else if (riskScore === "medium") scoreLabel = "MEDIUM RISK";

    let itemsHtml = "";
    if (clauses.length === 0) {
      itemsHtml = `<div class="cg-panel-item"><p class="cg-item-explanation">No significant risky clauses detected on this page.</p></div>`;
    } else {
      itemsHtml = clauses.map(c => `
        <div class="cg-panel-item">
          <div class="cg-item-category">${CATEGORY_TITLES[c.category] || c.category} • <span style="text-transform:uppercase;">${c.severity}</span></div>
          <div class="cg-item-explanation">${c.explanation}</div>
          <div class="cg-item-text">"${c.text}"</div>
        </div>
      `).join("");
    }

    widget.innerHTML = `
      <div class="cg-widget-pill" id="cg-widget-toggle">
        <span style="font-size: 16px;">🛡️ ClauseGuard</span>
        <span class="cg-widget-score cg-bg-${riskScore}">${scoreLabel} (${count})</span>
      </div>
      <div class="cg-widget-panel" id="cg-widget-panel">
        <div class="cg-panel-header">
          <h4 class="cg-panel-title">🛡️ ClauseGuard Summary</h4>
          <span class="cg-widget-score cg-bg-${riskScore}">${scoreLabel}</span>
        </div>
        <div class="cg-panel-body">
          ${itemsHtml}
        </div>
      </div>
    `;

    document.body.appendChild(widget);

    // Toggle panel drawer listener
    const toggleBtn = widget.querySelector("#cg-widget-toggle");
    const panel = widget.querySelector("#cg-widget-panel");
    toggleBtn.addEventListener("click", () => {
      panel.classList.toggle("cg-open");
    });
  }

  // Run Analysis Pipeline
  function runAnalysisPipeline() {
    if (!isLegalPage()) {
      console.log("[ClauseGuard] Page does not match legal heuristics, skipping auto-analysis.");
      return;
    }

    console.log("[ClauseGuard] Legal page detected! Extracting text...");
    const rawText = extractLegalText();
    if (!rawText || rawText.length < 50) {
      console.log("[ClauseGuard] Legal text too short for analysis.");
      return;
    }

    // Send to background service worker (Bypasses page CSP!)
    chrome.runtime.sendMessage(
      {
        action: "ANALYZE_LEGAL_TEXT",
        text: rawText,
        url: window.location.href
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("[ClauseGuard] Runtime error:", chrome.runtime.lastError.message);
          return;
        }

        if (response && response.success && response.data) {
          console.log("[ClauseGuard] Analysis complete!", response.data);
          applyHighlights(response.data.clauses);
          renderFloatingWidget(response.data);
        } else {
          console.error("[ClauseGuard] Analysis failed:", response ? response.error : "No response");
        }
      }
    );
  }

  // Execute after DOM load
  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(runAnalysisPipeline, 500);
  } else {
    window.addEventListener("DOMContentLoaded", () => setTimeout(runAnalysisPipeline, 500));
  }
})();
