import type { Metadata } from "next";
import { NOT_INDEXED } from "@/lib/metadata";
import { SettingsPage } from "@/features/settings/settings-page";

export const metadata: Metadata = {
  title: "Settings",
  robots: NOT_INDEXED,
};

export default SettingsPage;
