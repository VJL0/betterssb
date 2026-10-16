import type { RMPRating, RMPSchool } from "@/types";
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

function ratingColorClasses(rating: number): string {
  if (rating >= 4) return "bg-green-600 hover:bg-green-700";
  if (rating >= 3) return "bg-amber-500 hover:bg-amber-600";
  return "bg-red-600 hover:bg-red-700";
}

function createBadge(rating: RMPRating): HTMLSpanElement {
  const badge = document.createElement("span");
  badge.className = `group relative ml-1.5 inline-flex cursor-pointer items-center justify-center rounded-full px-2 py-0.5 align-middle text-xs font-semibold text-white shadow-sm transition hover:scale-105 hover:shadow-md ${ratingColorClasses(rating.overallRating)}`;
  badge.textContent = rating.overallRating.toFixed(1);

  const tooltip = document.createElement("div");
  tooltip.className =
    "pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-max max-w-xs -translate-x-1/2 rounded-lg border border-gray-200 bg-white p-3 text-left text-sm text-gray-800 opacity-0 shadow-lg transition-opacity group-hover:pointer-events-auto group-hover:opacity-100";

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
        `<div class="flex justify-between gap-4 py-0.5"><span class="text-gray-500">${label}</span><span class="font-semibold">${value}</span></div>`,
    )
    .join("");

  if (rating.topTags.length > 0) {
    tooltipHTML += `<div class="mt-1.5 flex flex-wrap gap-1">${rating.topTags.map((t) => `<span class="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-800">${t}</span>`).join("")}</div>`;
  }

  tooltipHTML += `<a class="mt-2 block text-xs text-indigo-600 no-underline hover:underline" href="${rating.rmpUrl}" target="_blank" rel="noopener">View on RateMyProfessors</a>`;

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
    const header =
      td.getAttribute("data-header") ?? td.getAttribute("aria-label") ?? "";
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
    const school = await getStorageItem<RMPSchool>("betterssb:school");
    const schoolName = school?.name ?? "";
    if (!schoolName) return;

    const elements = findInstructorElements();
    for (const el of elements) {
      processElement(el, schoolName);
    }
  })();
}
