import type { Metadata } from "next";
import { GetStartedPage } from "@/features/onboarding/get-started-page";

export const metadata: Metadata = {
  title: "Get started",
  description:
    "Pick your school and term to start planning. No account needed; everything is saved in your browser.",
  alternates: { canonical: "/start" },
};

export default GetStartedPage;
