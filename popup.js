document.addEventListener("DOMContentLoaded", () => {
  const CATEGORY_NAMES = {
    auto_renewal_cancellation: "Auto-Renewal & Cancellation",
    data_sharing_selling: "Data Sharing & Selling",
    arbitration_lawsuit_waiver: "Arbitration & Legal Waiver",
    hidden_fees_billing: "Hidden Fees & Billing",
    liability_disclaimer: "Liability Disclaimer"
  };

  const riskCard = document.getElementById("risk-card");
  const riskBadge = document.getElementById("risk-badge");
  const riskSummary = document.getElementById("risk-summary");
  const statHigh = document.getElementById("stat-high");
  const statMedium = document.getElementById("stat-medium");
  const statTotal = document.getElementById("stat-total");
  const clauseCountPill = document.getElementById("clause-count-pill");
  const clauseList = document.getElementById("clause-list");
  const statusBadge = document.getElementById("status-badge");
  const btnReanalyze = document.getElementById("btn-reanalyze");

  function renderAnalysisData(data) {
    if (!data) {
      riskSummary.textContent = "No analysis results found for this tab. Open a Terms of Service page or click Re-analyze.";
      return;
    }

    const riskScore = (data.risk_score || "low").toLowerCase();
    const clauses = data.clauses || [];

    // Update Banner
    riskCard.className = `risk-card risk-${riskScore}`;
    riskBadge.className = `risk-badge badge-${riskScore}`;
    riskBadge.textContent = `${riskScore.toUpperCase()} RISK`;
    riskSummary.textContent = data.summary || "Legal document analyzed successfully.";

    // Update Stats
    const highCount = clauses.filter(c => c.severity === "high").length;
    const medCount = clauses.filter(c => c.severity === "medium").length;

    statHigh.textContent = highCount;
    statMedium.textContent = medCount;
    statTotal.textContent = clauses.length;
    clauseCountPill.textContent = `${clauses.length} clause(s)`;
    statusBadge.textContent = "Active";

    // Update List
    if (clauses.length === 0) {
      clauseList.innerHTML = `<div class="empty-state">No significant risky clauses detected on this page.</div>`;
      return;
    }

    clauseList.innerHTML = clauses.map(c => {
      const catName = CATEGORY_NAMES[c.category] || c.category;
      const sev = (c.severity || "medium").toLowerCase();
      return `
        <div class="clause-item">
          <div class="clause-header">
            <span class="clause-cat">${catName}</span>
            <span class="clause-sev sev-${sev}">${sev}</span>
          </div>
          <div class="clause-explanation">${c.explanation}</div>
          <div class="clause-quote">"${c.text}"</div>
        </div>
      `;
    }).join("");
  }

  function loadActiveTabData() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) return;
      const activeTab = tabs[0];

      chrome.runtime.sendMessage({ action: "GET_CACHED_ANALYSIS", tabId: activeTab.id }, (response) => {
        if (response && response.success && response.data) {
          renderAnalysisData(response.data);
        } else {
          statusBadge.textContent = "Standby";
        }
      });
    });
  }

  btnReanalyze.addEventListener("click", () => {
    btnReanalyze.textContent = "⏳ Analyzing Page...";
    btnReanalyze.disabled = true;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0) return;
      const activeTab = tabs[0];

      chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: () => {
          if (window.ClauseGuardRunPipeline) {
            window.ClauseGuardRunPipeline();
          } else {
            location.reload();
          }
        }
      }, () => {
        setTimeout(() => {
          loadActiveTabData();
          btnReanalyze.textContent = "🔍 Re-analyze Active Tab";
          btnReanalyze.disabled = false;
        }, 1500);
      });
    });
  });

  loadActiveTabData();
});
