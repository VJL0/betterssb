import {
  BRIDGE_SOURCE,
  parseBridgeRequest,
} from "@workspace/shared/lib/bridge";
import { armProblem } from "@workspace/shared/lib/auto-reg-queue";
import type {
  AutoRegSnapshot,
  RegistrationTimeLookup,
} from "@workspace/shared/types/auto-reg";
import type { DarsAuditLookup } from "@workspace/shared/lib/dars";
import type { TranscriptLookup } from "@workspace/shared/lib/transcript";
import type { SSBRegPlanHeader, SSBTerm } from "@workspace/shared/types/ssb";
import type { BannerConnection, StoreKey } from "@workspace/shared/types/store";

export const EMPTY_AUTO_REGISTER: AutoRegSnapshot = {
  term: "",
  crns: [],
  scheduledRunAt: "",
  armed: false,
  lastResult: null,
};

/**
 * Stands in for the extension's web-bridge content script: answers bridge
 * requests from an in-memory store and auto-register state, using the same
 * allowlist and the same arming rules as the extension.
 *
 * Replies are dispatched with `source: window`, as a browser's postMessage
 * does; jsdom's postMessage leaves `source` null.
 */
export function installFakeBridge({
  banner = "connected" as BannerConnection,
  documents = {} as Partial<Record<StoreKey, unknown>>,
  autoRegister = EMPTY_AUTO_REGISTER,
  registrationTerms = [] as SSBTerm[],
  bannerPlans = [] as SSBRegPlanHeader[],
  /** What TUportal's countdown answers for any term. */
  registrationTime = { status: "not-listed" } as RegistrationTimeLookup,
  /** What Banner Self-Service's transcript answers. */
  transcript = { status: "signed-out" } as TranscriptLookup,
  /** What DARS answers; without one, DARS fails. */
  darsAudit = null as DarsAuditLookup | null,
} = {}) {
  const data = new Map(Object.entries(documents)) as Map<StoreKey, unknown>;
  const auto = { current: { ...autoRegister } };
  let bannerConnection = banner;
  const origin = window.location.origin;
  document.documentElement.dataset.betterssbExtension = "9.9.9";

  function post(data: Record<string, unknown>) {
    window.dispatchEvent(
      new MessageEvent("message", { data, origin, source: window }),
    );
  }

  function reply(id: string, body: Record<string, unknown>) {
    post({ source: BRIDGE_SOURCE, dir: "response", id, ...body });
  }

  function emitAutoRegisterChange() {
    post({ source: BRIDGE_SOURCE, dir: "event", type: "AUTOREG_CHANGED" });
  }

  function emitChange(key: StoreKey) {
    post({ source: BRIDGE_SOURCE, dir: "event", type: "STORE_CHANGED", key });
  }

  function onMessage(event: MessageEvent) {
    const d = event.data as { dir?: string; id?: unknown } | null;
    if (d?.dir !== "request" || typeof d.id !== "string") return;
    const parsed = parseBridgeRequest(event.data);
    if (!parsed)
      return reply(d.id, {
        success: false,
        error: "That request isn't allowed.",
      });
    const { id, request } = parsed;
    switch (request.type) {
      case "BANNER_STATUS":
        return reply(id, { success: true, data: bannerConnection });
      case "STORE_KEYS":
        return reply(id, { success: true, data: [...data.keys()] });
      case "STORE_GET":
        return reply(id, {
          success: true,
          data: data.get(request.key) ?? null,
        });
      case "STORE_SET":
        data.set(request.key, request.value);
        reply(id, { success: true });
        return emitChange(request.key);
      case "STORE_DELETE":
        data.delete(request.key);
        reply(id, { success: true });
        return emitChange(request.key);
      case "DARS_RUN_AUDIT":
        return darsAudit
          ? reply(id, { success: true, data: darsAudit })
          : reply(id, { success: false, error: "No DARS in tests." });
      case "AUTOREG_GET":
        return reply(id, { success: true, data: auto.current });
      case "AUTOREG_SAVE_QUEUE":
        if (auto.current.armed) {
          return reply(id, {
            success: false,
            error: "Turn off auto-register to change your classes.",
          });
        }
        auto.current = { ...auto.current, ...request.queue };
        reply(id, { success: true });
        return emitAutoRegisterChange();
      case "AUTOREG_ARM": {
        const problem = armProblem(auto.current, Date.now());
        if (problem) return reply(id, { success: false, error: problem });
        auto.current = { ...auto.current, armed: true };
        reply(id, { success: true });
        return emitAutoRegisterChange();
      }
      case "AUTOREG_DISARM":
        auto.current = { ...auto.current, armed: false };
        reply(id, { success: true });
        return emitAutoRegisterChange();
      case "AUTOREG_REGISTRATION_TIME":
        return reply(id, { success: true, data: registrationTime });
      case "BANNER_REG_TERMS":
        return reply(id, { success: true, data: registrationTerms });
      case "BANNER_REG_PLANS":
        return reply(id, {
          success: true,
          data: { plans: bannerPlans, selectPlanConfig: [] },
        });
      case "BANNER_TRANSCRIPT":
        return reply(id, { success: true, data: transcript });
    }
  }

  window.addEventListener("message", onMessage);
  return {
    data,
    auto,
    emitChange,
    /** The student signs in to or out of Banner, as the extension sees it. */
    setBanner(connection: BannerConnection) {
      bannerConnection = connection;
      post({ source: BRIDGE_SOURCE, dir: "event", type: "BANNER_CHANGED" });
    },
    uninstall() {
      window.removeEventListener("message", onMessage);
      delete document.documentElement.dataset.betterssbExtension;
    },
  };
}
