import { useState } from "react";
import { AddClipsPage } from "./pages/AddClipsPage";
import { EditPage } from "./pages/EditPage";
import { TestPage } from "./pages/TestPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { BottomNav } from "./components/system/BottomNav";
import { TopBar } from "./components/system/TopBar";
import { useProjectStore } from "./stores/useProjectStore";
import "./App.css";

function App() {
  const [activePage, setActivePage] = useState("clips");
  const projectId = useProjectStore((s) => s.projectId);

  // Show projects page when no project is active
  if (!projectId) {
    return <ProjectsPage />;
  }

  return (
    <div className="pb-20">
      <TopBar />
      {activePage === "clips" && <AddClipsPage />}
      {activePage === "edit" && <EditPage />}
      {activePage === "test" && <TestPage />}
      <BottomNav active={activePage} onNavigate={setActivePage} />
    </div>
  );
}

export default App;
