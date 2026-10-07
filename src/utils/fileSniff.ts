import path from "node:path";

/**
 * Content sniffing + extension allowlist for uploads (M6).
 *
 * The client-supplied `Content-Type` is untrusted: an attacker can post an
 * HTML/script payload labelled `text/plain` (or even `application/pdf`), so
 * every upload is validated against its extension AND its magic bytes before
 * it is persisted.
 */

export type FileContentKind =
  | "pdf"
  | "png"
  | "jpeg"
  | "gif"
  | "webp"
  | "zip"
  | "ole"
  | "html"
  | "text"
  | "binary"
  | "empty";

/** Explicit extension allowlist for every knowledge-base upload path. */
export const ALLOWED_UPLOAD_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "txt",
  "md",
  "csv",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "zip",
];

/** Which sniffed content kinds are acceptable for a given extension. */
const EXPECTED_KINDS_BY_EXT: Record<string, FileContentKind[]> = {
  pdf: ["pdf"],
  docx: ["zip"],
  pptx: ["zip"],
  xlsx: ["zip"],
  zip: ["zip"],
  doc: ["ole", "text"],
  xls: ["ole", "text"],
  ppt: ["ole", "text"],
  txt: ["text"],
  md: ["text"],
  csv: ["text"],
  png: ["png"],
  jpg: ["jpeg"],
  jpeg: ["jpeg"],
  gif: ["gif"],
  webp: ["webp"],
};

const NAMESPACE_HTML_HINTS = [
  "<!doctype html",
  "<html",
  "<head",
  "<body",
  "<script",
  "<!--",
  "<svg",
];

function startsWithBytes(buffer: Buffer, bytes: number[], offset = 0): boolean {
  if (buffer.length < offset + bytes.length) return false;
  for (let i = 0; i < bytes.length; i += 1) {
    if (buffer[offset + i] !== bytes[i]) return false;
  }
  return true;
}

function looksLikeHtml(prefix: string): boolean {
  const normalized = prefix
    .replace(/^\uFEFF/, "")
    .trimStart()
    .toLowerCase();
  if (NAMESPACE_HTML_HINTS.some((hint) => normalized.startsWith(hint)))
    return true;
  // Markup further in (e.g. a leading comment/wrapper) still renders as HTML.
  return normalized.includes("<script") || normalized.includes("<html");
}

function isUtf8Text(buffer: Buffer): boolean {
  if (buffer.includes(0)) return false;
  const decoded = buffer.toString("utf8");
  return Buffer.from(decoded, "utf8").equals(buffer);
}

/**
 * Identify file content from its leading bytes. Never trusts `mimetype`.
 */
export function detectContentKind(buffer: Buffer): FileContentKind {
  if (!buffer || buffer.length === 0) return "empty";

  const head = buffer.subarray(0, 4096);
  const latin = head.subarray(0, 16).toString("latin1");

  if (latin.startsWith("%PDF-")) return "pdf";
  if (startsWithBytes(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return "png";
  if (startsWithBytes(head, [0xff, 0xd8, 0xff])) return "jpeg";
  if (latin.startsWith("GIF87a") || latin.startsWith("GIF89a")) return "gif";
  if (latin.startsWith("RIFF") && latin.slice(8, 12) === "WEBP") return "webp";
  if (
    startsWithBytes(head, [0x50, 0x4b, 0x03, 0x04]) ||
    startsWithBytes(head, [0x50, 0x4b, 0x05, 0x06]) ||
    startsWithBytes(head, [0x50, 0x4b, 0x07, 0x08])
  ) {
    return "zip";
  }
  if (startsWithBytes(head, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
    return "ole";

  // Text-based sniffing: only decode when the bytes are plausibly textual.
  if (!head.includes(0)) {
    const prefix = head.subarray(0, 1024).toString("utf8");
    if (looksLikeHtml(prefix)) return "html";
    if (isUtf8Text(head)) return "text";
  }

  return "binary";
}

export interface UploadCandidate {
  originalname?: string;
  mimetype?: string;
  buffer?: Buffer;
}

export type UploadValidation = { ok: true } | { ok: false; reason: string };

/**
 * Validate extension allowlist + magic bytes for a single uploaded file.
 */
export function validateUploadCandidate(
  file: UploadCandidate,
): UploadValidation {
  const rawName =
    typeof file.originalname === "string" ? file.originalname : "";
  const ext = path.extname(rawName).replace(/^\./, "").toLowerCase();

  if (!ext) {
    return { ok: false, reason: "File extension is required" };
  }
  if (!ALLOWED_UPLOAD_EXTENSIONS.includes(ext)) {
    return { ok: false, reason: `File extension not allowed: .${ext}` };
  }

  const kind = detectContentKind(file.buffer ?? Buffer.alloc(0));
  if (kind === "empty") {
    return { ok: false, reason: "File is empty" };
  }
  // HTML (incl. script payloads) is never an acceptable upload payload.
  if (kind === "html") {
    return { ok: false, reason: "HTML files are not allowed" };
  }

  const expected = EXPECTED_KINDS_BY_EXT[ext] ?? [];
  if (!expected.includes(kind)) {
    return {
      ok: false,
      reason: `File content does not match .${ext} extension`,
    };
  }

  return { ok: true };
}
