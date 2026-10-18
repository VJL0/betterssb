import { createBrowserRouter } from "react-router";
import { AppShell } from "./app-shell";
import { NotFoundPage } from "./not-found-page";
import { RouteError } from "./route-error";

/** Routes. Each page is loaded on first visit; pages not built yet have no route. */
export const router = createBrowserRouter([
  {
    path: "/",
    errorElement: <RouteError />,
    lazy: () =>
      import("@/features/landing/landing-page").then((m) => ({
        Component: m.LandingPage,
      })),
  },
  {
    path: "/start",
    errorElement: <RouteError />,
    lazy: () =>
      import("@/features/onboarding/get-started-page").then((m) => ({
        Component: m.GetStartedPage,
      })),
  },
  {
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      {
        path: "/search",
        errorElement: <RouteError />,
        lazy: () =>
          import("@/features/search/search-page").then((m) => ({
            Component: m.SearchPage,
          })),
      },
      {
        path: "/schedule",
        errorElement: <RouteError />,
        lazy: () =>
          import("@/features/schedule/schedule-page").then((m) => ({
            Component: m.SchedulePage,
          })),
      },
      {
        path: "/plan",
        errorElement: <RouteError />,
        lazy: () =>
          import("@/features/plan/plan-page").then((m) => ({
            Component: m.PlanPage,
          })),
      },
      {
        path: "/register",
        errorElement: <RouteError />,
        lazy: () =>
          import("@/features/register/register-page").then((m) => ({
            Component: m.RegisterPage,
          })),
      },
      {
        path: "/audit",
        errorElement: <RouteError />,
        lazy: () =>
          import("@/features/audit/audit-page").then((m) => ({
            Component: m.AuditPage,
          })),
      },
      {
        path: "/transcript",
        errorElement: <RouteError />,
        lazy: () =>
          import("@/features/transcript/transcript-page").then((m) => ({
            Component: m.TranscriptPage,
          })),
      },
      {
        path: "/advisor",
        errorElement: <RouteError />,
        lazy: () =>
          import("@/features/advisor/advisor-page").then((m) => ({
            Component: m.AdvisorPage,
          })),
      },
      {
        path: "/settings",
        errorElement: <RouteError />,
        lazy: () =>
          import("@/features/settings/settings-page").then((m) => ({
            Component: m.SettingsPage,
          })),
      },
      { path: "*", Component: NotFoundPage },
    ],
  },
]);
