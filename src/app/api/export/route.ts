/**
 * Export the cleaned dataset as CSV or JSON (bonus requirement).
 * Protected: requires a session whenever Supabase is configured.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase';
import { createServerSupabase } from '@/lib/supabase-server';
import { getMockPosts, getLatestAnalysis } from '@/lib/data';

const CSV_COLUMNS = [
  'account', 'post_id', 'published_at_iso', 'weekday', 'hour', 'topic', 'format',
  'post_type', 'likes', 'replies', 'reposts', 'quotes', 'total_engagement',
  'char_count', 'hashtag_count', 'mention_count', 'url_count', 'has_question',
  'is_synthetic', 'url', 'text',
] as const;

function toCsvCell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  // Quote when the value contains a delimiter, quote or newline.
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: NextRequest) {
  if (isSupabaseConfigured()) {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '需要登入' }, { status: 401 });
    }
  }

  const format = new URL(request.url).searchParams.get('format') ?? 'json';

  try {
    if (format === 'csv') {
      const posts = await getMockPosts();
      const header = CSV_COLUMNS.join(',');
      const body = posts
        .map((p) => CSV_COLUMNS.map((c) => toCsvCell(p[c])).join(','))
        .join('\n');
      // BOM so Excel on Windows reads UTF-8 correctly.
      return new NextResponse('﻿' + header + '\n' + body, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="threads_posts.csv"',
        },
      });
    }

    const { analysis } = await getLatestAnalysis();
    return new NextResponse(JSON.stringify(analysis, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="threads_analysis.json"',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '匯出失敗' },
      { status: 500 },
    );
  }
}
