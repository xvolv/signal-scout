import { chromium } from "playwright";

export type ScrapeOptions = {
  url?: string;
  itemSelector?: string;
  titleSelector?: string;
  linkSelector?: string;
  companySelector?: string;
  locationSelector?: string;
  limit?: number;
  timeoutMs?: number;
  stripAfter?: string[];
  titleRemovePatterns?: string[];
};

export type ScrapeSource = ScrapeOptions & {
  name: string;
};

export type Opportunity = {
  title: string;
  link: string;
  company?: string;
  location?: string;
  source?: string;
};

export async function scrapeOpportunities(options: ScrapeOptions = {}) {
  const {
    url = "https://remotive.com/remote-jobs",
    itemSelector = ".job-tile",
    titleSelector = "h2, h3, a",
    linkSelector = "a",
    companySelector = "",
    locationSelector = "",
    limit = 5,
    timeoutMs = 30_000,
    stripAfter = ["•", "|"],
    titleRemovePatterns = [],
  } = options;

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
  await page.waitForSelector(itemSelector, { timeout: timeoutMs });

  const items = await page.$$eval(
    itemSelector,
    (jobs, opts) => {
      const {
        titleSelector,
        linkSelector,
        companySelector,
        locationSelector,
        limit,
        stripAfter,
        titleRemovePatterns,
      } = opts;

      const normalizeText = (value: string) =>
        value.replace(/\s+/g, " ").trim();

      const stripSuffixes = (value: string, markers: string[]) => {
        let result = value;
        for (const marker of markers) {
          if (result.includes(marker)) {
            result = result.split(marker)[0].trim();
          }
        }
        return result;
      };

      const cleanTitle = (value: string) => {
        let title = normalizeText(value);
        title = stripSuffixes(title, stripAfter);
        if (Array.isArray(titleRemovePatterns) && titleRemovePatterns.length) {
          for (const pattern of titleRemovePatterns) {
            try {
              const regex = new RegExp(pattern, "gi");
              title = title.replace(regex, " ");
            } catch {
              // ignore invalid regex patterns
            }
          }
        }
        title = normalizeText(title);
        title = title.replace(/\b(\w+)(\s+\1\b)+/gi, "$1");
        return title;
      };

      const getFirstText = (root: Element, selectors: string[]) => {
        for (const selector of selectors) {
          const el = root.querySelector(selector);
          const text = el?.textContent?.trim() || "";
          if (text) return text;
        }
        return "";
      };

      const getFirstTextFromCandidates = (
        root: Element | null,
        selectors: string[],
      ) => {
        if (!root) return "";
        return getFirstText(root, selectors);
      };

      return jobs.slice(0, limit).map((job) => {
        const titleSelectors = titleSelector
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const titleFromSelector = titleSelectors.length
          ? getFirstText(job, titleSelectors)
          : "";

        const titleEl = titleSelectors.length
          ? job.querySelector(titleSelectors[0])
          : null;
        const linkEl = job.querySelector(linkSelector);
        const linkChildTitle = linkEl
          ? getFirstText(linkEl, ["span.title", "h1", "h2", "h3", "strong"])
          : "";

        const fallbackTitle =
          linkChildTitle ||
          linkEl?.getAttribute("aria-label") ||
          linkEl?.getAttribute("title") ||
          linkEl?.textContent?.trim() ||
          titleEl?.getAttribute("aria-label") ||
          titleEl?.getAttribute("title") ||
          "";

        const rawTitle = titleFromSelector || fallbackTitle;
        const cleanedTitle = cleanTitle(rawTitle);

        const hrefCandidate =
          (linkEl instanceof HTMLAnchorElement && linkEl.href) ||
          (titleEl instanceof HTMLAnchorElement && titleEl.href) ||
          linkEl?.getAttribute("href") ||
          titleEl?.getAttribute("href") ||
          "";

        const normalizedHref = hrefCandidate
          ? new URL(hrefCandidate, window.location.href).href
          : "";

        const companyEl = companySelector
          ? job.querySelector(companySelector) ||
            linkEl?.querySelector(companySelector)
          : null;
        const locationEl = locationSelector
          ? job.querySelector(locationSelector) ||
            linkEl?.querySelector(locationSelector)
          : null;

        const companyFallback = getFirstTextFromCandidates(job, [
          "span.company",
          ".company",
          ".company-name",
          "[class*='company']",
        ]);
        const locationFallback = getFirstTextFromCandidates(job, [
          "span.region",
          ".region",
          "span.location",
          ".location",
          "[class*='location']",
        ]);

        const companyAttr =
          job.getAttribute("data-company") ||
          job.getAttribute("data-company-name") ||
          "";
        const locationAttr =
          job.getAttribute("data-location") ||
          job.getAttribute("data-job-location") ||
          "";

        const company = companyEl?.textContent
          ? normalizeText(companyEl.textContent)
          : companyFallback
            ? normalizeText(companyFallback)
            : companyAttr
              ? normalizeText(companyAttr)
              : "";
        const location = locationEl?.textContent
          ? normalizeText(locationEl.textContent)
          : locationFallback
            ? normalizeText(locationFallback)
            : locationAttr
              ? normalizeText(locationAttr)
              : "";

        return {
          title: cleanedTitle,
          link: normalizedHref,
          company,
          location,
        };
      });
    },
    {
      titleSelector,
      linkSelector,
      companySelector,
      locationSelector,
      limit,
      stripAfter,
      titleRemovePatterns,
    },
  );

  await browser.close();

  if (items.length === 0) {
    throw new Error(
      `No items found. Check itemSelector ("${itemSelector}") and the page structure.`,
    );
  }

  return items.filter((item) => item.title || item.link);
}

export async function scrapeSources(sources: ScrapeSource[]) {
  const results: Opportunity[] = [];
  for (const source of sources) {
    const items = await scrapeOpportunities(source);
    results.push(
      ...items.map((item) => ({
        ...item,
        source: source.name,
      })),
    );
  }
  return results;
}
