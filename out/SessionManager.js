"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionManager = void 0;
const crypto = require("crypto");
class SessionManager {
    constructor(context) {
        this.context = context;
        this.STORAGE_KEY_META = 'polysense_sessions_meta';
        this.STORAGE_KEY_PREFIX = 'polysense_session_';
    }
    getSessions() {
        const data = this.context.globalState.get(this.STORAGE_KEY_META) || [];
        return data.sort((a, b) => b.timestamp - a.timestamp);
    }
    async createSession(title = "New Chat") {
        const id = crypto.randomUUID();
        const sessions = this.getSessions();
        const newSession = {
            id,
            title,
            timestamp: Date.now(),
            preview: "Empty conversation"
        };
        sessions.unshift(newSession);
        await this.context.globalState.update(this.STORAGE_KEY_META, sessions);
        await this.context.globalState.update(this.getSessionKey(id), []);
        return id;
    }
    getSessionMessages(id) {
        return this.context.globalState.get(this.getSessionKey(id)) || [];
    }
    async saveMessageToSession(id, role, content) {
        const messages = this.getSessionMessages(id);
        messages.push({ role, content });
        // Limit message history per session if needed (e.g., 50)
        if (messages.length > 100) {
            messages.shift();
        }
        await this.context.globalState.update(this.getSessionKey(id), messages);
        // Update metadata (timestamp, preview, title if it's the first user message)
        const sessions = this.getSessions();
        const sessionIndex = sessions.findIndex(s => s.id === id);
        if (sessionIndex !== -1) {
            const session = sessions[sessionIndex];
            session.timestamp = Date.now();
            session.preview = content.substring(0, 50) + (content.length > 50 ? '...' : '');
            // Auto-update title if it's currently "New Chat" and this is a user message
            if (role === 'user' && session.title === "New Chat") {
                session.title = content.substring(0, 30) + (content.length > 30 ? '...' : '');
            }
            // Move to top
            sessions.splice(sessionIndex, 1);
            sessions.unshift(session);
            await this.context.globalState.update(this.STORAGE_KEY_META, sessions);
        }
    }
    async deleteSession(id) {
        const sessions = this.getSessions();
        const newSessions = sessions.filter(s => s.id !== id);
        await this.context.globalState.update(this.STORAGE_KEY_META, newSessions);
        await this.context.globalState.update(this.getSessionKey(id), undefined);
    }
    async clearAllSessions() {
        const sessions = this.getSessions();
        for (const session of sessions) {
            await this.context.globalState.update(this.getSessionKey(session.id), undefined);
        }
        await this.context.globalState.update(this.STORAGE_KEY_META, []);
    }
    // Migration helper
    async migrateLegacyHistory() {
        const legacyHistory = this.context.globalState.get('chatHistory');
        if (legacyHistory && legacyHistory.length > 0) {
            const id = await this.createSession("Legacy Session");
            await this.context.globalState.update(this.getSessionKey(id), legacyHistory);
            // Clear legacy key to avoid double migration
            await this.context.globalState.update('chatHistory', undefined);
            // Update preview/timestamp based on last message
            const lastMsg = legacyHistory[legacyHistory.length - 1];
            if (lastMsg) {
                const sessions = this.getSessions();
                const session = sessions.find(s => s.id === id);
                if (session) {
                    session.preview = lastMsg.content.substring(0, 50);
                    await this.context.globalState.update(this.STORAGE_KEY_META, sessions);
                }
            }
            return id;
        }
        return null; // No migration needed
    }
    getSessionKey(id) {
        return this.STORAGE_KEY_PREFIX + id;
    }
}
exports.SessionManager = SessionManager;
//# sourceMappingURL=SessionManager.js.map