import { App, View, Editor, TFile } from 'obsidian';

/**
 * Obsidian internal API types that are not exposed in the official API
 */

export interface InternalPlugin {
  enabled: boolean;
  instance?: {
    options?: {
      folder?: string;
      format?: string;
      template?: string;
    };
    settings?: {
      folder?: string;
      format?: string;
      template?: string;
    };
  };
  options?: {
    folder?: string;
    format?: string;
    template?: string;
  };
  settings?: {
    folder?: string;
    format?: string;
    template?: string;
  };
}

export interface AppWithInternalPlugins extends App {
  internalPlugins: {
    getPluginById(id: string): InternalPlugin | null;
  };
  setting?: {
    open(): void;
    openTabById(id: string): void;
  };
}

export interface MarkdownEditorWithScroll extends Editor {
  setCursor(line: number, ch: number): void;
  scrollIntoView(range: { from: { line: number; ch: number }; to: { line: number; ch: number } }, center: boolean): void;
}

export interface MurmurViewInterface extends View {
  updateAnimationClass?(): void;
  refreshData?(): void;
}
