import { describe, expect, it } from "vitest";
import { detectContentKind, validateUploadCandidate } from "./fileSniff.js";

const PDF = Buffer.from("%PDF-1.4\n1 0 obj\n<< >>\nendobj\n");
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from("IHDR"),
]);
const JPEG = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.from("JFIF"),
]);
const GIF = Buffer.from("GIF89a\x01\x00\x01\x00", "latin1");
const WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from("WEBP"),
]);
const ZIP = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from("stub"),
]);
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);
const HTML = Buffer.from(
  "<!DOCTYPE html>\n<html><script>alert(1)</script></html>",
);
const TEXT = Buffer.from("Catatan kuliah minggu 1\nBaris kedua.\n");
const BINARY = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0x00, 0x7f]);

describe("detectContentKind", () => {
  it("recognises the magic bytes of every allowed format", () => {
    expect(detectContentKind(PDF)).toBe("pdf");
    expect(detectContentKind(PNG)).toBe("png");
    expect(detectContentKind(JPEG)).toBe("jpeg");
    expect(detectContentKind(GIF)).toBe("gif");
    expect(detectContentKind(WEBP)).toBe("webp");
    expect(detectContentKind(ZIP)).toBe("zip");
    expect(detectContentKind(OLE)).toBe("ole");
    expect(detectContentKind(TEXT)).toBe("text");
  });

  it("flags HTML payloads and empty buffers", () => {
    expect(detectContentKind(HTML)).toBe("html");
    expect(detectContentKind(Buffer.from('   <html lang="en">'))).toBe("html");
    expect(
      detectContentKind(Buffer.from("<div>x</div><script>x()</script>")),
    ).toBe("html");
    expect(detectContentKind(Buffer.alloc(0))).toBe("empty");
    expect(detectContentKind(BINARY)).toBe("binary");
  });
});

describe("validateUploadCandidate", () => {
  it("accepts a real PDF", () => {
    expect(
      validateUploadCandidate({
        originalname: "materi.pdf",
        mimetype: "application/pdf",
        buffer: PDF,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects an HTML payload disguised as text/plain (F-05)", () => {
    const result = validateUploadCandidate({
      originalname: "RACE-UJI-batch.txt",
      mimetype: "text/plain",
      buffer: HTML,
    });
    expect(result.ok).toBe(false);
    expect(result).toEqual({ ok: false, reason: "HTML files are not allowed" });
  });

  it("rejects an HTML payload disguised as application/pdf", () => {
    const result = validateUploadCandidate({
      originalname: "xss.pdf",
      mimetype: "application/pdf",
      buffer: HTML,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects extensions outside the allowlist", () => {
    const result = validateUploadCandidate({
      originalname: "RACE-UJI-batch.html",
      mimetype: "text/plain",
      buffer: TEXT,
    });
    expect(result).toEqual({
      ok: false,
      reason: "File extension not allowed: .html",
    });
  });

  it("rejects a text file whose content is not text (magic-byte mismatch)", () => {
    const result = validateUploadCandidate({
      originalname: "notes.txt",
      mimetype: "text/plain",
      buffer: BINARY,
    });
    expect(result.ok).toBe(false);
    expect(result).toEqual({
      ok: false,
      reason: "File content does not match .txt extension",
    });
  });

  it("rejects a .pdf whose bytes are not a PDF", () => {
    const result = validateUploadCandidate({
      originalname: "fake.pdf",
      mimetype: "application/pdf",
      buffer: TEXT,
    });
    expect(result).toEqual({
      ok: false,
      reason: "File content does not match .pdf extension",
    });
  });

  it("rejects empty and extension-less files", () => {
    expect(
      validateUploadCandidate({
        originalname: "empty.pdf",
        mimetype: "application/pdf",
        buffer: Buffer.alloc(0),
      }),
    ).toEqual({ ok: false, reason: "File is empty" });
    expect(
      validateUploadCandidate({
        originalname: "README",
        mimetype: "text/plain",
        buffer: TEXT,
      }),
    ).toEqual({
      ok: false,
      reason: "File extension is required",
    });
  });

  it("accepts office documents and plain text formats", () => {
    expect(
      validateUploadCandidate({ originalname: "deck.pptx", buffer: ZIP }),
    ).toEqual({ ok: true });
    expect(
      validateUploadCandidate({ originalname: "legacy.doc", buffer: OLE }),
    ).toEqual({ ok: true });
    expect(
      validateUploadCandidate({ originalname: "catatan.md", buffer: TEXT }),
    ).toEqual({ ok: true });
    expect(
      validateUploadCandidate({ originalname: "foto.png", buffer: PNG }),
    ).toEqual({ ok: true });
  });
});
