/**
 * POST /api/analyze — create an analysis job for the signed-in user.
 *
 * Accepts a Threads account URL or bare username, normalises it, writes the
 * job + posts + aggregate result into Supabase (all RLS-scoped to the caller),
 * and returns the job id.
 *
 * Retry: transient Supabase/network failures are retried with backoff. A
 * failed job is recorded with its error message rather than vanishing.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase';
import { createServerSupabase } from '@/lib/supabase-server';
import { getMockAnalysis, getMockPosts } from '@/lib/data';
import { parseAccount } from '@/lib/account';

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        await new Promise((r) => setTimeout(r, 300 * 2 ** i));
      }
    }
  }
  throw lastErr;
}

export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { error: '尚未設定 Supabase，無法建立分析任務。請參考 README 設定環境變數。' },
      { status: 503 },
    );
  }

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: '需要登入' }, { status: 401 });
  }

  let body: { account?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '請求內容不是合法的 JSON' }, { status: 400 });
  }

  const account = parseAccount(body.account ?? '');
  if (!account) {
    return NextResponse.json(
      { error: '無效的帳號。請輸入 username 或 Threads 個人頁網址。' },
      { status: 400 },
    );
  }

  // Create the job first so a later failure is still auditable.
  const { data: job, error: jobError } = await supabase
    .from('analysis_jobs')
    .insert({ user_id: user.id, account, source: 'mock', status: 'running' })
    .select('id')
    .single();

  if (jobError || !job) {
    return NextResponse.json(
      { error: `建立任務失敗：${jobError?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }

  try {
    const [posts, analysis] = await Promise.all([getMockPosts(), getMockAnalysis()]);

    const rows = posts.map((p) => ({
      job_id: job.id,
      user_id: user.id,
      account,
      post_id: p.post_id,
      published_at: p.published_at_iso,
      text: p.text,
      topic: p.topic,
      format: p.format,
      post_type: p.post_type,
      likes: p.likes,
      replies: p.replies,
      reposts: p.reposts,
      quotes: p.quotes,
      total_engagement: p.total_engagement,
      char_count: p.char_count,
      hashtag_count: p.hashtag_count,
      mention_count: p.mention_count,
      url_count: p.url_count,
      has_question: p.has_question,
      is_reply: p.is_reply,
      is_synthetic: p.is_synthetic,
      url: p.url,
    }));

    // upsert on the dedupe key so re-running a job is idempotent
    await withRetry(async () => {
      const { error } = await supabase
        .from('posts')
        .upsert(rows, { onConflict: 'job_id,post_id' });
      if (error) throw new Error(error.message);
    });

    await withRetry(async () => {
      const { error } = await supabase
        .from('analysis_results')
        .upsert(
          { job_id: job.id, user_id: user.id, account, payload: analysis },
          { onConflict: 'job_id' },
        );
      if (error) throw new Error(error.message);
    });

    await supabase
      .from('analysis_jobs')
      .update({
        status: 'succeeded',
        post_count: rows.length,
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    return NextResponse.json({ job_id: job.id, account, post_count: rows.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from('analysis_jobs')
      .update({
        status: 'failed',
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    return NextResponse.json({ error: `分析失敗：${message}` }, { status: 500 });
  }
}
