import type { Metadata } from "next";
import { RegisterPage } from "@/features/register/register-page";

export const metadata: Metadata = {
  title: "Auto-register",
  // Shows the student's own saved data, so there's nothing here to index.
  robots: { index: false },
};

export default RegisterPage;
