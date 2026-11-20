import { HttpError } from "@/lib/http";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_DIGITAL_ASSET_BYTES = 50 * 1024 * 1024;

const imageTypes = {
  "image/jpeg": {
    extension: "jpg",
    matches: (bytes: Buffer) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  },
  "image/png": {
    extension: "png",
    matches: (bytes: Buffer) => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  },
  "image/webp": {
    extension: "webp",
    matches: (bytes: Buffer) => bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP",
  },
} as const;

export function validateImageUpload(contentType: string, bytes: Buffer) {
  if (bytes.length < 1 || bytes.length > MAX_IMAGE_BYTES) {
    throw new HttpError(413, "Product image must be between 1 byte and 5 MB", "INVALID_UPLOAD_SIZE");
  }
  const image = imageTypes[contentType as keyof typeof imageTypes];
  if (!image || !image.matches(bytes)) {
    throw new HttpError(400, "Only valid JPEG, PNG, or WebP images are supported", "INVALID_FILE_TYPE");
  }
  return image.extension;
}

export function validateDigitalAssetUpload(contentType: string, bytes: Buffer) {
  if (bytes.length < 1 || bytes.length > MAX_DIGITAL_ASSET_BYTES) {
    throw new HttpError(413, "Digital asset must be between 1 byte and 50 MB", "INVALID_UPLOAD_SIZE");
  }
  const isPdf = contentType === "application/pdf" && bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  const isZip = contentType === "application/zip" && bytes.length >= 4 &&
    (bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04])) ||
      bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x05, 0x06])) ||
      bytes.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x07, 0x08])));
  if (!isPdf && !isZip) {
    throw new HttpError(400, "Only valid ZIP or PDF digital assets are supported", "INVALID_FILE_TYPE");
  }
  return isPdf ? "pdf" : "zip";
}
