import {Plugin, Notice, addIcon} from 'obsidian';
import {MurmurSettingTab} from './src/plugin/MurmurSettingTab';
import {MurmurView, VIEW_TYPE_MURMUR} from './src/plugin/MurmurView';
import {BgmManager} from './src/audio/BgmManager';
import {DEFAULT_BGM_SETTINGS, type BgmSettings} from './src/audio/types';
import './src/index.css';

interface MurmurSettings {
  enableAnimations: boolean;
  bgm: BgmSettings;
}

const DEFAULT_SETTINGS: MurmurSettings = {
  enableAnimations: true,
  bgm: DEFAULT_BGM_SETTINGS,
};

const MURMUR_ICON = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M5 12c1-2 2-2 3.5 0s2.5 2 3.5 0 2.5-2 3.5 0 2.5 2 3.5 0" />
  <path d="M5 8c1-2 2-2 3.5 0s2.5 2 3.5 0 2.5-2 3.5 0 2.5 2 3.5 0" opacity="0.4" />
  <path d="M5 16c1-2 2-2 3.5 0s2.5 2 3.5 0 2.5-2 3.5 0 2.5 2 3.5 0" opacity="0.6" />
</svg>
`;

export default class MurmurPlugin extends Plugin {
  settings: MurmurSettings = DEFAULT_SETTINGS;
  bgmManager: BgmManager | null = null;

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  async onload() {
    try {
      await this.loadSettings();

      this.bgmManager = new BgmManager(
        this.settings.bgm,
        (msg) => new Notice(msg)
      );

      addIcon('murmur-signal', MURMUR_ICON);
      this.registerView(VIEW_TYPE_MURMUR, (leaf) => new MurmurView(leaf, this));

      this.addRibbonIcon('murmur-signal', 'Open Murmur', async () => {
        await this.activateView();
      });

      this.addCommand({
        id: 'open-murmur-view',
        name: 'Open Murmur view',
        callback: async () => {
          await this.activateView();
        },
      });

      this.addCommand({
        id: 'quick-submit',
        name: 'Quick Submit',
        callback: () => {
          this.app.workspace.trigger('murmur:quick-submit');
        },
      });

      this.addSettingTab(new MurmurSettingTab(this.app, this));
    } catch (e) {
      console.error('[Murmur] Failed to load plugin:', e);
      new Notice(`Murmur 插件加载失败: ${e.message || e}`);
    }
  }

  async onunload() {
    this.bgmManager?.destroy();
    this.bgmManager = null;
    await this.app.workspace.detachLeavesOfType(VIEW_TYPE_MURMUR);
  }

  async activateView() {
    const {workspace} = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_MURMUR)[0];

    if (!leaf) {
      // Use getLeaf(true) to open in a new tab in the main workspace area (Global View)
      leaf = workspace.getLeaf('tab');
      await leaf.setViewState({
        type: VIEW_TYPE_MURMUR,
        active: true,
      });
    }

    if (leaf) {
      workspace.revealLeaf(leaf);
    }
  }
}
