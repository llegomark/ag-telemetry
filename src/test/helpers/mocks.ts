/**
 * AG Telemetry - Test Mocks
 * Mock implementations for VS Code API and extension dependencies
 */

import * as sinon from 'sinon';

/**
 * Mock VS Code ExtensionContext
 */
export function createMockExtensionContext(): MockExtensionContext {
    const globalStateData = new Map<string, unknown>();

    return {
        subscriptions: [],
        globalState: {
            get: <T>(key: string, defaultValue?: T): T | undefined => {
                return (globalStateData.get(key) as T) ?? defaultValue;
            },
            update: async (key: string, value: unknown): Promise<void> => {
                if (value === undefined) {
                    globalStateData.delete(key);
                } else {
                    globalStateData.set(key, value);
                }
            },
            keys: (): readonly string[] => Array.from(globalStateData.keys()),
            setKeysForSync: (): void => { /* no-op */ }
        },
        workspaceState: {
            get: <T>(_key: string, defaultValue?: T): T | undefined => defaultValue,
            update: async (): Promise<void> => { /* no-op */ },
            keys: (): readonly string[] => [],
            setKeysForSync: (): void => { /* no-op */ }
        },
        extensionPath: '/mock/extension/path',
        extensionUri: { fsPath: '/mock/extension/path' },
        storagePath: '/mock/storage/path',
        globalStoragePath: '/mock/global/storage/path',
        logPath: '/mock/log/path',
        _globalStateData: globalStateData // Expose for test inspection
    };
}

export interface MockExtensionContext {
    subscriptions: { dispose: () => void }[];
    globalState: {
        get: <T>(key: string, defaultValue?: T) => T | undefined;
        update: (key: string, value: unknown) => Promise<void>;
        keys: () => readonly string[];
        setKeysForSync: (keys: readonly string[]) => void;
    };
    workspaceState: {
        get: <T>(key: string, defaultValue?: T) => T | undefined;
        update: (key: string, value: unknown) => Promise<void>;
        keys: () => readonly string[];
        setKeysForSync: (keys: readonly string[]) => void;
    };
    extensionPath: string;
    extensionUri: { fsPath: string };
    storagePath: string;
    globalStoragePath: string;
    logPath: string;
    _globalStateData: Map<string, unknown>;
}

/**
 * Mock VS Code window API
 */
export function createMockWindow() {
    return {
        showInformationMessage: sinon.stub().resolves(undefined),
        showWarningMessage: sinon.stub().resolves(undefined),
        showErrorMessage: sinon.stub().resolves(undefined),
        showQuickPick: sinon.stub().resolves(undefined),
        showInputBox: sinon.stub().resolves(undefined),
        createStatusBarItem: sinon.stub().returns(createMockStatusBarItem()),
        createTreeView: sinon.stub().returns({
            dispose: sinon.stub(),
            onDidChangeVisibility: sinon.stub(),
            reveal: sinon.stub()
        }),
        registerTreeDataProvider: sinon.stub().returns({ dispose: sinon.stub() })
    };
}

/**
 * Mock VS Code StatusBarItem
 */
export function createMockStatusBarItem() {
    return {
        text: '',
        tooltip: '',
        command: undefined as string | undefined,
        backgroundColor: undefined,
        name: '',
        show: sinon.stub(),
        hide: sinon.stub(),
        dispose: sinon.stub()
    };
}

/**
 * Mock VS Code commands API
 */
export function createMockCommands() {
    const registeredCommands = new Map<string, (...args: unknown[]) => unknown>();

    return {
        registerCommand: sinon.stub().callsFake((command: string, callback: (...args: unknown[]) => unknown) => {
            registeredCommands.set(command, callback);
            return { dispose: () => registeredCommands.delete(command) };
        }),
        executeCommand: sinon.stub().callsFake(async (command: string, ...args: unknown[]) => {
            const handler = registeredCommands.get(command);
            if (handler) {
                return handler(...args);
            }
            return undefined;
        }),
        getCommands: sinon.stub().resolves(Array.from(registeredCommands.keys())),
        _registeredCommands: registeredCommands
    };
}

/**
 * Mock VS Code workspace API
 */
export function createMockWorkspace(configValues: Record<string, unknown> = {}) {
    return {
        getConfiguration: sinon.stub().callsFake((section?: string) => ({
            get: <T>(key: string, defaultValue?: T): T => {
                const fullKey = section ? `${section}.${key}` : key;
                return (configValues[fullKey] as T) ?? (configValues[key] as T) ?? defaultValue as T;
            },
            has: (key: string): boolean => {
                const fullKey = section ? `${section}.${key}` : key;
                return fullKey in configValues || key in configValues;
            },
            update: sinon.stub().resolves(),
            inspect: sinon.stub()
        })),
        onDidChangeConfiguration: sinon.stub().returns({ dispose: sinon.stub() })
    };
}

/**
 * Mock ThemeColor
 */
export class MockThemeColor {
    constructor(public readonly id: string) { }
}

/**
 * Mock ThemeIcon
 */
export class MockThemeIcon {
    constructor(
        public readonly id: string,
        public readonly color?: MockThemeColor
    ) { }
}

/**
 * Mock MarkdownString
 */
export class MockMarkdownString {
    public value: string = '';
    public isTrusted: boolean = false;
    public supportThemeIcons: boolean = false;

    constructor(value?: string) {
        this.value = value || '';
    }

    appendMarkdown(value: string): this {
        this.value += value;
        return this;
    }

    appendText(value: string): this {
        this.value += value;
        return this;
    }
}

/**
 * Mock EventEmitter
 */
export class MockEventEmitter<T> {
    private listeners: ((e: T) => void)[] = [];

    event = (listener: (e: T) => void): { dispose: () => void } => {
        this.listeners.push(listener);
        return {
            dispose: () => {
                const index = this.listeners.indexOf(listener);
                if (index > -1) {
                    this.listeners.splice(index, 1);
                }
            }
        };
    };

    fire(data: T): void {
        this.listeners.forEach(listener => listener(data));
    }

    dispose(): void {
        this.listeners = [];
    }
}
