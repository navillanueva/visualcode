// BlurbCode wordmark: "blurb" (left) + "code" (right), drawn in the same 2-tone
// block font as the original. Hand-drawn glyphs:
//   b = box bowl + full left ascender   d = box bowl + full right ascender
//   o = clean box (no ascender)         l = tall stem with a foot
// The full ascenders keep b / d / o legibly distinct. Rendered blurb=strong /
// code=muted (see component/logo.tsx).
export const logo = {
  left: ["█    █              █   ", "█▀▀█ █    █__█ █▀▀▀ █▀▀█", "█__█ █    █__█ █    █__█", "▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀    ▀▀▀▀"],
  right: ["             █     ", "█▀▀▀ █▀▀█ █▀▀█ █▀▀█", "█___ █__█ █__█ █^^^", "▀▀▀▀ ▀▀▀▀ ▀▀▀▀ ▀▀▀▀"],
}

export const go = {
  left: ["    ", "█▀▀▀", "█_^█", "▀▀▀▀"],
  right: ["    ", "█▀▀█", "█__█", "▀▀▀▀"],
}

export const marks = "_^~,"
