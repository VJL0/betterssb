import { PopupHeader } from "./components/popup-header";
import { Home } from "./home";

/** The popup (E1): one screen; the website does the rest. */
export default function App() {
  return (
    <>
      <PopupHeader />
      <main className="min-h-0 flex-1 overflow-y-auto bg-muted/40 p-4 text-sm">
        <Home />
      </main>
    </>
  );
}
