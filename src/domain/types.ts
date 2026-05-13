export interface Note {
  id: string;
  path: string;
  time: string;
  date: string;
  content: string;
  tags: string[];
  ctime: number;
  mtime: number;
  startLine?: number;
  endLine?: number;
  frontmatter?: Record<string, unknown>;
}

export interface TagCount {
  name: string;
  count: number;
}

export interface MurmurStats {
  totalNotes: number;
  totalTags: number;
  totalDays: number;
  streak: number;
  peakDay: string;
}

export interface MurmurDataSnapshot {
  notes: Note[];
}

export interface MurmurDataSource {
  loadSnapshot(): Promise<MurmurDataSnapshot>;
  createEntry(content: string): Promise<void>;
  updateEntry(note: Note, content: string): Promise<void>;
  deleteEntry(note: Note): Promise<void>;
  openNote(note: Note): Promise<void>;
  subscribe?(onChange: () => void): () => void;
}
