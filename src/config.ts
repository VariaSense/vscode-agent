import * as vscode from 'vscode';

export enum ProviderType {
    Local = 'local',
    OpenAI = 'openai',
    Anthropic = 'anthropic'
}

export interface LocalProviderConfig {
    baseUrl: string;
    model: string;
}

export interface OpenAIProviderConfig {
    apiKey: string;
    model?: string;
}

export class ConfigManager {
    static getConfiguration() {
        return vscode.workspace.getConfiguration('VariaSense');
    }

    static getProviderType(): ProviderType {
        const type = this.getConfiguration().get<string>('providerType');
        return type as ProviderType || ProviderType.Local;
    }

    static getLocalConfig(): LocalProviderConfig {
        const config = this.getConfiguration();
        return {
            baseUrl: config.get<string>('local.baseUrl') || 'http://127.0.0.1:1234/v1',
            model: config.get<string>('local.model') || ''
        };
    }

    static getOpenAIConfig(): OpenAIProviderConfig {
        const config = this.getConfiguration();
        return {
            apiKey: config.get<string>('openai.apiKey') || '',
            model: config.get<string>('openai.model')
        };
    }

    static async setProviderType(type: ProviderType) {
        await this.getConfiguration().update('providerType', type, vscode.ConfigurationTarget.Global);
    }

    static async setLocalBaseUrl(url: string) {
        await this.getConfiguration().update('local.baseUrl', url, vscode.ConfigurationTarget.Global);
    }

    static async setOpenAIKey(key: string) {
        await this.getConfiguration().update('openai.apiKey', key, vscode.ConfigurationTarget.Global);
    }
}
