#!/usr/bin/env python3
"""Generate BlurbCode submission art: a square logo and a 16:9 cover.

Brand: deep-navy squircle + neon-green block cursor (the shell caret), the same
mark used for the favicon (visual-web/app/icon.svg). Rendered at 2x and
downscaled with LANCZOS for crisp edges. Wordmark uses the repo's Inter font.
"""
from PIL import Image, ImageDraw, ImageFilter, ImageFont

NAVY_TOP = (27, 46, 94)      # #1b2e5e
NAVY_BOT = (13, 26, 56)      # #0d1a38
NAVY_FLAT = (21, 36, 77)     # #15244d  (favicon ground)
GREEN = (155, 255, 60)       # #9bff3c
WHITE = (238, 244, 252)      # #eef4fc
BLUE = (108, 140, 255)       # brighter indigo so "code" reads on navy
MUTED = (150, 168, 201)      # #96a8c9

FONT_PATH = "/Users/nicolas.arnedo/visualcode/opencode/visual-web/app/fonts/Inter-VariableFont_opsz_wght.ttf"


def inter(size, weight=600):
    f = ImageFont.truetype(FONT_PATH, size)
    try:
        names = [n.decode() if isinstance(n, bytes) else n for n in f.get_variation_names()]
        want = "Semi Bold" if weight >= 600 and weight < 700 else ("Bold" if weight >= 700 else "Regular")
        pick = next((n for n in names if want.lower() in n.lower()), None)
        if pick:
            f.set_variation_by_name(pick)
    except Exception:
        pass
    return f


def vgradient(size, top, bot):
    w, h = size
    base = Image.new("RGB", (1, h))
    px = base.load()
    for y in range(h):
        t = y / max(1, h - 1)
        px[0, y] = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3))
    return base.resize((w, h)).convert("RGBA")


def soft_glow(size, draw_fn, blur, passes=2):
    """Draw a shape, blur it, return an RGBA layer to composite as glow."""
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    draw_fn(d)
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    out = Image.new("RGBA", size, (0, 0, 0, 0))
    for _ in range(passes):
        out = Image.alpha_composite(out, layer)
    return out


def make_logo(out_path, final=512):
    S = 2
    W = final * S
    img = Image.new("RGBA", (W, W), (0, 0, 0, 0))

    # squircle ground with a subtle vertical gradient
    radius = int(W * 0.235)
    mask = Image.new("L", (W, W), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, W - 1, W - 1], radius=radius, fill=255)
    ground = vgradient((W, W), NAVY_TOP, NAVY_BOT)
    img.paste(ground, (0, 0), mask)

    # green block cursor (centered) — matches favicon proportions: ~20% wide, ~48% tall
    cw, ch = int(W * 0.205), int(W * 0.49)
    cx, cy = W // 2, W // 2
    box = [cx - cw // 2, cy - ch // 2, cx + cw // 2, cy + ch // 2]
    cr = int(cw * 0.16)

    glow = soft_glow((W, W), lambda d: d.rounded_rectangle(box, radius=cr, fill=GREEN + (255,)),
                     blur=int(W * 0.05), passes=3)
    img = Image.alpha_composite(img, glow)

    ImageDraw.Draw(img).rounded_rectangle(box, radius=cr, fill=GREEN)

    img.resize((final, final), Image.LANCZOS).save(out_path)
    print("wrote", out_path)


def make_cover(out_path, w=640, h=360):
    S = 2
    W, H = w * S, h * S
    img = vgradient((W, H), NAVY_TOP, NAVY_BOT)

    # faint radial green energy behind the lockup
    glow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gw, gh = int(W * 0.5), int(H * 0.5)
    gd.ellipse([W // 2 - gw, int(H * 0.42) - gh, W // 2 + gw, int(H * 0.42) + gh],
               fill=GREEN + (26,))
    img = Image.alpha_composite(img, glow.filter(ImageFilter.GaussianBlur(int(W * 0.06))))

    draw = ImageDraw.Draw(img)

    # ---- lockup: [green block cursor] blurb code ----
    word_size = int(96 * S / 2 * 2 * 0.62)  # tuned: ~92px at 2x
    word_size = 116
    f = inter(word_size, 600)
    a, b = "blurb", "code"
    bb_a = draw.textbbox((0, 0), a, font=f)
    bb_b = draw.textbbox((0, 0), b, font=f)
    wa = bb_a[2] - bb_a[0]
    wb = bb_b[2] - bb_b[0]
    text_h = bb_a[3] - bb_a[1]

    # block cursor sized to the text cap height
    cur_w = int(word_size * 0.40)
    cur_h = int(text_h * 1.12)
    gap = int(word_size * 0.34)

    total_w = cur_w + gap + wa + wb
    x0 = (W - total_w) // 2
    cy = int(H * 0.42)

    # cursor
    cur_box = [x0, cy - cur_h // 2, x0 + cur_w, cy + cur_h // 2]
    cur_glow = soft_glow((W, H), lambda d: d.rounded_rectangle(cur_box, radius=int(cur_w * 0.18), fill=GREEN + (255,)),
                         blur=int(W * 0.012), passes=3)
    img = Image.alpha_composite(img, cur_glow)
    draw = ImageDraw.Draw(img)
    draw.rounded_rectangle(cur_box, radius=int(cur_w * 0.18), fill=GREEN)

    # wordmark — draw by baseline so the two colors line up
    tx = x0 + cur_w + gap
    ty = cy - text_h // 2 - bb_a[1]
    draw.text((tx, ty), a, font=f, fill=WHITE)
    draw.text((tx + wa, ty), b, font=f, fill=BLUE)

    # tagline
    tf = inter(int(word_size * 0.30), 500)
    tag = "Get paid while your agent works — you keep half."
    tbb = draw.textbbox((0, 0), tag, font=tf)
    draw.text(((W - (tbb[2] - tbb[0])) // 2, cy + cur_h // 2 + int(H * 0.07)), tag, font=tf, fill=MUTED)

    # url footer in mono-ish (Inter is fine), green accent
    uf = inter(int(word_size * 0.24), 600)
    url = "blurbcode.xyz"
    ubb = draw.textbbox((0, 0), url, font=uf)
    draw.text(((W - (ubb[2] - ubb[0])) // 2, int(H * 0.86)), url, font=uf, fill=GREEN)

    img.convert("RGB").resize((w, h), Image.LANCZOS).save(out_path)
    print("wrote", out_path)


if __name__ == "__main__":
    import os
    here = os.path.dirname(os.path.abspath(__file__))
    make_logo(os.path.join(here, "logo.png"))
    make_cover(os.path.join(here, "cover.png"))
