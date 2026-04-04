import { sendMessage, type ExtensionResponse } from "@/lib/messaging";

export function getTerms(): Promise<ExtensionResponse> {
  return sendMessage({ type: "SSB_REG_GET_TERMS", payload: {} });
}

export function getPlans(): Promise<ExtensionResponse> {
  return sendMessage({ type: "SSB_REG_GET_PLANS", payload: {} });
}
