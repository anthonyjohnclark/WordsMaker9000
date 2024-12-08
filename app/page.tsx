"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listProjects, createProject } from "./utils/fileManager";

export default function HomePage() {
  const [projects, setProjects] = useState<string[]>([]);
  const [newProjectName, setNewProjectName] = useState("");
  const router = useRouter();

  useEffect(() => {
    async function fetchProjects() {
      const projects = await listProjects();
      setProjects(projects);
    }
    fetchProjects();
  }, []);

  async function handleCreateProject() {
    if (newProjectName.trim()) {
      const trimmedName = newProjectName.trim();
      await createProject(trimmedName);
      setNewProjectName("");
      const updatedProjects = await listProjects();
      setProjects(updatedProjects);
      router.push(`/projects/${trimmedName}`);
    }
  }

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white overflow-x-hidden">
      {/* Header */}
      <header className="bg-yellow-600 text-white py-6 shadow-md">
        <div className="container mx-auto flex justify-between items-center px-6">
          <h1 className="text-3xl font-extrabold">Gilgamesh</h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto p-6">
        <h2 className="text-3xl font-bold mb-6">Projects</h2>
        <ul className="mb-6 space-y-4">
          {projects.map((project) => (
            <li
              key={project}
              className="bg-gray-800 rounded-lg shadow-lg p-4 hover:bg-gray-700 transition"
            >
              <a
                href={`/projects/${project}`}
                className="text-xl font-semibold text-blue-400 hover:underline"
              >
                {project}
              </a>
              <div className="mt-2 text-sm text-gray-400 flex justify-between">
                <p>
                  <span className="font-semibold text-gray-300">
                    Last Edited:
                  </span>{" "}
                  Placeholder
                </p>
                <p>
                  <span className="font-semibold text-gray-300">
                    Word Count:
                  </span>{" "}
                  Placeholder
                </p>
              </div>
            </li>
          ))}
        </ul>
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
          <h3 className="text-xl font-bold mb-4">Create New Project</h3>
          <div className="flex items-center space-x-4">
            <input
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="New project name"
              className="flex-1 border border-gray-700 bg-gray-900 text-white rounded p-2 focus:ring-2 focus:ring-yellow-600 focus:outline-none"
            />
            <button
              onClick={handleCreateProject}
              className="bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-500 transition"
            >
              Create
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 text-gray-400 py-4">
        <div className="container mx-auto text-center">
          © {new Date().getFullYear()} Gilgamesh - All Rights Reserved
        </div>
      </footer>
    </div>
  );
}
