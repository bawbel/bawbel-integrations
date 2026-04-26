/**
 * ui/statusBar.ts — status bar item manager
 *
 * Single place that owns the Bawbel status bar item.
 * Call update() with a StatusState to change it — never set text directly.
 *
 * CONTRIBUTING: Adding a new state? Add it to StatusState in core/types.ts,
 * then add a case here. Keep labels short — status bar space is limited.
 */

import * as vscode from "vscode";
import { StatusState } from "../core/types";

export class StatusBarManager {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item          = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left, 100
    );
    this.item.command  = "bawbel.scanFile";
    this.update("idle");
    this.item.show();
  }

  update(state: StatusState, count?: number): void {
    const config  = vscode.workspace.getConfiguration("bawbel");
    if (!config.get<boolean>("showStatusBar", true)) {
      this.item.hide();
      return;
    }

    switch (state) {
      case "idle":
        this.item.text            = "$(shield) Bawbel: ✓ clean";
        this.item.backgroundColor = undefined;
        this.item.color           = undefined;
        this.item.tooltip         = "Bawbel Scanner — no findings\nClick to scan current file";
        break;

      case "watching":
        this.item.text            = "$(eye) Bawbel: watching";
        this.item.backgroundColor = undefined;
        this.item.color           = undefined;
        this.item.tooltip         = "Bawbel Scanner — watch mode active (pattern+yara)\nClick to scan current file";
        break;

      case "scanning":
        this.item.text            = "$(loading~spin) Bawbel: scanning…";
        this.item.backgroundColor = undefined;
        this.item.color           = undefined;
        this.item.tooltip         = "Bawbel Scanner — scan in progress";
        break;

      case "findings":
        this.item.text            = `$(warning) Bawbel: ${count} finding(s)`;
        this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
        this.item.tooltip         = `Bawbel Scanner — ${count} active finding(s)\nClick to scan current file`;
        break;

      case "error":
        this.item.text            = "$(error) Bawbel: error";
        this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.errorBackground");
        this.item.tooltip         = "Bawbel Scanner — check Output panel for details";
        break;

      case "installing":
        this.item.text            = "$(loading~spin) Bawbel: installing…";
        this.item.backgroundColor = undefined;
        this.item.tooltip         = "Bawbel Scanner — installing CLI";
        break;
    }

    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}
