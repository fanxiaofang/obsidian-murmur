import {StrictMode} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {ItemView, type WorkspaceLeaf} from 'obsidian';
import AppRoot from '../App';
import {createObsidianDataSource} from '../data/obsidian-data-source';
import murmurStyles from '../index.css?inline';

import type MurmurPlugin from '../../main';

export const VIEW_TYPE_MURMUR = 'murmur-view';

export class MurmurView extends ItemView {
  private reactRoot: Root | null = null;
  private previousPadding = '';
  private previousOverflow = '';
  private plugin: MurmurPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: MurmurPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return VIEW_TYPE_MURMUR;
  }

  getDisplayText() {
    return 'Murmur';
  }

  getIcon() {
    return 'blocks';
  }

  private mountEl: HTMLDivElement | null = null;

  async onOpen() {
    this.previousPadding = this.contentEl.style.padding;
    this.previousOverflow = this.contentEl.style.overflow;
    this.contentEl.empty();
    this.contentEl.addClass('murmur-plugin-view');
    this.contentEl.style.padding = '0';
    this.contentEl.style.overflow = 'hidden';

    const shadowHost = this.contentEl.createDiv({cls: 'murmur-shadow-host'});
    shadowHost.style.display = 'block';
    shadowHost.style.width = '100%';
    shadowHost.style.height = '100%';
    const shadowRoot = shadowHost.attachShadow({mode: 'open'});

    const styleEl = document.createElement('style');
    styleEl.textContent = murmurStyles;
    shadowRoot.appendChild(styleEl);

    this.mountEl = document.createElement('div');
    this.mountEl.className = 'murmur-view';
    this.mountEl.style.width = '100%';
    this.mountEl.style.height = '100%';
    shadowRoot.appendChild(this.mountEl);

    // Initial theme sync
    this.updateTheme();
    this.updateAnimationClass();

    // Listen for theme changes
    this.registerEvent(this.app.workspace.on('css-change', () => this.updateTheme()));

    this.reactRoot = createRoot(this.mountEl);
    this.renderApp();
  }

  private updateTheme() {
    if (!this.mountEl) return;
    const isDark = document.body.classList.contains('theme-dark');
    if (isDark) {
      this.mountEl.classList.remove('theme-light');
      this.mountEl.classList.add('theme-dark');
    } else {
      this.mountEl.classList.remove('theme-dark');
      this.mountEl.classList.add('theme-light');
    }
  }

  private updateAnimationClass() {
    if (!this.mountEl) return;
    if (this.plugin.settings.enableAnimations) {
      this.mountEl.classList.remove('murmur-animations-disabled');
    } else {
      this.mountEl.classList.add('murmur-animations-disabled');
    }
  }

  private renderApp() {
    this.reactRoot?.render(
      <StrictMode>
        <AppRoot
          app={this.app}
          dataSource={createObsidianDataSource(this.app)}
          bgmManager={this.plugin.bgmManager}
          onOpenSettings={() => {
            const setting = (this.app as any).setting;
            setting?.open();
            setting?.openTabById?.('murmur');
          }}
        />
      </StrictMode>,
    );
  }

  /**
   * Called from setting tab to manually refresh data
   */
  public refreshData() {
    this.renderApp();
  }

  async onClose() {
    this.reactRoot?.unmount();
    this.reactRoot = null;
    this.contentEl.empty();
    this.contentEl.style.padding = this.previousPadding;
    this.contentEl.style.overflow = this.previousOverflow;
  }
}
