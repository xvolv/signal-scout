import * as cheerio from "cheerio";

export async function scrapeOpportunities() {
  const url = "http://127.0.0.1:5500/xxxx/index.html";
  const res = await fetch(url);
  const html = await res.text();
  const $ = cheerio.load(html);

  const items: { title: string; link: string }[] = [];

  $("a").each((_, el) => {
    const title = $(el).text().trim();
    let link = $(el).attr("href");
    if (title && link) {
      // Convert relative URL to absolute
      if (!link.startsWith("http")) {
        link = new URL(link, url).href;
      }
      items.push({ title, link });
    }
  });

  return items;
}
