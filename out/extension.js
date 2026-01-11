"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = require("vscode");
const config_1 = require("./config");
const llm_1 = require("./llm");
const ViewProvider_1 = require("./ViewProvider");
function activate(context) {
    console.log('Congratulations, your extension "VariaSense" is now active!');
    let configureDisposable = vscode.commands.registerCommand('variasense.configure', async () => {
        const type = await vscode.window.showQuickPick(['local', 'openai', 'anthropic'], {
            placeHolder: 'Select LLM Provider Type'
        });
        if (type) {
            await config_1.ConfigManager.setProviderType(type);
            vscode.window.showInformationMessage(`VariaSense AI Agent provider set to: ${type}`);
        }
    });
    let testConnectionDisposable = vscode.commands.registerCommand('variasense.testConnection', async () => {
        const client = new llm_1.LLMClient();
        const config = config_1.ConfigManager.getLocalConfig();
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "VariaSense AI Agent: Testing Connection",
            cancellable: false
        }, async (progress) => {
            progress.report({ message: `Connecting to ${config.baseUrl}...` });
            const success = await client.testConnection();
            if (success) {
                vscode.window.showInformationMessage(`Successfully connected to ${config.baseUrl}`);
            }
            else {
                vscode.window.showErrorMessage(`Failed to connect to ${config.baseUrl}. Please check your local server settings.`);
            }
        });
    });
    let generateDisposable = vscode.commands.registerCommand('variasense.generate', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('Please open a text editor to use VariaSense AI Agent.');
            return;
        }
        const prompt = await vscode.window.showInputBox({
            placeHolder: 'Enter your instruction for the LLM...'
        });
        if (!prompt) {
            return;
        }
        const client = new llm_1.LLMClient();
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "VariaSense AI Agent: Generating...",
            cancellable: true
        }, async (progress, token) => {
            try {
                const result = await client.complete(prompt);
                if (result) {
                    editor.edit(editBuilder => {
                        editBuilder.insert(editor.selection.active, result);
                    });
                }
            }
            catch (error) {
                vscode.window.showErrorMessage(`Generation failed: ${error.message}`);
            }
        });
    });
    context.subscriptions.push(configureDisposable);
    context.subscriptions.push(testConnectionDisposable);
    context.subscriptions.push(generateDisposable);
    const provider = new ViewProvider_1.ViewProvider(context.extensionUri, context);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(ViewProvider_1.ViewProvider.viewType, provider));
    // Register Commands for Native Toolbar
    context.subscriptions.push(vscode.commands.registerCommand('variasense.newChat', () => {
        provider.sendMessageToWebview({ type: 'newSession' });
    }), vscode.commands.registerCommand('variasense.showHistory', () => {
        provider.sendMessageToWebview({ type: 'toggleHistory' });
    }), vscode.commands.registerCommand('variasense.resetChat', () => {
        // vscode.window.showWarningMessage('Clear current chat?', 'Yes', 'No').then(selection => {
        //     if (selection === 'Yes') {
        provider.clearChat();
        //     }
        // });
    }), vscode.commands.registerCommand('variasense.openSettings', () => {
        provider.sendMessageToWebview({ type: 'toggleSettings' });
    }));
}
function deactivate() { }
//# sourceMappingURL=extension.js.map