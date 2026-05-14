import {MarkdownView, Notice, TFile, moment, normalizePath, type App} from 'obsidian';
import type {MurmurDataSnapshot, MurmurDataSource, Note} from '../domain/types';
import {
  deleteEntryInMarkdown,
  formatMurmurEntryBlock,
  parseJournalEntriesFromMarkdown,
  updateEntryInMarkdown,
} from './entry-parser';

type DailyNotesSettings = {
  folder: string;
  format: string;
  template: string;
};

function getDailyNotesPlugin(app: App) {
  return (app as any).internalPlugins?.getPluginById?.('daily-notes') ?? null;
}

function getDailyNotesSettings(app: App): DailyNotesSettings {
  const plugin = getDailyNotesPlugin(app);
  const instance = plugin?.instance ?? plugin;
  const rawSettings =
    instance?.options ??
    instance?.settings ??
    plugin?.options ??
    plugin?.settings ??
    {};

  return {
    folder: String(rawSettings.folder ?? '').trim(),
    format: String(rawSettings.format ?? 'YYYY-MM-DD').trim() || 'YYYY-MM-DD',
    template: String(rawSettings.template ?? '').trim(),
  };
}

function isDailyNotesEnabled(app: App) {
  const plugin = getDailyNotesPlugin(app);
  return Boolean(plugin?.enabled);
}

function getTodayJournalPath(app: App) {
  const settings = getDailyNotesSettings(app);
  const basename = moment().format(settings.format);
  const relativePath = settings.folder
    ? normalizePath(`${settings.folder}/${basename}.md`)
    : normalizePath(`${basename}.md`);

  return relativePath;
}

async function ensureFolderExists(app: App, filePath: string) {
  const segments = normalizePath(filePath).split('/');
  segments.pop();

  let currentPath = '';
  for (const segment of segments) {
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;
    const folder = app.vault.getAbstractFileByPath(currentPath);
    if (!folder) {
      await app.vault.createFolder(currentPath);
    }
  }
}

async function getTemplateContent(app: App) {
  const settings = getDailyNotesSettings(app);
  if (!settings.template) {
    return '';
  }

  const templateFile = app.vault.getAbstractFileByPath(normalizePath(settings.template));
  if (!(templateFile instanceof TFile)) {
    return '';
  }

  return app.vault.cachedRead(templateFile);
}

async function ensureTodayJournalFile(app: App) {
  const journalPath = getTodayJournalPath(app);
  const existing = app.vault.getAbstractFileByPath(journalPath);
  if (existing instanceof TFile) {
    return existing;
  }

  await ensureFolderExists(app, journalPath);

  const createdFile = await app.vault.create(journalPath, '');
  const initialContent = await getTemplateContent(app);

  if (initialContent.trim()) {
    await app.vault.modify(createdFile, `${initialContent.trimEnd()}\n`);
  }

  return createdFile;
}



export function createObsidianDataSource(app: App): MurmurDataSource {
  const fileCache = new Map<string, { mtime: number; notes: Note[] }>();
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function isInDailyNotesFolder(filePath: string): boolean {
    const settings = getDailyNotesSettings(app);
    const folder = normalizePath(settings.folder || '');
    if (!folder) return true;
    return filePath === folder || filePath.startsWith(`${folder}/`);
  }

  function scheduleRefresh(onChange: () => void) {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      onChange();
    }, 300);
  }

  return {
    async loadSnapshot(): Promise<MurmurDataSnapshot> {
      if (!isDailyNotesEnabled(app)) {
        fileCache.clear();
        return {notes: []};
      }

      const settings = getDailyNotesSettings(app);
      const folder = normalizePath(settings.folder || '');

      if (!folder) {
        fileCache.clear();
        throw new Error('尚未设置日记存放目录，请前往 Obsidian 设置 → 日记插件 进行配置。');
      }

      const files = app.vault.getMarkdownFiles().filter((file) => {
        if (folder && !file.path.startsWith(`${folder}/`)) {
          return false;
        }
        return true;
      });

      const currentPaths = new Set(files.map(f => f.path));
      for (const cachedPath of fileCache.keys()) {
        if (!currentPaths.has(cachedPath)) {
          fileCache.delete(cachedPath);
        }
      }

      const noteGroups = await Promise.all(
        files.map(async (file) => {
          const cached = fileCache.get(file.path);
          if (cached && cached.mtime === file.stat.mtime) {
            return cached.notes;
          }

          const markdown = await app.vault.cachedRead(file);
          const entries = parseJournalEntriesFromMarkdown({
            path: file.path,
            markdown,
            ctime: file.stat.ctime,
            mtime: file.stat.mtime,
          });

          fileCache.set(file.path, { mtime: file.stat.mtime, notes: entries });
          return entries;
        }),
      );

      return {
        notes: noteGroups
          .flat()
          .sort((a, b) => {
            if (a.date !== b.date) return b.date.localeCompare(a.date);
            if (a.time !== b.time) return b.time.localeCompare(a.time);
            return b.mtime - a.mtime;
          }),
      };
    },

    async createEntry(content: string) {
      const trimmed = content.trim();
      if (!trimmed) {
        return;
      }

      if (!isDailyNotesEnabled(app)) {
        throw new Error('Daily Notes 插件未启用，无法写入 Murmur 条目。');
      }

      const dailySettings = getDailyNotesSettings(app);
      if (!dailySettings.folder.trim()) {
        throw new Error('尚未设置日记存放目录，请前往 Obsidian 设置 → 日记插件 进行配置。');
      }

      const file = await ensureTodayJournalFile(app);
      const block = formatMurmurEntryBlock(trimmed);

      await app.vault.process(file, (existingContent) => {
        const normalized = existingContent.trimEnd();
        if (!normalized) {
          return `${block}\n`;
        }

        return `${normalized}\n\n${block}\n`;
      });

      new Notice('Murmur 已写入今日日记');
    },

    async updateEntry(note: Note, content: string) {
      const trimmed = content.trim();
      if (!trimmed) {
        return;
      }

      const file = app.vault.getAbstractFileByPath(note.path);
      if (!(file instanceof TFile)) {
        throw new Error(`无法编辑日记文件：${note.path}`);
      }

      await app.vault.process(file, (existingContent) => updateEntryInMarkdown(existingContent, note, trimmed));
      new Notice('Murmur 条目已更新');
    },

    async deleteEntry(note: Note) {
      const file = app.vault.getAbstractFileByPath(note.path);
      if (!(file instanceof TFile)) {
        throw new Error(`无法删除日记条目：${note.path}`);
      }

      await app.vault.process(file, (existingContent) => deleteEntryInMarkdown(existingContent, note));
      new Notice('Murmur 条目已删除');
    },

    async openNote(note: Note) {
      const file = app.vault.getAbstractFileByPath(note.path);
      if (!(file instanceof TFile)) {
        throw new Error(`无法打开日记文件：${note.path}`);
      }

      const leaf = app.workspace.getLeaf(true);
      await leaf.openFile(file);

      if (note.startLine && leaf.view instanceof MarkdownView) {
        const editor = (leaf.view as MarkdownView).editor as any;
        const line = Math.max(note.startLine - 1, 0);

        if (editor?.setCursor) {
          editor.setCursor(line, 0);
        }

        if (editor?.scrollIntoView) {
          editor.scrollIntoView({from: {line, ch: 0}, to: {line, ch: 0}}, true);
        }

        return;
      }

      const linkText = `${note.path}#${note.time}`;
      if (typeof app.workspace.openLinkText === 'function') {
        try {
          await app.workspace.openLinkText(linkText, note.path, true);
        } catch (error) {
          console.warn('Murmur failed to locate entry heading, opened file only.', error);
        }
      }
    },

    subscribe(onChange) {
      const handleChange = (file: { path: string }) => {
        if (isInDailyNotesFolder(file.path)) {
          scheduleRefresh(onChange);
        }
      };

      const vaultRefs = [
        app.vault.on('create', handleChange),
        app.vault.on('modify', handleChange),
        app.vault.on('delete', handleChange),
      ];
      const metadataRef = app.metadataCache.on('changed', (file: TFile) => {
        if (isInDailyNotesFolder(file.path)) {
          scheduleRefresh(onChange);
        }
      });

      return () => {
        if (debounceTimer) clearTimeout(debounceTimer);
        vaultRefs.forEach((ref) => app.vault.offref(ref));
        app.metadataCache.offref(metadataRef);
      };
    },
  };
}