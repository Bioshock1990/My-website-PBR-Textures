import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve("textures");
const INDEX_PATH = path.join(ROOT, "index.json");
const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"]);

const TYPE_ALIASES = {
  basecolor: ["basecolor", "albedo", "diffuse", "color", "col"],
  normal: ["normal", "nrm", "nor"],
  roughness: ["roughness", "rough"],
  metalness: ["metalness", "metallic", "metal"],
  ao: ["ao", "ambientocclusion", "occlusion"],
  displacement: ["displacement", "height", "disp"],
};

function mapType(name) {
  const base = name.replace(/\.[^.]+$/, "").toLowerCase();
  const chunks = base.split(/[_\-\s.]+/g);
  for (const [type, aliases] of Object.entries(TYPE_ALIASES)) {
    if (aliases.some(a => chunks.includes(a))) return type;
  }
  return chunks[chunks.length - 1] || "map";
}

function pickPreview(files) {
  const score = n => {
    const s = n.toLowerCase();
    let p = 0;
    if (s.includes("basecolor") || s.includes("albedo") || s.includes("diffuse")) p += 20;
    if (s.includes("preview") || s.includes("thumb")) p += 10;
    if (s.includes("normal")) p -= 4;
    return p;
  };
  return [...files].sort((a, b) => score(b) - score(a) || a.localeCompare(b))[0] || null;
}

async function listDirs(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  return entries.filter(e => e.isDirectory()).map(e => e.name);
}

function toPosix(p) {
  return p.split(path.sep).join("/");
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function makeThumb(sourcePath, outPath) {
  await sharp(sourcePath)
    .resize(320, 320, { fit: "cover", withoutEnlargement: true })
    .webp({ quality: 78 })
    .toFile(outPath);
}

async function build() {
  const items = [];
  const categories = await listDirs(ROOT);

  for (const category of categories) {
    const categoryPath = path.join(ROOT, category);
    const textureDirs = await listDirs(categoryPath);

    for (const textureName of textureDirs) {
      const texturePath = path.join(categoryPath, textureName);
      const entries = await fs.readdir(texturePath, { withFileTypes: true });
      const imageFiles = entries
        .filter(e => e.isFile())
        .map(e => e.name)
        .filter(name => IMAGE_EXT.has(path.extname(name).toLowerCase()));

      if (!imageFiles.length) continue;

      const previewFile = pickPreview(imageFiles);
      const thumbName = "thumb.webp";
      const thumbPath = path.join(texturePath, thumbName);

      if (previewFile && !(await fileExists(thumbPath))) {
        await makeThumb(path.join(texturePath, previewFile), thumbPath);
      }

      const files = imageFiles
        .filter(name => name !== thumbName)
        .map(name => ({
          name,
          type: mapType(name),
          src: toPosix(path.relative(path.resolve("."), path.join(texturePath, name))),
          relInTexture: name,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      if (!files.length) continue;

      items.push({
        name: textureName,
        category,
        preview: (await fileExists(thumbPath))
          ? toPosix(path.relative(path.resolve("."), thumbPath))
          : files[0].src,
        files,
      });
    }
  }

  items.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  const output = {
    generatedAt: new Date().toISOString(),
    items,
  };

  await fs.writeFile(INDEX_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Generated ${items.length} textures -> ${toPosix(path.relative(path.resolve("."), INDEX_PATH))}`);
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
