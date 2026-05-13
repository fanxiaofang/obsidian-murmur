import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {MurmurDataSource, MurmurStats, Note, TagCount} from '../domain/types';

function computeStats(notes: Note[], groupedNotes: Record<string, Note[]>): MurmurStats {
  const sortedDates = Object.keys(groupedNotes).sort();
  let maxStreak = 0;
  let currentStreak = 0;
  let lastDate: Date | null = null;

  sortedDates.forEach((dateStr) => {
    const currentDate = new Date(dateStr);
    if (Number.isNaN(currentDate.getTime())) {
      return;
    }

    if (lastDate) {
      const diffTime = Math.abs(currentDate.getTime() - lastDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        currentStreak++;
      } else {
        maxStreak = Math.max(maxStreak, currentStreak);
        currentStreak = 1;
      }
    } else {
      currentStreak = 1;
    }

    lastDate = currentDate;
  });

  maxStreak = Math.max(maxStreak, currentStreak);
  let peakDate = '---';
  let maxNotes = 0;
  Object.entries(groupedNotes).forEach(([date, dayNotes]) => {
    if (dayNotes.length > maxNotes) {
      maxNotes = dayNotes.length;
      peakDate = date;
    }
  });

  return {
    totalNotes: notes.length,
    totalTags: new Set(notes.flatMap((note) => note.tags)).size,
    totalDays: new Set(notes.map((note) => note.date)).size,
    streak: maxStreak,
    peakDay: peakDate,
  };
}

export function useMurmurData(dataSource: MurmurDataSource) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const subscribeDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async (showLoading = false) => {
    if (showLoading) setIsLoading(true);
    try {
      const snapshot = await dataSource.loadSnapshot();
      setNotes(snapshot.notes);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '读取 Murmur 数据失败。');
    } finally {
      setIsLoading(false);
    }
  }, [dataSource]);

  useEffect(() => {
    void refresh(true);

    if (!dataSource.subscribe) {
      return;
    }

    return dataSource.subscribe(() => {
      if (subscribeDebounce.current) clearTimeout(subscribeDebounce.current);
      subscribeDebounce.current = setTimeout(() => {
        subscribeDebounce.current = null;
        void refresh(false);
      }, 500);
    });
  }, [dataSource, refresh]);

  const groupedNotes = useMemo(() => {
    return notes.reduce<Record<string, Note[]>>((accumulator, note) => {
      if (!accumulator[note.date]) {
        accumulator[note.date] = [];
      }

      accumulator[note.date].push(note);
      return accumulator;
    }, {});
  }, [notes]);

  const sortedTags = useMemo<TagCount[]>(() => {
    const tagCounts = notes
      .flatMap((note) => note.tags)
      .reduce<Record<string, number>>((accumulator, tag) => {
        accumulator[tag] = (accumulator[tag] || 0) + 1;
        return accumulator;
      }, {});

    return Object.entries(tagCounts)
      .map(([name, count]) => ({name, count}))
      .sort((a, b) => b.count - a.count);
  }, [notes]);

  const stats = useMemo(() => computeStats(notes, groupedNotes), [groupedNotes, notes]);

  return {
    notes,
    groupedNotes,
    sortedTags,
    stats,
    isLoading,
    error,
    refresh,
  };
}
