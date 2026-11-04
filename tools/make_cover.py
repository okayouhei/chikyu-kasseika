"""演説記事の表紙画像を作る。
使い方: python3 tools/make_cover.py 回数 "テーマ" スラッグ ["問いかけの一文"]
  例) python3 tools/make_cover.py 2 "住まいの不安" 2026-11-03-enzetsu-2 "家賃や部屋さがしで、困っていませんか？"
できるもの:
  img/blog/<スラッグ>.png       … ブログ・LINE/X で共有したとき用（1200×630）
  instagram/<スラッグ>.png      … Instagram 投稿用（1080×1080、ホームページには出ない）
"""
import base64, pathlib, sys
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
PHOTO = "data:image/jpeg;base64," + base64.b64encode((ROOT / "img/okachan.jpg").read_bytes()).decode()

CSS = """
*{margin:0;box-sizing:border-box}
body{width:%(w)dpx;height:%(h)dpx;background:#f5f8fb;font-family:"Noto Sans CJK JP","Noto Sans JP",sans-serif;color:#14212e;overflow:hidden}
.card{position:absolute;inset:%(pad)dpx;background:#fff;border-radius:36px;border:6px solid #1f6fb2;
      display:flex;flex-direction:column;justify-content:space-between;padding:%(ipad)dpx}
.kicker{display:inline-block;background:#1f6fb2;color:#fff;font-weight:900;font-size:%(k)dpx;padding:10px 26px;border-radius:999px;letter-spacing:.06em}
.no{font-weight:900;font-size:%(no)dpx;color:#1f6fb2;margin-top:%(gap)dpx}
.theme{font-weight:900;font-size:%(t)dpx;line-height:1.25;margin-top:10px}
.theme span{background:linear-gradient(transparent 70%%,#f2b705 70%%,#f2b705 92%%,transparent 92%%)}
.q{font-size:%(q)dpx;font-weight:700;color:#4a5a6a;margin-top:%(qgap)dpx;line-height:1.5}
.foot{display:flex;align-items:center;gap:22px}
.foot img{width:%(ph)dpx;height:%(ph)dpx;border-radius:50%%;object-fit:cover;border:5px solid #f2b705}
.who{font-size:%(f)dpx;font-weight:700;line-height:1.4}
.who small{display:block;font-size:%(fs)dpx;color:#4a5a6a;font-weight:500}
"""


def page(no, theme, w, h, big, q=""):
    s = dict(w=w, h=h, pad=28, ipad=56 if big else 48, k=30 if big else 28, no=56 if big else 46,
             t=96 if big else 78, gap=40 if big else 22, ph=120 if big else 96, f=34 if big else 30, fs=24 if big else 22,
             q=44 if big else 32, qgap=56 if big else 22)
    return f"""<html><head><meta charset="utf-8"><style>{CSS % s}</style></head><body><div class="card">
<div><span class="kicker">ありが党 ネット街頭演説</span>
<p class="no">第{no}回</p><p class="theme"><span>{theme}</span></p>{f'<p class="q">{q}</p>' if q else ""}</div>
<div class="foot"><img src="{PHOTO}" alt=""><p class="who">呼びかけ人 岡ちゃん<small>広島から、政治をもっと身近に</small></p></div>
</div></body></html>"""


def main(no, theme, slug, q=""):
    (ROOT / "img/blog").mkdir(parents=True, exist_ok=True)
    (ROOT / "instagram").mkdir(exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch()
        for w, h, big, out in ((1200, 630, False, ROOT / f"img/blog/{slug}.png"),
                               (1080, 1080, True, ROOT / f"instagram/{slug}.png")):
            pg = b.new_page(viewport={"width": w, "height": h})
            pg.set_content(page(no, theme, w, h, big, q))
            pg.screenshot(path=str(out))
            print("作りました:", out.relative_to(ROOT))
        b.close()


if __name__ == "__main__":
    main(*sys.argv[1:5])
