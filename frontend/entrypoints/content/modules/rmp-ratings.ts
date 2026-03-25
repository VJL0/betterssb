import type { RMPRating } from "@/types";
import { sendMessage } from "@/lib/messaging";
import { getCachedRatings, cacheRating } from "@/lib/storage";
import { getStorageItem } from "@/lib/storage";

const PROCESSED_ATTR = "data-betterssb-rated";

const INSTRUCTOR_SELECTORS = [
  '[data-property="instructor"]',
  ".section-detail-instructor",
  ".instructor",
  'td[data-header="Instructor"]',
  ".primary-instructor",
  ".faculty-name",
];

function ratingColorClass(rating: number): string {
  if (rating >= 4) return "betterssb-rating-badge--green";
  if (rating >= 3) return "betterssb-rating-badge--yellow";
  return "betterssb-rating-badge--red";
}

function createBadge(rating: RMPRating): HTMLSpanElement {
  const badge = document.createElement("span");
  badge.className = `betterssb-rating-badge ${ratingColorClass(rating.overallRating)}`;
  badge.textContent = rating.overallRating.toFixed(1);

  const tooltip = document.createElement("div");
  tooltip.className = "betterssb-tooltip";

  const rows: [string, string][] = [
    ["Overall", `${rating.overallRating.toFixed(1)} / 5`],
    ["Difficulty", `${rating.difficulty.toFixed(1)} / 5`],
    ["Ratings", `${rating.numRatings}`],
  ];

  if (rating.wouldTakeAgainPct != null) {
    rows.push(["Would Take Again", `${Math.round(rating.wouldTakeAgainPct)}%`]);
  }

  let tooltipHTML = rows
    .map(
      ([label, value]) =>
        `<div class="betterssb-tooltip-row"><span class="betterssb-tooltip-label">${label}</span><span class="betterssb-tooltip-value">${value}</span></div>`
    )
    .join("");

  if (rating.topTags.length > 0) {
    tooltipHTML += `<div class="betterssb-tooltip-tags">${rating.topTags.map((t) => `<span class="betterssb-tooltip-tag">${t}</span>`).join("")}</div>`;
  }

  tooltipHTML += `<a class="betterssb-tooltip-link" href="${rating.rmpUrl}" target="_blank" rel="noopener">View on RateMyProfessors</a>`;

  tooltip.innerHTML = tooltipHTML;
  badge.appendChild(tooltip);

  return badge;
}

function extractProfessorName(el: Element): string | null {
  const text = (el.textContent ?? "").trim();
  if (!text || text.length < 3) return null;

  const cleaned = text.replace(/\(.*?\)/g, "").trim();
  if (/^[A-Za-z,.'\-\s]+$/.test(cleaned) && cleaned.includes(" ")) {
    return cleaned;
  }
  return null;
}

function findInstructorElements(): Element[] {
  for (const selector of INSTRUCTOR_SELECTORS) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) return Array.from(elements);
  }

  const allTds = document.querySelectorAll("td");
  const instructorTds: Element[] = [];
  for (const td of allTds) {
    const header = td.getAttribute("data-header") ?? td.getAttribute("aria-label") ?? "";
    if (/instructor|professor|faculty/i.test(header)) {
      instructorTds.push(td);
    }
  }

  return instructorTds;
}

async function processElement(el: Element, schoolName: string): Promise<void> {
  if (el.hasAttribute(PROCESSED_ATTR)) return;
  el.setAttribute(PROCESSED_ATTR, "true");

  const name = extractProfessorName(el);
  if (!name) return;

  const cached = await getCachedRatings();
  const key = name.toLowerCase();

  if (cached[key]) {
    el.appendChild(createBadge(cached[key]));
    return;
  }

  try {
    const response = await sendMessage({
      type: "FETCH_RATING",
      payload: { name, school: schoolName },
    });

    if (response.success && response.data) {
      const rating = response.data as RMPRating;
      await cacheRating(name, rating);
      el.appendChild(createBadge(rating));
    }
  } catch {
    // silently skip — badge just won't appear
  }
}

export function initRMPRatings(_observer?: MutationObserver): void {
  (async () => {
    const schoolName =
      (await getStorageItem<string>("betterssb:schoolName")) ?? "";
    if (!schoolName) return;

    const elements = findInstructorElements();
    for (const el of elements) {
      processElement(el, schoolName);
    }
  })();
}
