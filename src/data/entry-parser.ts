import type {Note} from '../domain/types';

const ENTRY_HEADING_REGEX = /^#{1,6}\s+(\d{1,2}:\d{2})\s*$/;
const DATE_IN_PATH_REGEX = /(\d{4}-\d{2}-\d{2})|(\d{4}\d{2}\d{2})/;
const TAG_REGEX = /(^|\s)#([^\s#]+)/g;

function normalizeTime(value: string) {
  const [hourPart, minutePart] = value.split(':');
  const hour = hourPart.padStart(2, '0');
  return `${hour}:${minutePart}`;
}

function extractDateFromPath(path: string, fallbackTimestamp: number) {
  const match = path.match(DATE_IN_PATH_REGEX);
  if (match) {
    const matched = match[1] || match[2];
    if (matched) {
      // If it's YYYYMMDD, convert to YYYY-MM-DD
      if (matched.length === 8 && !matched.includes('-')) {
        return `${matched.slice(0, 4)}-${matched.slice(4, 6)}-${matched.slice(6, 8)}`;
      }
      return matched;
    }
  }

  // Use file system creation time if possible, otherwise mtime
  return new Date(fallbackTimestamp).toISOString().slice(0, 10);
}

function extractTags(content: string) {
  const tags = new Set<string>();

  for (const match of content.matchAll(TAG_REGEX)) {
    const tag = match[2]?.trim();
    if (tag) {
      tags.add(tag);
    }
  }

  return [...tags];
}

export function parseJournalEntriesFromMarkdown(params: {
  path: string;
  markdown: string;
  ctime: number;
  mtime: number;
}): Note[] {
  const {path, markdown, ctime, mtime} = params;
  const date = extractDateFromPath(path, mtime);
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const entries: Note[] = [];

  let currentTime: string | null = null;
  let currentContent: string[] = [];
  let currentIndex = 0;

  const pushEntry = () => {
    if (!currentTime) {
      return;
    }

    const content = currentContent.join('\n').trim();
    if (!content) {
      currentTime = null;
      currentContent = [];
      return;
    }

    const normalizedTime = normalizeTime(currentTime);
    entries.push({
      id: `${path}#${normalizedTime}#${currentIndex}`,
      path,
      time: normalizedTime,
      date,
      content,
      tags: extractTags(content),
      ctime,
      mtime,
      startLine: currentIndex + 1,
      endLine: currentIndex + currentContent.length + 1,
    });

    currentTime = null;
    currentContent = [];
  };

  lines.forEach((line, index) => {
    const headingMatch = line.match(ENTRY_HEADING_REGEX);
    if (headingMatch) {
      pushEntry();
      currentTime = headingMatch[1];
      currentIndex = index;
      return;
    }

    if (currentTime) {
      currentContent.push(line);
    }
  });

  pushEntry();

  return entries.sort((a, b) => {
    if (a.date !== b.date) {
      return b.date.localeCompare(a.date);
    }

    return b.time.localeCompare(a.time);
  });
}

export function formatMurmurEntryBlock(content: string, now = new Date()) {
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return `## ${time}\n${content.trim()}\n`;
}

export function formatMurmurEntryBlockWithTime(time: string, content: string) {
  return `## ${normalizeTime(time)}\n${content.trim()}\n`;
}

function normalizeMarkdownAfterMutation(lines: string[]) {
  const joined = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return joined ? `${joined}\n` : '';
}

export function updateEntryInMarkdown(markdown: string, note: Note, content: string) {
  if (!note.startLine || !note.endLine) {
    throw new Error('缺少条目定位信息，无法编辑。');
  }

  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const replacementLines = formatMurmurEntryBlockWithTime(note.time, content).trimEnd().split('\n');
  const startIndex = note.startLine - 1;
  const endIndex = note.endLine;

  lines.splice(startIndex, endIndex - startIndex, ...replacementLines);
  return normalizeMarkdownAfterMutation(lines);
}

export function deleteEntryInMarkdown(markdown: string, note: Note) {
  if (!note.startLine || !note.endLine) {
    throw new Error('缺少条目定位信息，无法删除。');
  }

  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const startIndex = note.startLine - 1;
  let endIndex = note.endLine;

  while (endIndex < lines.length && lines[endIndex]?.trim() === '') {
    endIndex++;
  }

  lines.splice(startIndex, endIndex - startIndex);
  return normalizeMarkdownAfterMutation(lines);
}
