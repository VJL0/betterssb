import type { Metadata } from "next";
import { SearchPage } from "@/features/search/search-page";

export const metadata: Metadata = {
  title: "Course search",
  description:
    "Every section of the term from Banner's class search, with Rate My Professors ratings, live seats and filters.",
  alternates: { canonical: "/search" },
};

export default SearchPage;
