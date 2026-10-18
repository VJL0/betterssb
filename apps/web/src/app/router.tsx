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
        path: "/audit",
        errorElement: <RouteError />,
        lazy: () =>
          import("@/features/audit/audit-page").then((m) => ({
            Component: m.AuditPage,
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
