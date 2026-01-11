"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ViewProvider = void 0;
const vscode = require("vscode");
const config_1 = require("./config");
const llm_1 = require("./llm");
const SessionManager_1 = require("./SessionManager");
class ViewProvider {
    constructor(_extensionUri, _context) {
        this._extensionUri = _extensionUri;
        this._context = _context;
        this._currentSessionId = null;
        this._pendingMessages = [];
        this._sessionManager = new SessionManager_1.SessionManager(_context);
    }
    sendSessionList() {
        if (!this._view)
            return;
        const sessions = this._sessionManager.getSessions();
        this._view.webview.postMessage({ type: 'updateSessionList', sessions, currentId: this._currentSessionId });
    }
    sendMessageToWebview(message) {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
        else {
            this._pendingMessages.push(message);
        }
    }
    async clearChat() {
        await this._context.globalState.update('chatHistory', []);
        this._view?.webview.postMessage({ type: 'initHistory', history: [] });
        const greeting = { role: 'assistant', content: "Chat reset. How can I help you?" };
        // Create new session effectively
        this._currentSessionId = await this._sessionManager.createSession();
        await this._sessionManager.saveMessageToSession(this._currentSessionId, greeting.role, greeting.content);
        this._view?.webview.postMessage({ type: 'addMessage', role: greeting.role, content: greeting.content });
        this.sendSessionList();
    }
    async resetChatUI() {
        // Clear history in global state
        await this._context.globalState.update('chatHistory', []);
        // Notify webview to clear UI
        this._view?.webview.postMessage({ type: 'initHistory', history: [] });
        // Re-send initial greeting
        const greeting = { role: 'assistant', content: "Chat reset. How can I help you?" };
        this._currentSessionId = await this._sessionManager.createSession();
        await this._sessionManager.saveMessageToSession(this._currentSessionId, greeting.role, greeting.content);
        this._view?.webview.postMessage({ type: 'addMessage', role: greeting.role, content: greeting.content });
    }
    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;
        for (const message of this._pendingMessages) {
            this._view.webview.postMessage(message);
        }
        this._pendingMessages = [];
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'askLLM':
                    {
                        if (!data.value && (!data.attachments || data.attachments.length === 0)) {
                            return;
                        }
                        await this.handleUserMessage(data.value, data.agentMode, data.attachments);
                        break;
                    }
                case 'selectFiles':
                    {
                        const options = {
                            canSelectMany: true,
                            openLabel: 'Attach',
                            canSelectFiles: true,
                            canSelectFolders: false
                        };
                        const fileUris = await vscode.window.showOpenDialog(options);
                        if (fileUris && fileUris.length > 0) {
                            const attachments = [];
                            for (const uri of fileUris) {
                                // Simple logic: check if image or text
                                // For MVP we read everything as potential text unless it looks like an image
                                // Actually, webview needs base64 for images to preview them effectively too if we want to pass them back/forth
                                // But better to just return path and let webview show path, then read on demand? 
                                // No, user wants to "add files". Let's read them now.
                                try {
                                    const fileData = await vscode.workspace.fs.readFile(uri);
                                    // Heuristic check
                                    const ext = uri.path.split('.').pop()?.toLowerCase();
                                    const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext || '');
                                    if (isImage) {
                                        const base64 = Buffer.from(fileData).toString('base64');
                                        attachments.push({
                                            type: 'image',
                                            name: uri.path.split('/').pop(),
                                            data: `data:image/${ext};base64,${base64}`
                                        });
                                    }
                                    else {
                                        attachments.push({
                                            type: 'text',
                                            name: uri.path.split('/').pop(),
                                            content: Buffer.from(fileData).toString('utf-8')
                                        });
                                    }
                                }
                                catch (e) {
                                    console.error("Failed to read file", uri, e);
                                }
                            }
                            this._view?.webview.postMessage({ type: 'filesSelected', attachments });
                        }
                        break;
                    }
                case 'getSettings':
                    {
                        await this.sendSettingsToWebview();
                        break;
                    }
                case 'updateSettings':
                    {
                        if (data.provider) {
                            await config_1.ConfigManager.setProviderType(data.provider);
                        }
                        if (data.baseUrl) {
                            await config_1.ConfigManager.setLocalBaseUrl(data.baseUrl);
                        }
                        if (data.apiKey) {
                            // Determine which provider to update based on current selection or passed data
                            // Simplification: if provider is openai, update openai key.
                            const currentProvider = data.provider || config_1.ConfigManager.getProviderType();
                            if (currentProvider === config_1.ProviderType.OpenAI) {
                                await config_1.ConfigManager.setOpenAIKey(data.apiKey);
                            }
                        }
                        await this.sendSettingsToWebview();
                        break;
                    }
                case 'refreshModels':
                    {
                        const client = new llm_1.LLMClient();
                        const models = await client.listModels();
                        this._view?.webview.postMessage({ type: 'updateModels', models });
                        break;
                    }
                case 'newSession':
                    {
                        this.resetChatUI();
                        break;
                    }
                case 'resetChat':
                    {
                        // Clear history in global state
                        await this._context.globalState.update('chatHistory', []);
                        // Notify webview to clear UI
                        this._view?.webview.postMessage({ type: 'initHistory', history: [] });
                        // Re-send initial greeting? 
                        // Actually, webview reload might be cleaner, but let's just send a fresh greeting
                        const greeting = { role: 'assistant', content: "Chat reset. How can I help you?" };
                        await this._sessionManager.saveMessageToSession(this._currentSessionId, greeting.role, greeting.content);
                        this._view?.webview.postMessage({ type: 'addMessage', role: greeting.role, content: greeting.content });
                        break;
                    }
            }
        });
    }
    async sendSettingsToWebview() {
        if (!this._view)
            return;
        const type = config_1.ConfigManager.getProviderType();
        const localConfig = config_1.ConfigManager.getLocalConfig();
        const openaiConfig = config_1.ConfigManager.getOpenAIConfig();
        const client = new llm_1.LLMClient();
        const models = await client.listModels();
        this._view.webview.postMessage({
            type: 'initSettings',
            settings: {
                provider: type,
                models: models,
                baseUrl: localConfig.baseUrl,
                apiKey: openaiConfig.apiKey
            }
        });
        // Load history and Model Info
        const history = this._context.globalState.get('chatHistory', []);
        this._view.webview.postMessage({ type: 'initHistory', history });
        // Send current model name for status bar
        if (models.length > 0) {
            if (type === config_1.ProviderType.Local && !localConfig.model) {
                localConfig.model = models[0];
            }
            else if (type === config_1.ProviderType.OpenAI && !openaiConfig.model) {
                openaiConfig.model = models[0];
            }
        }
        const currentModel = (type === config_1.ProviderType.Local ? localConfig.model : openaiConfig.model) || "Unknown Model";
        this._view.webview.postMessage({ type: 'updateModelStatus', model: currentModel });
    }
    async handleUserMessage(userMessage, agentMode, attachments) {
        if (!this._view) {
            return;
        }
        // 1. Show user message
        // If there are attachments, we should maybe serialize them for display or just show [Image] etc.
        // For now, simpliest is to show text and a note about attachments
        // 1. Show user message
        let displayMessage = userMessage;
        if (attachments && attachments.length > 0) {
            const names = attachments.map(a => a.name).join(', ');
            displayMessage += `\n[Attached: ${names}]`;
        }
        this._view.webview.postMessage({ type: 'addMessage', role: 'user', content: displayMessage });
        // Save user message
        if (!this._currentSessionId) {
            // Fallback if no session
            this._currentSessionId = await this._sessionManager.createSession();
        }
        await this._sessionManager.saveMessageToSession(this._currentSessionId, 'user', displayMessage);
        this.sendSessionList(); // Update preview
        // 2. Call LLM
        const client = new llm_1.LLMClient();
        try {
            // Build Prompt
            let prompt = userMessage;
            // If we have attachments, we need to construct a robust prompt or multimodal content
            if (attachments && attachments.length > 0) {
                // Check if any are images
                const hasImages = attachments.some(a => a.type === 'image');
                if (hasImages) {
                    // Multimodal construction
                    const contentArray = [];
                    if (userMessage) {
                        contentArray.push({ type: 'text', text: userMessage });
                    }
                    for (const att of attachments) {
                        if (att.type === 'image') {
                            contentArray.push({
                                type: 'image_url',
                                image_url: {
                                    url: att.data // data:image/...;base64,...
                                }
                            });
                        }
                        else {
                            // Append text attachments as text blocks
                            contentArray.push({
                                type: 'text',
                                text: `File: ${att.name}\n${att.content}`
                            });
                        }
                    }
                    prompt = contentArray;
                }
                else {
                    // Text only attachments - just append to string
                    for (const att of attachments) {
                        prompt += `\n\n--- File: ${att.name} ---\n${att.content}\n---`;
                    }
                }
            }
            // 3. Construct Full Messages History
            let messages = [];
            // A. System Prompt (Agent Mode or General)
            if (agentMode) {
                const systemPrompt = `You are VariaSense AI Agent, an AI assistant in VS Code.
You are in AGENT MODE. You can edit files.
If you want to create or edit a file, output the content in a code block like this:
<write_file path="path/to/file.txt">
CONTENT HERE
</write_file>

Always use forward slashes for paths. relative paths are relative to workspace root.`;
                messages.push({ role: 'system', content: systemPrompt });
            }
            else {
                messages.push({ role: 'system', content: "You are VariaSense AI Agent, a helpful AI assistant in VS Code." });
            }
            // B. Chat History
            const history = this._context.globalState.get('chatHistory', []);
            // We append history. Note: History contains {role, content} where content is string.
            // Previous attachments are only represented by their text summary in history.
            messages.push(...history);
            // C. Current Message
            // 'prompt' variable currently holds the user message content (string or array)
            messages.push({ role: 'user', content: prompt });
            const response = await client.complete(messages);
            if (response) {
                this._view.webview.postMessage({ type: 'addMessage', role: 'assistant', content: response });
                await this._sessionManager.saveMessageToSession(this._currentSessionId, 'assistant', response);
                this.sendSessionList();
                if (agentMode) {
                    await this.processAgentResponse(response);
                }
            }
            else {
                const noResp = "(No response from provider)";
                this._view.webview.postMessage({ type: 'addMessage', role: 'assistant', content: noResp });
                await this._sessionManager.saveMessageToSession(this._currentSessionId, 'assistant', noResp);
            }
        }
        catch (e) {
            const errorMsg = `Error: ${e.message}`;
            this._view.webview.postMessage({ type: 'addMessage', role: 'error', content: errorMsg });
            // Do not save errors to history typically, or maybe save them as errors?
            // For now let's not persist transient errors causing history clutter.
        }
    }
    // Old saveMessage method removed or deprecated
    /*
    private saveMessage(role: string, content: string) {
        ...
    }
    */
    async processAgentResponse(response) {
        // Simple regex to find <write_file> tags
        const fileRegex = /<write_file path="([^"]+)">([\s\S]*?)<\/write_file>/g;
        let match;
        while ((match = fileRegex.exec(response)) !== null) {
            const filePath = match[1];
            const content = match[2];
            try {
                // Determine absolute path. If relative, use workspace root.
                let uri;
                if (vscode.workspace.workspaceFolders && !filePath.includes(':') && !filePath.startsWith('/')) {
                    uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, filePath);
                }
                else {
                    uri = vscode.Uri.file(filePath); // Assume absolute if possible or let vscode handle it
                }
                await vscode.workspace.fs.writeFile(uri, new Uint8Array(Buffer.from(content)));
                this._view?.webview.postMessage({ type: 'addMessage', role: 'assistant', content: `✅ Wrote to file: ${filePath}` });
            }
            catch (e) {
                this._view?.webview.postMessage({ type: 'addMessage', role: 'error', content: `Failed to write file ${filePath}: ${e.message}` });
            }
        }
    }
    _getHtmlForWebview(webview) {
        const styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css'));
        const styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css'));
        const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'));
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
        // Use a secure nonce
        const nonce = getNonce();
        return `<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link href="${styleResetUri}" rel="stylesheet">
				<link href="${styleVSCodeUri}" rel="stylesheet">
				<link href="${styleMainUri}" rel="stylesheet">
				<title>VariaSense AI Agent</title>
			</head>
			<body>
                <!-- Overlay -->
                <div id="overlay" class="overlay"></div>

                <!-- History Panel -->
                <div id="history-panel" class="history-panel">
                    <div class="history-header">
                        <span>History</span>
                        <button id="close-history" class="toolbar-btn">✕</button>
                    </div>
                    <div id="session-list" class="session-list">
                        <!-- Items -->
                    </div>
                </div>

                <!-- No Toolbar (Native VS Code Toolbar Used) -->

                <div class="chat-container">
                    <!-- Settings Panel Overlay -->
                    <div id="settings-panel" class="settings-panel">
                        <div class="header-row">
                             <h3>Settings</h3>
                             <button id="close-settings" class="icon-btn secondary">✕</button>
                        </div>
                        <div class="form-group">
                            <label>Provider</label>
                            <select id="provider-select">
                                <option value="local">Local</option>
                                <option value="openai">OpenAI</option>
                                <option value="anthropic">Anthropic</option>
                            </select>
                        </div>
                        <div class="form-group" id="base-url-group">
                            <label>Base URL</label>
                            <input type="text" id="base-url-input" placeholder="e.g. http://localhost:1234/v1">
                        </div>
                        <div class="form-group" id="api-key-group">
                            <label>API Key</label>
                            <input type="password" id="api-key-input" placeholder="sk-...">
                        </div>
                        <div class="form-group">
                            <label>Model</label>
                            <select id="model-select">
                                <option value="" disabled selected>Loading...</option>
                            </select>
                        </div>
                         <div class="toggle-group">
                            <label>Agent Mode</label>
                             <label class="switch">
                                <input type="checkbox" id="agent-mode-toggle">
                                <span class="slider"></span>
                            </label>
                        </div>
                    </div>

                    <!-- Messages Area -->
                    <div id="messages" class="messages">
                        <!-- Initial Greeting -->
                        <div class="message-wrapper assistant">
                            <div class="message-header">
                                <div class="avatar assistant">AI</div>
                                <span class="timestamp">Just now</span>
                            </div>
                            <div class="message-content">
                                Hello! I am VariaSense AI Agent. How can I help you today?
                            </div>
                        </div>
                    </div>

                    <!-- Input Area -->
                    <div class="input-area">
                        <div class="input-controls">
                             <button id="attach-button" class="icon-btn secondary" title="Attach Files">
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M4.5 3.5C4.5 1.57 6.07 0 8 0C9.93 0 11.5 1.57 11.5 3.5V11.5C11.5 13.98 9.48 16 7 16C4.52 16 2.5 13.98 2.5 11.5V5.5H4V11.5C4 13.16 5.34 14.5 7 14.5C8.66 14.5 10 13.16 10 11.5V3.5C10 2.4 9.1 1.5 8 1.5C6.9 1.5 6 2.4 6 3.5V10.5H4.5V3.5Z"/>
                                </svg>
                            </button>
                            <select id="model-quick-select" class="model-quick-select" title="Active Model">
                                <option value="" disabled selected>Loading Models...</option>
                            </select>
                        </div>
                        <div id="attachments-preview" class="attachments-preview"></div>
                        <div class="input-row">
                            <textarea id="prompt-input" placeholder="Ask anything... (Cmd+Enter to send)"></textarea>
                            <button id="send-button" class="icon-btn" title="Send">
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                    <path d="M1.5 8.5L14.5 2L8 14.5L6.5 9.5L1.5 8.5Z"/>
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
    }
}
exports.ViewProvider = ViewProvider;
ViewProvider.viewType = 'variasense.chatView';
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
//# sourceMappingURL=ViewProvider.js.map