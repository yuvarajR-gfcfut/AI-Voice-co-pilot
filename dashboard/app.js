let sessions = {};
let selectedSessionId = null;
let selectedTurnIndex = null;

// Optimize polling: Track last rendered active session's state to prevent redundant DOM updates
let lastRenderedSessionId = null;
let lastRenderedTurnsCount = 0;
let lastRenderedOutcome = null;

// Track whether the user has manually scrolled up
let isUserScrolledUp = false;

// Alias main fetch function to support standard fetchLiveData call
function fetchLiveData() {
    fetchFeed();
}

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', () => {
    fetchFeed();
    // Poll every 2 seconds for live updates
    setInterval(fetchFeed, 2000);

    // Scroll event listener for live transcript
    const container = document.getElementById('live-transcript-container');
    if (container) {
        container.addEventListener('scroll', () => {
            const distanceFromBottom = container.scrollHeight - container.clientHeight - container.scrollTop;
            isUserScrolledUp = distanceFromBottom > 60;
        });
    }
    
    // Copy buttons
    document.getElementById('copy-followup-btn').addEventListener('click', () => {
        const text = document.getElementById('followup-text').innerText;
        copyToClipboard(text);
    });

    // Human Oversight click event listeners are handled via event delegation on document.body

    // Session sidebar event delegation
    const sessionList = document.getElementById('session-list');
    sessionList.addEventListener('click', (event) => {
        const item = event.target.closest('.session-item');
        if (item) {
            const sessionId = item.getAttribute('data-session-id');
            selectedSessionId = sessionId;
            selectedTurnIndex = null; // reset selected turn for AI panel
            
            // Remove active class from all items and add to the clicked item
            document.querySelectorAll('.session-item').forEach(el => el.classList.remove('active'));
            item.classList.add('active');
            
            // Immediately fetch and render
            updateTranscriptView(sessionId, true);
        }
    });
});

async function fetchFeed() {
    try {
        const response = await fetch('live_feed.json');
        if (!response.ok) throw new Error("Could not load feed");
        const data = await response.json();
        processFeed(data);
    } catch (err) {
        console.warn("Waiting for live feed data...", err);
    }
}

function processFeed(feedData) {
    const oldSessionsCount = Object.keys(sessions).length;
    sessions = {};
    
    feedData.forEach(item => {
        const cid = item.customer_id;
        if (!sessions[cid]) {
            sessions[cid] = {
                customer_id: cid,
                turns: [],
                crm: null,
                followup: null,
                outcome: 'active'
            };
        }
        
        if (item.type === 'turn') {
            sessions[cid].turns.push(item);
        } else if (item.type === 'crm') {
            sessions[cid].crm = item;
            sessions[cid].outcome = item.outcome;
        } else if (item.type === 'followup') {
            sessions[cid].followup = item;
        }
    });
    
    const newSessionIds = Object.keys(sessions);
    
    // Check if new session added
    if (newSessionIds.length > oldSessionsCount && oldSessionsCount > 0) {
        showToast(`New call session detected: ${newSessionIds[newSessionIds.length - 1]}`);
    }
    
    updateSidebar();
    updateStats();
    initAnalyticsCharts(sessions);
    
    // Select default or keep selected
    if (selectedSessionId && sessions[selectedSessionId]) {
        updateTranscriptView(selectedSessionId, false);
    } else if (newSessionIds.length > 0) {
        selectedSessionId = newSessionIds[0];
        updateTranscriptView(selectedSessionId, true);
    }
}

function updateSidebar() {
    const list = document.getElementById('session-list');
    list.innerHTML = '';
    
    Object.keys(sessions).forEach(id => {
        const s = sessions[id];
        const li = document.createElement('li');
        li.className = `session-item ${id === selectedSessionId ? 'active' : ''}`;
        li.setAttribute('data-session-id', id); // Associate session ID with the DOM element for delegation
        
        let badgeClass = 'status-active';
        let badgeText = 'Active';
        
        if (s.outcome === 'won') {
            badgeClass = 'status-won';
            badgeText = 'Won';
        } else if (s.outcome === 'drop-off') {
            badgeClass = 'status-drop-off';
            badgeText = 'Drop-off';
        }
        
        li.innerHTML = `
            <span class="session-name">${id}</span>
            <span class="badge ${badgeClass}">${badgeText}</span>
        `;
        
        list.appendChild(li);
    });
}

function updateStats() {
    const ids = Object.keys(sessions);
    const totalCalls = ids.length;
    
    let wonCount = 0;
    let totalCost = 0;
    
    ids.forEach(id => {
        const s = sessions[id];
        if (s.outcome === 'won') wonCount++;
        
        // Calculate costs matching gemini_client.py tiers
        s.turns.forEach(turn => {
            if (turn.speaker === 'customer') {
                // Intent classification (Flash)
                totalCost += (120 * 15) / 1000000;
                // NBA generation (Pro)
                totalCost += (450 * 150) / 1000000;
                // Selfcheck review (Flash, only if guardrail passed)
                if (turn.passed_guardrail) {
                    totalCost += (350 * 15) / 1000000;
                }
            }
        });
        
        if (s.followup) {
            totalCost += (180 * 15) / 1000000;
        }
    });
    
    const convRate = totalCalls > 0 ? Math.round((wonCount / totalCalls) * 100) : 0;
    
    document.getElementById('stat-total-calls').innerText = totalCalls;
    document.getElementById('stat-conversion').innerText = totalCalls > 0 ? `${convRate}%` : '-';
    document.getElementById('stat-total-cost').innerText = `₹${totalCost.toFixed(4)}`;
}

function updateTranscriptView(cid, forceScroll = false) {
    const s = sessions[cid];
    if (!s) return;

    if (forceScroll) {
        isUserScrolledUp = false;
    }

    const container = document.getElementById('live-transcript-container');
    const feed = container;
    
    // Optimize: Only redraw the DOM if forced, active session changed, or turn count/outcome changed
    const hasChanged = cid !== lastRenderedSessionId || 
                       s.turns.length !== lastRenderedTurnsCount || 
                       s.outcome !== lastRenderedOutcome;
                       
    if (!forceScroll && !hasChanged) {
        // Redundant poll update, keep the DOM intact
        return;
    }
    
    lastRenderedSessionId = cid;
    lastRenderedTurnsCount = s.turns.length;
    lastRenderedOutcome = s.outcome;

    feed.innerHTML = '';
    
    document.getElementById('active-customer-badge').innerText = cid;
    document.getElementById('active-customer-badge').className = `badge status-${s.outcome}`;
    
    if (s.turns.length === 0) {
        feed.innerHTML = `
            <div class="empty-state">
                <i class="fa-solid fa-hourglass-start"></i>
                <p>Call initiated. Waiting for transcript turns...</p>
            </div>
        `;
        return;
    }
    
    s.turns.forEach((turn, idx) => {
        const bubble = document.createElement('div');
        const isCustomer = turn.speaker === 'customer';
        
        let activeClass = '';
        let iconHtml = '';
        
        if (isCustomer) {
            activeClass = selectedTurnIndex === idx ? 'active-turn' : '';
            iconHtml = `<i class="fa-solid fa-wand-magic-sparkles bubble-copilot-indicator"></i>`;
        }
        
        bubble.className = `chat-bubble ${turn.speaker} ${activeClass}`;
        bubble.innerHTML = `
            <span class="bubble-sender">${turn.speaker}</span>
            <p>${turn.text}</p>
            ${isCustomer ? iconHtml : ''}
        `;
        
        // Let the agent click on a customer turn to review RAG/grounding details in the right-hand panel
        if (isCustomer) {
            bubble.addEventListener('click', () => {
                selectedTurnIndex = idx;
                document.querySelectorAll('.chat-bubble').forEach(el => el.classList.remove('active-turn'));
                bubble.classList.add('active-turn');
                showCopilotInsight(turn);
            });
        }
        
        feed.appendChild(bubble);
    });
    
    // Auto-scroll transcript list to bottom
    if (isUserScrolledUp === false) {
        container.scrollTop = container.scrollHeight;
    }
    
    // Automatically select the last customer turn's insight if none is selected
    if (selectedTurnIndex === null) {
        const customerTurns = s.turns.reduce((acc, turn, index) => {
            if (turn.speaker === 'customer') acc.push(index);
            return acc;
        }, []);
        
        if (customerTurns.length > 0) {
            selectedTurnIndex = customerTurns[customerTurns.length - 1];
            // Highlight the bubble
            const bubbles = feed.querySelectorAll('.chat-bubble.customer');
            if (bubbles.length > 0) {
                bubbles[bubbles.length - 1].classList.add('active-turn');
            }
            showCopilotInsight(s.turns[selectedTurnIndex]);
        } else {
            showCopilotInsight(null);
        }
    }
    
    // Update CRM section at the bottom of the right panel
    const postCallCard = document.getElementById('post-call-card');
    if (s.crm) {
        postCallCard.classList.remove('hidden');
        document.getElementById('crm-outcome').innerText = s.crm.outcome;
        document.getElementById('crm-outcome').className = `badge status-${s.crm.outcome}`;
        document.getElementById('crm-notes').innerText = s.crm.notes;
        
        const followupSec = document.getElementById('followup-section');
        if (s.followup) {
            followupSec.classList.remove('hidden');
            document.getElementById('followup-text').innerText = s.followup.text;
        } else {
            followupSec.classList.add('hidden');
        }
    } else {
        postCallCard.classList.add('hidden');
    }
}

function showCopilotInsight(turn) {
    const container = document.getElementById('copilot-container');
    const emptyState = document.getElementById('copilot-empty');
    
    if (!turn) {
        container.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    container.classList.remove('hidden');
    
    const textarea = document.getElementById('recommendation-textarea');
    if (textarea) {
        textarea.value = turn.final_suggestion;
        textarea.disabled = false;
        textarea.removeAttribute('data-action-logged');
    }
    
    // Reset compliance badge status
    updateComplianceBadge('Pending Review');
    
    const approveBtn = document.getElementById('approve-btn');
    const overrideBtn = document.getElementById('override-btn');
    const lockStatus = document.getElementById('lock-status');
    const bubble = document.querySelector('.human-oversight-bubble');
    
    if (approveBtn) approveBtn.disabled = false;
    if (overrideBtn) overrideBtn.disabled = false;
    if (lockStatus) lockStatus.classList.add('hidden');
    if (bubble) bubble.classList.remove('locked');

    document.getElementById('copilot-intent').innerText = turn.intent.replace('_', ' ').toUpperCase();
    document.getElementById('copilot-fact').innerText = turn.kb_fact || 'No grounding fact required.';
    
    // Update Guardrail Status UI
    const gr = document.getElementById('audit-guardrail');
    if (turn.passed_guardrail) {
        gr.className = 'audit-item passed';
        gr.querySelector('p').innerText = 'Passed (No toxic or final approval words detected)';
    } else {
        gr.className = 'audit-item failed';
        gr.querySelector('p').innerText = 'Blocked & Replaced with fallback compliance statement';
    }
    
    // Update Self Check UI
    const sc = document.getElementById('audit-selfcheck');
    if (!turn.passed_guardrail) {
        sc.className = 'audit-item failed';
        sc.querySelector('p').innerText = 'Skipped (Guardrail blocked suggestion)';
    } else if (turn.passed_selfcheck) {
        sc.className = 'audit-item passed';
        sc.querySelector('p').innerText = 'Passed (AI self-check verified grounding)';
    } else {
        sc.className = 'audit-item failed';
        sc.querySelector('p').innerText = turn.selfcheck_reason || 'Failed (AI self-check failed validation)';
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard!');
    }).catch(err => {
        console.error('Failed to copy: ', err);
    });
}

function showToast(message) {
    const toast = document.getElementById('toast');
    toast.innerText = message;
    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 2500);
}

// Lock Human Oversight UI elements once actions are taken
function lockOversightUI(actionType) {
    const textarea = document.getElementById('recommendation-textarea');
    const approveBtn = document.getElementById('approve-btn');
    const overrideBtn = document.getElementById('override-btn');
    const lockStatus = document.getElementById('lock-status');
    const bubble = document.querySelector('.human-oversight-bubble');
    
    if (textarea) {
        textarea.disabled = true;
        textarea.setAttribute('data-action-logged', actionType);
    }
    if (approveBtn) approveBtn.disabled = true;
    if (overrideBtn) overrideBtn.disabled = true;
    if (lockStatus) lockStatus.classList.remove('hidden');
    if (bubble) bubble.classList.add('locked');
}

// Append new entry to the Human Oversight Log audit trail
function appendAuditEntry(status, text) {
    const logContainer = document.getElementById('human-audit-log');
    if (!logContainer) return;
    
    // Remove empty state if present
    const emptyState = logContainer.querySelector('.log-empty-state');
    if (emptyState) {
        emptyState.remove();
    }
    
    // Generate timestamp using toLocaleTimeString with custom 2-digit format
    const timestamp = new Date().toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    
    // Create new div matching required tailwind structure class
    const entryDiv = document.createElement('div');
    entryDiv.className = 'text-xs p-2 mb-1 rounded bg-gray-800 border border-gray-700 flex justify-between items-center';
    
    // Apply green or orange badge styling based on approval/override state
    const badgeClass = status === 'APPROVED' ? 'bg-green-900 text-green-300' : 'bg-amber-900 text-amber-300';
    
    entryDiv.innerHTML = `
        <div style="display: flex; gap: 8px; align-items: center;">
            <span class="badge ${badgeClass}" style="padding: 2px 6px; font-size: 10px;">${status}</span>
            <span style="color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 200px;">${text}</span>
        </div>
        <span style="color: var(--text-dark); font-size: 11px;">${timestamp}</span>
    `;
    
    // Prepend entry to top of the log container
    logContainer.insertBefore(entryDiv, logContainer.firstChild);
}

// Update the compliance status badge element
function updateComplianceBadge(status) {
    const badge = document.getElementById('compliance-badge');
    if (badge) {
        badge.innerText = status;
        badge.className = `badge status-${status.toLowerCase().replace(' ', '-')}`;
    }
}

// Single delegated click event listener attached to document.body
document.body.addEventListener('click', (e) => {
    const approveBtn = e.target.closest('#approve-btn');
    const overrideBtn = e.target.closest('#override-btn');
    const reloadBtn = e.target.closest('#reload-feed-btn');
    
    if (approveBtn) {
        e.preventDefault();
        const textarea = document.getElementById('recommendation-textarea');
        const text = textarea ? textarea.value : '';
        
        appendAuditEntry('APPROVED', text);
        showToast('AI Recommendation Approved & Sent');
        updateComplianceBadge('Human Verified');
        lockOversightUI('Approved');
    }
    
    if (overrideBtn) {
        e.preventDefault();
        const textarea = document.getElementById('recommendation-textarea');
        const text = textarea ? textarea.value : '';
        
        appendAuditEntry('OVERRIDDEN', text);
        showToast('Custom Response Sent (Human Override)');
        updateComplianceBadge('Human Overridden');
        lockOversightUI('Overridden');
    }

    if (reloadBtn) {
        e.preventDefault();
        fetchLiveData();
        showToast('Feed refreshed successfully');
    }
});

// Chart instances for visual analytics
let outcomeChartInstance = null;
let intentChartInstance = null;

// Initialize and dynamically update the doughnut and bar charts
function initAnalyticsCharts(sessionsData) {
    let wonCount = 0;
    let dropOffCount = 0;
    
    Object.values(sessionsData).forEach(s => {
        if (s.outcome === 'won') wonCount++;
        else if (s.outcome === 'drop-off') dropOffCount++;
    });

    let intentCounts = {
        'Pricing': 0,
        'Credit Score': 0,
        'KYC': 0,
        'Eligibility': 0,
        'Objections': 0
    };
    
    Object.values(sessionsData).forEach(s => {
        s.turns.forEach(turn => {
            if (turn.speaker === 'customer' && turn.intent) {
                const intent = turn.intent.toLowerCase();
                if (intent.includes('pricing') || intent.includes('price')) {
                    intentCounts['Pricing']++;
                } else if (intent.includes('credit') || intent.includes('score') || intent.includes('cibil')) {
                    intentCounts['Credit Score']++;
                } else if (intent.includes('kyc') || intent.includes('document') || intent.includes('verify') || intent.includes('pan') || intent.includes('aadhaar')) {
                    intentCounts['KYC']++;
                } else if (intent.includes('eligibility') || intent.includes('age') || intent.includes('income')) {
                    intentCounts['Eligibility']++;
                } else {
                    intentCounts['Objections']++;
                }
            }
        });
    });

    const textMuted = '#94a3b8';
    const borderDark = 'rgba(255, 255, 255, 0.08)';

    // Outcomes Doughnut Chart
    const ctxOutcome = document.getElementById('outcomeChart');
    if (ctxOutcome) {
        if (outcomeChartInstance) {
            outcomeChartInstance.destroy();
        }
        outcomeChartInstance = new Chart(ctxOutcome, {
            type: 'doughnut',
            data: {
                labels: ['Won', 'Drop-Off'],
                datasets: [{
                    data: [wonCount, dropOffCount],
                    backgroundColor: [
                        'rgba(16, 185, 129, 0.65)',
                        'rgba(239, 68, 68, 0.65)'
                    ],
                    borderColor: [
                        'rgba(16, 185, 129, 1)',
                        'rgba(239, 68, 68, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: textMuted,
                            font: { family: 'Plus Jakarta Sans', size: 11 }
                        }
                    }
                }
            }
        });
    }

    // Customer Intent Bar Chart
    const ctxIntent = document.getElementById('intentChart');
    if (ctxIntent) {
        if (intentChartInstance) {
            intentChartInstance.destroy();
        }
        intentChartInstance = new Chart(ctxIntent, {
            type: 'bar',
            data: {
                labels: ['Pricing', 'Credit Score', 'KYC', 'Eligibility', 'Objections'],
                datasets: [{
                    label: 'Intent distribution',
                    data: [
                        intentCounts['Pricing'],
                        intentCounts['Credit Score'],
                        intentCounts['KYC'],
                        intentCounts['Eligibility'],
                        intentCounts['Objections']
                    ],
                    backgroundColor: 'rgba(99, 102, 241, 0.65)',
                    borderColor: 'rgba(99, 102, 241, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        grid: { color: borderDark },
                        ticks: {
                            color: textMuted,
                            font: { family: 'Plus Jakarta Sans', size: 10 }
                        }
                    },
                    y: {
                        grid: { color: borderDark },
                        beginAtZero: true,
                        ticks: {
                            color: textMuted,
                            precision: 0,
                            font: { family: 'Plus Jakarta Sans', size: 10 }
                        }
                    }
                }
            }
        });
    }
}
