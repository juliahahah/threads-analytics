"""Generate a 5-minute spoken-presentation deck from data/analysis.json.

Distinct from export_deck.py (the dense written report): this deck carries one
argument per slide, sized to be read from the back of a room.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Emu, Pt

ROOT = Path(__file__).resolve().parent.parent
ANALYSIS = ROOT / "data" / "analysis.json"
OUT = ROOT / "reports" / "pitch.pptx"

INK = RGBColor(0x14, 0x1A, 0x21)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
BLUE = RGBColor(0x2563EB >> 16, (0x2563EB >> 8) & 0xFF, 0x2563EB & 0xFF)
SKY = RGBColor(0x8A, 0xB4, 0xFF)
VIOLET = RGBColor(0x7C, 0x3A, 0xED)
CYAN = RGBColor(0x08, 0x91, 0xB2)
GREY = RGBColor(0x8B, 0x94, 0xA3)
SOFT = RGBColor(0xC4, 0xCD, 0xD8)
WASH = RGBColor(0xF4, 0xF7, 0xFB)
RULE = RGBColor(0xDF, 0xE4, 0xEB)

FONT = "Microsoft JhengHei"

W = 12192000
H = 6858000
MARGIN = 900000
CONTENT_W = W - MARGIN * 2


def text(slide, x, y, w, h, body, size, *, bold=False, color=INK,
         align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, spacing=1.0, space_after=0):
    box = slide.shapes.add_textbox(Emu(x), Emu(y), Emu(w), Emu(h))
    tf = box.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    lines = body.split("\n") if isinstance(body, str) else list(body)
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = spacing
        if space_after:
            p.space_after = Pt(space_after)
        run = p.add_run()
        run.text = line
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.color.rgb = color
        run.font.name = FONT
    return box


def rect(slide, x, y, w, h, fill, *, line=None, radius=0.05):
    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE,
                                   Emu(x), Emu(y), Emu(w), Emu(h))
    shape.adjustments[0] = radius
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    if line is None:
        shape.line.fill.background()
    else:
        shape.line.color.rgb = line
        shape.line.width = Pt(1)
    shape.shadow.inherit = False
    shape.text_frame.text = ""
    return shape


def bar(slide, x, y, w, h, fill):
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Emu(x), Emu(y), Emu(w), Emu(h))
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    shape.line.fill.background()
    shape.shadow.inherit = False
    shape.text_frame.text = ""
    return shape


def blank(prs):
    return prs.slides.add_slide(prs.slide_layouts[6])


def dark(slide):
    rect(slide, 0, 0, W, H, INK, radius=0)


def heading(slide, kicker, title, *, color=BLUE):
    text(slide, MARGIN, 620000, CONTENT_W, 300000, kicker, 13, bold=True, color=color)
    text(slide, MARGIN, 960000, CONTENT_W, 760000, title, 34, bold=True)
    bar(slide, MARGIN, 1800000, 620000, 54000, color)


def fmt(v):
    return f"{v:g}" if isinstance(v, float) else str(v)


def build(d: dict) -> Presentation:
    prs = Presentation()
    prs.slide_width = Emu(W)
    prs.slide_height = Emu(H)

    ov = d["overview"]
    tiers = d["tier_analysis"]["tiers"]
    hi, mid, lo = (t["aggregate"] for t in tiers)
    timing = d["timing"]
    account = d["account"]

    # ---------------------------------------------------------- 1 cover
    s = blank(prs)
    dark(s)
    text(s, MARGIN, 2250000, CONTENT_W, 360000,
         "THREADS 帳號互動分析", 15, bold=True, color=SKY)
    bar(s, MARGIN, 2760000, 700000, 60000, BLUE)
    text(s, MARGIN, 3060000, CONTENT_W, 1000000,
         "這個帳號很會說故事，", 40, bold=True, color=WHITE, spacing=1.25)
    text(s, MARGIN, 3760000, CONTENT_W, 1000000,
         "但沒有邀請讀者開口。", 40, bold=True, color=SKY, spacing=1.25)
    text(s, MARGIN, 5500000, CONTENT_W, 400000,
         f"@{account}　|　16 則真實貼文　|　劉怡妏", 14, color=GREY)

    # ---------------------------------------------------------- 2 合規判斷
    s = blank(prs)
    heading(s, "01　資料從哪來", "我沒有爬 Threads。")

    text(s, MARGIN, 2350000, CONTENT_W, 480000,
         "未登入的頁面回傳 275 KB 的 JS 空殼，like_count 出現 0 次。",
         19, color=INK, spacing=1.3)
    text(s, MARGIN, 2900000, CONTENT_W, 480000,
         "要拿到數字，只能竊取 session 或繞過登入 —— 那是題目明文禁止的。",
         19, color=INK, spacing=1.3)

    cards = [
        ("16", "則真實貼文", "考題 Google Sheet\n公開可讀", BLUE),
        ("20", "則合成補充", "僅為湊足題目\n要求的 30 則", GREY),
        ("0", "則進入結論", "合成資料不參與\n任何一句分析", VIOLET),
    ]
    for i, (big, label, note, color) in enumerate(cards):
        x = MARGIN + i * 3500000
        rect(s, x, 3750000, 3200000, 1750000, WASH, line=RULE)
        text(s, x + 300000, 3960000, 2600000, 620000, big, 46, bold=True, color=color)
        text(s, x + 300000, 4600000, 2600000, 300000, label, 14, bold=True)
        text(s, x + 300000, 4950000, 2600000, 500000, note, 12,
             color=GREY, spacing=1.3)

    text(s, MARGIN, 5750000, CONTENT_W, 400000,
         "資料少，但每個數字都站得住。", 15, bold=True, color=BLUE)

    # ---------------------------------------------------------- 3 長尾
    s = blank(prs)
    heading(s, "02　先看資料的形狀", "平均值會騙人。")

    rect(s, MARGIN, 2350000, 4900000, 1500000, WASH, line=RULE)
    text(s, MARGIN + 340000, 2560000, 4300000, 300000, "平均總互動", 14, color=GREY)
    text(s, MARGIN + 340000, 2880000, 4300000, 700000,
         fmt(ov["avg_total_engagement"]), 48, bold=True, color=GREY)

    rect(s, MARGIN + 5300000, 2350000, 4900000, 1500000, WHITE, line=BLUE)
    text(s, MARGIN + 5640000, 2560000, 4300000, 300000, "中位數", 14, color=BLUE)
    text(s, MARGIN + 5640000, 2880000, 4300000, 700000,
         fmt(ov["median_total_engagement"]), 48, bold=True, color=BLUE)

    text(s, MARGIN, 4200000, CONTENT_W, 560000,
         "16 則裡，最高 846、最低 1。少數爆款把平均拉高了四倍。",
         20, color=INK, spacing=1.3)
    text(s, MARGIN, 4900000, CONTENT_W, 900000,
         "所以這份分析不看平均，\n改看「什麼樣的貼文會掉到中位數以下」。",
         22, bold=True, color=INK, spacing=1.35)

    # ---------------------------------------------------------- 4 核心發現
    s = blank(prs)
    dark(s)
    text(s, MARGIN, 1150000, CONTENT_W, 320000,
         "03　核心發現", 14, bold=True, color=SKY)
    text(s, MARGIN, 1700000, CONTENT_W, 800000,
         "互動最低的 6 則貼文，", 32, bold=True, color=WHITE, spacing=1.25)
    text(s, MARGIN, 2320000, CONTENT_W, 800000,
         "提問率是 0%。", 44, bold=True, color=SKY, spacing=1.25)

    rect(s, MARGIN, 3600000, 4900000, 1600000, RGBColor(0x1E, 0x26, 0x30))
    text(s, MARGIN + 340000, 3820000, 4300000, 300000,
         "有提問的貼文（高互動組）", 13, color=SOFT)

    text(s, MARGIN + 340000, 4130000, 4300000, 700000,
         f"{fmt(hi['avg_replies'])}", 46, bold=True, color=WHITE)
    text(s, MARGIN + 340000, 4830000, 4300000, 300000, "平均回覆", 13, color=GREY)

    rect(s, MARGIN + 5300000, 3600000, 4900000, 1600000, RGBColor(0x1E, 0x26, 0x30))
    text(s, MARGIN + 5640000, 3820000, 4300000, 300000,
         "零提問的貼文（低互動組）", 13, color=SOFT)
    text(s, MARGIN + 5640000, 4130000, 4300000, 700000,
         f"{fmt(lo['avg_replies'])}", 46, bold=True, color=SKY)
    text(s, MARGIN + 5640000, 4830000, 4300000, 300000, "平均回覆", 13, color=GREY)

    text(s, MARGIN, 5550000, CONTENT_W, 400000,
         "貼文寫完就結束，讀者沒有理由留言。回覆數差了 60 倍。", 17, color=SOFT)

    # ---------------------------------------------------------- 5 三組對照
    s = blank(prs)
    heading(s, "04　但提問只解釋了一半", "提問帶來回覆，不保證帶來讚。")

    rows = [
        ("高互動組", hi, BLUE),
        ("中互動組", mid, VIOLET),
        ("低互動組", lo, CYAN),
    ]
    head_y = 2420000
    col_q = MARGIN + 5500000
    col_r = MARGIN + 7500000
    col_l = MARGIN + 9300000
    text(s, col_q, head_y, 1800000, 300000, "提問率", 13, bold=True, color=GREY)
    text(s, col_r, head_y, 1600000, 300000, "平均回覆", 13, bold=True, color=GREY)
    text(s, col_l, head_y, 1600000, 300000, "平均讚", 13, bold=True, color=GREY)

    for i, (name, agg, color) in enumerate(rows):
        y = 2900000 + i * 760000
        text(s, MARGIN, y, 1800000, 380000, name, 17, bold=True)
        text(s, MARGIN + 2000000, y, 3200000, 380000,
             f"{fmt(agg['avg_total_engagement'])} 互動", 17, bold=True, color=color)
        text(s, col_q, y + 20000, 1800000, 340000,
             f"{fmt(agg['question_rate_pct'])}%", 17,
             bold=agg["question_rate_pct"] == 0, color=INK)
        text(s, col_r, y + 20000, 1600000, 340000,
             fmt(agg["avg_replies"]), 17, color=INK)
        text(s, col_l, y + 20000, 1600000, 340000,
             fmt(agg["avg_likes"]), 17, color=INK)

    rect(s, MARGIN, 5250000, CONTENT_W, 1000000, WASH, line=RULE)
    bar(s, MARGIN, 5250000, 60000, 1000000, BLUE)
    text(s, MARGIN + 340000, 5420000, 10000000, 640000,
         "中互動組同樣有 40% 提問，讚數卻只有 46 —— 提問決定讀者回不回，\n"
         "但決定讚數量級的是故事本身。兩者要一起到位。",
         15, color=INK, spacing=1.35)

    # ---------------------------------------------------------- 6 不是長度
    s = blank(prs)
    heading(s, "05　排除另一個解釋", "不是因為寫得不夠長。")

    bars = [
        ("高互動組", hi["avg_char_count"], BLUE),
        ("中互動組", mid["avg_char_count"], VIOLET),
        ("低互動組", lo["avg_char_count"], CYAN),
    ]
    peak = max(b[1] for b in bars)
    track = 5600000
    for i, (name, value, color) in enumerate(bars):
        y = 2500000 + i * 780000
        text(s, MARGIN, y + 40000, 1600000, 360000, name, 16, bold=True)
        width = max(int(track * value / peak), 40000)
        bar(s, MARGIN + 1800000, y, width, 380000, color)
        text(s, MARGIN + 1800000 + width + 160000, y + 50000, 1600000, 320000,
             f"{fmt(value)} 字", 16, bold=True, color=color)

    text(s, MARGIN, 5000000, CONTENT_W, 480000,
         "三組平均字數只差 24 字。長度不是分水嶺 ——",
         20, color=INK, spacing=1.3)
    text(s, MARGIN, 5550000, CONTENT_W, 480000,
         "同樣長度的貼文，有沒有提問，結果差 56 倍。",
         22, bold=True, color=BLUE, spacing=1.3)

    # ---------------------------------------------------------- 7 時段
    s = blank(prs)
    heading(s, "06　順帶發現", "發文時段和成效是錯開的。")

    rect(s, MARGIN, 2500000, 4900000, 1900000, WASH, line=RULE)
    text(s, MARGIN + 340000, 2730000, 4300000, 300000, "發文最密集", 14, color=GREY)
    text(s, MARGIN + 340000, 3060000, 4300000, 760000,
         f"{timing['busiest_hour']['hour']:02d} 時", 44, bold=True, color=GREY)
    text(s, MARGIN + 340000, 3900000, 4300000, 340000,
         f"平均僅 {fmt(timing['busiest_hour']['avg_engagement'])} 互動",
         15, color=GREY)

    rect(s, MARGIN + 5300000, 2500000, 4900000, 1900000, WHITE, line=BLUE)
    text(s, MARGIN + 5640000, 2730000, 4300000, 300000, "互動最高", 14, color=BLUE)
    text(s, MARGIN + 5640000, 3060000, 4300000, 760000,
         f"{timing['best_hour_by_engagement']['hour']:02d} 時", 44, bold=True, color=BLUE)
    text(s, MARGIN + 5640000, 3900000, 4300000, 340000,
         f"平均 {fmt(timing['best_hour_by_engagement']['avg_engagement'])} 互動",
         15, bold=True, color=BLUE)

    text(s, MARGIN, 4850000, CONTENT_W, 900000,
         "最用力的時段，不是讀者最買單的時段。\n這是不用增加產量就能改的事。",
         21, color=INK, spacing=1.4)

    # ---------------------------------------------------------- 8 建議
    s = blank(prs)
    heading(s, "07　所以我的建議", "三件事，按投報率排序。")

    items = [
        ("每篇結尾都放一個二選一的問題",
         "全帳號互動最高的貼文就是這個寫法：624 互動、92 則回覆。"
         "故事能力已經夠了，缺的是邀請。", BLUE),
        ("長度守在 200–300 字",
         "200 字以下平均 56 互動，200 字以上平均 281。"
         "金句型貼文留著當補充，不要當主力。", VIOLET),
        ("把最有把握的貼文挪到晚間",
         "同樣的內容、同樣的產量，只換時段。", CYAN),
    ]
    for i, (title, body, color) in enumerate(items):
        y = 2400000 + i * 1180000
        rect(s, MARGIN, y, CONTENT_W, 1030000, WASH, line=RULE)
        bar(s, MARGIN, y, 60000, 1030000, color)
        text(s, MARGIN + 340000, y + 180000, 1000000, 400000,
             f"0{i + 1}", 22, bold=True, color=color)
        text(s, MARGIN + 1250000, y + 170000, 8900000, 360000, title, 18, bold=True)
        text(s, MARGIN + 1250000, y + 580000, 8900000, 380000, body, 13,
             color=GREY, spacing=1.25)

    # ---------------------------------------------------------- 9 closing
    s = blank(prs)
    dark(s)
    text(s, MARGIN, 2300000, CONTENT_W, 320000,
         "一句話總結", 14, bold=True, color=SKY)
    text(s, MARGIN, 2850000, CONTENT_W, 900000,
         "這個帳號不缺內容力，", 36, bold=True, color=WHITE, spacing=1.3)
    text(s, MARGIN, 3550000, CONTENT_W, 900000,
         "缺的是在結尾遞出一個問題。", 36, bold=True, color=SKY, spacing=1.3)

    text(s, MARGIN, 5300000, CONTENT_W, 700000,
         f"完整報告：reports/report.pdf　|　Dashboard：Next.js + Supabase\n"
         f"資料管線與 20 項單元測試：scripts/　tests/",
         13, color=GREY, spacing=1.45)

    return prs


def find_soffice() -> str | None:
    found = shutil.which("soffice") or shutil.which("libreoffice")
    if found:
        return found
    for base in (os.environ.get("ProgramFiles"), os.environ.get("ProgramFiles(x86)")):
        if not base:
            continue
        candidate = Path(base) / "LibreOffice" / "program" / "soffice.exe"
        if candidate.exists():
            return str(candidate)
    return None


def to_pdf(pptx: Path) -> Path | None:
    """Convert the deck to PDF via LibreOffice, if it is installed."""
    soffice = find_soffice()
    if not soffice:
        print("  (略過 PDF：找不到 LibreOffice，請見 README)")
        return None
    subprocess.run(
        [soffice, "--headless", "--convert-to", "pdf",
         "--outdir", str(pptx.parent), str(pptx)],
        check=True, capture_output=True, timeout=300,
    )
    pdf = pptx.with_suffix(".pdf")
    return pdf if pdf.exists() else None


def main() -> None:
    data = json.loads(ANALYSIS.read_text(encoding="utf-8"))
    prs = build(data)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    prs.save(str(OUT))
    print(f"wrote {OUT.relative_to(ROOT)}  ({OUT.stat().st_size / 1024:.0f} KB, "
          f"{len(prs.slides._sldIdLst)} slides)")

    pdf = to_pdf(OUT)
    if pdf:
        print(f"wrote {pdf.relative_to(ROOT)}  ({pdf.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
