import type { Metadata } from "next";
import { SettingsPage } from "@/features/settings/settings-page";

export const metadata: Metadata = {
  title: "Settings",
  // Shows the student's own saved data, so there's nothing here to index.
  robots: { index: false },
};

export default SettingsPage;
