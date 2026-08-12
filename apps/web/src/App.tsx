import { Route, Routes } from "react-router";

import { AppShell } from "./components/AppShell";
import { PwaUpdatePrompt } from "./components/PwaUpdatePrompt";
import { HomePage } from "./pages/HomePage";
import { InfoPage } from "./pages/InfoPage";

export function App() {
  return (
    <>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route
            element={<InfoPage bodyKey="pages.logBody" titleKey="pages.logTitle" />}
            path="log/new"
          />
          <Route
            element={<InfoPage bodyKey="pages.sessionsBody" titleKey="pages.sessionsTitle" />}
            path="sessions"
          />
          <Route
            element={<InfoPage bodyKey="pages.memoryBody" titleKey="pages.memoryTitle" />}
            path="memory"
          />
          <Route
            element={<InfoPage bodyKey="pages.assistantBody" titleKey="pages.assistantTitle" />}
            path="vicenc"
          />
          <Route
            element={<InfoPage bodyKey="pages.notFoundBody" titleKey="pages.notFoundTitle" />}
            path="*"
          />
        </Route>
      </Routes>
      <PwaUpdatePrompt />
    </>
  );
}
