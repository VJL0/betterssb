import "./style.css";
import { onContentMessage } from "@/lib/messaging";
import type { ExtensionMessage, ExtensionResponse } from "@/lib/messaging";
import * as ssb from "@/lib/ssb-api";
import type {
  SSBCourseSearchParams,
  SSBSectionSearchParams,
  SSBPlanBatchPayload,
  SSBSubmitRegistrationBatchPayload,
} from "@/types/ssb";

type Page = "planAhead" | "registration" | "results" | "plan" | "unknown";

async function handleSSBMessage(
  msg: ExtensionMessage,
): Promise<ExtensionResponse> {
  switch (msg.type) {
    case "SSB_GET_TERMS": {
      const data = await ssb.getTerms();
      return { success: true, data };
    }
    case "SSB_GET_SUBJECTS": {
      const { term, searchTerm } = msg.payload as {
        term: string;
        searchTerm?: string;
      };
      const data = await ssb.getSubjects(term, searchTerm);
      return { success: true, data };
    }
    case "SSB_SEARCH_COURSES": {
      const params = msg.payload as SSBCourseSearchParams;
      const data = await ssb.searchCourses(params);
      return { success: true, data };
    }
    case "SSB_SEARCH_SECTIONS": {
      const params = msg.payload as SSBSectionSearchParams;
      const data = await ssb.searchSections(params);
      return { success: true, data };
    }
    case "SSB_GET_CLASS_DETAILS": {
      const { term, crn } = msg.payload as { term: string; crn: string };
      const data = await ssb.getClassDetails(term, crn);
      return { success: true, data };
    }
    case "SSB_GET_ENROLLMENT": {
      const { term, crn } = msg.payload as { term: string; crn: string };
      const data = await ssb.getEnrollmentInfo(term, crn);
      return { success: true, data };
    }
    case "SSB_GET_PREREQS": {
      const { term, crn } = msg.payload as { term: string; crn: string };
      const data = await ssb.getSectionPrerequisites(term, crn);
      return { success: true, data };
    }
    case "SSB_RESET_FORM": {
      await ssb.resetDataForm();
      return { success: true };
    }
    case "SSB_PLAN_GET_TERMS": {
      const data = await ssb.getPlanTerms();
      return { success: true, data };
    }
    case "SSB_PLAN_SAVE_TERM": {
      const { term } = msg.payload as { term: string };
      await ssb.savePlanTerm(term);
      return { success: true };
    }
    case "SSB_PLAN_ADD_ITEM": {
      const { term, crn } = msg.payload as { term: string; crn: string };
      const data = await ssb.addPlanItem(term, crn);
      return { success: true, data };
    }
    case "SSB_PLAN_GET_EVENTS": {
      const { termFilter } = (msg.payload as { termFilter?: string }) ?? {};
      const data = await ssb.getPlanEvents(termFilter);
      return { success: true, data };
    }
    case "SSB_PLAN_SUBMIT_BATCH": {
      const payload = msg.payload as SSBPlanBatchPayload;
      const data = await ssb.submitPlanBatch(payload);
      return { success: true, data };
    }
    case "SSB_REG_HISTORY": {
      const { term } = msg.payload as { term: string };
      const data = await ssb.resetRegistrationHistory(term);
      return { success: true, data };
    }
    case "SSB_REG_EVENTS": {
      const { termFilter } = (msg.payload as { termFilter?: string }) ?? {};
      const data = await ssb.getRegistrationEvents(termFilter);
      return { success: true, data };
    }
    case "SSB_REG_MEETING_INFO": {
      const data = await ssb.getMeetingInformationForRegistrations();
      return { success: true, data };
    }
    case "SSB_REG_GET_TERMS": {
      const data = await ssb.getRegistrationTerms();
      return { success: true, data };
    }
    case "SSB_REG_SAVE_TERM": {
      const { term } = msg.payload as { term: string };
      await ssb.saveRegistrationTerm(term);
      return { success: true };
    }
    case "SSB_REG_SEARCH_TERM": {
      const { term, altPin } = msg.payload as { term: string; altPin?: string };
      const data = await ssb.searchRegistrationTerm(term, altPin);
      return { success: true, data };
    }
    case "SSB_REG_RESET": {
      const data = await ssb.resetClassRegistration();
      return { success: true, data };
    }
    case "SSB_REG_GET_SECTION_CRN": {
      const { crn, term } = msg.payload as { crn: string; term: string };
      const data = await ssb.getSectionDetailsFromCRN(crn, term);
      return { success: true, data };
    }
    case "SSB_REG_GET_PLANS": {
      const data = await ssb.getPlans();
      return { success: true, data };
    }
    case "SSB_REG_ADD_CRNS": {
      const { crnList, term } = msg.payload as {
        crnList: string[];
        term: string;
      };
      const data = await ssb.addCRNRegistrationItems(crnList, term);
      return { success: true, data };
    }
    case "SSB_REG_ADD_ITEM": {
      const { term, crn, olr } = msg.payload as {
        term: string;
        crn: string;
        olr?: boolean;
      };
      const data = await ssb.addRegistrationItem(term, crn, olr);
      return { success: true, data };
    }
    case "SSB_REG_SUBMIT_BATCH": {
      const payload = msg.payload as SSBSubmitRegistrationBatchPayload;
      const data = await ssb.submitRegistrationBatch(payload);
      return { success: true, data };
    }
    case "SSB_AUTO_REGISTER_RUN": {
      const { term, crnList } = msg.payload as {
        term: string;
        crnList: string[];
      };
      const result = await ssb.executeRegistrationSubmit(term, crnList);
      return { success: true, data: result };
    }
    case "SSB_REG_TUITION": {
      const data = await ssb.getTuitionFeeDetail();
      return { success: true, data };
    }
    default:
      return { success: false, error: `Unknown SSB message: ${msg.type}` };
  }
}

export default defineContentScript({
  matches: ["*://*.edu/StudentRegistrationSsb/*", "*://*.edu/ssb/*"],
  cssInjectionMode: "ui",

  async main() {
    const { initRMPRatings } = await import("./modules/rmp-ratings");
    const { initUIEnhancer } = await import("./modules/ui-enhancer");
    const { initAutoRegister } = await import("./modules/auto-register");

    onContentMessage(async (msg, sendResponse) => {
      if (msg.type.startsWith("SSB_")) {
        try {
          const result = await handleSSBMessage(msg);
          sendResponse(result);
        } catch (err) {
          sendResponse({
            success: false,
            error: err instanceof Error ? err.message : "SSB request failed",
          });
        }
      }
    });

    function detectPage(): Page {
      const currentUrl = window.location.href.toLowerCase();
      const ssbPathSegments = currentUrl.split("/ssb/");
      const path = ssbPathSegments[1];

      if (path.includes("plan/plan")) return "planAhead";
      // if (path.includes("classsearch") || path.includes("searchresults"))
      //   return "search";
      // if (path.includes("registration") || path.includes("adddrop"))
      //   return "registration";
      // if (path.includes("results")) return "results";
      return "unknown";
    }

    function activateModules() {
      const page = detectPage();

      // initUIEnhancer();
      if (page === "planAhead") {
        initRMPRatings(observer);
      }
    }

    const observer = new MutationObserver((mutations) => {
      const hasNewNodes = mutations.some(
        (m) => m.addedNodes.length > 0 || m.type === "childList",
      );
      if (hasNewNodes) {
        activateModules();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    activateModules();
  },
});
