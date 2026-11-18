import type { Metadata } from "next";
import { NOT_INDEXED } from "@/lib/metadata";
import { RegisterPage } from "@/features/register/register-page";

export const metadata: Metadata = {
  title: "Auto-register",
  robots: NOT_INDEXED,
};

export default RegisterPage;
