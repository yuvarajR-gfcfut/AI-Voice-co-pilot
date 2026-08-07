let sessions = {};
let selectedSessionId = null;
let selectedTurnIndex = null;

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', () => {
    fetchFeed();
    // Poll every 2 seconds for live updates
    setInterval(fetchFeed, 2000);
    
    // Refresh button handler
    document.getElementById('refresh-btn').addEventListener('click', () => {
        fetchFeed();
        showToast('Feed reloaded successfully!');
    });
    
    // Copy buttons
    document.getElementById('copy-btn').addEventListener('click', () => {
        const text = document.getElementById('copilot-suggestion').innerText;
        copyToClipboard(text);
    });
    
    document.getElementById('copy-followup-btn').addEventListener('click', () => {
        const text = document.getElementById('followup-text').innerText;
        copyToClipboard(text);
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
    
    // Select default or keep selected
    if (selectedSessionId && sessions[selectedSessionId]) {
        updateTranscriptView(selectedSessionId);
    } else if (newSessionIds.length > 0) {
        selectedSessionId = newSessionIds[0];
        updateTranscriptView(selectedSessionId);
    }
}

function updateSidebar() {
    const list = document.getElementById('session-list');
    list.innerHTML = '';
    
    Object.keys(sessions).forEach(id => {
        const s = sessions[id];
        const li = document.createElement('li');
        li.className = `session-item ${id === selectedSessionId ? 'active' : ''}`;
        
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
        
        li.addEventListener('click', () => {
            selectedSessionId = id;
            selectedTurnIndex = null; // reset selected turn for AI panel
            document.querySelectorAll('.session-item').forEach(el => el.classList.remove('active'));
            li.classList.add('active');
            updateTranscriptView(id);
        });
        
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

function updateTranscriptView(cid) {
    const s = sessions[cid];
    const feed = document.getElementById('transcript-feed');
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
    feed.scrollTop = feed.scrollHeight;
    
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
    
    document.getElementById('copilot-suggestion').innerText = turn.final_suggestion;
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
