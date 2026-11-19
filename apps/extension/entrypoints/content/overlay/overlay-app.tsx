import { useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { queryOptions, useQuery } from "@tanstack/react-query";
import type { RmpRating } from "@workspace/api-client";
import {
  instructorSearchName,
  isRmpRating,
} from "@workspace/shared/lib/instructors";
import { settingsOrDefaults } from "@workspace/shared/lib/store";
import { RmpBadge } from "@workspace/ui/components/rmp-badge";
import { useStoreDocument } from "@/hooks/use-store-document";
import { askBackground } from "@/lib/ask-background";
import type { RatingSlot, RatingSlotWatcher } from "./rating-slots";

// The background answers null when Rate My Professors has no match.
function isRatingReply(data: unknown): data is RmpRating | null {
  return data === null || isRmpRating(data);
}

function ratingOptions(name: string) {
  return queryOptions({
    queryKey: ["rmpRating", name],
    queryFn: () =>
      askBackground(
        {
          type: "FETCH_RATING",
          payload: { name: instructorSearchName(name) },
        },
        isRatingReply,
      ),
    // A rating doesn't change while the page is open.
    staleTime: "static",
  });
}

function Rating({
  slot,
  popupContainer,
}: {
  slot: RatingSlot;
  popupContainer: HTMLElement;
}) {
  const rating = useQuery(ratingOptions(slot.name));
  // Nothing while loading or when the lookup fails: Banner's name stands alone.
  if (!rating.isSuccess) return null;
  return createPortal(
    <RmpBadge
      rating={rating.data}
      instructorName={slot.name}
      popupContainer={popupContainer}
      compact
      className="mr-1"
    />,
    slot.container,
  );
}

/**
 * The Banner overlay: a Rate My Professors rating before each instructor.
 * The Banner-pages setting turns it off.
 */
export function OverlayApp({
  watcher,
  popupContainer,
}: {
  watcher: RatingSlotWatcher;
  popupContainer: HTMLElement;
}) {
  const settings = useStoreDocument("settings");
  const enabled =
    settings.loaded && settingsOrDefaults(settings.value).bannerOverlay;

  useEffect(() => {
    if (!enabled) return;
    watcher.start();
    return () => watcher.stop();
  }, [enabled, watcher]);

  const slots = useSyncExternalStore(watcher.subscribe, watcher.getSnapshot);

  return enabled
    ? slots.map((slot, index) => (
        <Rating
          key={`${index}:${slot.name}`}
          slot={slot}
          popupContainer={popupContainer}
        />
      ))
    : null;
}
