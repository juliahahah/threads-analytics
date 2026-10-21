"""Generate a PPTX deck and a PDF report from data/analysis.json."""

from __future__ import annotations

import json
import os
from pathlib import Path

from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.dml.color import RGBColor
from pptx.enum.chart import XL_CHART_TYPE, XL_LEGEND_POSITION
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.ns import qn
from pptx.util import Emu, Pt
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parent.parent
ANALYSIS = ROOT / "data" / "analysis.json"
OUT_DIR = ROOT / "reports"

INK = RGBColor(0x1F, 0x29, 0x33)
MUTED = RGBColor(0x6B, 0x72, 0x80)
BLUE = RGBColor(0x25, 0x63, 0xEB)
VIOLET = RGBColor(0x7C, 0x3A, 0xED)
CYAN = RGBColor(0x08, 0x91, 0xB2)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
RULE = RGBColor(0xE5, 0xE7, 0xEB)
WASH = RGBColor(0xF6, 0xF8, 0xFB)

PDF_INK = colors.HexColor("#1f2933")
PDF_MUTED = colors.HexColor("#6b7280")
PDF_BLUE = colors.HexColor("#2563eb")
PDF_RULE = colors.HexColor("#e5e7eb")
PDF_WASH = colors.HexColor("#f6f8fb")

SLIDE_W = Emu(12192000)  # 13.333in, 16:9
SLIDE_H = Emu(6858000)


# ---------------------------------------------------------------- fonts


def register_cjk_fonts() -> tuple[str, str]:
    """Register a CJK-capable TTF pair with reportlab. Returns (regular, bold)."""
    win = Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts"
    candidates = [
        ("MSJhengHei", win / "msjh.ttc", "MSJhengHei-Bold", win / "msjhbd.ttc"),
        ("MSYaHei", win / "msyh.ttc", "MSYaHei-Bold", win / "msyhbd.ttc"),
    ]
    for reg_name, reg_path, bold_name, bold_path in candidates:
        if not reg_path.exists():
            continue
        try:
            pdfmetrics.registerFont(TTFont(reg_name, str(reg_path), subfontIndex=0))
            bold = bold_name
            if bold_path.exists():
                pdfmetrics.registerFont(TTFont(bold_name, str(bold_path), subfontIndex=0))
            else:
                bold = reg_name
            return reg_name, bold
        except Exception:
            continue
    return "Helvetica", "Helvetica-Bold"


PPT_FONT = "Microsoft JhengHei"


# ---------------------------------------------------------------- helpers


def load() -> dict:
    return json.loads(ANALYSIS.read_text(encoding="utf-8"))


def fmt(value) -> str:
    if isinstance(value, float):
        return f"{value:g}"
    return str(value)


def clip(text: str, limit: int) -> str:
    text = " ".join(str(text).split())
    return text if len(text) <= limit else text[: limit - 1] + "…"


# ---------------------------------------------------------------- pptx


def add_textbox(slide, x, y, w, h, text, size, *, bold=False, color=INK,
                align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, spacing=1.0):
    box = slide.shapes.add_textbox(Emu(x), Emu(y), Emu(w), Emu(h))
    tf = box.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    lines = text.split("\n") if isinstance(text, str) else list(text)
    for i, line in enumerate(lines):
        para = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        para.alignment = align
        para.line_spacing = spacing
        run = para.add_run()
        run.text = line
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.color.rgb = color
        run.font.name = PPT_FONT
    return box


def add_rect(slide, x, y, w, h, fill, *, line=None):
    from pptx.enum.shapes import MSO_SHAPE

    shape = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Emu(x), Emu(y), Emu(w), Emu(h))
    shape.adjustments[0] = 0.06
    shape.fill.solid()
    shape.fill.fore_color.rgb = fill
    if line is None:
        shape.line.fill.background()
    else:
        shape.line.color.rgb = line
        shape.line.width = Pt(0.75)
    shape.shadow.inherit = False
    shape.text_frame.text = ""
    return shape


def blank(prs):
    return prs.slides.add_slide(prs.slide_layouts[6])


def slide_header(slide, kicker: str, title: str):
    add_textbox(slide, 800000, 520000, 10600000, 300000, kicker, 12,
                bold=True, color=BLUE)
    add_textbox(slide, 800000, 810000, 10600000, 620000, title, 30, bold=True)
    bar = slide.shapes.add_shape(1, Emu(800000), Emu(1480000), Emu(560000), Emu(50000))
    bar.fill.solid()
    bar.fill.fore_color.rgb = BLUE
    bar.line.fill.background()
    bar.shadow.inherit = False


def ppt_table(slide, headers, rows, x, y, w, h, *, font=11, header_font=11,
              col_widths=None, align_right=()):
    shape = slide.shapes.add_table(len(rows) + 1, len(headers), Emu(x), Emu(y), Emu(w), Emu(h))
    table = shape.table
    table.first_row = True
    if col_widths:
        total = sum(col_widths)
        for i, cw in enumerate(col_widths):
            table.columns[i].width = Emu(int(w * cw / total))
    for col, text in enumerate(headers):
        cell = table.cell(0, col)
        cell.text = ""
        cell.fill.solid()
        cell.fill.fore_color.rgb = INK
        cell.margin_left = cell.margin_right = Emu(70000)
        cell.margin_top = cell.margin_bottom = Emu(45000)
        cell.vertical_anchor = MSO_ANCHOR.MIDDLE
        para = cell.text_frame.paragraphs[0]
        para.alignment = PP_ALIGN.RIGHT if col in align_right else PP_ALIGN.LEFT
        run = para.add_run()
        run.text = str(text)
        run.font.size = Pt(header_font)
        run.font.bold = True
        run.font.color.rgb = WHITE
        run.font.name = PPT_FONT
    for r, row in enumerate(rows, start=1):
        for col, value in enumerate(row):
            cell = table.cell(r, col)
            cell.text = ""
            cell.fill.solid()
            cell.fill.fore_color.rgb = WHITE if r % 2 else WASH
            cell.margin_left = cell.margin_right = Emu(70000)
            cell.margin_top = cell.margin_bottom = Emu(40000)
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            para = cell.text_frame.paragraphs[0]
            para.alignment = PP_ALIGN.RIGHT if col in align_right else PP_ALIGN.LEFT
            run = para.add_run()
            run.text = str(value)
            run.font.size = Pt(font)
            run.font.color.rgb = INK
            run.font.name = PPT_FONT
    return table


def style_chart(chart, *, font=11, legend=False):
    chart.font.size = Pt(font)
    chart.font.name = PPT_FONT
    chart.font.color.rgb = INK
    chart.has_legend = legend
    if legend:
        chart.legend.position = XL_LEGEND_POSITION.BOTTOM
        chart.legend.include_in_layout = False


def bar_chart(slide, x, y, w, h, categories, series, *, colors_=None, horizontal=False,
              number_format='0.#', legend=False, gap=60):
    data = CategoryChartData()
    data.categories = categories
    for name, values in series:
        data.add_series(name, values, number_format)
    kind = XL_CHART_TYPE.BAR_CLUSTERED if horizontal else XL_CHART_TYPE.COLUMN_CLUSTERED
    frame = slide.shapes.add_chart(kind, Emu(x), Emu(y), Emu(w), Emu(h), data)
    chart = frame.chart
    style_chart(chart, legend=legend)
    plot = chart.plots[0]
    plot.gap_width = gap
    plot.has_data_labels = True
    labels = plot.data_labels
    labels.number_format = number_format
    labels.number_format_is_linked = False
    labels.font.size = Pt(10)
    labels.font.color.rgb = INK
    labels.font.name = PPT_FONT
    if colors_ and len(series) == 1:
        plot.vary_by_categories = True
        for i, point in enumerate(plot.series[0].points):
            point.format.fill.solid()
            point.format.fill.fore_color.rgb = colors_[i % len(colors_)]
    elif colors_:
        plot.vary_by_categories = False
        for i, s in enumerate(plot.series):
            s.format.fill.solid()
            s.format.fill.fore_color.rgb = colors_[i % len(colors_)]
    value_axis = chart.value_axis
    value_axis.has_major_gridlines = True
    value_axis.major_gridlines.format.line.color.rgb = RULE
    value_axis.major_gridlines.format.line.width = Pt(0.5)
    value_axis.format.line.fill.background()
    value_axis.has_title = False
    cat_axis = chart.category_axis
    cat_axis.format.line.color.rgb = RULE
    cat_axis.has_major_gridlines = False
    if horizontal:
        # BAR_CLUSTERED plots the first category at the bottom; flip so the
        # reading order matches the data order, keeping the value axis on the left.
        def set_orientation(axis_el, value):
            scaling = axis_el.find(qn("c:scaling"))
            orientation = scaling.find(qn("c:orientation"))
            if orientation is None:
                orientation = scaling.makeelement(qn("c:orientation"), {})
                scaling.insert(0, orientation)
            orientation.set("val", value)

        set_orientation(cat_axis._element, "maxMin")
        val_ax = chart.value_axis._element
        crosses = val_ax.find(qn("c:crosses"))
        if crosses is not None:
            val_ax.remove(crosses)
    return chart


def build_pptx(d: dict, out: Path) -> Path:
    prs = Presentation()
    prs.slide_width = SLIDE_W
    prs.slide_height = SLIDE_H

    ov = d["overview"]
    counts = d["counts"]
    timing = d["timing"]
    length = d["length_vs_engagement"]
    tiers = d["tier_analysis"]["tiers"]
    account = d["account"]
    date_range = ov["date_range"]

    # --- 1. cover -------------------------------------------------
    s = blank(prs)
    add_rect(s, 0, 0, 12192000, 6858000, INK)
    accent = s.shapes.add_shape(1, Emu(900000), Emu(2180000), Emu(760000), Emu(60000))
    accent.fill.solid()
    accent.fill.fore_color.rgb = BLUE
    accent.line.fill.background()
    accent.shadow.inherit = False
    add_textbox(s, 900000, 1500000, 9000000, 360000,
                "THREADS 帳號互動分析", 15, bold=True, color=RGBColor(0x8A, 0xB4, 0xFF))
    add_textbox(s, 900000, 2420000, 10000000, 1000000,
                f"@{account} 發文表現與內容策略", 42, bold=True, color=WHITE)
    add_textbox(s, 900000, 3560000, 10000000, 460000,
                f"分析期間 {date_range['from']} ~ {date_range['to']}（Asia/Taipei）",
                17, color=RGBColor(0xC4, 0xCD, 0xD8))
    add_textbox(s, 900000, 4120000, 10000000, 420000,
                f"真實貼文 {counts['real']} 則　|　合成補充 {counts['synthetic']} 則　|　"
                f"所有結論僅採計真實貼文",
                14, color=MUTED)
    add_textbox(s, 900000, 5750000, 10000000, 360000,
                f"產出時間 {d['generated_at'][:19].replace('T', ' ')}", 12, color=MUTED)

    # --- 2. 資料來源與方法 ----------------------------------------
    s = blank(prs)
    slide_header(s, "DATA & METHOD", "資料來源與方法")
    add_textbox(s, 800000, 1750000, 10600000, 600000,
                "Threads 公開頁面已擋登入，未登入的 HTML 不含 like_count 等欄位。"
                "取得資料只能竊取 session 或繞過登入，違反考題限制，因此不予採用。",
                14, color=MUTED, spacing=1.3)

    cards = [
        ("16 則", "真實貼文", "考題提供的 Google Sheet\nCSV export 公開可讀", BLUE),
        ("20 則", "合成補充", "僅為滿足「至少 30 則」\n標記 is_synthetic=true", VIOLET),
        ("16 則", "實際採計", "所有指標與洞察\n只採計真實貼文", CYAN),
    ]
    for i, (big, label, note, color) in enumerate(cards):
        x = 800000 + i * 3600000
        add_rect(s, x, 2550000, 3300000, 1850000, WASH, line=RULE)
        add_textbox(s, x + 280000, 2780000, 2800000, 560000, big, 34, bold=True, color=color)
        add_textbox(s, x + 280000, 3380000, 2800000, 300000, label, 14, bold=True)
        add_textbox(s, x + 280000, 3720000, 2800000, 560000, note, 11,
                    color=MUTED, spacing=1.25)

    add_rect(s, 800000, 4650000, 10700000, 1200000, WHITE, line=RULE)
    add_textbox(s, 1060000, 4850000, 10200000, 300000, "分析方法", 13, bold=True, color=BLUE)
    add_textbox(s, 1060000, 5180000, 10200000, 560000,
                "清理 → 特徵萃取 → 指標計算 → 依 likes+replies 三分位分組 → "
                "各組取中位數鄰近 3–5 則套用完全相同的 NLP 特徵萃取（句數、提問、人稱、五類詞彙、高頻詞）。",
                12.5, color=INK, spacing=1.35)

    # --- 3. 總覽指標 ----------------------------------------------
    s = blank(prs)
    slide_header(s, "OVERVIEW", "總覽指標")
    kpis = [
        ("平均 like", fmt(ov["avg_likes"]), BLUE),
        ("平均 reply", fmt(ov["avg_replies"]), VIOLET),
        ("平均總互動", fmt(ov["avg_total_engagement"]), CYAN),
        ("互動中位數", fmt(ov["median_total_engagement"]), INK),
    ]
    for i, (label, value, color) in enumerate(kpis):
        x = 800000 + i * 2700000
        add_rect(s, x, 1800000, 2450000, 1320000, WASH, line=RULE)
        add_textbox(s, x + 240000, 1980000, 2000000, 300000, label, 12, color=MUTED)
        add_textbox(s, x + 240000, 2300000, 2000000, 620000, value, 32, bold=True, color=color)

    rows = [
        ("貼文數（真實）", fmt(ov["post_count"])),
        ("平均 repost", fmt(ov["avg_reposts"])),
        ("平均 quote", fmt(ov["avg_quotes"])),
        ("最高 / 最低總互動", f"{ov['max_total_engagement']} / {ov['min_total_engagement']}"),
        ("平均字數", fmt(ov["avg_char_count"])),
    ]
    ppt_table(s, ["指標", "數值"], rows, 800000, 3400000, 4900000, 1900000,
              font=12, col_widths=[62, 38], align_right=(1,))

    add_rect(s, 6000000, 3400000, 5500000, 1900000, WHITE, line=RULE)
    add_textbox(s, 6280000, 3620000, 4950000, 320000, "長尾分布警訊", 14, bold=True, color=BLUE)
    add_textbox(s, 6280000, 4000000, 4950000, 1100000,
                f"平均 {fmt(ov['avg_total_engagement'])} 與中位數 "
                f"{fmt(ov['median_total_engagement'])} 落差極大，"
                "代表少數爆款貼文拉高了平均。\n\n評估成效時應以中位數為準。",
                13, color=INK, spacing=1.4)

    # --- 4. Top 5 posts -------------------------------------------
    s = blank(prs)
    slide_header(s, "TOP POSTS", "互動表現最佳的 5 則貼文")
    rows = []
    for i, p in enumerate(d["top_posts"], start=1):
        rows.append([
            str(i),
            clip(p["excerpt"], 42),
            fmt(p["likes"]),
            fmt(p["replies"]),
            fmt(p["total_engagement"]),
            fmt(p["char_count"]),
            p.get("format", ""),
        ])
    ppt_table(s, ["#", "摘要", "讚", "回覆", "總互動", "字數", "文型"], rows,
              800000, 1850000, 10700000, 3000000,
              font=10.5, header_font=11,
              col_widths=[4, 40, 8, 8, 11, 8, 21], align_right=(2, 3, 4, 5))
    add_textbox(s, 800000, 5150000, 10700000, 560000,
                "前 3 名皆為 200 字以上的第一人稱敘事，且全部收在一個具體的生活轉折上 —— "
                "不是抒情，而是可被讀者代入的決定。",
                12.5, color=MUTED, spacing=1.3)

    # --- 5. chart: tiers ------------------------------------------
    s = blank(prs)
    slide_header(s, "CHART 1", "三組互動分層的平均總互動數")
    bar_chart(s, 800000, 1800000, 6600000, 3700000,
              [t["tier"] for t in tiers],
              [("平均總互動", [t["aggregate"]["avg_total_engagement"] for t in tiers])],
              colors_=[BLUE, VIOLET, CYAN], horizontal=True, gap=70)
    add_rect(s, 7700000, 1800000, 3800000, 3700000, WASH, line=RULE)
    add_textbox(s, 7960000, 2020000, 3300000, 320000, "分組方法", 13, bold=True, color=BLUE)
    add_textbox(s, 7960000, 2380000, 3300000, 700000,
                "依 likes + replies 排序後取三分位，分為高 / 中 / 低三組。",
                12, color=INK, spacing=1.35)
    hi, lo = tiers[0]["aggregate"], tiers[-1]["aggregate"]
    ratio = hi["avg_total_engagement"] / max(lo["avg_total_engagement"], 1e-9)
    add_textbox(s, 7960000, 3250000, 3300000, 320000, "落差倍數", 13, bold=True, color=BLUE)
    add_textbox(s, 7960000, 3600000, 3300000, 560000, f"{ratio:.0f}×", 38, bold=True, color=INK)
    add_textbox(s, 7960000, 4250000, 3300000, 900000,
                f"高互動組平均 {fmt(hi['avg_total_engagement'])}，"
                f"低互動組僅 {fmt(lo['avg_total_engagement'])}。"
                "同一帳號、同一時期，差異來自寫法而非流量波動。",
                12, color=MUTED, spacing=1.35)

    # --- 6. chart: hours ------------------------------------------
    s = blank(prs)
    slide_header(s, "CHART 2", "發文時段 vs 平均互動")
    by_hour = timing["by_hour"]
    bar_chart(s, 800000, 1800000, 6600000, 3700000,
              [f"{h['hour']:02d} 時" for h in by_hour],
              [("平均互動", [h["avg_engagement"] for h in by_hour])],
              colors_=[BLUE], gap=55)
    best = timing["best_hour_by_engagement"]
    busiest = timing["busiest_hour"]
    add_rect(s, 7700000, 1800000, 3800000, 1700000, WASH, line=RULE)
    add_textbox(s, 7960000, 2000000, 3300000, 300000, "互動最佳時段", 12, color=MUTED)
    add_textbox(s, 7960000, 2320000, 3300000, 560000, f"{best['hour']:02d} 時",
                34, bold=True, color=BLUE)
    add_textbox(s, 7960000, 2940000, 3300000, 400000,
                f"平均 {fmt(best['avg_engagement'])} 互動（{best['post_count']} 則）",
                12, color=MUTED)
    add_rect(s, 7700000, 3700000, 3800000, 1800000, WHITE, line=RULE)
    add_textbox(s, 7960000, 3900000, 3300000, 300000, "發文最密集時段", 12, color=MUTED)
    add_textbox(s, 7960000, 4220000, 3300000, 560000, f"{busiest['hour']:02d} 時",
                34, bold=True, color=VIOLET)
    add_textbox(s, 7960000, 4840000, 3300000, 500000,
                f"平均僅 {fmt(busiest['avg_engagement'])} 互動 —— 產量與成效錯位。",
                12, color=MUTED, spacing=1.3)

    # --- 7. chart: length -----------------------------------------
    s = blank(prs)
    slide_header(s, "CHART 3", "文字長度 vs 互動量")
    buckets = length["buckets"]
    bar_chart(s, 800000, 1800000, 6600000, 3700000,
              [b["bucket"] for b in buckets],
              [("平均互動", [b["avg_engagement"] for b in buckets]),
               ("平均回覆", [b["avg_replies"] for b in buckets])],
              colors_=[BLUE, CYAN], legend=True, gap=45)
    add_rect(s, 7700000, 1800000, 3800000, 1550000, WASH, line=RULE)
    add_textbox(s, 7960000, 2000000, 3300000, 300000, "Pearson r（字數 vs 總互動）",
                12, color=MUTED)
    add_textbox(s, 7960000, 2320000, 3300000, 560000,
                fmt(length["pearson_char_vs_total"]), 36, bold=True, color=BLUE)
    add_textbox(s, 7960000, 2940000, 3300000, 320000, "中等正相關", 12, color=MUTED)
    add_rect(s, 7700000, 3550000, 3800000, 1950000, WHITE, line=RULE)
    add_textbox(s, 7960000, 3760000, 3300000, 320000, "解讀", 13, bold=True, color=BLUE)
    add_textbox(s, 7960000, 4120000, 3300000, 1250000,
                "200 字以上的平均互動明顯跳升。\n\n"
                "「夠長到能說完一個故事」是必要條件，但不是充分條件 —— "
                "長度本身不會製造互動。",
                12, color=INK, spacing=1.35)

    # --- 8. chart: format -----------------------------------------
    s = blank(prs)
    slide_header(s, "CHART 4", "文型 vs 平均互動")
    fmts = d["by_format"]
    bar_chart(s, 800000, 1800000, 10700000, 3400000,
              [clip(f["name"], 12) for f in fmts],
              [("平均互動", [f["avg_engagement"] for f in fmts]),
               ("平均回覆", [f["avg_replies"] for f in fmts])],
              colors_=[BLUE, CYAN], legend=True, gap=50)
    top_fmt = fmts[0]
    add_textbox(s, 800000, 5400000, 10700000, 560000,
                f"「{top_fmt['name']}」僅 {top_fmt['post_count']} 則，"
                f"卻拿下 {fmt(top_fmt['avg_engagement'])} 平均互動與 "
                f"{fmt(top_fmt['avg_replies'])} 平均回覆 —— 樣本雖小，方向明確。",
                12.5, color=MUTED, spacing=1.3)

    # --- 9. tier NLP comparison -----------------------------------
    s = blank(prs)
    slide_header(s, "NLP", "三組分層的內文特徵對照")
    rows = []
    for t in tiers:
        agg = t["aggregate"]
        rows.append([
            t["tier"],
            f"{t['post_count']} 則",
            fmt(agg["avg_char_count"]),
            fmt(agg["avg_likes"]),
            fmt(agg["avg_replies"]),
            f"{fmt(agg['question_rate_pct'])}%",
            fmt(agg["avg_second_person"]),
            fmt(agg["avg_first_person"]),
        ])
    ppt_table(s, ["分層", "則數", "平均字數", "平均讚", "平均回覆", "提問率", "第二人稱", "第一人稱"],
              rows, 800000, 1850000, 10700000, 1500000,
              font=12, col_widths=[16, 9, 12, 11, 12, 11, 14, 15],
              align_right=(1, 2, 3, 4, 5, 6, 7))

    add_textbox(s, 800000, 3600000, 10700000, 320000, "詞彙命中（各組取樣 5 則合計）",
                13, bold=True, color=BLUE)
    lex_keys = list(tiers[0]["lexicon_totals"].keys())
    lex_rows = [[t["tier"]] + [fmt(t["lexicon_totals"].get(k, 0)) for k in lex_keys]
                for t in tiers]
    ppt_table(s, ["分層"] + lex_keys, lex_rows, 800000, 3980000, 10700000, 1300000,
              font=12, col_widths=[22] + [15.6] * len(lex_keys),
              align_right=tuple(range(1, len(lex_keys) + 1)))

    # --- 10. key differentiators ----------------------------------
    s = blank(prs)
    slide_header(s, "KEY FINDINGS", "跨組對照最關鍵的三個差異")
    hi_agg, mid_agg, lo_agg = (t["aggregate"] for t in tiers)
    items = [
        ("01", "提問是最強的分水嶺",
         f"高互動組與中互動組提問率同為 {fmt(hi_agg['question_rate_pct'])}%，"
         f"低互動組為 {fmt(lo_agg['question_rate_pct'])}% —— 完全沒有向讀者提問，"
         f"貼文寫完即結束。回覆數因此出現斷崖：{fmt(hi_agg['avg_replies'])} vs "
         f"{fmt(lo_agg['avg_replies'])}。", BLUE),
        ("02", "第二人稱密度決定「對話感」",
         f"高互動組平均出現 {fmt(hi_agg['avg_second_person'])} 次「你／妳」，"
         f"低互動組僅 {fmt(lo_agg['avg_second_person'])} 次。"
         "高互動貼文把讀者寫進文本，低互動貼文只是自言自語。", VIOLET),
        ("03", "字數不是失敗主因，但有門檻",
         f"三組平均字數分別為 {fmt(hi_agg['avg_char_count'])}、"
         f"{fmt(mid_agg['avg_char_count'])}、{fmt(lo_agg['avg_char_count'])} 字，差距不大；"
         "但 200 字以上的分桶平均互動明顯跳升。", CYAN),
    ]
    for i, (num, title, body, color) in enumerate(items):
        y = 1800000 + i * 1300000
        add_rect(s, 800000, y, 10700000, 1150000, WASH, line=RULE)
        add_textbox(s, 1020000, y + 230000, 800000, 600000, num, 30, bold=True, color=color)
        add_textbox(s, 1900000, y + 210000, 9400000, 320000, title, 15, bold=True)
        add_textbox(s, 1900000, y + 570000, 9400000, 520000, body, 11.5,
                    color=MUTED, spacing=1.3)

    # --- 11. strategy ---------------------------------------------
    s = blank(prs)
    slide_header(s, "STRATEGY", "對帳號內容策略的 3 點觀察")
    strategies = [
        ("把「提問」變成預設收尾",
         "低互動組 6 則貼文的提問率是 0%，平均回覆僅 0.67 則；"
         "而全帳號互動最高的貼文正是「二選一互動提問」（624 互動）。"
         "故事寫作能力已經足夠，槓桿點在於每篇結尾都給讀者一個低門檻、可二選一的問題。", BLUE),
        ("內容長度穩定在 200–300 字的敘事帶",
         "字數與互動呈中等正相關 (r=0.403)，200 字以上分桶的平均互動（230）"
         "遠高於 200 字以下。少於 100 字的金句型貼文雖偶有爆款，但回覆數極低，"
         "難以累積社群關係 —— 建議作為補充而非主力。", VIOLET),
        ("把主力貼文挪到晚間時段",
         "目前發文最密集的是 00 時，而平均互動最高的時段是 20 時（504.33 互動）。"
         "在現有節奏下，把最有信心的「故事＋提問」貼文挪到晚間，"
         "是不需要增加產量就能提升成效的調整。", CYAN),
    ]
    for i, (title, body, color) in enumerate(strategies):
        x = 800000 + i * 3600000
        add_rect(s, x, 1800000, 3300000, 3500000, WHITE, line=RULE)
        chip = s.shapes.add_shape(1, Emu(x), Emu(1800000), Emu(3300000), Emu(70000))
        chip.fill.solid()
        chip.fill.fore_color.rgb = color
        chip.line.fill.background()
        chip.shadow.inherit = False
        add_textbox(s, x + 280000, 2030000, 2750000, 300000, f"觀察 {i + 1}", 11.5,
                    bold=True, color=color)
        add_textbox(s, x + 280000, 2380000, 2750000, 700000, title, 16, bold=True, spacing=1.2)
        add_textbox(s, x + 280000, 3220000, 2750000, 1900000, body, 11.5,
                    color=MUTED, spacing=1.4)

    # --- 12. limits -----------------------------------------------
    s = blank(prs)
    slide_header(s, "LIMITATIONS", "已知限制")
    limits = [
        "真實樣本僅 16 則、時間跨度約 3 天，統計結論屬於方向性指標，不足以做顯著性檢定。",
        "Threads 公開頁面擋登入，無法取得粉絲數，因此以絕對互動數代替正規化後的互動率。",
        "16 則貼文全為純文字（無連結／hashtag／mention），「貼文類型」維度無鑑別力，"
        "分析改以「文型」與「主題」作為替代切角。",
        "中文斷詞採 bigram 近似法而非詞典式斷詞，關鍵字可能包含跨詞邊界的組合。",
        "合成資料不具語意價值，僅用於湊足筆數與壓力測試管線，未進入任何結論。",
    ]
    for i, text in enumerate(limits):
        y = 1850000 + i * 780000
        add_rect(s, 800000, y, 10700000, 660000, WASH if i % 2 == 0 else WHITE, line=RULE)
        add_textbox(s, 1020000, y + 130000, 400000, 400000, f"{i + 1}", 16, bold=True, color=BLUE)
        add_textbox(s, 1560000, y + 120000, 9700000, 460000, text, 12.5,
                    color=INK, anchor=MSO_ANCHOR.MIDDLE, spacing=1.25)

    # --- 13. closing ----------------------------------------------
    s = blank(prs)
    add_rect(s, 0, 0, 12192000, 6858000, INK)
    add_textbox(s, 900000, 2550000, 10000000, 800000,
                "一句話總結", 15, bold=True, color=RGBColor(0x8A, 0xB4, 0xFF))
    add_textbox(s, 900000, 2950000, 10200000, 1400000,
                "這個帳號已經很會說故事，\n缺的是在故事結尾向讀者遞出一個問題。",
                32, bold=True, color=WHITE, spacing=1.3)
    add_textbox(s, 900000, 5750000, 10000000, 360000,
                f"@{account}　|　資料來源：考題提供之 Google Sheet　|　"
                f"分析腳本 scripts/analyze.py",
                12, color=MUTED)

    out.parent.mkdir(parents=True, exist_ok=True)
    prs.save(str(out))
    return out


# ---------------------------------------------------------------- pdf


def build_pdf(d: dict, out: Path, fonts: tuple[str, str]) -> Path:
    regular, bold = fonts
    ov = d["overview"]
    counts = d["counts"]
    timing = d["timing"]
    length = d["length_vs_engagement"]
    tiers = d["tier_analysis"]["tiers"]
    account = d["account"]

    styles = getSampleStyleSheet()

    def mk(name, size, leading, *, font=regular, color=PDF_INK, space_before=0,
           space_after=6, align=TA_LEFT):
        return ParagraphStyle(name, parent=styles["Normal"], fontName=font,
                              fontSize=size, leading=leading, textColor=color,
                              spaceBefore=space_before, spaceAfter=space_after,
                              alignment=align)

    title_s = mk("t", 23, 31, font=bold, space_after=4)
    sub_s = mk("sub", 11, 16, color=PDF_MUTED, space_after=2)
    h1_s = mk("h1", 15, 21, font=bold, space_before=16, space_after=8)
    h2_s = mk("h2", 12, 17, font=bold, space_before=11, space_after=5)
    body_s = mk("b", 10, 16.5, space_after=6)
    muted_s = mk("m", 9, 14.5, color=PDF_MUTED, space_after=5)
    cell_s = mk("c", 8.6, 12.5, space_after=0)
    cell_b = mk("cb", 8.6, 12.5, font=bold, color=colors.white, space_after=0)

    story = []

    def table(headers, rows, widths, *, align_right=()):
        head = [Paragraph(str(h), cell_b) for h in headers]
        body = [[Paragraph(str(c), cell_s) for c in row] for row in rows]
        t = Table([head] + body, colWidths=widths, repeatRows=1, hAlign="LEFT")
        style = [
            ("BACKGROUND", (0, 0), (-1, 0), PDF_INK),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("GRID", (0, 0), (-1, -1), 0.4, PDF_RULE),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("LEFTPADDING", (0, 0), (-1, -1), 6),
            ("RIGHTPADDING", (0, 0), (-1, -1), 6),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, PDF_WASH]),
        ]
        for col in align_right:
            style.append(("ALIGN", (col, 0), (col, -1), "RIGHT"))
        t.setStyle(TableStyle(style))
        return t

    def hbar(categories, values, *, labels=None, width=165 * mm, color=PDF_BLUE,
             bar_h=7.2 * mm, label_w=30 * mm, value_w=30 * mm):
        """Simple horizontal bar chart as a Table — no external renderer needed."""
        peak = max(values) if values and max(values) > 0 else 1
        track = width - label_w - value_w - 3 * mm
        rows, style = [], [
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 1.6),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 1.6),
        ]
        for i, (cat, val) in enumerate(zip(categories, values)):
            w = max(track * (val / peak), 0.6 * mm)
            bar = Table([[""]], colWidths=[w], rowHeights=[bar_h])
            bar.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), color),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
            ]))
            text = labels[i] if labels else fmt(val)
            rows.append([Paragraph(str(cat), cell_s), bar,
                         Paragraph(text.replace(" ", "&nbsp;"), muted_s)])
        t = Table(rows, colWidths=[label_w, track + 3 * mm, value_w], hAlign="LEFT")
        t.setStyle(TableStyle(style))
        return t

    # cover block
    story.append(Paragraph(f"Threads 帳號互動分析報告", title_s))
    story.append(Paragraph(f"@{account}", mk("acct", 15, 20, font=bold,
                                             color=PDF_BLUE, space_after=10)))
    story.append(HRFlowable(width="100%", thickness=2, color=PDF_BLUE,
                            spaceBefore=0, spaceAfter=9))
    dr = ov["date_range"]
    story.append(Paragraph(
        f"分析期間 {dr['from']} ~ {dr['to']}（Asia/Taipei）　|　"
        f"產出時間 {d['generated_at'][:19].replace('T', ' ')}", sub_s))
    story.append(Paragraph(
        f"資料集共 {counts['total']} 則貼文，其中真實貼文 <b>{counts['real']} 則</b>、"
        f"合成補充 {counts['synthetic']} 則。", sub_s))
    story.append(Spacer(1, 7))

    notice = Table([[Paragraph(
        "<b>重要聲明</b>　Threads 公開頁面已擋登入，無法在不違反平台條款的前提下爬取。"
        "本報告的真實資料來自考題提供的 Google&nbsp;Sheet；合成貼文僅為滿足題目"
        "「至少&nbsp;30&nbsp;則」的數量要求，"
        "<b>以下所有指標與洞察均只採計真實貼文</b>。",
        mk("n", 9, 14.5, color=PDF_INK, space_after=0))]],
        colWidths=[165 * mm], hAlign="LEFT")
    notice.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PDF_WASH),
        ("LINEBEFORE", (0, 0), (0, -1), 2.4, PDF_BLUE),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    story.append(notice)

    # 1 overview
    story.append(Paragraph("1　總覽指標", h1_s))
    rows = [
        ("貼文數（真實）", fmt(ov["post_count"])),
        ("平均 like", fmt(ov["avg_likes"])),
        ("平均 reply", fmt(ov["avg_replies"])),
        ("平均 repost", fmt(ov["avg_reposts"])),
        ("平均 quote", fmt(ov["avg_quotes"])),
        ("平均總互動", fmt(ov["avg_total_engagement"])),
        ("總互動中位數", fmt(ov["median_total_engagement"])),
        ("最高 / 最低總互動", f"{ov['max_total_engagement']} / {ov['min_total_engagement']}"),
        ("平均字數", fmt(ov["avg_char_count"])),
    ]
    story.append(table(["指標", "數值"], rows, [52 * mm, 32 * mm], align_right=(1,)))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        f"平均值 {fmt(ov['avg_total_engagement'])} 與中位數 "
        f"{fmt(ov['median_total_engagement'])} 落差極大，代表少數爆款貼文拉高了平均 —— "
        "這是典型的長尾分布，評估成效時應以中位數為準。", body_s))

    # 2 top posts
    story.append(PageBreak())
    story.append(Paragraph("2　互動表現最佳的 5 則貼文", h1_s))
    rows = []
    for i, p in enumerate(d["top_posts"], start=1):
        rows.append([str(i), clip(p["excerpt"], 46), fmt(p["likes"]), fmt(p["replies"]),
                     f"<b>{fmt(p['total_engagement'])}</b>", fmt(p["char_count"]),
                     p.get("format", "")])
    story.append(table(["#", "摘要", "讚", "回覆", "總互動", "字數", "文型"], rows,
                       [7 * mm, 72 * mm, 13 * mm, 14 * mm, 17 * mm, 13 * mm, 29 * mm],
                       align_right=(2, 3, 4, 5)))
    story.append(Spacer(1, 6))
    story.append(Paragraph(
        "前 3 名皆為 200 字以上的第一人稱敘事，且全部收在一個具體的生活轉折上 —— "
        "不是抒情，而是可被讀者代入的決定。", body_s))

    # 3 charts
    story.append(Paragraph("3　圖表", h1_s))

    story.append(Paragraph("圖 1　三組互動分層的平均總互動數", h2_s))
    story.append(hbar([t["tier"] for t in tiers],
                      [t["aggregate"]["avg_total_engagement"] for t in tiers]))
    story.append(Spacer(1, 4))
    hi, lo = tiers[0]["aggregate"], tiers[-1]["aggregate"]
    story.append(Paragraph(
        f"高互動組平均 {fmt(hi['avg_total_engagement'])}，低互動組僅 "
        f"{fmt(lo['avg_total_engagement'])}，相差約 "
        f"{hi['avg_total_engagement'] / max(lo['avg_total_engagement'], 1e-9):.0f} 倍。", muted_s))

    story.append(Paragraph("圖 2　發文時段 vs 平均互動", h2_s))
    by_hour = timing["by_hour"]
    story.append(hbar([f"{h['hour']:02d} 時" for h in by_hour],
                      [h["avg_engagement"] for h in by_hour],
                      labels=[f"{fmt(h['avg_engagement'])}（{h['post_count']} 則）"
                              for h in by_hour],
                      color=colors.HexColor("#7c3aed"), bar_h=6 * mm,
                      label_w=20 * mm, value_w=34 * mm))

    story.append(Paragraph("圖 3　文字長度 vs 平均互動", h2_s))
    buckets = length["buckets"]
    story.append(hbar([b["bucket"] for b in buckets],
                      [b["avg_engagement"] for b in buckets],
                      labels=[f"{fmt(b['avg_engagement'])}（{b['post_count']} 則）"
                              for b in buckets],
                      color=colors.HexColor("#0891b2"), bar_h=6 * mm,
                      label_w=34 * mm, value_w=34 * mm))

    story.append(Paragraph("圖 4　文型 vs 平均互動", h2_s))
    fmts = d["by_format"]
    story.append(hbar([clip(f["name"], 11) for f in fmts],
                      [f["avg_engagement"] for f in fmts],
                      labels=[f"{fmt(f['avg_engagement'])}（{f['post_count']} 則）"
                              for f in fmts],
                      bar_h=6 * mm, label_w=38 * mm, value_w=34 * mm))

    story.append(PageBreak())

    # 4 timing
    story.append(Paragraph("4　發文時間分布", h1_s))
    rows = [[w["label"], fmt(w["post_count"]), fmt(w["avg_engagement"])]
            for w in timing["by_weekday"]]
    story.append(table(["星期", "貼文數", "平均互動"], rows,
                       [26 * mm, 26 * mm, 30 * mm], align_right=(1, 2)))
    story.append(Spacer(1, 6))
    best = timing["best_hour_by_engagement"]
    story.append(Paragraph(
        f"發文最多：{timing['busiest_weekday']['label']}"
        f"（{timing['busiest_weekday']['post_count']} 則）、"
        f"{timing['busiest_hour']['hour']:02d} 時"
        f"（{timing['busiest_hour']['post_count']} 則）。"
        f"互動最佳時段為 <b>{best['hour']:02d} 時</b>，平均 "
        f"{fmt(best['avg_engagement'])} 互動 —— 產量與成效明顯錯位。", body_s))

    # 5 length
    story.append(Paragraph("5　文字長度與互動量的關係", h1_s))
    story.append(Paragraph(
        f"Pearson 相關係數 <b>{fmt(length['pearson_char_vs_total'])}</b>（中等正相關）；"
        f"對 like 為 {fmt(length['pearson_char_vs_likes'])}、"
        f"對 reply 為 {fmt(length['pearson_char_vs_replies'])}。", body_s))
    rows = [[b["bucket"], fmt(b["post_count"]), fmt(b["avg_engagement"]),
             fmt(b["avg_likes"]), fmt(b["avg_replies"])] for b in buckets]
    story.append(table(["字數區間", "貼文數", "平均互動", "平均讚", "平均回覆"], rows,
                       [34 * mm, 22 * mm, 26 * mm, 24 * mm, 26 * mm],
                       align_right=(1, 2, 3, 4)))

    # 6 keywords
    story.append(Paragraph("6　常見關鍵字與 hashtag", h1_s))
    kws = d["keywords"]["top_keywords"][:15]
    kw_text = "　".join(f"<b>{k['term']}</b>({k['count']})" for k in kws)
    story.append(Paragraph("出現在 2 篇以上貼文的高頻詞（中文採 bigram 切詞）：", body_s))
    story.append(Paragraph(kw_text, mk("kw", 9.5, 17, space_after=6)))
    story.append(Paragraph(
        f"hashtag 使用率：<b>{fmt(d['keywords']['hashtag_usage_rate'])}%</b>"
        "（此帳號幾乎不使用 hashtag）。", muted_s))

    # 7 format
    story.append(Paragraph("7　貼文類型與文型分類", h1_s))
    rows = [[f["name"], fmt(f["post_count"]), f"{fmt(f['share_pct'])}%",
             fmt(f["avg_engagement"]), fmt(f["avg_replies"])] for f in fmts]
    story.append(table(["文型", "貼文數", "占比", "平均互動", "平均回覆"], rows,
                       [46 * mm, 20 * mm, 18 * mm, 26 * mm, 26 * mm],
                       align_right=(1, 2, 3, 4)))

    story.append(PageBreak())

    # 8 tier NLP
    story.append(Paragraph("8　三組互動分層的 NLP 內文分析", h1_s))
    story.append(Paragraph(
        "分組方法：依 likes + replies 三分位分組，各組取中位數鄰近 3–5 則，"
        "套用完全相同的特徵萃取 —— 句數、平均句長、問號數、第一／第二人稱次數、"
        "五類詞彙命中數、高頻詞。", body_s))

    rows = []
    for t in tiers:
        agg = t["aggregate"]
        rows.append([t["tier"], f"{t['post_count']} 則",
                     fmt(agg["avg_char_count"]), fmt(agg["avg_likes"]),
                     fmt(agg["avg_replies"]), f"{fmt(agg['question_rate_pct'])}%",
                     fmt(agg["avg_second_person"]), fmt(agg["avg_first_person"])])
    story.append(table(
        ["分層", "則數", "平均字數", "平均讚", "平均回覆", "提問率", "第二人稱", "第一人稱"],
        rows, [22 * mm, 14 * mm, 22 * mm, 19 * mm, 22 * mm, 18 * mm, 22 * mm, 22 * mm],
        align_right=(1, 2, 3, 4, 5, 6, 7)))
    story.append(Spacer(1, 6))

    lex_keys = list(tiers[0]["lexicon_totals"].keys())
    rows = [[t["tier"]] + [fmt(t["lexicon_totals"].get(k, 0)) for k in lex_keys]
            for t in tiers]
    story.append(Paragraph("詞彙命中（各組取樣 5 則合計）", h2_s))
    story.append(table(["分層"] + lex_keys, rows,
                       [22 * mm] + [24 * mm] * len(lex_keys),
                       align_right=tuple(range(1, len(lex_keys) + 1))))

    for t in tiers:
        sr = t["score_range"]
        story.append(Paragraph(
            f"{t['tier']}（{t['post_count']} 則，互動分數 {sr['min']}–{sr['max']}）", h2_s))
        rows = []
        for sample in t["samples"]:
            rows.append([clip(sample["excerpt"], 40), fmt(sample["likes"]),
                         fmt(sample["replies"]), fmt(sample["char_count"]),
                         fmt(sample["sentence_count"]), fmt(sample["question_marks"]),
                         fmt(sample["second_person_count"])])
        story.append(table(["摘要", "讚", "回覆", "字數", "句數", "問號", "第二人稱"], rows,
                           [73 * mm, 13 * mm, 15 * mm, 14 * mm, 14 * mm, 13 * mm, 23 * mm],
                           align_right=(1, 2, 3, 4, 5, 6)))

    story.append(PageBreak())

    # 9 key differentiators
    story.append(Paragraph("9　跨組對照最關鍵的三個差異", h1_s))
    hi_agg, mid_agg, lo_agg = (t["aggregate"] for t in tiers)
    diffs = [
        ("提問是最強的分水嶺",
         f"高互動組與中互動組提問率同為 {fmt(hi_agg['question_rate_pct'])}%，"
         f"低互動組為 <b>{fmt(lo_agg['question_rate_pct'])}%</b> —— 低互動組完全沒有向讀者提問，"
         f"貼文寫完即結束，沒有給出留言的理由。這同時解釋了回覆數的斷崖："
         f"{fmt(hi_agg['avg_replies'])} vs {fmt(lo_agg['avg_replies'])}。"),
        ("第二人稱密度決定「對話感」",
         f"高互動組平均出現 {fmt(hi_agg['avg_second_person'])} 次「你／妳」，"
         f"低互動組僅 {fmt(lo_agg['avg_second_person'])} 次。"
         "高互動貼文把讀者寫進文本，低互動貼文只是自言自語。"),
        ("字數不是失敗主因，但有門檻",
         f"三組平均字數分別為 {fmt(hi_agg['avg_char_count'])}、"
         f"{fmt(mid_agg['avg_char_count'])}、{fmt(lo_agg['avg_char_count'])} 字，差距不大；"
         "但從長度分桶可見 200 字以上的貼文平均互動明顯跳升，顯示「夠長到能說完一個故事」"
         "是必要條件，而非充分條件。"),
    ]
    for i, (title, body) in enumerate(diffs, start=1):
        story.append(Paragraph(f"{i}.　{title}", h2_s))
        story.append(Paragraph(body, body_s))

    # 10 strategy
    story.append(Paragraph("10　對帳號內容策略的 3 點觀察", h1_s))
    strategies = [
        ("把「提問」變成預設收尾，而不是偶爾為之",
         "低互動組 6 則貼文的提問率是 0%，平均回覆僅 0.67 則；而全帳號互動最高的貼文"
         "正是「二選一互動提問」（624 互動）。此帳號的故事寫作能力已經足夠，"
         "真正的槓桿點在於每篇結尾都給讀者一個低門檻、可二選一的問題。"),
        ("內容長度應穩定在 200–300 字的敘事帶",
         "字數與互動呈中等正相關 (r=0.403)，且 200 字以上分桶的平均互動（230）"
         "遠高於 200 字以下。少於 100 字的金句型貼文雖偶有爆款，但回覆數極低，"
         "難以累積社群關係 —— 建議作為補充而非主力。"),
        ("發文時段集中在深夜，但高互動其實落在晚間",
         "目前發文最密集的是 00 時，而平均互動最高的時段是 20 時（504.33 互動）。"
         "在現有節奏下，把最有信心的「故事＋提問」貼文挪到晚間時段，"
         "是不需要增加產量就能提升成效的調整。"),
    ]
    for i, (title, body) in enumerate(strategies, start=1):
        story.append(KeepTogether([
            Paragraph(f"{i}.　{title}", h2_s),
            Paragraph(body, body_s),
        ]))

    # 11 limits
    story.append(Paragraph("11　已知限制", h1_s))
    limits = [
        "真實樣本僅 16 則、時間跨度約 3 天，統計結論屬於方向性指標，不足以做顯著性檢定。",
        "Threads 公開頁面擋登入，無法取得粉絲數，因此「互動率」以絕對互動數代替"
        "分母正規化後的比率。",
        "本帳號 16 則貼文全為純文字（無連結／hashtag／mention），故「貼文類型」維度"
        "無鑑別力，分析改以「文型」與「主題」作為替代切角。",
        "中文斷詞採 bigram 近似法而非詞典式斷詞，關鍵字結果可能包含跨詞邊界的組合。",
        "合成資料不具語意價值，僅用於湊足筆數與壓力測試管線，未進入任何結論。",
    ]
    for i, text in enumerate(limits, start=1):
        story.append(Paragraph(f"{i}.　{text}", body_s))

    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=0.6, color=PDF_RULE,
                            spaceBefore=0, spaceAfter=7))
    story.append(Paragraph(
        "本報告由 scripts/export_deck.py 自動產生，資料來源 data/analysis.json。", muted_s))

    def decorate(canvas, doc):
        canvas.saveState()
        canvas.setFont(regular, 8)
        canvas.setFillColor(PDF_MUTED)
        canvas.drawString(20 * mm, 12 * mm, f"Threads 互動分析　|　@{account}")
        canvas.drawRightString(A4[0] - 20 * mm, 12 * mm, f"{doc.page}")
        canvas.setStrokeColor(PDF_RULE)
        canvas.setLineWidth(0.4)
        canvas.line(20 * mm, 15 * mm, A4[0] - 20 * mm, 15 * mm)
        canvas.restoreState()

    out.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(out), pagesize=A4,
        leftMargin=20 * mm, rightMargin=20 * mm,
        topMargin=18 * mm, bottomMargin=20 * mm,
        title=f"Threads 帳號互動分析報告 — @{account}",
        author="threads-analytics",
    )
    doc.build(story, onFirstPage=decorate, onLaterPages=decorate)
    return out


def main() -> None:
    data = load()
    fonts = register_cjk_fonts()
    pptx_path = build_pptx(data, OUT_DIR / "report.pptx")
    pdf_path = build_pdf(data, OUT_DIR / "report.pdf", fonts)
    for path in (pptx_path, pdf_path):
        print(f"wrote {path.relative_to(ROOT)}  ({path.stat().st_size / 1024:.0f} KB)")


if __name__ == "__main__":
    main()
