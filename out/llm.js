"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLMClient = void 0;
const config_1 = require("./config");
const https = require("https");
const http = require("http");
class LLMClient {
    async makeRequest(url, method, headers, body) {
        const lib = url.startsWith('https') ? https : http;
        return new Promise((resolve, reject) => {
            const req = lib.request(url, {
                method,
                headers,
            }, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(JSON.parse(data));
                        }
                        catch (e) {
                            reject(new Error(`Failed to parse response: ${data}`));
                        }
                    }
                    else {
                        reject(new Error(`Request failed with status ${res.statusCode}: ${data}`));
                    }
                });
            });
            req.on('error', (e) => reject(e));
            if (body) {
                req.write(JSON.stringify(body));
            }
            req.end();
        });
    }
    async testConnection() {
        const type = config_1.ConfigManager.getProviderType();
        if (type === config_1.ProviderType.Local) {
            const config = config_1.ConfigManager.getLocalConfig();
            try {
                // Try listing models as a connection test
                const modelsUrl = `${config.baseUrl}/models`;
                // Standardize URL handling to assume base URL often includes /v1 if user copied it, 
                // but strictly speaking /models might be at root or under /v1. 
                // For OpenAI compatibility, /v1 is usually part of the base.
                // Let's assume the user provided fully qualified base for v1, e.g. http://localhost:1234/v1
                await this.makeRequest(modelsUrl, 'GET', {});
                return true;
            }
            catch (e) {
                console.error('Connection test failed:', e);
                return false;
            }
        }
        // Add other provider tests here
        return true;
    }
    async listModels() {
        const type = config_1.ConfigManager.getProviderType();
        let url = '';
        let headers = {};
        if (type === config_1.ProviderType.Local) {
            const config = config_1.ConfigManager.getLocalConfig();
            url = `${config.baseUrl}/models`;
        }
        else if (type === config_1.ProviderType.OpenAI) {
            const config = config_1.ConfigManager.getOpenAIConfig();
            url = 'https://api.openai.com/v1/models';
            headers = { 'Authorization': `Bearer ${config.apiKey}` };
        }
        else {
            return []; // Not supported yet for others
        }
        try {
            const response = await this.makeRequest(url, 'GET', headers);
            if (response && response.data) {
                return response.data.map((m) => m.id);
            }
            return [];
        }
        catch (e) {
            console.error('Failed to list models', e);
            return [];
        }
    }
    async complete(input) {
        const type = config_1.ConfigManager.getProviderType();
        let messages = [];
        // Determine if input is already a messages array
        if (Array.isArray(input) && input.length > 0 && input[0].role) {
            messages = input;
        }
        else {
            // It's a prompt string or a multimodal content array
            messages = [{ role: 'user', content: input }];
        }
        if (type === config_1.ProviderType.Local) {
            const config = config_1.ConfigManager.getLocalConfig();
            const request = {
                model: config.model || 'local-model',
                messages: messages,
                temperature: 0.7
            };
            const url = `${config.baseUrl}/chat/completions`;
            const response = await this.makeRequest(url, 'POST', {
                'Content-Type': 'application/json'
            }, request);
            if (response.choices && response.choices.length > 0) {
                return response.choices[0].message.content;
            }
        }
        throw new Error('Provider not implemented or no response');
    }
}
exports.LLMClient = LLMClient;
//# sourceMappingURL=llm.js.map