/**
 * Data access with a simple in-process cache.
 *
 * Reading the analysis payload: Supabase first (the user's most recent job),
 * falling back to the on-disk mock when DATA_SOURCE=mock or Supabase is not
 * configured. The dashboard therefore works end-to-end before any cloud
 * credentials exist, which is what makes local verification possible.
 */
import { promises as fs } from 'fs';
import path from 'path';
import type { Analysis, Post } from './types';
import { isSupabaseConfigured } from './supabase';
import { createServerSupabase } from './supabase-server';

const DATA_DIR = path.join(process.cwd(), 'data');
const CACHE_TTL_MS = 5 * 60 * 1000;

type CacheEntry<T> = { value: T; expires: number };
const cache = new Map<string, CacheEntry<unknown>>();

function cacheGet<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit || hit.expires < Date.now()) {
    if (hit) cache.delete(key);
    return null;
  }
  return hit.value as T;
}

function cacheSet<T>(key: string, value: T): void {
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}

/** Read a JSON file from data/, with cache. Throws a readable error if absent. */
async function readJson<T>(file: string): Promise<T> {
  const key = `file:${file}`;
  const cached = cacheGet<T>(key);
  if (cached) return cached;

  const full = path.join(DATA_DIR, file);
  try {
    const raw = await fs.readFile(full, 'utf-8');
    const parsed = JSON.parse(raw) as T;
    cacheSet(key, parsed);
    return parsed;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `無法讀取 data/${file}（${reason}）。請先執行：npm run data:build`,
    );
  }
}

export async function getMockAnalysis(): Promise<Analysis> {
  return readJson<Analysis>('analysis.json');
}

export async function getMockPosts(): Promise<Post[]> {
  return readJson<Post[]>('posts.json');
}

export function useMockData(): boolean {
  return process.env.DATA_SOURCE === 'mock' || !isSupabaseConfigured();
}

/**
 * The signed-in user's latest analysis.
 * Returns the mock payload when running without Supabase so the dashboard is
 * never blank during local development.
 */
export async function getLatestAnalysis(): Promise<{ analysis: Analysis; source: 'supabase' | 'mock' }> {
  if (useMockData()) {
    return { analysis: await getMockAnalysis(), source: 'mock' };
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase
    .from('analysis_results')
    .select('payload')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // RLS already restricts rows to the caller; an empty result just means the
  // user has not run a job yet, so fall back rather than erroring out.
  if (error || !data?.payload) {
    return { analysis: await getMockAnalysis(), source: 'mock' };
  }
  return { analysis: data.payload as Analysis, source: 'supabase' };
}
