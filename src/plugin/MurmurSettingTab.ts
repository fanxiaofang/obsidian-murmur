import { PluginSettingTab, Setting, Notice, type App } from 'obsidian';
import type MurmurPlugin from '../../main';
import type { AppWithInternalPlugins, MurmurViewInterface } from '../domain/obsidian';

export class MurmurSettingTab extends PluginSettingTab {
  plugin: MurmurPlugin;

  constructor(app: App, plugin: MurmurPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  private getDailyNotesPlugin() {
    return (this.app as AppWithInternalPlugins).internalPlugins?.getPluginById?.('daily-notes') ?? null;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName('Murmur · Global View Console').setHeading();
    containerEl.createEl('p', {
      text: '为Obsidian 设计的复古终端式内心独白记录，在无声转动的机械齿轮中，把呢喃低语化为能量碎片',
      cls: 'setting-item-description',
    });

    const dailyNotes = this.getDailyNotesPlugin();
    const isDailyNotesEnabled = Boolean(dailyNotes?.enabled);
    const dnInstance = dailyNotes?.instance ?? dailyNotes;
    const dnSettings = dnInstance?.options ?? dnInstance?.settings ?? dailyNotes?.options ?? dailyNotes?.settings ?? {};
    const dailyNotesFolder = String(dnSettings.folder ?? '').trim();
    const isFolderMissing = isDailyNotesEnabled && !dailyNotesFolder;

    new Setting(containerEl).setName('依赖插件状态 (Dependencies)').setHeading();

    if (isFolderMissing) {
      const warningBox = containerEl.createDiv({
        cls: 'murmur-setting-warning',
      });

      warningBox.createSpan({ text: '⚠️', cls: 'murmur-setting-warning-icon' });

      warningBox.createEl('strong', {
        text: '检测到您尚未设置日记存放目录',
        cls: 'murmur-setting-warning-title'
      });

      warningBox.createEl('p', {
        text: 'Murmur 依赖日记核心插件来存储灵感碎片。当前日记存放目录为空，Murmur 将以只读模式运行，无法写入新条目。',
        cls: 'setting-item-description murmur-setting-warning-desc',
      });

      const btnRow = warningBox.createDiv({ cls: 'murmur-setting-warning-btn-row' });

      const openSettingsBtn = btnRow.createEl('button', {
        text: '前往日记插件设置',
        cls: 'murmur-setting-warning-btn'
      });
      openSettingsBtn.addEventListener('click', () => {
        (this.app as AppWithInternalPlugins).setting?.openTabById?.('daily-notes');
      });
    }

    new Setting(containerEl)
      .setName('日记核心 (Daily Notes)')
      .setDesc(isDailyNotesEnabled ? (dailyNotesFolder ? `[ 已启用 ] 日记目录: ${dailyNotesFolder} | 模板: ${dnSettings.template || '无'}` : '[ ⚠ 已启用但未设置存放目录 ]') : '未启用，Murmur 将无法写入数据。')
      .addToggle((toggle) => {
        toggle.setValue(isDailyNotesEnabled).setDisabled(true);
      });

    new Setting(containerEl).setName('视觉与校准 (Visuals)').setHeading();

    new Setting(containerEl)
      .setName('机械动画')
      .setDesc('打开侧边栏机械齿轮旋转与压力表指针摆动的开关（关闭后可降低 GPU 占用）')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.enableAnimations).onChange(async (value) => {
          try {
            this.plugin.settings.enableAnimations = value;
            await this.plugin.saveSettings();
            for (const leaf of this.app.workspace.getLeavesOfType('murmur-view')) {
              (leaf.view as MurmurViewInterface).updateAnimationClass?.();
            }
          } catch (e) {
            new Notice('保存设置失败');
          }
        });
      });


    new Setting(containerEl).setName('背景音 (Ambient Sound)').setHeading();

    new Setting(containerEl)
      .setName('背景音开关')
      .setDesc('开启后，可以通过输入框底栏信号流图标控制夏日雨后环境音')
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.bgm.enabled).onChange(async (value) => {
          try {
            this.plugin.settings.bgm.enabled = value;
            await this.plugin.saveSettings();
          } catch (e) {
            new Notice('保存设置失败');
          }
        });
      });

    new Setting(containerEl)
      .setName('默认音量')
      .setDesc(`当前: ${Math.round(this.plugin.settings.bgm.defaultVolume * 100)}%`)
      .addSlider((slider) => {
        slider
          .setLimits(5, 100, 5)
          .setValue(this.plugin.settings.bgm.defaultVolume * 100)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.bgm.defaultVolume = value / 100;
            await this.plugin.saveSettings();
            (this.containerEl.querySelector('.setting-item-description:last-of-type') as HTMLElement)
              ?.setText(`当前: ${value}%`);
          });
      });


    new Setting(containerEl).setName('系统状态诊断').setHeading();

    new Setting(containerEl)
      .setName('强制刷新数据')
      .setDesc(isFolderMissing
        ? '请先设置日记存放目录后才能刷新数据。'
        : '如果发现日记内容没有同步，可以尝试手动触发全量重新扫描')
      .addButton(button => button
        .setButtonText('立即刷新')
        .setCta()
        .onClick(async () => {
          if (isFolderMissing) {
            new Notice('尚未设置日记存放目录。请前往 Obsidian 设置 → 日记插件 进行配置，或在此页面上方点击「前往日记插件设置」。');
            return;
          }
          const views = this.app.workspace.getLeavesOfType('murmur-view');
          for (const leaf of views) {
            (leaf.view as MurmurViewInterface).refreshData?.();
          }
          new Notice('已触发 Murmur 数据刷新');
        }));
  }
}
