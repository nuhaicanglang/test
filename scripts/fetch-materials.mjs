import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import sharp from "sharp";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// Explicit, finite CC0 asset download; metadata and checksums make it reproducible.
const root = path.resolve(import.meta.dirname, "..");
const cache = path.join(root, "work", "material-originals");
const dest = path.join(root, "public", "materials");
const specs = [
  ["snow", "snow_02", 4096, { color: "Diffuse", normal: "nor_gl", arm: "arm" }],
  ["rock", "rock_04", 4096, { color: "Diffuse", normal: "nor_gl", arm: "arm" }],
  [
    "bark",
    "bark_brown_01",
    2048,
    { color: "Diffuse", normal: "nor_gl", arm: "arm" },
  ],
  [
    "wood",
    "wood_planks_grey",
    2048,
    { color: "Diffuse", normal: "nor_gl", arm: "arm" },
  ],
  ["fabric", "denim_fabric_05", 2048, { normal: "nor_gl", arm: "arm" }],
  [
    "pine",
    "pine_tree_01",
    2048,
    {
      color: "twig_diff",
      normal: "twig_nor_gl",
      arm: "twig_arm",
      alpha: "twig_alpha",
    },
  ],
];
const sha = (b) => createHash("sha256").update(b).digest("hex");
async function get(url) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      if (process.platform === "win32") {
        const target = path.join(cache, `request-${sha(url)}.bin`);
        await promisify(execFile)(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-File",
            path.join(root, "scripts/download-file.ps1"),
            "-Uri",
            url,
            "-Destination",
            target,
          ],
          { windowsHide: true, timeout: 130000 },
        );
        return await readFile(target);
      }
      const res = await fetch(url, { signal: AbortSignal.timeout(120000) });
      if (!res.ok) throw new Error(`${res.status}: ${url}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (e) {
      if (attempt === 3) throw e;
    }
  }
}
await mkdir(cache, { recursive: true });
await mkdir(dest, { recursive: true });
const manifest = {
  schemaVersion: 1,
  fetchedAt: new Date().toISOString(),
  license: "CC0-1.0",
  licenseUrl: "https://polyhaven.com/license",
  assets: [],
};
for (const [name, id, max, channels] of specs) {
  const files = JSON.parse(await get(`https://api.polyhaven.com/files/${id}`));
  const info = JSON.parse(await get(`https://api.polyhaven.com/info/${id}`));
  const asset = {
    name,
    id,
    title: info.name,
    authors: info.authors,
    source: `https://polyhaven.com/a/${id}`,
    published: info.date_published,
    channels: {},
  };
  for (const [channel, key] of Object.entries(channels)) {
    const size = `${max / 1024}k`;
    const available = files[key]?.[size];
    if (!available) throw new Error(`Missing ${id}/${key}/${size}`);
    const source =
      available[channel === "color" ? "jpg" : "png"] ||
      available.jpg ||
      available.png;
    const filename = path.basename(new URL(source.url).pathname);
    let bytes;
    try {
      bytes = await readFile(path.join(cache, filename));
    } catch {
      bytes = await get(source.url);
      await writeFile(path.join(cache, filename), bytes);
    }
    if (
      source.md5 &&
      createHash("md5").update(bytes).digest("hex") !== source.md5
    )
      throw new Error(`Checksum failed: ${filename}`);
    const record = {
      original: source.url,
      sourceMD5: source.md5,
      sourceSHA256: sha(bytes),
      colorSpace: channel === "color" ? "srgb" : "linear",
      processing:
        channel === "color"
          ? "Lanczos resize; WebP quality 90"
          : "Lanczos resize; lossless WebP; no transfer-function conversion",
      variants: {},
    };
    for (const px of [1024, 2048, 4096].filter((n) => n <= max)) {
      const output = `${name}-${channel}-${px / 1024}k.webp`;
      const result = await sharp(bytes)
        .resize(px, px, { fit: "fill" })
        .webp(
          channel === "color" ? { quality: 90 } : { lossless: true, effort: 4 },
        )
        .toBuffer();
      await writeFile(path.join(dest, output), result);
      record.variants[`${px / 1024}k`] = {
        file: `/materials/${output}`,
        bytes: result.length,
        sha256: sha(result),
      };
    }
    asset.channels[channel] = record;
    console.log(`${name}/${channel} ready`);
  }
  manifest.assets.push(asset);
}
const hdriId = "passendorf_snow";
const hdriFiles = JSON.parse(
  await get(`https://api.polyhaven.com/files/${hdriId}`),
);
const hdriInfo = JSON.parse(
  await get(`https://api.polyhaven.com/info/${hdriId}`),
);
const source = hdriFiles.hdri["2k"].hdr;
const hdr = await get(source.url);
await writeFile(path.join(dest, "winter-environment-2k.hdr"), hdr);
manifest.assets.push({
  name: "environment",
  id: hdriId,
  authors: hdriInfo.authors,
  source: `https://polyhaven.com/a/${hdriId}`,
  license: "CC0-1.0",
  file: "/materials/winter-environment-2k.hdr",
  original: source.url,
  sha256: sha(hdr),
  bytes: hdr.length,
  processing: "Original 2K Radiance HDR; runtime PMREM convolution",
});
await writeFile(
  path.join(dest, "manifest.json"),
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(`Completed ${manifest.assets.length} CC0 assets.`);
