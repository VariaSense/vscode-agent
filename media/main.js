const vscode = acquireVsCodeApi();

const messagesContainer = document.getElementById('messages');
const promptInput = document.getElementById('prompt-input');
const sendButton = document.getElementById('send-button');

// Settings Elements
const settingsPanel = document.getElementById('settings-panel');
const closeSettingsBtn = document.getElementById('close-settings');
const historyPanel = document.getElementById('history-panel');
const closeHistoryBtn = document.getElementById('close-history');
const overlay = document.getElementById('overlay');
const sessionList = document.getElementById('session-list');
const newChatBtn = document.getElementById('new-chat-btn'); // Now inside history or not needed

const providerSelect = document.getElementById('provider-select');
const modelSelect = document.getElementById('model-select'); // In settings
const modelQuickSelect = document.getElementById('model-quick-select'); // In footer
// const modelStatus = document.getElementById('model-status'); // Removed

const baseUrlGroup = document.getElementById('base-url-group');
const baseUrlInput = document.getElementById('base-url-input');
const apiKeyGroup = document.getElementById('api-key-group');
const apiKeyInput = document.getElementById('api-key-input');
const agentModeToggle = document.getElementById('agent-mode-toggle');
const attachButton = document.getElementById('attach-button');
const attachmentsPreview = document.getElementById('attachments-preview');
// const resetButton = document.getElementById('reset-button'); // Removed

let isAgentMode = false;
let currentAttachments = [];
 let currentModel = null;
// Initialize
window.addEventListener('load', () => {
    vscode.postMessage({ type: 'getSettings' });
});

// UI Event Listeners
// Removed specific listeners for top toolbar buttons since they are now native commands
// triggering messages "toggleHistory", "newSession", etc.

if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener('click', () => {
        settingsPanel.classList.remove('visible');
    });
}

closeHistoryBtn.addEventListener('click', closeHistory);
overlay.addEventListener('click', closeHistory);

function closeHistory() {
    historyPanel.classList.remove('visible');
    overlay.classList.remove('visible');
}

// newChatBtn.addEventListener('click', () => {
//     vscode.postMessage({ type: 'newSession' });
//     // closeHistory(); // Not strictly needed inside toolbar but safe
// });

agentModeToggle.addEventListener('change', (e) => {
    isAgentMode = e.target.checked;
});

// --- File Handling ---
attachButton.addEventListener('click', () => {
    vscode.postMessage({ type: 'selectFiles' });
});


// Paste Handler
promptInput.addEventListener('paste', (e) => {
    const items = e.clipboardData.items;
    let hasMedia = false;
    for (const item of items) {
        if (item.type.startsWith('image/')) {
            hasMedia = true;
            const file = item.getAsFile();
            const reader = new FileReader();
            reader.onload = (event) => {
                const base64 = event.target.result; // Data URL
                currentAttachments.push({
                    type: 'image',
                    name: "Pasted Image",
                    data: base64
                });
                renderAttachments();
            };
            reader.readAsDataURL(file);
        }
    }
});

function renderAttachments() {
    attachmentsPreview.innerHTML = '';
    currentAttachments.forEach((att, index) => {
        const chip = document.createElement('div');
        chip.className = 'chip';
        // Shorten long names
        let name = att.name;
        if (name.length > 20) name = name.substring(0, 17) + '...';
        chip.textContent = name;

        const removeBtn = document.createElement('button');
        removeBtn.textContent = '✕';
        removeBtn.onclick = () => {
            currentAttachments.splice(index, 1);
            renderAttachments();
        };

        chip.appendChild(removeBtn);
        attachmentsPreview.appendChild(chip);
    });
}

providerSelect.addEventListener('change', () => {
    updateVisibility();
    saveSettings();
});

baseUrlInput.addEventListener('change', saveSettings);
apiKeyInput.addEventListener('change', saveSettings);

function updateVisibility() {
    const provider = providerSelect.value;
    if (provider === 'local') {
        baseUrlGroup.style.display = 'flex';
        apiKeyGroup.style.display = 'none';
    } else {
        baseUrlGroup.style.display = 'none';
        apiKeyGroup.style.display = 'flex';
    }
}

function saveSettings() {
    vscode.postMessage({
        type: 'updateSettings',
        provider: providerSelect.value,
        baseUrl: baseUrlInput.value,
        apiKey: apiKeyInput.value
    });
}

// Handle button click
sendButton.addEventListener('click', () => {
    sendMessage();
});

// Handle Enter key (Shift+Enter for new line)
promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

function setLoading(isLoading) {
    if (isLoading) {
        sendButton.disabled = true;
        promptInput.disabled = true;
        attachButton.disabled = true;

        // Show typing indicator
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message-wrapper assistant typing-wrapper';
        typingDiv.id = 'typing-indicator';
        typingDiv.innerHTML = `
            <div class="message-header">
                <div class="avatar assistant">AI</div>
                 <span class="timestamp">Thinking...</span>
            </div>
            <div class="message-content typing-indicator">
                <span></span><span></span><span></span>
            </div>
        `;
        messagesContainer.appendChild(typingDiv);
        scrollToBottom();

    } else {
        sendButton.disabled = false;
        promptInput.disabled = false;
        attachButton.disabled = false;
        promptInput.focus();

        // Remove typing indicator
        const indicator = document.getElementById('typing-indicator');
        if (indicator) {
            indicator.remove();
        }
    }
}

function sendMessage() {
    const text = promptInput.value.trim();
    if (!text && currentAttachments.length === 0) return;

    setLoading(true);

    // Send to extension
    vscode.postMessage({
        type: 'askLLM',
        value: text,
        agentMode: isAgentMode,
        attachments: currentAttachments
    });

    // Clear input
    promptInput.value = '';
    currentAttachments = [];
    renderAttachments();
}




function updateModelQuickSelect(models) {
    if (!modelQuickSelect) return;
    modelQuickSelect.innerHTML = '';
    if (!models || models.length === 0) {
        const opt = document.createElement('option');
        opt.text = "No models";
        modelQuickSelect.add(opt);
        return;
    }
    // Sync with provider config if possible, or just list
    // Ideally we need to know the current selected model to select it here
    models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.text = m;
        modelQuickSelect.add(opt);
    });

    // Listener for quick select
    modelQuickSelect.onchange = () => {
        // Just update the main model select (hidden maybe?) or just post message?
        // Let's pretend it updates settings directly or via "updateSettings"
        // Actually simpler: Set the settings UI model select and trigger save
        if (modelSelect) {
            modelSelect.value = modelQuickSelect.value;
            saveSettings();
        }
    };
}

function updateSettingsUI(settings) {
    if (settings.provider) {
        providerSelect.value = settings.provider;
    }
    if (settings.baseUrl) {
        baseUrlInput.value = settings.baseUrl;
    }
    if (settings.apiKey) {
        apiKeyInput.value = settings.apiKey;
    }

    updateVisibility();
    populateModels(settings.models);

    // Also update quick select
    updateModelQuickSelect(settings.models);

    // Sync selection
    currentModel = (settings.provider === 'local') ? settings.models[0] : settings.models[0]; // Simplification
    // Try to find the actual current model from config passed? Settings object passed from backend contains 'models' list but not currently selected one explicitly separated aside from what we might infer.
    // Actually Backend sends 'updateModelStatus' with model name. Use that to set selection.
}

function populateModels(models) {
    modelSelect.innerHTML = '';
    if (!models || models.length === 0) {
        const option = document.createElement('option');
        option.text = "No models found";
        modelSelect.add(option);
        return;
    }

    models.forEach(modelId => {
        const option = document.createElement('option');
        option.value = modelId;
        option.text = modelId;
        if (currentModel === modelId) {
            option.selected = true;
        }
        modelSelect.add(option);
    });

    // If no model selected (or invalid), select first
    if (!modelSelect.value && modelSelect.options.length > 0) {
        modelSelect.selectedIndex = 0;
    }

    // // Force update status
    // updateModelStatusFromDropdown();
}

// modelSelect.addEventListener('change', () => {
//     updateModelStatusFromDropdown();
// });

// function updateModelStatusFromDropdown() {
//     const model = modelSelect.value;
//     if (model) {
//         modelStatus.textContent = model;
//         modelStatus.title = model;
//     }
// }

function addMessage(role, content) {
    const wrapper = document.createElement('div');
    wrapper.className = `message-wrapper ${role}`;

    const header = document.createElement('div');
    header.className = 'message-header';

    const avatar = document.createElement('div');
    avatar.className = `avatar ${role}`;
    avatar.textContent = role === 'user' ? 'ME' : 'AI';

    const timestamp = document.createElement('span');
    timestamp.className = 'timestamp';
    const now = new Date();
    timestamp.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    header.appendChild(avatar);
    header.appendChild(timestamp);

    const messageContent = document.createElement('div');
    messageContent.className = 'message-content';

    // Simple formatting
    if (content.includes('```')) {
        // Basic code block handling
        const parts = content.split(/```/);
        let html = '';
        parts.forEach((part, index) => {
            if (index % 2 === 1) {
                // Code block
                const formatted = part.replace(/</g, '&lt;').replace(/>/g, '&gt;').trim();
                html += `<pre><code>${formatted}</code></pre>`;
            } else {
                // Text
                html += part.replace(/\n/g, '<br>'); // Simple line breaks
            }
        });
        messageContent.innerHTML = html;
    } else {
        messageContent.textContent = content; // Text content safe (escaped by browser)
        // If we want newlines for plain text messages:
        messageContent.innerHTML = content.replace(/\n/g, '<br>').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    if (role === 'error') {
        messageContent.classList.add('error');
    }

    wrapper.appendChild(header);
    wrapper.appendChild(messageContent);
    messagesContainer.appendChild(wrapper);
    scrollToBottom();
}

function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}


function renderSessionList(sessions, currentId) {
    sessionList.innerHTML = '';
    if (!sessions || sessions.length === 0) {
        sessionList.innerHTML = '<div style="padding:10px; opacity:0.6; font-size:12px;">No history</div>';
        return;
    }

    sessions.forEach(session => {
        const item = document.createElement('div');
        item.className = 'session-item';
        if (session.id === currentId) {
            item.classList.add('active');
        }

        item.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <span class="session-title">${session.title || 'New Chat'}</span>
                <button class="delete-session-btn" title="Delete">✕</button>
            </div>
            <span class="session-preview">${session.preview || '...'}</span>
        `;

        // Click to load
        item.addEventListener('click', (e) => {
            // Check if delete button was clicked
            if (e.target.classList.contains('delete-session-btn')) {
                e.stopPropagation();
                if (confirm('Delete this chat?')) {
                    vscode.postMessage({ type: 'deleteSession', id: session.id });
                }
                return;
            }
            // Load session
            if (session.id !== currentId) {
                vscode.postMessage({ type: 'loadSession', id: session.id });
                closeHistory();
            }
        });

    })
}

// Handle messages from the extension
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.type) {
        case 'addMessage':
            addMessage(message.role, message.content);
            if (message.role !== 'user') {
                setLoading(false);
            }
            break;
        case 'initSettings':
            updateSettingsUI(message.settings);
            break;
        case 'updateModels':
            populateModels(message.models);
            break;
        case 'filesSelected':
            if (message.attachments) {
                currentAttachments.push(...message.attachments);
                renderAttachments();
            }
            break;
        case 'initHistory':
            if (message.history) {
                messagesContainer.innerHTML = '';
                message.history.forEach(msg => {
                    addMessage(msg.role, msg.content);
                });
            }
            break;
        case 'updateModelStatus':
            if (message.model) {
                if (modelQuickSelect) {
                    modelQuickSelect.value = message.model;
                    // If not in list, add it temp?
                    if (modelQuickSelect.value !== message.model) {
                        const opt = document.createElement('option');
                        opt.value = message.model;
                        opt.text = message.model;
                        modelQuickSelect.add(opt);
                        modelQuickSelect.value = message.model;
                    }
                }
            }
            break;
        case 'updateSessionList':
            renderSessionList(message.sessions, message.currentId);
            break;
        case 'toggleHistory':
            if (historyPanel.classList.contains('visible')) {
                closeHistory();
            } else {
                historyPanel.classList.add('visible');
                overlay.classList.add('visible');
                vscode.postMessage({ type: 'listSessions' });
            }
            break;
        case 'toggleSettings':
            settingsPanel.classList.toggle('visible');
            break;
        case 'newSession':
            // Just trigger the logic
            vscode.postMessage({ type: 'newSession' });
            break;
        case 'confirmReset':
            // if (confirm('Are you sure you want to clear the current chat?')) {
                vscode.postMessage({ type: 'resetChat' });
            // }
            break;
    }
});
