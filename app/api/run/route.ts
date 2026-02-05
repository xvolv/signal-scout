import { clearSeen, filterNewByUrl } from "@/lib/dedupe";
import { scrapeSources, type ScrapeSource } from "@/lib/scrapePlaywright";
import { sendTelegramMessage } from "@/lib/telegram";

export const dynamic = "force-dynamic";

const sources: ScrapeSource[] = [
  {
    name: "Remotive",
    url: "https://remotive.com/remote-jobs",
    itemSelector: ".job-tile",
    titleSelector: "h2, h3, .job-title, .job-tile-title, a .job-title",
    linkSelector: "a",
    companySelector:
      ".company, .company-name, .job-company, .job-tile-company, .job-tile .company-name",
    locationSelector:
      ".location, .job-location, .job-tile-location, .job-tile .location",
    limit: 8,
  },
  {
    name: "Remote OK",
    url: "https://remoteok.com/remote-dev-jobs",
    itemSelector: "tr.job",
    titleSelector: "h2, .position, .job-title, td.company_and_position h2",
    linkSelector: "a.preventLink",
    companySelector: "h3",
    locationSelector: ".location",
    limit: 8,
  },
  {
    name: "We Work Remotely",
    url: "https://weworkremotely.com/remote-jobs",
    itemSelector: "section.jobs li:not(.view-all):not(.category)",
    titleSelector: "a span.title",
    linkSelector: "a[href^='/remote-jobs/']",
    companySelector: "span.company, .company",
    locationSelector: "span.region, .region, .location",
    limit: 8,
    titleRemovePatterns: [
      "\\bFeatured\\b",
      "\\bTop\\s*100\\b",
      "\\bFull[- ]Time\\b",
      "\\bPart[- ]Time\\b",
      "\\bContract\\b",
      "\\bTemporary\\b",
      "\\b\\d+d\\b",
      "\\bNew\\b",
      "\\bRemote\\b",
      "Anywhere in the World",
    ],
  },
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const include = searchParams.get("include")?.toLowerCase() || "";
  const exclude = searchParams.get("exclude")?.toLowerCase() || "";
  const max = Number(searchParams.get("max") || 10);
  const debug = searchParams.get("debug") === "1";
  const skipDedupe = searchParams.get("dedupe") === "0";
  const reset = searchParams.get("reset") === "1";
  const testMode = searchParams.get("test") === "1";

  if (reset) {
    await clearSeen();
  }

  const items = await scrapeSources(sources);

  const countsBySource = items.reduce<Record<string, number>>((acc, item) => {
    const key = item.source || "Unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  if (debug) {
    console.log("Scraped items:", items.slice(0, 20));
  }

  const filtered = items.filter((item) => {
    const haystack =
      `${item.title} ${item.company ?? ""} ${item.location ?? ""}`
        .toLowerCase()
        .trim();
    if (item.title.toLowerCase() === "view company profile") return false;
    if (include && !haystack.includes(include)) return false;
    if (exclude && haystack.includes(exclude)) return false;
    return Boolean(item.title || item.link);
  });

  const deduped =
    skipDedupe || testMode ? filtered : await filterNewByUrl(filtered, 50);
  const top = deduped.slice(0, Math.max(1, max));

  if (top.length === 0) {
    if (debug) {
      return new Response(
        JSON.stringify(
          {
            message: "No new items found.",
            countsBySource,
            totalScraped: items.length,
            totalFiltered: filtered.length,
            totalAfterDedupe: deduped.length,
            sampleLinks: items.slice(0, 5).map((item) => item.link),
          },
          null,
          2,
        ),
        { headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response("No new items found.");
  }

  if (testMode) {
    return new Response(
      JSON.stringify(
        {
          message: "Test mode: returning items without sending Telegram.",
          countsBySource,
          totalScraped: items.length,
          totalFiltered: filtered.length,
          totalAfterDedupe: deduped.length,
          sample: top.slice(0, 10),
        },
        null,
        2,
      ),
      { headers: { "Content-Type": "application/json" } },
    );
  }

  const message = top
    .map((item) => {
      const title = item.title || "Untitled";
      const company = item.company ? ` at ${item.company}` : "";
      const location = item.location ? ` (${item.location})` : "";
      const link = item.link || "No link";
      return `💼 ${title}${company}${location}\n🔗 ${link}`;
    })
    .join("\n\n");

  await sendTelegramMessage(message);
  return new Response("Message sent to Telegram!");
}
