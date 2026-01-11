"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigManager = exports.ProviderType = void 0;
const vscode = require("vscode");
var ProviderType;
(function (ProviderType) {
    ProviderType["Local"] = "local";
    ProviderType["OpenAI"] = "openai";
    ProviderType["Anthropic"] = "anthropic";
})(ProviderType || (exports.ProviderType = ProviderType = {}));
class ConfigManager {
    static getConfiguration() {
        return vscode.workspace.getConfiguration('VariaSense');
    }
    static getProviderType() {
        const type = this.getConfiguration().get('providerType');
        return type || ProviderType.Local;
    }
    static getLocalConfig() {
        const config = this.getConfiguration();
        return {
            baseUrl: config.get('local.baseUrl') || 'http://127.0.0.1:1234/v1',
            model: config.get('local.model') || ''
        };
    }
    static getOpenAIConfig() {
        const config = this.getConfiguration();
        return {
            apiKey: config.get('openai.apiKey') || '',
            model: config.get('openai.model')
        };
    }
    static async setProviderType(type) {
        await this.getConfiguration().update('providerType', type, vscode.ConfigurationTarget.Global);
    }
    static async setLocalBaseUrl(url) {
        await this.getConfiguration().update('local.baseUrl', url, vscode.ConfigurationTarget.Global);
    }
    static async setOpenAIKey(key) {
        await this.getConfiguration().update('openai.apiKey', key, vscode.ConfigurationTarget.Global);
    }
}
exports.ConfigManager = ConfigManager;
//# sourceMappingURL=config.js.map