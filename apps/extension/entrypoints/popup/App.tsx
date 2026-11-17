import { PopupHeader } from "./components/popup-header";
import { DataConsent } from "./data-consent";
import { Home } from "./home";
import { useDataConsent } from "./hooks/use-data-consent";

/** The popup (E1): one screen, after the data disclosure; the website does the rest. */
export default function App() {
  const consented = useDataConsent();
  return (
    <>
      <PopupHeader />
      <main className="min-h-0 flex-1 overflow-y-auto bg-muted/40 p-4 text-sm">
        {consented === true && <Home />}
        {consented === false && <DataConsent />}
      </main>
    </>
  );
}
