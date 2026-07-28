import { useEffect, useRef, useState } from "react";
import {
  FiAlertCircle,
  FiCheckCircle,
  FiChevronDown,
  FiDownload,
  FiExternalLink,
} from "react-icons/fi";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { save } from "@tauri-apps/plugin-dialog";
import { v4 as uuidv4 } from "uuid";

import { useProjectContext } from "../../../contexts/pages/ProjectProvider";
import { useModal } from "../../../contexts/global/ModalContext";
import { useErrorContext } from "../../../contexts/global/ErrorContext";
import { prepareAndPublishProject } from "../../../utils/publishPreparation";
import {
  parsePublishFailure,
  profileForFormat,
  progressForExport,
  scopeForSelection,
} from "../../../utils/publishingForm";
import type {
  Diagnostic,
  NodePublishingOverride,
  PublishingMetadata,
  PublishingOutlineNode,
  PublishingSetup,
  PublishFailure,
  PublishFormat,
  PublishProfileId,
  PublishProgress,
  PublishRequest,
  PublishResult,
  SectionRole,
} from "../../../types/PublishingTypes";

const emptyMetadata = (title: string): PublishingMetadata => ({
  title,
  author: "",
  contact: {
    author_name: "",
    email: "",
    phone: "",
    mailing_address: "",
    header_surname: "",
    short_title: "",
  },
});

const roles: SectionRole[] = [
  "front_matter",
  "part",
  "chapter",
  "scene",
  "work",
  "installment",
  "volume",
  "back_matter",
  "unassigned",
];

export const ExportModal = () => {
  const project = useProjectContext();
  const modal = useModal();
  const { showError } = useErrorContext();

  const [setup, setSetup] = useState<PublishingSetup | null>(null);
  const [metadata, setMetadata] = useState<PublishingMetadata>(() =>
    emptyMetadata(project.projectMetadata.projectName || ""),
  );
  const [format, setFormat] = useState<PublishFormat>("pdf");
  const [profileId, setProfileId] =
    useState<PublishProfileId>("proof_pdf");
  const [nodeOverrides, setNodeOverrides] = useState<
    Record<string, NodePublishingOverride>
  >({});
  const [outlineConfirmed, setOutlineConfirmed] = useState(false);
  const [scopeMode, setScopeMode] = useState("full_project");
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [isSetupLoading, setIsSetupLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<PublishResult | null>(null);
  const [failure, setFailure] = useState<PublishFailure | null>(null);
  const [progress, setProgress] = useState<PublishProgress | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const currentExportIdRef = useRef<string | null>(null);
  const setupStartedRef = useRef(false);

  useEffect(() => {
    if (setupStartedRef.current) return;
    setupStartedRef.current = true;

    const loadSetup = async () => {
      try {
        await project.flushProjectSnapshot();
        const loaded = await invoke<PublishingSetup>("get_publishing_setup", {
          projectName: decodeURIComponent(project.projectName),
        });
        setSetup(loaded);
        setMetadata({
          ...emptyMetadata(project.projectMetadata.projectName || ""),
          ...loaded.config.book_metadata,
          contact: {
            ...emptyMetadata("").contact,
            ...loaded.config.book_metadata.contact,
          },
        });
        setNodeOverrides(loaded.config.node_roles);
        setOutlineConfirmed(loaded.config.project_type_strategy.confirmed);
        const defaultFormat = loaded.config.default_profile_by_format;
        if (defaultFormat.docx === "clean_handoff") {
          setProfileId("clean_handoff");
        }
      } catch (error) {
        const parsed = parsePublishFailure(error);
        setFailure(parsed);
        showError(parsed.message, "loading publishing settings");
      } finally {
        setIsSetupLoading(false);
      }
    };

    void loadSetup();
    return () => {
      unlistenRef.current?.();
    };
  }, [
    project.flushProjectSnapshot,
    project.projectMetadata.projectName,
    project.projectName,
    showError,
  ]);

  const chooseFormat = (nextFormat: PublishFormat) => {
    setFormat(nextFormat);
    setProfileId(
      profileForFormat(
        nextFormat,
        setup?.config.default_profile_by_format.docx,
      ),
    );
  };

  const handlePublish = async () => {
    if (!setup) return;
    setFailure(null);
    setResult(null);

    const extension = format === "pdf" ? "pdf" : "docx";
    const destination = await save({
      title: `Save ${format.toUpperCase()} export`,
      defaultPath: `${safeFilename(metadata.title || "Untitled")}.${extension}`,
      filters: [
        {
          name: format === "pdf" ? "PDF Document" : "Word Document",
          extensions: [extension],
        },
      ],
    });
    if (!destination) return;

    const exportId = uuidv4();
    currentExportIdRef.current = exportId;
    setIsLoading(true);
    setProgress({
      export_id: exportId,
      phase: "snapshot",
      message: "Saving the current project snapshot",
      current: 0,
      total: 6,
      severity: "info",
    });

    try {
      unlistenRef.current?.();
      unlistenRef.current = await listen<PublishProgress>(
        "publish-progress",
        (event) => {
          const jobProgress = progressForExport(
            currentExportIdRef.current,
            event.payload,
          );
          if (jobProgress) setProgress(jobProgress);
        },
      );

      const request: PublishRequest = {
        export_id: exportId,
        project_name: decodeURIComponent(project.projectName),
        project_type: setup.project_type,
        scope: scopeForSelection(scopeMode, selectedNodeId),
        format,
        profile_id: profileId,
        metadata: cleanMetadata(metadata),
        node_overrides: nodeOverrides,
        outline_confirmed: outlineConfirmed,
        include_shared_matter: true,
        destination,
      };
      const publishResult = await prepareAndPublishProject(
        {
          request,
          flushProjectSnapshot: project.flushProjectSnapshot,
        },
        {
          publishProject: (publishRequest) =>
            invoke<PublishResult>("publish_project", {
              request: publishRequest,
            }),
        },
      );
      setResult(publishResult);
    } catch (error) {
      const parsed = parsePublishFailure(error);
      setFailure(parsed);
      showError(parsed.message, "publishing project");
    } finally {
      unlistenRef.current?.();
      unlistenRef.current = null;
      currentExportIdRef.current = null;
      setIsLoading(false);
      setProgress(null);
    }
  };

  const handleOpenArtifact = async () => {
    if (!result) return;
    try {
      await invoke("open_file_default", {
        path: result.primary_artifact_path,
      });
    } catch (error) {
      showError(error, "opening published artifact");
    }
  };

  if (isSetupLoading) {
    return <StatusPanel title="Preparing publishing…" message="Saving and loading the project outline." />;
  }

  if (result) {
    return (
      <div className="flex flex-col gap-4">
        <h2
          className="text-lg font-bold flex items-center gap-2"
          style={{ color: "var(--text-primary)" }}
        >
          <FiCheckCircle style={{ color: "var(--btn-success)" }} />
          Publish Complete
        </h2>
        <DiagnosticList diagnostics={result.diagnostics} />
        <div className="flex justify-end gap-4">
          <button
            onClick={modal.handleClose}
            className="px-4 py-2 rounded border input-button"
            style={{ borderColor: "var(--border-color)" }}
          >
            Done
          </button>
          <button
            onClick={handleOpenArtifact}
            className="px-4 py-2 rounded flex items-center gap-2"
            style={{
              background: "var(--btn-primary)",
              color: "var(--btn-text)",
            }}
          >
            <FiExternalLink />
            Open {format.toUpperCase()}
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    const percent =
      progress && progress.total > 0
        ? Math.round((progress.current / progress.total) * 100)
        : 0;
    return (
      <div className="flex flex-col gap-4">
        <h2
          className="text-lg font-bold flex items-center gap-2"
          style={{ color: "var(--text-primary)" }}
        >
          <FiDownload style={{ color: "var(--btn-primary)" }} />
          Publishing…
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {progress?.message || "Preparing…"}
        </p>
        <div
          className="w-full rounded-full h-3 overflow-hidden"
          style={{ background: "var(--bg-input)" }}
        >
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${percent}%`,
              background: "var(--btn-primary)",
            }}
          />
        </div>
        <p className="text-xs text-right" style={{ color: "var(--text-secondary)" }}>
          {percent}%
        </p>
      </div>
    );
  }

  if (!setup) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <FiAlertCircle style={{ color: "var(--btn-danger, #ef4444)" }} />
          Publishing Unavailable
        </h2>
        <DiagnosticList diagnostics={failure?.diagnostics ?? []} />
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          {failure?.message}
        </p>
        <button onClick={modal.handleClose} className="px-4 py-2 rounded input-button self-end">
          Close
        </button>
      </div>
    );
  }

  const selectableNodes = flattenOutline(setup.outline).filter(
    (node): node is PublishingOutlineNode & { id: number } =>
      node.id !== undefined &&
      (scopeMode === "selected_nodes" ||
        (scopeMode === "single_work" &&
          (nodeOverrides[node.id.toString()]?.role ?? node.role) === "work") ||
        (scopeMode === "single_installment" &&
          (nodeOverrides[node.id.toString()]?.role ?? node.role) ===
            "installment") ||
        (scopeMode === "volume" &&
          (nodeOverrides[node.id.toString()]?.role ?? node.role) === "volume")),
  );
  const publishBlockers: string[] = [];
  if (!metadata.title.trim()) publishBlockers.push("title");
  if (!metadata.author.trim()) publishBlockers.push("author");
  if (!outlineConfirmed) publishBlockers.push("outline confirmation");
  if (scopeMode !== "full_project" && selectedNodeId === null) {
    publishBlockers.push("included item");
  }

  return (
    <div className="flex flex-col gap-4 max-h-[75vh] overflow-y-auto pr-1">
      <h2
        className="text-lg font-bold flex items-center gap-2"
        style={{ color: "var(--text-primary)" }}
      >
        <FiDownload style={{ color: "var(--btn-primary)" }} />
        Publish
      </h2>
      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
        Fields marked <span style={{ color: "var(--btn-danger)" }}>*</span> are
        required.
      </p>

      {failure && (
        <div
          className="rounded border p-3"
          style={{ borderColor: "var(--btn-danger, #ef4444)" }}
        >
          <p className="text-sm font-medium">{failure.message}</p>
          <DiagnosticList diagnostics={failure.diagnostics} />
        </div>
      )}

      <Field label="Title" required>
        <input
          value={metadata.title}
          onChange={(event) =>
            setMetadata({ ...metadata, title: event.target.value })
          }
          className="border rounded w-full p-2 focus:outline-none"
          style={inputStyle}
          required
          autoFocus
        />
      </Field>
      <Field label="Subtitle (optional)">
        <input
          value={metadata.subtitle ?? ""}
          onChange={(event) =>
            setMetadata({ ...metadata, subtitle: event.target.value })
          }
          className="border rounded w-full p-2 focus:outline-none"
          style={inputStyle}
        />
      </Field>
      <Field label="Author" required>
        <input
          value={metadata.author}
          onChange={(event) => {
            const author = event.target.value;
            setMetadata({
              ...metadata,
              author,
              contact: {
                ...metadata.contact,
                author_name: metadata.contact.author_name || author,
              },
            });
          }}
          className="border rounded w-full p-2 focus:outline-none"
          style={inputStyle}
          required
        />
      </Field>

      <fieldset>
        <legend className="text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
          Format
        </legend>
        <div className="grid grid-cols-2 gap-2">
          <ChoiceButton
            selected={format === "pdf"}
            onClick={() => chooseFormat("pdf")}
            title="Proof PDF"
            description="Current proof layout"
          />
          <ChoiceButton
            selected={format === "docx"}
            onClick={() => chooseFormat("docx")}
            title="DOCX"
            description="Editable Word document"
          />
        </div>
      </fieldset>

      {format === "docx" && (
        <>
          <Field label="DOCX profile">
            <select
              value={profileId}
              onChange={(event) =>
                setProfileId(event.target.value as PublishProfileId)
              }
              className="border rounded w-full p-2"
              style={inputStyle}
            >
              <option value="standard_manuscript">Standard Manuscript</option>
              <option value="clean_handoff">Clean Handoff</option>
            </select>
          </Field>
          <ContactFields metadata={metadata} onChange={setMetadata} />
        </>
      )}

      <Field label="Publication scope">
        <select
          value={scopeMode}
          onChange={(event) => {
            setScopeMode(event.target.value);
            setSelectedNodeId(null);
          }}
          className="border rounded w-full p-2"
          style={inputStyle}
        >
          <option value="full_project">Full project</option>
          <option value="selected_nodes">Selected section</option>
          {setup.project_type === "collection" && (
            <option value="single_work">Single work</option>
          )}
          {setup.project_type === "serial" && (
            <option value="single_installment">Single installment</option>
          )}
          {flattenOutline(setup.outline).some(
            (node) =>
              (node.id === undefined
                ? node.role
                : nodeOverrides[node.id.toString()]?.role ?? node.role) ===
              "volume",
          ) && <option value="volume">Single volume</option>}
        </select>
      </Field>

      {scopeMode !== "full_project" && (
        <Field label="Included item" required>
          <select
            value={selectedNodeId ?? ""}
            onChange={(event) =>
              setSelectedNodeId(
                event.target.value ? Number(event.target.value) : null,
              )
            }
            className="border rounded w-full p-2"
            style={inputStyle}
            required
          >
            <option value="">Choose an item…</option>
            {selectableNodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.title || `Node ${node.id}`}
              </option>
            ))}
          </select>
        </Field>
      )}

      <button
        type="button"
        onClick={() => setOutlineOpen((open) => !open)}
        className="flex items-center justify-between rounded border p-2 text-left"
        style={inputStyle}
      >
        <span>
          <span className="font-medium">Outline and roles</span>
          <span className="block text-xs" style={{ color: "var(--text-secondary)" }}>
            Review inferred structure and exclusions
          </span>
        </span>
        <FiChevronDown
          style={{ transform: outlineOpen ? "rotate(180deg)" : undefined }}
        />
      </button>
      {outlineOpen && (
        <div className="rounded border p-2" style={{ borderColor: "var(--border-color)" }}>
          {setup.outline.map((node) => (
            <OutlineRow
              key={`${node.id ?? "matter"}-${node.title ?? node.role}`}
              node={node}
              depth={0}
              overrides={nodeOverrides}
              onChange={setNodeOverrides}
            />
          ))}
        </div>
      )}

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={outlineConfirmed}
          onChange={(event) => setOutlineConfirmed(event.target.checked)}
          className="mt-1"
          required
        />
        <span>
          I reviewed and confirm this publishing outline.{" "}
          <span style={{ color: "var(--btn-danger)" }}>*</span>
          <span className="block text-xs" style={{ color: "var(--text-secondary)" }}>
            Confirmation and role overrides are saved with the project.
          </span>
        </span>
      </label>

      <details>
        <summary className="text-sm cursor-pointer" style={{ color: "var(--text-secondary)" }}>
          Front and back matter
        </summary>
        <div className="grid gap-3 mt-2">
          <Field label="Front matter (optional)">
            <textarea
              value={metadata.front_matter ?? ""}
              onChange={(event) =>
                setMetadata({ ...metadata, front_matter: event.target.value })
              }
              rows={2}
              className="border rounded w-full p-2 resize-y"
              style={inputStyle}
            />
          </Field>
          <Field label="Back matter (optional)">
            <textarea
              value={metadata.back_matter ?? ""}
              onChange={(event) =>
                setMetadata({ ...metadata, back_matter: event.target.value })
              }
              rows={2}
              className="border rounded w-full p-2 resize-y"
              style={inputStyle}
            />
          </Field>
        </div>
      </details>

      <div className="flex items-center justify-between gap-4 mt-2">
        <p
          id="publish-requirements"
          className="text-xs"
          style={{
            color:
              publishBlockers.length > 0
                ? "var(--btn-danger)"
                : "var(--btn-success)",
          }}
          aria-live="polite"
        >
          {publishBlockers.length > 0
            ? `Complete before publishing: ${publishBlockers.join(", ")}.`
            : "Ready to publish."}
        </p>
        <div className="flex justify-end gap-4">
          <button
            onClick={modal.handleClose}
            className="px-4 py-2 rounded border input-button"
            style={{ borderColor: "var(--border-color)" }}
          >
            Cancel
          </button>
          <button
            onClick={handlePublish}
            disabled={publishBlockers.length > 0}
            aria-describedby="publish-requirements"
            title={
              publishBlockers.length > 0
                ? `Complete: ${publishBlockers.join(", ")}`
                : `Publish ${format.toUpperCase()}`
            }
            className="px-4 py-2 rounded flex items-center gap-2 disabled:opacity-50"
            style={{
              background: "var(--btn-primary)",
              color: "var(--btn-text)",
            }}
          >
            <FiDownload />
            {failure ? "Retry" : "Publish"} {format.toUpperCase()}
          </button>
        </div>
      </div>
    </div>
  );
};

const inputStyle = {
  borderColor: "var(--border-color)",
  background: "var(--bg-input)",
  color: "var(--text-primary)",
};

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span
        className="block text-sm font-medium mb-1"
        style={{ color: "var(--text-secondary)" }}
      >
        {label}
        {required && (
          <span aria-hidden="true" style={{ color: "var(--btn-danger)" }}>
            {" "}*
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

function ChoiceButton({
  selected,
  onClick,
  title,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border p-2 text-left"
      style={{
        ...inputStyle,
        borderColor: selected ? "var(--btn-primary)" : "var(--border-color)",
      }}
    >
      <span className="block font-medium text-sm">{title}</span>
      <span className="block text-xs" style={{ color: "var(--text-secondary)" }}>
        {description}
      </span>
    </button>
  );
}

function ContactFields({
  metadata,
  onChange,
}: {
  metadata: PublishingMetadata;
  onChange: (metadata: PublishingMetadata) => void;
}) {
  const update = (
    key: keyof PublishingMetadata["contact"],
    value: string,
  ) => {
    onChange({
      ...metadata,
      contact: { ...metadata.contact, [key]: value },
    });
  };
  return (
    <details>
      <summary className="text-sm cursor-pointer" style={{ color: "var(--text-secondary)" }}>
        Contact and manuscript header
      </summary>
      <div className="grid grid-cols-2 gap-3 mt-2">
        {(
          [
            ["author_name", "Contact name"],
            ["email", "Email"],
            ["phone", "Phone"],
            ["mailing_address", "Mailing address"],
            ["header_surname", "Header surname"],
            ["short_title", "Short title"],
          ] as const
        ).map(([key, label]) => (
          <Field key={key} label={label}>
            <input
              value={metadata.contact[key]}
              onChange={(event) => update(key, event.target.value)}
              className="border rounded w-full p-2"
              style={inputStyle}
            />
          </Field>
        ))}
      </div>
    </details>
  );
}

function OutlineRow({
  node,
  depth,
  overrides,
  onChange,
}: {
  node: PublishingOutlineNode;
  depth: number;
  overrides: Record<string, NodePublishingOverride>;
  onChange: (overrides: Record<string, NodePublishingOverride>) => void;
}) {
  const key = node.id?.toString();
  const current = key ? overrides[key] : undefined;
  const role = current?.role ?? node.role;
  const excluded = (current?.inclusion ?? node.inclusion).type === "excluded";
  const update = (next: Partial<NodePublishingOverride>) => {
    if (!key) return;
    onChange({
      ...overrides,
      [key]: {
        role,
        inclusion: current?.inclusion ?? node.inclusion,
        ...next,
      },
    });
  };
  return (
    <>
      <div
        className="grid grid-cols-[1fr_auto_auto] items-center gap-2 py-1"
        style={{ paddingLeft: `${depth * 0.75}rem` }}
      >
        <span className="text-sm truncate">{node.title || formatRole(node.role)}</span>
        <select
          value={role}
          disabled={!key}
          onChange={(event) =>
            update({ role: event.target.value as SectionRole })
          }
          className="rounded border p-1 text-xs"
          style={inputStyle}
          aria-label={`Role for ${node.title ?? node.role}`}
        >
          {roles.map((candidate) => (
            <option key={candidate} value={candidate}>
              {formatRole(candidate)}
            </option>
          ))}
        </select>
        <label className="text-xs flex items-center gap-1">
          <input
            type="checkbox"
            checked={!excluded}
            disabled={!key}
            onChange={(event) =>
              update({
                inclusion: event.target.checked
                  ? { type: "all_formats" }
                  : { type: "excluded" },
              })
            }
          />
          Include
        </label>
      </div>
      {node.children.map((child) => (
        <OutlineRow
          key={`${child.id ?? "matter"}-${child.title ?? child.role}`}
          node={child}
          depth={depth + 1}
          overrides={overrides}
          onChange={onChange}
        />
      ))}
    </>
  );
}

function DiagnosticList({ diagnostics }: { diagnostics: Diagnostic[] }) {
  if (diagnostics.length === 0) return null;
  return (
    <ul className="text-sm space-y-1">
      {diagnostics.map((diagnostic, index) => (
        <li key={`${diagnostic.code}-${index}`}>
          <strong>{diagnostic.code}:</strong> {diagnostic.message}
          {diagnostic.remediation && (
            <span className="block text-xs" style={{ color: "var(--text-secondary)" }}>
              {diagnostic.remediation}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function StatusPanel({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {message}
      </p>
    </div>
  );
}

function flattenOutline(
  nodes: PublishingOutlineNode[],
): PublishingOutlineNode[] {
  return nodes.flatMap((node) => [node, ...flattenOutline(node.children)]);
}

function cleanMetadata(metadata: PublishingMetadata): PublishingMetadata {
  return {
    ...metadata,
    title: metadata.title.trim(),
    subtitle: metadata.subtitle?.trim() || undefined,
    author: metadata.author.trim(),
    language: metadata.language?.trim() || undefined,
    front_matter: metadata.front_matter?.trim() || undefined,
    back_matter: metadata.back_matter?.trim() || undefined,
    contact: Object.fromEntries(
      Object.entries(metadata.contact).map(([key, value]) => [
        key,
        value.trim(),
      ]),
    ) as unknown as PublishingMetadata["contact"],
  };
}

function safeFilename(title: string): string {
  const sanitized = title.replace(/[<>:"/\\|?*]/g, "_").trim();
  return sanitized || "Untitled";
}

function formatRole(role: SectionRole): string {
  return role
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}
