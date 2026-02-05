import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = path.join(process.cwd(), "data");
const SEEN_PATH = path.join(DATA_DIR, "seen.json");

type SeenState = {
  urls: string[];
};

async function readSeen(): Promise<SeenState> {
  try {
    const content = await fs.readFile(SEEN_PATH, "utf-8");
    const parsed = JSON.parse(content) as SeenState;
    return { urls: Array.isArray(parsed.urls) ? parsed.urls : [] };
  } catch {
    return { urls: [] };
  }
}

async function writeSeen(state: SeenState) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(SEEN_PATH, JSON.stringify(state, null, 2));
}

export async function clearSeen() {
  await writeSeen({ urls: [] });
}

export async function filterNewByUrl<T extends { link: string }>(
  items: T[],
  limit = 50,
) {
  const seen = await readSeen();
  const seenSet = new Set(seen.urls);

  const fresh = items.filter((item) => item.link && !seenSet.has(item.link));
  const updatedUrls = [...fresh.map((item) => item.link), ...seen.urls].slice(
    0,
    limit,
  );

  await writeSeen({ urls: updatedUrls });

  return fresh;
}
