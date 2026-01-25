import { useState, useEffect } from "react";
import { AddClipsPage } from "./pages/AddClipsPage";
import { EditPage } from "./pages/EditPage";
import { TestPage } from "./pages/TestPage";
import { ProjectsPage } from "./pages/ProjectsPage";
import { TopBar } from "./components/system/TopBar";
import { useProjectStore } from "./stores/useProjectStore";
import "./App.css";

type Step = "clips" | "edit" | "test";

function App() {
  const [step, setStep] = useState<Step>("clips");
  const projectId = useProjectStore((s) => s.projectId);
  const timeline = useProjectStore((s) => s.timeline);
  const phase = useProjectStore((s) => s.phase);

  // If project has already been processed (has timeline data or is ready), skip to edit step
  useEffect(() => {
    if (timeline.entries.length > 0 || phase === "ready") {
      setStep("edit");
    }
  }, [timeline.entries.length, phase]);

  // Reset step when project changes
  useEffect(() => {
    if (!projectId) {
      setStep("clips");
    }
  }, [projectId]);

  // Dev shortcut: Ctrl+Shift+T to access test page
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "T") {
        setStep((s) => (s === "test" ? "edit" : "test"));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Show projects page when no project is active
  if (!projectId) {
    return <ProjectsPage />;
  }

  const handleNext = () => {
    setStep("edit");
  };

  return (
    <div>
      <TopBar />
      {step === "clips" && <AddClipsPage onNext={handleNext} />}
      {step === "edit" && <EditPage />}
      {step === "test" && <TestPage />}
    </div>
  );
}

export default App;
