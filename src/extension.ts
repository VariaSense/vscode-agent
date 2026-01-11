import * as vscode from 'vscode';
import { ConfigManager, ProviderType } from './config';
import { LLMClient } from './llm';
import { ViewProvider } from './ViewProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "VariaSense" is now active!');

    let configureDisposable = vscode.commands.registerCommand('variasense.configure', async () => {
        const type = await vscode.window.showQuickPick(['local', 'openai', 'anthropic'], {
            placeHolder: 'Select LLM Provider Type'
        });

        if (type) {
            await ConfigManager.setProviderType(type as ProviderType);
            vscode.window.showInformationMessage(`VariaSense AI Agent provider set to: ${type}`);
        }
    });

    let testConnectionDisposable = vscode.commands.registerCommand('variasense.testConnection', async () => {
        const client = new LLMClient();
        const config = ConfigManager.getLocalConfig();

        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "VariaSense AI Agent: Testing Connection",
            cancellable: false
        }, async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
            progress.report({ message: `Connecting to ${config.baseUrl}...` });
            const success = await client.testConnection();

            if (success) {
                vscode.window.showInformationMessage(`Successfully connected to ${config.baseUrl}`);
            } else {
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

        if (!prompt) { return; }

        const client = new LLMClient();

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
            } catch (error: any) {
                vscode.window.showErrorMessage(`Generation failed: ${error.message}`);
            }
        });
    });

    context.subscriptions.push(configureDisposable);
    context.subscriptions.push(testConnectionDisposable);
    context.subscriptions.push(generateDisposable);

    const provider = new ViewProvider(context.extensionUri, context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(ViewProvider.viewType, provider)
    );

    // Register Commands for Native Toolbar
    context.subscriptions.push(
        vscode.commands.registerCommand('variasense.newChat', () => {
            provider.sendMessageToWebview({ type: 'newSession' });
        }),
        vscode.commands.registerCommand('variasense.showHistory', () => {
            provider.sendMessageToWebview({ type: 'toggleHistory' });
        }),
        vscode.commands.registerCommand('variasense.resetChat', () => {
            // vscode.window.showWarningMessage('Clear current chat?', 'Yes', 'No').then(selection => {
            //     if (selection === 'Yes') {
                    provider.clearChat();
            //     }
            // });
        }),
        vscode.commands.registerCommand('variasense.openSettings', () => {
            provider.sendMessageToWebview({ type: 'toggleSettings' });
        })
    );
}

export function deactivate() { }
