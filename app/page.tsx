"use client";

import { useEffect, useState } from "react";
import { listProjects, createProject } from "./utils/fileManager";

export default function HomePage() {
  const [projects, setProjects] = useState<string[]>([]);
  const [newProjectName, setNewProjectName] = useState("");

  useEffect(() => {
    async function fetchProjects() {
      const projects = await listProjects();
      setProjects(projects);
    }
    fetchProjects();
  }, []);

  async function handleCreateProject() {
    if (newProjectName.trim()) {
      await createProject(newProjectName.trim());
      setNewProjectName("");
      const updatedProjects = await listProjects();
      setProjects(updatedProjects);
    }
  }
  return (
    <div className="flex flex-col min-h-screen bg-black-100">
      {/* Header */}
      <header className="bg-blue-600 text-white py-4">
        <div className="container mx-auto flex justify-between items-center px-4">
          <h1 className="text-2xl font-bold">My Editor</h1>
        </div>
      </header>
      <main className="flex-1 container mx-auto p-4">
        <h2 className="text-2xl font-bold mb-4">Projects</h2>
        <ul className="mb-4">
          {projects.map((project) => (
            <li key={project}>
              <a
                href={`/projects/${project}`}
                className="text-blue-500 hover:underline"
              >
                {project}
              </a>
            </li>
          ))}
        </ul>
        <div>
          <input
            type="text"
            value={newProjectName}
            onChange={(e) => setNewProjectName(e.target.value)}
            placeholder="New project name"
            className="border p-2 mr-2"
          />
          <button
            onClick={handleCreateProject}
            className="bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-500"
          >
            Create Project
          </button>
        </div>
      </main>
    </div>
  );
}
