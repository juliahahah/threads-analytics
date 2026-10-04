"""Unit tests for the data pipeline and analytics.

Run:  python -m unittest discover -s tests -v
"""

from __future__ import annotations

import sys
import unittest
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import analyze  # noqa: E402
import build_dataset as bd  # noqa: E402


class TestCleaning(unittest.TestCase):
    def test_excel_serial_converts_to_taipei(self):
        # 46296.1919 is 2026-09-30 in the provided sheet
        dt = bd.excel_serial_to_dt("46296.1919")
        self.assertIsInstance(dt, datetime)
        self.assertEqual(dt.year, 2026)
        self.assertEqual(dt.utcoffset().total_seconds(), 8 * 3600)

    def test_to_int_handles_messy_values(self):
        self.assertEqual(bd.to_int("1,234"), 1234)
        self.assertEqual(bd.to_int(""), 0)
        self.assertEqual(bd.to_int(None), 0)
        self.assertEqual(bd.to_int("abc"), 0)
        self.assertEqual(bd.to_int("12.0"), 12)

    def test_clean_drops_duplicates_and_invalid_rows(self):
        rows = [
            {"帳號": "a", "post_id": "X1", "發布時間": "46296.0", "貼文摘要": "hello",
             "按讚": "10", "回覆": "1", "轉發": "0", "引用": "0", "字數": "5",
             "貼文連結": "u", "is_reply": "FALSE", "主題": "t", "文型": "f"},
            # exact duplicate post_id -> dropped
            {"帳號": "a", "post_id": "X1", "發布時間": "46296.0", "貼文摘要": "hello",
             "按讚": "10", "回覆": "1", "轉發": "0", "引用": "0", "字數": "5",
             "貼文連結": "u", "is_reply": "FALSE", "主題": "t", "文型": "f"},
            # missing body -> dropped
            {"帳號": "a", "post_id": "X2", "發布時間": "46296.0", "貼文摘要": "",
             "按讚": "1", "回覆": "0", "轉發": "0", "引用": "0", "字數": "0",
             "貼文連結": "u", "is_reply": "FALSE", "主題": "t", "文型": "f"},
        ]
        cleaned = bd.clean(rows)
        self.assertEqual(len(cleaned), 1)
        self.assertEqual(cleaned[0]["post_id"], "X1")

    def test_missing_char_count_falls_back_to_text_length(self):
        rows = [{
            "帳號": "a", "post_id": "Y1", "發布時間": "46296.0", "貼文摘要": "12345",
            "按讚": "0", "回覆": "0", "轉發": "0", "引用": "0", "字數": "",
            "貼文連結": "", "is_reply": "FALSE", "主題": "t", "文型": "f",
        }]
        self.assertEqual(bd.clean(rows)[0]["char_count"], 5)


class TestEnrichment(unittest.TestCase):
    def _post(self, text: str, **kw):
        base = {
            "text": text, "likes": 1, "replies": 2, "reposts": 3, "quotes": 4,
            "published_at": bd.excel_serial_to_dt("46296.5"), "char_count": len(text),
        }
        base.update(kw)
        return bd.enrich(base)

    def test_counts_hashtags_mentions_urls(self):
        p = self._post("看這個 #心情 #日常 @someone https://example.com")
        self.assertEqual(p["hashtag_count"], 2)
        self.assertEqual(p["mention_count"], 1)
        self.assertEqual(p["url_count"], 1)

    def test_post_type_precedence_url_over_hashtag(self):
        self.assertEqual(self._post("a https://x.com #tag")["post_type"], "含連結")
        self.assertEqual(self._post("a #tag")["post_type"], "含 hashtag")
        self.assertEqual(self._post("a @bob")["post_type"], "含 mention")
        self.assertEqual(self._post("純文字內容")["post_type"], "純文字")

    def test_engagement_totals(self):
        p = self._post("hi")
        self.assertEqual(p["total_engagement"], 1 + 2 + 3 + 4)
        # weighted: likes + 3*replies + 2*reposts + 2*quotes
        self.assertEqual(p["weighted_engagement"], 1 + 6 + 6 + 8)

    def test_detects_both_question_marks(self):
        self.assertTrue(self._post("你覺得呢？")["has_question"])
        self.assertTrue(self._post("really?")["has_question"])
        self.assertFalse(self._post("沒有問題。")["has_question"])


class TestStatistics(unittest.TestCase):
    def test_pearson_perfect_positive(self):
        self.assertEqual(analyze.pearson([1, 2, 3, 4], [2, 4, 6, 8]), 1.0)

    def test_pearson_perfect_negative(self):
        self.assertEqual(analyze.pearson([1, 2, 3, 4], [8, 6, 4, 2]), -1.0)

    def test_pearson_degenerate_inputs_return_zero(self):
        self.assertEqual(analyze.pearson([1, 1, 1], [1, 2, 3]), 0.0)  # zero variance
        self.assertEqual(analyze.pearson([1, 2], [1, 2]), 0.0)        # n < 3

    def test_tokenize_skips_stopwords_and_short_strings(self):
        tokens = analyze.tokenize("我的工作很累")
        self.assertNotIn("我的", tokens)
        self.assertIn("工作", tokens)

    def test_interpret_r_wording(self):
        self.assertIn("強", analyze.interpret_r(0.8))
        self.assertIn("負", analyze.interpret_r(-0.5))
        self.assertIn("幾乎無", analyze.interpret_r(0.05))


class TestTierAnalysis(unittest.TestCase):
    def _make(self, n: int):
        posts = []
        for i in range(n):
            text = f"貼文{i} 我今天很累。你覺得呢？"
            posts.append(bd.enrich({
                "post_id": f"P{i}", "text": text, "likes": i * 10, "replies": i,
                "reposts": 0, "quotes": 0, "char_count": len(text),
                "topic": "t", "format": "f", "is_synthetic": False,
                "url": "", "account": "a", "is_reply": False,
                "published_at": bd.excel_serial_to_dt(f"{46290 + i}.5"),
            }))
        return posts

    def test_splits_into_three_tiers_covering_all_posts(self):
        result = analyze.tier_analysis(self._make(12))
        self.assertEqual(len(result["tiers"]), 3)
        self.assertEqual(sum(t["post_count"] for t in result["tiers"]), 12)

    def test_samples_capped_at_five_and_applied_per_tier(self):
        for t in analyze.tier_analysis(self._make(30))["tiers"]:
            self.assertLessEqual(t["sample_size"], 5)
            self.assertGreaterEqual(t["sample_size"], 3)
            # the SAME profile fields must exist on every sample
            for s in t["samples"]:
                self.assertIn("question_marks", s)
                self.assertIn("lexicon", s)
                self.assertIn("second_person_count", s)

    def test_high_tier_outranks_low_tier(self):
        tiers = analyze.tier_analysis(self._make(12))["tiers"]
        self.assertGreater(
            tiers[0]["aggregate"]["avg_total_engagement"],
            tiers[-1]["aggregate"]["avg_total_engagement"],
        )


class TestRealDatasetIntegrity(unittest.TestCase):
    """Guards against the dataset silently losing its real rows."""

    @classmethod
    def setUpClass(cls):
        import json
        path = ROOT / "data" / "posts.json"
        if not path.exists():
            raise unittest.SkipTest("run `npm run data:build` first")
        cls.posts = json.loads(path.read_text(encoding="utf-8"))

    def test_meets_assignment_minimum(self):
        self.assertGreaterEqual(len(self.posts), 30)

    def test_real_posts_present_and_flagged(self):
        real = [p for p in self.posts if not p["is_synthetic"]]
        self.assertEqual(len(real), 16)

    def test_no_duplicate_post_ids(self):
        ids = [p["post_id"] for p in self.posts]
        self.assertEqual(len(ids), len(set(ids)))

    def test_engagement_fields_consistent(self):
        for p in self.posts:
            self.assertEqual(
                p["total_engagement"],
                p["likes"] + p["replies"] + p["reposts"] + p["quotes"],
                msg=f"mismatch on {p['post_id']}",
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)
