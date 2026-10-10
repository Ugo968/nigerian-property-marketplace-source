import { describe, it, expect } from "bun:test";
import {
  validateFile,
  sniffMimeType,
  getFileExtension,
} from "@/lib/storage/file-validation";

// Helper: convert a string of bytes to Uint8Array.
function bytes(...nums: number[]): Uint8Array {
  return new Uint8Array(nums);
}

// Build a valid PDF magic-byte header
function makePdfBytes(size = 100): Uint8Array {
  const out = new Uint8Array(size);
  // %PDF-1.4 magic
  out[0] = 0x25;
  out[1] = 0x50;
  out[2] = 0x44;
  out[3] = 0x46;
  return out;
}

// Build a valid PNG magic-byte header
function makePngBytes(size = 100): Uint8Array {
  const out = new Uint8Array(size);
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < png.length; i++) out[i] = png[i];
  return out;
}

// Build a valid JPEG magic-byte header
function makeJpegBytes(size = 100): Uint8Array {
  const out = new Uint8Array(size);
  out[0] = 0xff;
  out[1] = 0xd8;
  out[2] = 0xff;
  return out;
}

// Build a WebP magic-byte header
function makeWebpBytes(size = 100): Uint8Array {
  const out = new Uint8Array(size);
  // RIFF....WEBP
  const riff = [0x52, 0x49, 0x46, 0x46];
  const webp = [0x57, 0x45, 0x42, 0x50];
  for (let i = 0; i < riff.length; i++) out[i] = riff[i];
  // Skip 4 bytes (file size)
  for (let i = 0; i < webp.length; i++) out[8 + i] = webp[i];
  return out;
}

describe("sniffMimeType", () => {
  it("detects JPEG from FF D8 FF magic", () => {
    expect(sniffMimeType(makeJpegBytes())).toBe("image/jpeg");
  });

  it("detects PNG from 89 50 4E 47 0D 0A 1A 0A magic", () => {
    expect(sniffMimeType(makePngBytes())).toBe("image/png");
  });

  it("detects PDF from %PDF magic", () => {
    expect(sniffMimeType(makePdfBytes())).toBe("application/pdf");
  });

  it("detects WebP from RIFF...WEBP magic", () => {
    expect(sniffMimeType(makeWebpBytes())).toBe("image/webp");
  });

  it("returns null for unknown content", () => {
    expect(sniffMimeType(bytes(0, 0, 0, 0, 0, 0, 0, 0))).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(sniffMimeType(new Uint8Array(0))).toBeNull();
  });

  it("returns null when bytes are too short for signature", () => {
    // PNG needs 8 bytes; only 3 provided
    expect(sniffMimeType(bytes(0x89, 0x50, 0x4e))).toBeNull();
  });
});

describe("getFileExtension", () => {
  it("extracts lowercase extension", () => {
    expect(getFileExtension("photo.JPG")).toBe("jpg");
    expect(getFileExtension("doc.PDF")).toBe("pdf");
  });

  it("returns empty for no extension", () => {
    expect(getFileExtension("noextension")).toBe("");
  });

  it("returns empty for trailing dot", () => {
    expect(getFileExtension("ends.")).toBe("");
  });

  it("handles multiple dots", () => {
    expect(getFileExtension("my.photo.final.png")).toBe("png");
  });
});

describe("validateFile (documents)", () => {
  function makeValidInput(overrides: Partial<{
    fileName: string;
    clientMimeType: string;
    size: number;
    firstBytes: Uint8Array;
  }> = {}) {
    return {
      fileName: "doc.pdf",
      clientMimeType: "application/pdf",
      size: 1024 * 100, // 100 KB
      firstBytes: makePdfBytes(),
      context: "document" as const,
      ...overrides,
    };
  }

  it("accepts valid PDF", () => {
    const result = validateFile(makeValidInput());
    expect(result.ok).toBe(true);
    expect(result.detectedMimeType).toBe("application/pdf");
  });

  it("accepts valid PNG", () => {
    const result = validateFile(
      makeValidInput({
        fileName: "photo.png",
        clientMimeType: "image/png",
        firstBytes: makePngBytes(),
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.detectedMimeType).toBe("image/png");
  });

  it("accepts valid JPEG", () => {
    const result = validateFile(
      makeValidInput({
        fileName: "photo.jpg",
        clientMimeType: "image/jpeg",
        firstBytes: makeJpegBytes(),
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.detectedMimeType).toBe("image/jpeg");
  });

  it("rejects file too large (>10MB)", () => {
    const result = validateFile(
      makeValidInput({ size: 11 * 1024 * 1024 }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/too large/i);
  });

  it("rejects empty file", () => {
    const result = validateFile(makeValidInput({ size: 0 }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });

  it("rejects file with no extension", () => {
    const result = validateFile(
      makeValidInput({ fileName: "noextension" }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects .exe files (executable blocklist)", () => {
    const result = validateFile(
      makeValidInput({ fileName: "malware.exe" }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/\.exe/i);
  });

  it("rejects .svg files (XSS risk)", () => {
    const result = validateFile(
      makeValidInput({ fileName: "image.svg" }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects .zip files", () => {
    const result = validateFile(
      makeValidInput({ fileName: "archive.zip" }),
    );
    expect(result.ok).toBe(false);
  });

  it("uses the sniffed type when client MIME disagrees (image/png with .pdf extension accepted)", () => {
    // The function detects image/png from magic bytes. PNG IS an allowed
    // document type. The .pdf extension is also allowed. So the file
    // is accepted, and the detectedMimeType reflects the actual content.
    const result = validateFile(
      makeValidInput({
        fileName: "doc.pdf",
        clientMimeType: "application/pdf",
        firstBytes: makePngBytes(),
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.detectedMimeType).toBe("image/png");
  });

  it("rejects unknown file type", () => {
    const result = validateFile(
      makeValidInput({
        fileName: "doc.pdf",
        clientMimeType: "application/pdf",
        firstBytes: bytes(0, 1, 2, 3, 4, 5, 6, 7, 8, 9),
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/could not verify/i);
  });

  it("rejects .doc files (not in allowed list)", () => {
    const result = validateFile(
      makeValidInput({ fileName: "doc.doc" }),
    );
    expect(result.ok).toBe(false);
  });
});

describe("validateFile (avatars)", () => {
  function makeAvatarInput(overrides: Partial<{
    fileName: string;
    clientMimeType: string;
    size: number;
    firstBytes: Uint8Array;
  }> = {}) {
    return {
      fileName: "avatar.jpg",
      clientMimeType: "image/jpeg",
      size: 1024 * 100,
      firstBytes: makeJpegBytes(),
      context: "avatar" as const,
      ...overrides,
    };
  }

  it("accepts valid JPEG avatar", () => {
    const result = validateFile(makeAvatarInput());
    expect(result.ok).toBe(true);
  });

  it("accepts valid PNG avatar", () => {
    const result = validateFile(
      makeAvatarInput({
        fileName: "avatar.png",
        clientMimeType: "image/png",
        firstBytes: makePngBytes(),
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects PDF as avatar (image-only)", () => {
    const result = validateFile(
      makeAvatarInput({
        fileName: "avatar.pdf",
        clientMimeType: "application/pdf",
        firstBytes: makePdfBytes(),
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("rejects avatar larger than 5MB", () => {
    const result = validateFile(
      makeAvatarInput({ size: 6 * 1024 * 1024 }),
    );
    expect(result.ok).toBe(false);
  });
});
