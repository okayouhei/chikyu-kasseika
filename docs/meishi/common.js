// QR名刺メーカー 共通処理（データはURLの中だけに入れる。サーバーには何も保存しない）
var Meishi = (function () {
  function b64urlEncode(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = "";
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64urlDecode(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    var bin = atob(s);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function encode(data) {
    var clean = {};
    Object.keys(data).forEach(function (k) { if (data[k]) clean[k] = data[k]; });
    return b64urlEncode(JSON.stringify(clean));
  }
  function decode(s) {
    try { var o = JSON.parse(b64urlDecode(s)); return (o && typeof o === "object") ? o : null; }
    catch (e) { return null; }
  }
  function safeUrl(u) {
    if (!u) return "";
    u = String(u).trim();
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    try { var p = new URL(u); return (p.protocol === "https:" || p.protocol === "http:") ? p.href : ""; }
    catch (e) { return ""; }
  }
  function handle(h) { return String(h || "").trim().replace(/^@/, "").replace(/[^A-Za-z0-9._]/g, ""); }
  function tel(t) { return String(t || "").replace(/[^0-9+]/g, ""); }

  function vcard(d) {
    var esc = function (s) { return String(s).replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n"); };
    var lines = ["BEGIN:VCARD", "VERSION:3.0", "FN:" + esc(d.n || "")];
    if (d.r) lines.push("TITLE:" + esc(d.r));
    if (d.t) lines.push("TEL;TYPE=CELL:" + tel(d.t));
    if (d.e) lines.push("EMAIL:" + esc(d.e));
    if (d.i) lines.push("URL:https://www.instagram.com/" + handle(d.i) + "/");
    if (d.w) lines.push("URL:" + safeUrl(d.w));
    if (d.m) lines.push("NOTE:" + esc(d.m));
    lines.push("END:VCARD");
    return lines.join("\r\n");
  }

  // QRコードの模様（qrcode-generator を使用）
  function qrMatrix(text) {
    var q = qrcode(0, "M");
    q.addData(text);
    q.make();
    return q;
  }
  function drawQR(ctx, q, x, y, size, color) {
    var n = q.getModuleCount();
    var cell = size / n;
    ctx.fillStyle = color;
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) {
      if (q.isDark(r, c)) ctx.fillRect(Math.floor(x + c * cell), Math.floor(y + r * cell), Math.ceil(cell), Math.ceil(cell));
    }
  }
  function wrapText(ctx, text, maxW) {
    var out = [];
    String(text).split("\n").forEach(function (para) {
      var line = "";
      for (var i = 0; i < para.length; i++) {
        var test = line + para[i];
        if (ctx.measureText(test).width > maxW && line) { out.push(line); line = para[i]; }
        else line = test;
      }
      out.push(line);
    });
    return out;
  }

  // スマホ画面サイズの名刺画像
  function makeImage(d, url) {
    var W = 1080, H = 2340;
    var cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var x = cv.getContext("2d");
    var sky = "#1f6fb2", sun = "#f2b705", ink = "#14212e";
    var disp = '"Zen Maru Gothic","Hiragino Maru Gothic ProN","Noto Sans JP",sans-serif';
    x.fillStyle = sky; x.fillRect(0, 0, W, H);
    x.fillStyle = sun; x.beginPath(); x.arc(W - 40, 40, 300, 0, Math.PI * 2); x.fill();
    var y = 400;
    x.fillStyle = "rgba(255,255,255,.88)";
    if (d.r) { x.font = "700 44px " + disp; wrapText(x, d.r, W - 160).slice(0, 2).forEach(function (l) { x.fillText(l, 80, y); y += 60; }); y += 10; }
    x.fillStyle = "#fff";
    var fs = 150; x.font = "900 " + fs + "px " + disp;
    while (x.measureText(d.n || "").width > W - 160 && fs > 70) { fs -= 6; x.font = "900 " + fs + "px " + disp; }
    y += fs * 0.85; x.fillText(d.n || "", 80, y); y += 70;
    if (d.m) {
      x.font = "700 50px " + disp;
      wrapText(x, d.m, W - 160).slice(0, 4).forEach(function (l) { y += 72; x.fillText(l, 80, y); });
    }
    var size = 720, pad = 50, qx = (W - size) / 2, qy = Math.max(y + 100, 1080);
    x.fillStyle = "#fff";
    if (x.roundRect) { x.beginPath(); x.roundRect(qx - pad, qy - pad, size + pad * 2, size + pad * 2, 56); x.fill(); }
    else x.fillRect(qx - pad, qy - pad, size + pad * 2, size + pad * 2);
    drawQR(x, qrMatrix(url), qx, qy, size, ink);
    x.fillStyle = "#fff"; x.font = "700 50px " + disp; x.textAlign = "center";
    x.fillText("カメラで読み取ってください", W / 2, qy + size + pad + 100);
    x.font = "500 36px " + disp; x.fillStyle = "rgba(255,255,255,.75)";
    x.fillText("QR名刺メーカー｜地球活性化実行委員会", W / 2, H - 120);
    return cv.toDataURL("image/png");
  }

  return { encode: encode, decode: decode, safeUrl: safeUrl, handle: handle, tel: tel, vcard: vcard, makeImage: makeImage };
})();
