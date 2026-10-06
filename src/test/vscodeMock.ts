export const window = {
  terminals: [] as any[],
  createTerminal: () => ({
    name: '⚡ Konvert: Run',
    show: () => {},
    sendText: () => {},
    dispose: () => {},
  }),
  showWarningMessage: () => Promise.resolve(undefined),
  showErrorMessage: () => Promise.resolve(undefined),
  showInformationMessage: () => Promise.resolve(undefined),
  showQuickPick: () => Promise.resolve(undefined),
  showInputBox: () => Promise.resolve(undefined),
  setStatusBarMessage: () => ({ dispose: () => {} }),
  activeTextEditor: undefined,
};

export const workspace = {
  textDocuments: [] as any[],
};
