"""地球活性化実行委員会サイトのビルド。
posts/*.md（先頭に title / date / summary）を読み、docs/（GitHub Pagesで公開）と artifact/（プレビュー用）を作る。
使い方: python3 build.py
"""
import html, json, pathlib, re, shutil
import markdown

ROOT = pathlib.Path(__file__).parent
SITE = "地球活性化実行委員会"
BASE = "https://okayouhei.github.io/chikyu-kasseika/"
DESC = "広島の市民グループ「地球活性化実行委員会」。障がいがあってもなくても自然につながれる場所づくりと、活動ブログ、仲間募集。呼びかけ人は岡ちゃん。"
FONTS = ('<link rel="preconnect" href="https://fonts.googleapis.com">\n'
         '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
         '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@500;700;900&family=Noto+Sans+JP:wght@400;500;700&display=swap">')


def load_posts():
    posts = []
    for f in sorted((ROOT / "posts").glob("*.md"), reverse=True):
        raw = f.read_text(encoding="utf-8")
        m = re.match(r"---\n(.*?)\n---\n(.*)", raw, re.S)
        meta = dict(line.split(":", 1) for line in m.group(1).splitlines() if ":" in line)
        meta = {k.strip(): v.strip() for k, v in meta.items()}
        meta["slug"] = f.stem
        meta["html"] = markdown.markdown(m.group(2), extensions=["extra"])
        posts.append(meta)
    return posts


def jdate(d):
    y, mo, da = d.split("-")
    return f"{int(y)}年{int(mo)}月{int(da)}日"


def cards(posts, prefix):
    if not posts:
        return '<p class="note">記事はまだありません。</p>'
    out = ['<div class="posts">']
    for p in posts:
        out.append(f'<a class="post-card" href="{prefix}{p["slug"]}.html"><time datetime="{p["date"]}">{jdate(p["date"])}</time>'
                   f'<h3>{html.escape(p["title"])}</h3><p>{html.escape(p.get("summary", ""))}</p></a>')
    out.append("</div>")
    return "\n".join(out)


def header(prefix):
    return (f'<header><div class="wrap"><a class="logo" href="{prefix}index.html">{SITE}</a>'
            f'<nav aria-label="メニュー"><a href="{prefix}index.html#about">岡ちゃん</a><a href="{prefix}index.html#event">イベント</a>'
            f'<a href="{prefix}blog/index.html">ブログ</a><a href="{prefix}index.html#join">仲間募集</a><a href="{prefix}arigatou.html">ありが党</a><a href="{prefix}index.html#contact">連絡先</a></nav></div></header>')


FOOTER = (f'<footer><p>障がいがあってもなくても、自然につながれる場所を広島に。</p>'
          f'<p><a href="https://www.instagram.com/ayu19841002/" target="_blank" rel="noopener">Instagram @ayu19841002</a></p>'
          f'<p>© 2026 {SITE} ・ 広島</p></footer>')


def full_doc(title, desc, css, body, extra_head=""):
    return f"""<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
<meta property="og:type" content="website">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(desc)}">
<meta property="og:locale" content="ja_JP">
{extra_head}{FONTS}
<link rel="stylesheet" href="{css}">
</head>
<body>
{body}
</body>
</html>
"""


def post_body(p, prefix):
    return (header(prefix) + f'\n<main class="wrap article"><time datetime="{p["date"]}">{jdate(p["date"])}</time>'
            f'<h1>{html.escape(p["title"])}</h1><div class="body">{p["html"]}</div>'
            f'<a class="back" href="{prefix}blog/index.html">← 記事一覧へ</a></main>\n' + FOOTER)


def list_body(posts, prefix):
    return (header(prefix) + '\n<main class="wrap article"><p class="kicker">BLOG</p><h1>活動ブログ</h1>'
            f'<div class="body" style="max-width:none">{cards(posts, "")}</div></main>\n' + FOOTER)


def build():
    posts = load_posts()
    home = (ROOT / "home.html").read_text(encoding="utf-8").replace("{{POSTS}}", cards(posts[:5], "blog/"))
    org = json.dumps({"@context": "https://schema.org", "@type": "Organization", "name": SITE,
                      "areaServed": "広島", "description": DESC,
                      "founder": {"@type": "Person", "name": "岡ちゃん"}}, ensure_ascii=False)

    for out, kind in ((ROOT / "docs", "dist"), (ROOT / "artifact", "artifact")):
        if out.exists():
            shutil.rmtree(out)
        (out / "blog").mkdir(parents=True)
        shutil.copy(ROOT / "style.css", out / "style.css")
        shutil.copytree(ROOT / "img", out / "img")
        home_body = header("") + "\n" + home + "\n" + FOOTER
        if kind == "dist":
            (out / "index.html").write_text(full_doc(f"{SITE}｜広島から、障がいがあってもなくてもつながれる場所を", DESC, "style.css", home_body,
                                                     f'<script type="application/ld+json">{org}</script>\n'), encoding="utf-8")
        else:  # プレビュー用: doctype なし（公開時に包まれる）
            (out / "page.html").write_text(f"<title>{SITE}</title>\n{FONTS}\n<link rel=\"stylesheet\" href=\"style.css\">\n{home_body}\n", encoding="utf-8")
        ari_body = header("") + "\n" + (ROOT / "arigatou.html").read_text(encoding="utf-8") + "\n" + FOOTER
        (out / "arigatou.html").write_text(full_doc(f"ありが党｜政治を、もっと身近に（広島・呼びかけ人 岡ちゃん）",
            "広島から始める政治の仲間づくり「ありが党」。政治団体として動き出すための準備中です。呼びかけ人は電動車椅子で暮らす岡ちゃん。仲間を募集しています。",
            "style.css", ari_body), encoding="utf-8")
        (out / "blog" / "index.html").write_text(full_doc(f"活動ブログ｜{SITE}", f"{SITE}（広島）の活動ブログ。", "../style.css", list_body(posts, "../")), encoding="utf-8")
        for p in posts:
            (out / "blog" / f'{p["slug"]}.html').write_text(
                full_doc(f'{p["title"]}｜{SITE}', p.get("summary", DESC), "../style.css", post_body(p, "../")), encoding="utf-8")
    # 検索エンジン向け
    docs = ROOT / "docs"
    urls = [BASE, BASE + "arigatou.html", BASE + "blog/index.html"] + [BASE + f'blog/{p["slug"]}.html' for p in posts]
    (docs / "sitemap.xml").write_text('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "".join(f"<url><loc>{u}</loc></url>\n" for u in urls) + "</urlset>\n", encoding="utf-8")
    (docs / "robots.txt").write_text(f"User-agent: *\nAllow: /\nSitemap: {BASE}sitemap.xml\n", encoding="utf-8")
    (docs / ".nojekyll").write_text("")
    print(f"built {len(posts)} posts")


if __name__ == "__main__":
    build()
