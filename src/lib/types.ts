/** Shared shapes for the analysis payload produced by scripts/analyze.py. */

export interface Post {
  account: string;
  post_id: string;
  published_at_iso: string;
  published_date: string;
  weekday: number;
  hour: number;
  text: string;
  topic: string;
  format: string;
  post_type: string;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  total_engagement: number;
  weighted_engagement: number;
  char_count: number;
  hashtag_count: number;
  mention_count: number;
  url_count: number;
  has_question: boolean;
  is_reply: boolean;
  is_synthetic: boolean;
  url: string;
  hashtags: string[];
  mentions: string[];
}

export interface Overview {
  post_count: number;
  date_range: { from: string; to: string };
  avg_likes: number;
  avg_replies: number;
  avg_reposts: number;
  avg_quotes: number;
  avg_total_engagement: number;
  median_total_engagement: number;
  max_total_engagement: number;
  min_total_engagement: number;
  total_likes: number;
  total_replies: number;
  avg_char_count: number;
}

export interface TopPost {
  rank: number;
  post_id: string;
  excerpt: string;
  likes: number;
  replies: number;
  reposts: number;
  quotes: number;
  total_engagement: number;
  char_count: number;
  topic: string;
  format: string;
  url: string;
  published_at_iso: string;
}

export interface TierSample {
  post_id: string;
  excerpt: string;
  likes: number;
  replies: number;
  total_engagement: number;
  char_count: number;
  topic: string;
  format: string;
  is_synthetic: boolean;
  url: string;
  sentence_count: number;
  avg_sentence_len: number;
  question_marks: number;
  second_person_count: number;
  first_person_count: number;
  ends_with_question: boolean;
  lexicon: Record<string, { count: number; terms: string[] }>;
  top_terms: string[];
}

export interface Tier {
  tier: string;
  post_count: number;
  score_range: { min: number; max: number; median: number };
  aggregate: {
    avg_char_count: number;
    avg_likes: number;
    avg_replies: number;
    avg_total_engagement: number;
    question_rate_pct: number;
    avg_sentences: number;
    avg_second_person: number;
    avg_first_person: number;
  };
  lexicon_totals: Record<string, number>;
  top_formats: { name: string; count: number }[];
  top_topics: { name: string; count: number }[];
  samples: TierSample[];
  sample_size: number;
}

export interface Breakdown {
  name: string;
  post_count: number;
  share_pct: number;
  avg_engagement: number;
  avg_likes: number;
  avg_replies: number;
}

export interface Analysis {
  generated_at: string;
  account: string;
  counts: { total: number; real: number; synthetic: number };
  note: string;
  overview: Overview;
  overview_including_synthetic: Overview;
  top_posts: TopPost[];
  timing: {
    by_weekday: { weekday: number; label: string; post_count: number; avg_engagement: number }[];
    by_hour: { hour: number; post_count: number; avg_engagement: number }[];
    busiest_weekday: { label: string; post_count: number } | null;
    busiest_hour: { hour: number; post_count: number } | null;
    best_hour_by_engagement: { hour: number; avg_engagement: number } | null;
  };
  length_vs_engagement: {
    pearson_char_vs_total: number;
    pearson_char_vs_likes: number;
    pearson_char_vs_replies: number;
    interpretation: string;
    buckets: { bucket: string; post_count: number; avg_engagement: number; avg_likes: number; avg_replies: number }[];
  };
  keywords: {
    top_keywords: { term: string; count: number; doc_freq: number }[];
    top_hashtags: { tag: string; count: number }[];
    hashtag_usage_rate: number;
  };
  by_post_type: Breakdown[];
  by_topic: Breakdown[];
  by_format: Breakdown[];
  tier_analysis: { tiers: Tier[]; method: string; findings: string[] };
}
