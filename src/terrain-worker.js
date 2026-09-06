import { generatePatch } from "./terrain-patch.js";
self.onmessage = ({ data }) => {
  try {
    const mesh = generatePatch(data.patch, data.seed, data.segments);
    self.postMessage(
      { id: data.id, version: data.version, mesh },
      Object.values(mesh)
        .filter((v) => ArrayBuffer.isView(v))
        .map((v) => v.buffer),
    );
  } catch (error) {
    self.postMessage({
      id: data.id,
      version: data.version,
      error: error.message,
    });
  }
};
