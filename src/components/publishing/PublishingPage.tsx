import { useEffect, useRef, useState } from "react";
import {
  FiCheckCircle,
  FiChevronDown,
  FiEye,
  FiExternalLink,
  FiSave,
  FiTrash2,
} from "react-icons/fi";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { v4 as uuidv4 } from "uuid";
import Loader from "../Loader";

import { useProjectContext } from "../../contexts/pages/ProjectProvider";
import { useErrorContext } from "../../contexts/global/ErrorContext";
import { prepareAndPublishProject } from "../../utils/publishPreparation";
import {
  defaultMasterPageSelection,
  defaultMatterTemplateVariables,
  defaultHardcoverPdfSettings,
  defaultLargePrintPdfSettings,
  defaultPrintInteriorPdfSettings,
  diagnosticsBySeverity,
  formatPublishFailure,
  hardcoverSettingsErrors,
  hardcoverSettingsFromProfiles,
  largePrintSettingsErrors,
  largePrintSettingsFromProfiles,
  matterTemplateSelectionErrors,
  outlineNodeRole,
  parsePublishFailure,
  printInteriorSettingsErrors,
  printInteriorSettingsFromProfiles,
  profileForFormat,
  progressForExport,
  selectionForScope,
  scopeForSelection,
} from "../../utils/publishingForm";
import type {
  Diagnostic,
  DocxProfileId,
  HardcoverPdfSettings,
  HardcoverTrimSize,
  LargePrintPdfSettings,
  LargePrintTrimSize,
  MasterPageSelection,
  MatterTemplateDefinition,
  MatterTemplateSelection,
  NodePublishingOverride,
  PdfProfileId,
  PrintInteriorPdfSettings,
  PrintTrimSize,
  PublishingMetadata,
  PublishingOutlineNode,
  PublishingSetup,
  PublishingConfig,
  PublishFormat,
  PublishProgress,
  PublishRequest,
  PublishResult,
  SavedPublishingProfile,
  SectionRole,
} from "../../types/PublishingTypes";

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
  ebook: {
    include_front_matter: true,
    include_back_matter: true,
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

type PublishingPageProps = {
  onNavigateEditor?: () => void;
  onOpenArtifactHistory?: () => void;
  onPublishComplete?: () => void;
};

export const PublishingPage = ({
  onNavigateEditor,
  onOpenArtifactHistory,
  onPublishComplete,
}: PublishingPageProps = {}) => {
  const project = useProjectContext();
  const { showError } = useErrorContext();

  const [setup, setSetup] = useState<PublishingSetup | null>(null);
  const [metadata, setMetadata] = useState<PublishingMetadata>(() =>
    emptyMetadata(project.projectMetadata.projectName || ""),
  );
  const [format, setFormat] = useState<PublishFormat>("pdf");
  const [pdfProfileId, setPdfProfileId] = useState<PdfProfileId>("proof_pdf");
  const [printInteriorSettings, setPrintInteriorSettings] =
    useState<PrintInteriorPdfSettings>(() => defaultPrintInteriorPdfSettings());
  const [largePrintSettings, setLargePrintSettings] =
    useState<LargePrintPdfSettings>(() => defaultLargePrintPdfSettings());
  const [hardcoverSettings, setHardcoverSettings] =
    useState<HardcoverPdfSettings>(() => defaultHardcoverPdfSettings());
  const [docxProfileId, setDocxProfileId] = useState<DocxProfileId>(
    "standard_manuscript",
  );
  const [matterTemplates, setMatterTemplates] = useState<
    MatterTemplateSelection[]
  >([]);
  const [masterPage, setMasterPage] = useState<MasterPageSelection>(() =>
    defaultMasterPageSelection(),
  );
  const [nodeOverrides, setNodeOverrides] = useState<
    Record<string, NodePublishingOverride>
  >({});
  const [outlineConfirmed, setOutlineConfirmed] = useState(false);
  const [scopeMode, setScopeMode] = useState("full_project");
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectedSavedProfileId, setSelectedSavedProfileId] = useState("");
  const [savedProfileName, setSavedProfileName] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSetupLoading, setIsSetupLoading] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupAttempt, setSetupAttempt] = useState(0);
  const [cancellationNotice, setCancellationNotice] = useState("");
  const [result, setResult] = useState<PublishResult | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [progress, setProgress] = useState<PublishProgress | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const currentExportIdRef = useRef<string | null>(null);
  const cancelRequestedRef = useRef(false);
  const setupRunIdRef = useRef(0);

  useEffect(() => {
    if (project.isProjectPageLoading) {
      return;
    }

    let isDisposed = false;
    const runId = ++setupRunIdRef.current;
    setIsSetupLoading(true);
    setSetupError(null);

    const loadSetup = async () => {
      const minLoaderDelay = new Promise<void>((resolve) => {
        setTimeout(resolve, 1000);
      });

      try {
        await project.flushProjectSnapshot();
        const loaded = await invoke<PublishingSetup>("get_publishing_setup", {
          projectName: decodeURIComponent(project.projectName),
        });
        await minLoaderDelay;
        if (isDisposed || runId !== setupRunIdRef.current) return;
        setSetup(loaded);
        setMetadata({
          ...emptyMetadata(project.projectMetadata.projectName || ""),
          ...loaded.config.book_metadata,
          contact: {
            ...emptyMetadata("").contact,
            ...loaded.config.book_metadata.contact,
          },
          ebook: {
            ...emptyMetadata("").ebook,
            ...loaded.config.book_metadata.ebook,
          },
        });
        setNodeOverrides(loaded.config.node_roles);
        setMatterTemplates(loaded.config.matter_templates ?? []);
        setMasterPage(
          loaded.config.default_profile_by_format.pdf === "print_interior"
            ? (loaded.config.master_page ?? defaultMasterPageSelection())
            : defaultMasterPageSelection(),
        );
        setOutlineConfirmed(loaded.config.project_type_strategy.confirmed);
        const defaultFormat = loaded.config.default_profile_by_format;
        if (
          defaultFormat.pdf === "print_interior" ||
          defaultFormat.pdf === "large_print" ||
          defaultFormat.pdf === "hardcover"
        ) {
          setPdfProfileId(defaultFormat.pdf);
        }
        setPrintInteriorSettings(
          printInteriorSettingsFromProfiles(loaded.config.profiles),
        );
        setLargePrintSettings(
          largePrintSettingsFromProfiles(loaded.config.profiles),
        );
        setHardcoverSettings(
          hardcoverSettingsFromProfiles(loaded.config.profiles),
        );
        if (defaultFormat.docx === "clean_handoff") {
          setDocxProfileId("clean_handoff");
        }
      } catch (error) {
        await minLoaderDelay;
        if (isDisposed || runId !== setupRunIdRef.current) return;
        const parsed = parsePublishFailure(error);
        setSetupError(formatPublishFailure(parsed));
      } finally {
        if (isDisposed || runId !== setupRunIdRef.current) return;
        setIsSetupLoading(false);
      }
    };

    // Defer one tick so React StrictMode's throwaway effect cleanup can cancel
    // the first pass before we perform side effects.
    const deferredStart = setTimeout(() => {
      if (!isDisposed) {
        void loadSetup();
      }
    }, 0);

    return () => {
      isDisposed = true;
      clearTimeout(deferredStart);
      unlistenRef.current?.();
    };
  }, [
    project.isProjectPageLoading,
    project.projectName,
    setupAttempt,
    showError,
  ]);

  const chooseFormat = (nextFormat: PublishFormat) => {
    setFormat(nextFormat);
    if (nextFormat !== "pdf") {
      setMasterPage(defaultMasterPageSelection());
    }
    setSelectedSavedProfileId("");
    setSavedProfileName("");
  };

  const currentRecipe = (): SavedPublishingProfile["recipe"] | null => {
    if (!setup) return null;
    return {
      project_type: setup.project_type,
      scope: scopeForSelection(scopeMode, selectedNodeId),
      format,
      profile_id: profileForFormat(format, {
        pdf: pdfProfileId,
        docx: docxProfileId,
      }),
      pdf_settings: printInteriorSettings,
      large_print_settings: largePrintSettings,
      hardcover_settings: hardcoverSettings,
      metadata: cleanMetadata(metadata),
      node_overrides: nodeOverrides,
      outline_confirmed: outlineConfirmed,
      include_shared_matter: true,
      matter_templates: matterTemplates,
      master_page: masterPage,
    };
  };

  const replaceSetupConfig = (config: PublishingConfig) => {
    setSetup((current) => (current ? { ...current, config } : current));
  };

  const applyProfileState = (profile: SavedPublishingProfile) => {
    const recipe = profile.recipe;
    setSelectedSavedProfileId(profile.id);
    setSavedProfileName(profile.name);
    setFormat(recipe.format);
    if (
      recipe.format === "pdf" &&
      (recipe.profile_id === "proof_pdf" ||
        recipe.profile_id === "print_interior" ||
        recipe.profile_id === "large_print" ||
        recipe.profile_id === "hardcover")
    ) {
      setPdfProfileId(recipe.profile_id);
    }
    if (
      recipe.format === "docx" &&
      (recipe.profile_id === "standard_manuscript" ||
        recipe.profile_id === "clean_handoff")
    ) {
      setDocxProfileId(recipe.profile_id);
    }
    setPrintInteriorSettings(recipe.pdf_settings);
    setLargePrintSettings(
      recipe.large_print_settings ?? defaultLargePrintPdfSettings(),
    );
    setHardcoverSettings(
      recipe.hardcover_settings ?? defaultHardcoverPdfSettings(),
    );
    setMetadata(recipe.metadata);
    setNodeOverrides(recipe.node_overrides);
    setOutlineConfirmed(recipe.outline_confirmed);
    setMatterTemplates(recipe.matter_templates ?? []);
    setMasterPage(recipe.master_page ?? defaultMasterPageSelection());
    const selection = selectionForScope(recipe.scope);
    setScopeMode(selection.mode);
    setSelectedNodeId(selection.selectedNodeId);
  };

  const applySavedProfile = (profileId: string) => {
    const profile = setup?.config.saved_profiles.find(
      (candidate) => candidate.id === profileId,
    );
    if (!profile) {
      setSelectedSavedProfileId("");
      setSavedProfileName("");
      return;
    }
    applyProfileState(profile);
  };

  const handleSaveProfile = async () => {
    const recipe = currentRecipe();
    const name = savedProfileName.trim();
    if (!recipe || !name) return;
    setIsSavingProfile(true);
    try {
      const id = selectedSavedProfileId || uuidv4();
      const config = await invoke<PublishingConfig>("save_publishing_profile", {
        projectName: decodeURIComponent(project.projectName),
        profile: { id, name, recipe },
      });
      replaceSetupConfig(config);
      const persisted = config.saved_profiles.find(
        (profile) => profile.id === id,
      );
      if (persisted) {
        applyProfileState(persisted);
      }
    } catch (error) {
      const parsed = parsePublishFailure(error);
      showError(formatPublishFailure(parsed), "saving publishing profile");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleDeleteProfile = async () => {
    if (!selectedSavedProfileId) return;
    const profile = setup?.config.saved_profiles.find(
      (candidate) => candidate.id === selectedSavedProfileId,
    );
    if (
      !window.confirm(
        `Delete the saved publishing profile "${profile?.name ?? "this profile"}"?`,
      )
    ) {
      return;
    }
    try {
      const config = await invoke<PublishingConfig>(
        "delete_publishing_profile",
        {
          projectName: decodeURIComponent(project.projectName),
          profileId: selectedSavedProfileId,
        },
      );
      replaceSetupConfig(config);
      setSelectedSavedProfileId("");
      setSavedProfileName("");
    } catch (error) {
      const parsed = parsePublishFailure(error);
      showError(formatPublishFailure(parsed), "deleting publishing profile");
    }
  };

  const handleChooseCover = async () => {
    try {
      const selected = await open({
        title: "Choose ebook cover",
        multiple: false,
        directory: false,
        filters: [
          {
            name: "Ebook cover image",
            extensions: ["jpg", "jpeg", "png", "gif", "svg"],
          },
        ],
      });
      const source = Array.isArray(selected) ? selected[0] : selected;
      if (!source) return;
      setMetadata({
        ...metadata,
        ebook: {
          ...metadata.ebook,
          cover: {
            source,
            alt_text: metadata.ebook.cover?.alt_text ?? "",
          },
        },
      });
    } catch (error) {
      showError(error, "choosing ebook cover");
    }
  };

  const handlePublish = async () => {
    if (!setup) return;
    setResult(null);
    setPreviewOpen(false);
    setCancellationNotice("");

    const extension = format;
    const filterName =
      format === "pdf"
        ? "PDF Document"
        : format === "docx"
          ? "Word Document"
          : "EPUB 3 Ebook";
    const destination = await save({
      title: `Save ${format.toUpperCase()} export`,
      defaultPath: `${safeFilename(metadata.title || "Untitled")}.${extension}`,
      filters: [
        {
          name: filterName,
          extensions: [extension],
        },
      ],
    });
    if (!destination) return;

    const exportId = uuidv4();
    cancelRequestedRef.current = false;
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
        profile_id: profileForFormat(format, {
          pdf: pdfProfileId,
          docx: docxProfileId,
        }),
        pdf_settings: printInteriorSettings,
        large_print_settings: largePrintSettings,
        hardcover_settings: hardcoverSettings,
        metadata: cleanMetadata(metadata),
        node_overrides: nodeOverrides,
        outline_confirmed: outlineConfirmed,
        include_shared_matter: true,
        matter_templates: matterTemplates,
        master_page: masterPage,
        destination,
      };
      const publishResult = await prepareAndPublishProject(
        {
          request,
          flushProjectSnapshot: project.flushProjectSnapshot,
        },
        {
          publishProject: (publishRequest) => {
            if (cancelRequestedRef.current) {
              return Promise.reject({
                message: "Publishing cancelled.",
                diagnostics: [
                  {
                    code: "PUBLISH_CANCELLED",
                    severity: "warning",
                    message:
                      "Publishing was cancelled before the artifact was committed.",
                    remediation:
                      "No successful artifact or manifest was created.",
                  },
                ],
              });
            }
            return invoke<PublishResult>("publish_project", {
              request: publishRequest,
            });
          },
        },
      );
      setResult(publishResult);
      onPublishComplete?.();
    } catch (error) {
      const parsed = parsePublishFailure(error);
      if (
        parsed.diagnostics.some(
          (diagnostic) => diagnostic.code === "PUBLISH_CANCELLED",
        )
      ) {
        setCancellationNotice(
          "Publishing was cancelled. No artifact or successful manifest was created.",
        );
      } else {
        showError(formatPublishFailure(parsed), "publishing project");
      }
    } finally {
      unlistenRef.current?.();
      unlistenRef.current = null;
      currentExportIdRef.current = null;
      cancelRequestedRef.current = false;
      setIsLoading(false);
      setIsCancelling(false);
      setProgress(null);
    }
  };

  const handleCancelPublish = async () => {
    const exportId = currentExportIdRef.current;
    if (!exportId || isCancelling) return;
    cancelRequestedRef.current = true;
    setIsCancelling(true);
    setProgress((current) =>
      current
        ? { ...current, message: "Cancelling after the current render step…" }
        : current,
    );
    try {
      await invoke("cancel_publish", { exportId });
    } catch (error) {
      setIsCancelling(false);
      showError(error, "cancelling publication");
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
    return (
      <div className="h-full flex items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (setupError) {
    return (
      <div className="publish-page-panel w-full max-w-5xl mx-auto flex flex-col gap-4">
        <h2
          className="text-lg font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          Preparing publishing failed
        </h2>
        <p className="text-sm" style={{ color: "var(--btn-danger)" }}>
          {setupError}
        </p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => setSetupAttempt((value) => value + 1)}
            className="px-4 py-2 rounded border input-button"
            style={inputStyle}
          >
            Retry
          </button>
          <button
            type="button"
            onClick={onNavigateEditor}
            className="px-4 py-2 rounded"
            style={{
              background: "var(--btn-primary)",
              color: "var(--btn-text)",
            }}
          >
            Editor
          </button>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="publish-page-panel w-full max-w-5xl mx-auto flex flex-col gap-4">
        <h2
          className="text-lg font-bold flex items-center gap-2"
          style={{ color: "var(--text-primary)" }}
        >
          <FiCheckCircle style={{ color: "var(--btn-success)" }} />
          Publish Complete
        </h2>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
          The generated artifact is recorded in Artifact History.
        </p>
        <DiagnosticList diagnostics={result.diagnostics} />
        {format === "pdf" && previewOpen && (
          <iframe
            title="Generated PDF preview"
            src={convertFileSrc(result.primary_artifact_path)}
            className="w-full h-[55vh] rounded border"
            style={{
              borderColor: "var(--border-color)",
              background: "white",
            }}
          />
        )}
        <div className="flex justify-end gap-4">
          <button
            onClick={() => {
              setResult(null);
              setPreviewOpen(false);
            }}
            className="px-4 py-2 rounded border input-button"
            style={inputStyle}
          >
            New Publish
          </button>
          <button
            onClick={onOpenArtifactHistory}
            className="px-4 py-2 rounded border input-button"
            style={inputStyle}
          >
            Artifact History
          </button>
          {format === "pdf" && (
            <button
              onClick={() => setPreviewOpen((open) => !open)}
              className="px-4 py-2 rounded border input-button flex items-center gap-2"
              style={{ borderColor: "var(--border-color)" }}
            >
              <FiEye />
              {previewOpen ? "Hide Preview" : "Preview PDF"}
            </button>
          )}
          <button
            onClick={handleOpenArtifact}
            className="px-4 py-2 rounded flex items-center gap-2"
            style={{
              background: "var(--btn-primary)",
              color: "var(--btn-text)",
            }}
          >
            <FiExternalLink />
            {format === "pdf"
              ? "Open PDF"
              : `Preview ${format.toUpperCase()} in Default App`}
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
      <div className="publish-page-panel w-full max-w-5xl mx-auto flex flex-col gap-4">
        <h2
          className="text-lg font-bold flex items-center gap-2"
          style={{ color: "var(--text-primary)" }}
        >
          <span aria-hidden="true" className="text-sm leading-none">
            🚀
          </span>
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
        <p
          className="text-xs text-right"
          style={{ color: "var(--text-secondary)" }}
        >
          {percent}%
        </p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void handleCancelPublish()}
            disabled={isCancelling}
            className="px-4 py-2 rounded border input-button disabled:opacity-50"
            style={inputStyle}
          >
            {isCancelling ? "Cancelling…" : "Cancel Publish"}
          </button>
        </div>
      </div>
    );
  }

  if (!setup) {
    return null;
  }

  const displayedOutline = outlineWithMatterTemplates(
    setup.outline,
    setup.matter_template_catalog,
    matterTemplates,
  );
  const selectableNodes = flattenOutline(displayedOutline).filter(
    (node): node is PublishingOutlineNode & { id: number } =>
      node.id !== null &&
      (scopeMode === "selected_nodes" ||
        (scopeMode === "single_work" &&
          outlineNodeRole(node, nodeOverrides) === "work") ||
        (scopeMode === "single_installment" &&
          outlineNodeRole(node, nodeOverrides) === "installment") ||
        (scopeMode === "volume" &&
          outlineNodeRole(node, nodeOverrides) === "volume")),
  );
  const publishBlockers: string[] = [];
  const printSettingsErrors =
    format !== "pdf"
      ? []
      : pdfProfileId === "print_interior"
        ? printInteriorSettingsErrors(printInteriorSettings)
        : pdfProfileId === "large_print"
          ? largePrintSettingsErrors(largePrintSettings)
          : pdfProfileId === "hardcover"
            ? hardcoverSettingsErrors(hardcoverSettings)
            : [];
  const templateErrors = matterTemplateSelectionErrors(
    setup.matter_template_catalog,
    matterTemplates,
  );
  if (!metadata.title.trim()) publishBlockers.push("title");
  if (!metadata.author.trim()) publishBlockers.push("author");
  if (format === "epub" && !metadata.language?.trim()) {
    publishBlockers.push("ebook language");
  }
  if (format === "epub" && !metadata.ebook.cover) {
    publishBlockers.push("ebook cover");
  }
  if (
    format === "epub" &&
    metadata.ebook.cover &&
    !metadata.ebook.cover.alt_text.trim()
  ) {
    publishBlockers.push("cover alt text");
  }
  if (!outlineConfirmed) publishBlockers.push("outline confirmation");
  if (printSettingsErrors.length > 0) {
    publishBlockers.push("valid print settings");
  }
  if (templateErrors.length > 0) {
    publishBlockers.push("complete matter templates");
  }
  if (
    masterPage.template_id !== "profile_default" &&
    (format !== "pdf" || pdfProfileId !== "print_interior")
  ) {
    publishBlockers.push("compatible master page");
  }
  if (
    scopeMode !== "full_project" &&
    (selectedNodeId === null ||
      !selectableNodes.some((node) => node.id === selectedNodeId))
  ) {
    publishBlockers.push("included item");
  }

  return (
    <div className="publish-page-panel w-full max-w-5xl mx-auto flex flex-col gap-4 h-full overflow-y-auto pr-1 pb-6">
      <h2
        className="text-lg font-bold flex items-center gap-2"
        style={{ color: "var(--text-primary)" }}
      >
        <span aria-hidden="true" className="text-sm leading-none">
          🚀
        </span>
        Publish
      </h2>
      <fieldset>
        <legend
          className="text-sm font-medium mb-1"
          style={{ color: "var(--text-secondary)" }}
        >
          Destination
        </legend>
        <div className="grid grid-cols-3 gap-2">
          <ChoiceButton
            selected={format === "docx"}
            onClick={() => chooseFormat("docx")}
            title="Manuscript"
            description="Editable DOCX for submission or handoff"
          />
          <ChoiceButton
            selected={format === "epub"}
            onClick={() => chooseFormat("epub")}
            title="Ebook"
            description="Accessible reflowable EPUB 3"
          />
          <ChoiceButton
            selected={format === "pdf"}
            onClick={() => chooseFormat("pdf")}
            title="Print"
            description="Proof or print-interior PDF"
          />
        </div>
      </fieldset>

      <div
        className="rounded border p-3 grid gap-2"
        style={{ borderColor: "var(--border-color)" }}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto] gap-2 items-end">
          <Field label="Saved workflow">
            <select
              value={selectedSavedProfileId}
              onChange={(event) => applySavedProfile(event.target.value)}
              className="border rounded w-full p-2"
              style={inputStyle}
            >
              <option value="">Current project defaults</option>
              {(setup.config.saved_profiles ?? []).map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Profile name">
            <input
              value={savedProfileName}
              maxLength={80}
              placeholder="e.g. Agent submission"
              onChange={(event) => setSavedProfileName(event.target.value)}
              className="border rounded w-full p-2"
              style={inputStyle}
            />
          </Field>
          <button
            type="button"
            onClick={() => void handleSaveProfile()}
            disabled={
              !savedProfileName.trim() ||
              isSavingProfile ||
              publishBlockers.length > 0
            }
            className="publish-save-button px-3 py-2 rounded border input-button flex items-center gap-2 disabled:opacity-50"
            style={saveButtonStyle}
          >
            <FiSave />
            {selectedSavedProfileId ? "Update" : "Save"}
          </button>
          <button
            type="button"
            onClick={() => void handleDeleteProfile()}
            disabled={!selectedSavedProfileId}
            className="publish-delete-button px-3 py-2 rounded border input-button disabled:opacity-50"
            style={deleteButtonStyle}
            title="Delete saved workflow"
          >
            <FiTrash2 />
          </button>
        </div>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          {profileSummary(format, pdfProfileId, docxProfileId)}. Named workflows
          preserve metadata, scope, outline roles, and format settings.
        </p>
      </div>

      {cancellationNotice && (
        <p
          className="rounded border p-2 text-sm"
          style={{
            borderColor: "var(--border-color)",
            color: "var(--text-secondary)",
          }}
          role="status"
        >
          {cancellationNotice}
        </p>
      )}

      <details
        open={advancedOpen}
        onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
        className="rounded border p-3"
        style={{ borderColor: "var(--border-color)" }}
      >
        <summary className="cursor-pointer font-medium">
          Advanced publishing settings
          <span
            className="block text-xs font-normal"
            style={{ color: "var(--text-secondary)" }}
          >
            Metadata, profile details, scope, outline, and included matter
          </span>
        </summary>
        <div className="grid gap-4 mt-4">
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            Fields marked <span style={{ color: "var(--btn-danger)" }}>*</span>{" "}
            are required.
          </p>

          <Field label="Title" required>
            <input
              value={metadata.title}
              onChange={(event) =>
                setMetadata({ ...metadata, title: event.target.value })
              }
              className="border rounded w-full p-2 focus:outline-none"
              style={inputStyle}
              required
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

          {format === "pdf" && (
            <>
              <Field label="PDF profile">
                <select
                  value={pdfProfileId}
                  onChange={(event) => {
                    const profile = event.target.value as PdfProfileId;
                    setPdfProfileId(profile);
                    if (profile === "print_interior") {
                      setMasterPage(
                        setup.config.master_page ??
                          defaultMasterPageSelection(),
                      );
                    } else {
                      setMasterPage(defaultMasterPageSelection());
                    }
                  }}
                  className="border rounded w-full p-2"
                  style={inputStyle}
                >
                  <option value="proof_pdf">Proof PDF</option>
                  <option value="print_interior">Print Interior PDF</option>
                  <option value="large_print">Large Print PDF</option>
                  <option value="hardcover">Hardcover PDF</option>
                </select>
              </Field>
              {pdfProfileId === "print_interior" && (
                <>
                  <Field label="Master page">
                    <select
                      value={`${masterPage.template_id}@${masterPage.template_version}`}
                      onChange={(event) => {
                        const definition = setup.master_page_catalog.find(
                          (candidate) =>
                            `${candidate.id}@${candidate.version}` ===
                            event.target.value,
                        );
                        if (!definition) return;
                        setMasterPage({
                          template_id: definition.id,
                          template_version: definition.version,
                        });
                        if (definition.settings) {
                          setPrintInteriorSettings({
                            ...printInteriorSettings,
                            ...definition.settings,
                          });
                        }
                      }}
                      className="border rounded w-full p-2"
                      style={inputStyle}
                    >
                      {setup.master_page_catalog.map((definition) => (
                        <option
                          key={`${definition.id}@${definition.version}`}
                          value={`${definition.id}@${definition.version}`}
                        >
                          {definition.label} (v{definition.version})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <p
                    className="text-xs"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {
                      setup.master_page_catalog.find(
                        (definition) =>
                          definition.id === masterPage.template_id &&
                          definition.version === masterPage.template_version,
                      )?.description
                    }
                  </p>
                  <PrintInteriorFields
                    settings={printInteriorSettings}
                    onChange={(settings) => {
                      setPrintInteriorSettings(settings);
                      setMasterPage(defaultMasterPageSelection());
                    }}
                    errors={printSettingsErrors}
                  />
                </>
              )}
              {pdfProfileId === "large_print" && (
                <LargePrintFields
                  settings={largePrintSettings}
                  onChange={setLargePrintSettings}
                  errors={printSettingsErrors}
                />
              )}
              {pdfProfileId === "hardcover" && (
                <HardcoverFields
                  settings={hardcoverSettings}
                  onChange={setHardcoverSettings}
                  errors={printSettingsErrors}
                />
              )}
            </>
          )}

          {format === "docx" && (
            <>
              <Field label="DOCX profile">
                <select
                  value={docxProfileId}
                  onChange={(event) =>
                    setDocxProfileId(event.target.value as DocxProfileId)
                  }
                  className="border rounded w-full p-2"
                  style={inputStyle}
                >
                  <option value="standard_manuscript">
                    Standard Manuscript
                  </option>
                  <option value="clean_handoff">Clean Handoff</option>
                </select>
              </Field>
              <ContactFields metadata={metadata} onChange={setMetadata} />
            </>
          )}

          {format === "epub" && (
            <EbookFields
              metadata={metadata}
              onChange={setMetadata}
              onChooseCover={handleChooseCover}
            />
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
                (node) => outlineNodeRole(node, nodeOverrides) === "volume",
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
              <span
                className="block text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                Review inferred structure and exclusions
              </span>
            </span>
            <FiChevronDown
              style={{ transform: outlineOpen ? "rotate(180deg)" : undefined }}
            />
          </button>
          {outlineOpen && (
            <div
              className="rounded border p-2"
              style={{ borderColor: "var(--border-color)" }}
            >
              {displayedOutline.map((node) => (
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
              <span
                className="block text-xs"
                style={{ color: "var(--text-secondary)" }}
              >
                Confirmation and role overrides are saved with the project.
              </span>
            </span>
          </label>

          <details>
            <summary
              className="text-sm cursor-pointer"
              style={{ color: "var(--text-secondary)" }}
            >
              Front and back matter
            </summary>
            <div className="grid gap-3 mt-2">
              <MatterTemplateFields
                catalog={setup.matter_template_catalog}
                selections={matterTemplates}
                metadata={metadata}
                errors={templateErrors}
                onChange={setMatterTemplates}
              />
              <Field label="Front matter (optional)">
                <textarea
                  value={metadata.front_matter ?? ""}
                  onChange={(event) =>
                    setMetadata({
                      ...metadata,
                      front_matter: event.target.value,
                    })
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
                    setMetadata({
                      ...metadata,
                      back_matter: event.target.value,
                    })
                  }
                  rows={2}
                  className="border rounded w-full p-2 resize-y"
                  style={inputStyle}
                />
              </Field>
            </div>
          </details>
        </div>
      </details>

      <div className="flex items-center justify-between gap-4 mt-2">
        <div className="text-xs" aria-live="polite">
          <p
            id="publish-requirements"
            style={{
              color:
                publishBlockers.length > 0
                  ? "var(--btn-danger)"
                  : "var(--btn-success)",
            }}
          >
            {publishBlockers.length > 0
              ? `Complete before publishing: ${publishBlockers.join(", ")}.`
              : `Ready to publish ${profileSummary(
                  format,
                  pdfProfileId,
                  docxProfileId,
                ).toLowerCase()}.`}
          </p>
          {publishBlockers.length > 0 && !advancedOpen && (
            <button
              type="button"
              className="underline mt-1"
              style={{ color: "var(--btn-primary)" }}
              onClick={() => setAdvancedOpen(true)}
            >
              Open Advanced settings
            </button>
          )}
        </div>
        <div className="flex justify-end gap-4">
          <button
            onClick={onNavigateEditor}
            className="px-4 py-2 rounded border input-button"
            style={inputStyle}
          >
            Editor
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
            <span aria-hidden="true">🚀</span>
            Publish {format.toUpperCase()}
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

const saveButtonStyle = {
  borderColor: "var(--btn-success)",
  background: "var(--btn-success)",
  color: "var(--btn-text)",
};

const deleteButtonStyle = {
  borderColor: "var(--btn-danger)",
  background: "var(--btn-danger)",
  color: "var(--btn-text)",
};

function profileSummary(
  format: PublishFormat,
  pdfProfileId: PdfProfileId,
  docxProfileId: DocxProfileId,
): string {
  if (format === "pdf") {
    switch (pdfProfileId) {
      case "print_interior":
        return "Print Interior PDF";
      case "large_print":
        return "Large Print PDF";
      case "hardcover":
        return "Hardcover PDF";
      default:
        return "Proof PDF";
    }
  }
  if (format === "docx") {
    return docxProfileId === "clean_handoff"
      ? "Clean Handoff DOCX"
      : "Standard Manuscript DOCX";
  }
  return "Reflowable EPUB 3";
}

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
            {" "}
            *
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
      <span
        className="block text-xs"
        style={{ color: "var(--text-secondary)" }}
      >
        {description}
      </span>
    </button>
  );
}

function MatterTemplateFields({
  catalog,
  selections,
  metadata,
  errors,
  onChange,
}: {
  catalog: MatterTemplateDefinition[];
  selections: MatterTemplateSelection[];
  metadata: PublishingMetadata;
  errors: string[];
  onChange: (selections: MatterTemplateSelection[]) => void;
}) {
  const selectionFor = (definition: MatterTemplateDefinition) =>
    selections.find(
      (selection) =>
        selection.template_id === definition.id &&
        selection.template_version === definition.version,
    );
  const setEnabled = (
    definition: MatterTemplateDefinition,
    enabled: boolean,
  ) => {
    if (!enabled) {
      onChange(
        selections.filter(
          (selection) =>
            selection.template_id !== definition.id ||
            selection.template_version !== definition.version,
        ),
      );
      return;
    }
    const next = [
      ...selections,
      {
        template_id: definition.id,
        template_version: definition.version,
        variables: defaultMatterTemplateVariables(definition, metadata),
      },
    ];
    onChange(
      [...next].sort(
        (left, right) =>
          catalog.findIndex(
            (definition) =>
              definition.id === left.template_id &&
              definition.version === left.template_version,
          ) -
          catalog.findIndex(
            (definition) =>
              definition.id === right.template_id &&
              definition.version === right.template_version,
          ),
      ),
    );
  };
  const updateVariable = (
    selection: MatterTemplateSelection,
    key: string,
    value: string,
  ) => {
    onChange(
      selections.map((candidate) =>
        candidate.template_id === selection.template_id &&
        candidate.template_version === selection.template_version
          ? {
              ...candidate,
              variables: { ...candidate.variables, [key]: value },
            }
          : candidate,
      ),
    );
  };

  return (
    <fieldset
      className="rounded border p-3 grid gap-3"
      style={{ borderColor: "var(--border-color)" }}
    >
      <legend
        className="px-1 text-sm font-medium"
        style={{ color: "var(--text-secondary)" }}
      >
        Reusable matter templates
      </legend>
      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
        Built-in templates are versioned and saved with publishing workflows.
        Existing free-text matter below remains unchanged.
      </p>
      <div className="grid grid-cols-2 gap-3">
        {(["front", "back"] as const).map((placement) => (
          <div key={placement} className="grid gap-2 content-start">
            <h4 className="text-sm font-semibold">
              {placement === "front" ? "Front matter" : "Back matter"}
            </h4>
            {catalog
              .filter((definition) => definition.placement === placement)
              .map((definition) => {
                const selection = selectionFor(definition);
                return (
                  <div
                    key={`${definition.id}@${definition.version}`}
                    className="rounded border p-2"
                    style={{ borderColor: "var(--border-color)" }}
                  >
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={
                          definition.id === "title_page" || Boolean(selection)
                        }
                        disabled={definition.id === "title_page"}
                        onChange={(event) =>
                          setEnabled(definition, event.target.checked)
                        }
                      />
                      <span>
                        <span className="font-medium">
                          {definition.label} v{definition.version}
                          {definition.id === "title_page" ? " (required)" : ""}
                        </span>
                        <span
                          className="block text-xs"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {definition.description}
                        </span>
                      </span>
                    </label>
                    {selection && definition.variables.length > 0 && (
                      <div className="grid gap-2 mt-2 pl-6">
                        {definition.variables.map((variable) => (
                          <Field
                            key={variable.key}
                            label={variable.label}
                            required={variable.required}
                          >
                            {variable.multiline ? (
                              <textarea
                                rows={3}
                                value={selection.variables[variable.key] ?? ""}
                                onChange={(event) =>
                                  updateVariable(
                                    selection,
                                    variable.key,
                                    event.target.value,
                                  )
                                }
                                className="border rounded w-full p-2 resize-y"
                                style={inputStyle}
                              />
                            ) : (
                              <input
                                value={selection.variables[variable.key] ?? ""}
                                onChange={(event) =>
                                  updateVariable(
                                    selection,
                                    variable.key,
                                    event.target.value,
                                  )
                                }
                                className="border rounded w-full p-2"
                                style={inputStyle}
                              />
                            )}
                          </Field>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        ))}
      </div>
      {errors.length > 0 && (
        <ul
          className="text-xs list-disc pl-5"
          style={{ color: "var(--btn-danger)" }}
        >
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}

function PrintInteriorFields({
  settings,
  onChange,
  errors,
}: {
  settings: PrintInteriorPdfSettings;
  onChange: (settings: PrintInteriorPdfSettings) => void;
  errors: string[];
}) {
  type MarginKey =
    | "top_margin_inches"
    | "bottom_margin_inches"
    | "inside_margin_inches"
    | "outside_margin_inches"
    | "gutter_inches";
  const updateNumber = (key: MarginKey, value: string) => {
    onChange({ ...settings, [key]: Number(value) });
  };
  const marginFields: Array<{
    key: MarginKey;
    label: string;
    min: number;
  }> = [
    { key: "top_margin_inches", label: "Top", min: 0.25 },
    { key: "bottom_margin_inches", label: "Bottom", min: 0.25 },
    { key: "inside_margin_inches", label: "Inside", min: 0.25 },
    { key: "outside_margin_inches", label: "Outside", min: 0.25 },
    { key: "gutter_inches", label: "Gutter", min: 0 },
  ];

  return (
    <fieldset
      className="rounded border p-3 grid gap-3"
      style={{ borderColor: "var(--border-color)" }}
    >
      <legend
        className="px-1 text-sm font-medium"
        style={{ color: "var(--text-secondary)" }}
      >
        Print interior settings
      </legend>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Trim size">
          <select
            value={settings.trim_size}
            onChange={(event) =>
              onChange({
                ...settings,
                trim_size: event.target.value as PrintTrimSize,
              })
            }
            className="border rounded w-full p-2"
            style={inputStyle}
          >
            <option value="five_by_eight">5 × 8 in</option>
            <option value="five_point_two_five_by_eight">5.25 × 8 in</option>
            <option value="five_point_five_by_eight_point_five">
              5.5 × 8.5 in
            </option>
            <option value="six_by_nine">6 × 9 in</option>
          </select>
        </Field>
        <Field label="Chapter starts">
          <select
            value={settings.chapter_start}
            onChange={(event) =>
              onChange({
                ...settings,
                chapter_start: event.target
                  .value as PrintInteriorPdfSettings["chapter_start"],
              })
            }
            className="border rounded w-full p-2"
            style={inputStyle}
          >
            <option value="recto">Right-hand page (recto)</option>
            <option value="next_page">Next page</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {marginFields.map(({ key, label, min }) => (
          <Field key={key} label={`${label} (in)`}>
            <input
              type="number"
              value={settings[key]}
              min={min}
              max={key === "gutter_inches" ? 1 : 2}
              step={0.125}
              onChange={(event) => updateNumber(key, event.target.value)}
              className="border rounded w-full p-2"
              style={inputStyle}
            />
          </Field>
        ))}
      </div>
      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
        The gutter is added to the inside margin. These are provider-neutral
        settings and are not yet labeled KDP- or Ingram-ready.
      </p>
      {errors.length > 0 && (
        <ul
          className="text-xs list-disc pl-5"
          style={{ color: "var(--btn-danger)" }}
        >
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.running_headers}
            onChange={(event) =>
              onChange({
                ...settings,
                running_headers: event.target.checked,
              })
            }
          />
          Alternating running heads
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.front_matter_page_numbers}
            onChange={(event) =>
              onChange({
                ...settings,
                front_matter_page_numbers: event.target.checked,
              })
            }
          />
          Roman front-matter numbers
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.body_page_numbers}
            onChange={(event) =>
              onChange({
                ...settings,
                body_page_numbers: event.target.checked,
              })
            }
          />
          Body page numbers
        </label>
      </div>
    </fieldset>
  );
}

function LargePrintFields({
  settings,
  onChange,
  errors,
}: {
  settings: LargePrintPdfSettings;
  onChange: (settings: LargePrintPdfSettings) => void;
  errors: string[];
}) {
  type NumberKey = Exclude<
    keyof LargePrintPdfSettings,
    | "trim_size"
    | "running_headers"
    | "front_matter_page_numbers"
    | "body_page_numbers"
  >;
  const updateNumber = (key: NumberKey, value: string) =>
    onChange({ ...settings, [key]: Number(value) });
  const margins: Array<{ key: NumberKey; label: string; min: number }> = [
    { key: "top_margin_inches", label: "Top", min: 0.5 },
    { key: "bottom_margin_inches", label: "Bottom", min: 0.5 },
    { key: "inside_margin_inches", label: "Inside", min: 0.5 },
    { key: "outside_margin_inches", label: "Outside", min: 0.5 },
    { key: "gutter_inches", label: "Gutter", min: 0 },
  ];

  return (
    <fieldset
      className="rounded border p-3 grid gap-3"
      style={{ borderColor: "var(--border-color)" }}
    >
      <legend
        className="px-1 text-sm font-medium"
        style={{ color: "var(--text-secondary)" }}
      >
        Large Print settings
      </legend>
      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
        Provider-neutral controls use a deterministic proportional-type estimate
        to cap line length. They do not claim compliance with a specific
        printer.
      </p>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Trim size">
          <select
            value={settings.trim_size}
            onChange={(event) =>
              onChange({
                ...settings,
                trim_size: event.target.value as LargePrintTrimSize,
              })
            }
            className="border rounded w-full p-2"
            style={inputStyle}
          >
            <option value="six_by_nine">6 × 9 in</option>
            <option value="seven_by_ten">7 × 10 in</option>
            <option value="eight_by_ten">8 × 10 in</option>
          </select>
        </Field>
        <Field label="Body type (pt)">
          <input
            type="number"
            value={settings.base_font_size_points}
            min={14}
            max={24}
            step={0.5}
            onChange={(event) =>
              updateNumber("base_font_size_points", event.target.value)
            }
            className="border rounded w-full p-2"
            style={inputStyle}
          />
        </Field>
        <Field label="Line spacing">
          <input
            type="number"
            value={settings.line_spacing}
            min={1.2}
            max={2}
            step={0.05}
            onChange={(event) =>
              updateNumber("line_spacing", event.target.value)
            }
            className="border rounded w-full p-2"
            style={inputStyle}
          />
        </Field>
        <Field label="Maximum line length">
          <input
            type="number"
            value={settings.max_line_length_characters}
            min={35}
            max={65}
            step={1}
            onChange={(event) =>
              updateNumber("max_line_length_characters", event.target.value)
            }
            className="border rounded w-full p-2"
            style={inputStyle}
          />
        </Field>
        <Field label="Heading scale">
          <input
            type="number"
            value={settings.heading_scale}
            min={1.2}
            max={2}
            step={0.05}
            onChange={(event) =>
              updateNumber("heading_scale", event.target.value)
            }
            className="border rounded w-full p-2"
            style={inputStyle}
          />
        </Field>
        <Field label="Paragraph after (pt)">
          <input
            type="number"
            value={settings.paragraph_spacing_points}
            min={0}
            max={18}
            step={1}
            onChange={(event) =>
              updateNumber("paragraph_spacing_points", event.target.value)
            }
            className="border rounded w-full p-2"
            style={inputStyle}
          />
        </Field>
        <Field label="Header/folio type (pt)">
          <input
            type="number"
            value={settings.page_furniture_size_points}
            min={10}
            max={18}
            step={0.5}
            onChange={(event) =>
              updateNumber("page_furniture_size_points", event.target.value)
            }
            className="border rounded w-full p-2"
            style={inputStyle}
          />
        </Field>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {margins.map(({ key, label, min }) => (
          <Field key={key} label={`${label} (in)`}>
            <input
              type="number"
              value={settings[key] as number}
              min={min}
              max={key === "gutter_inches" ? 1 : 2}
              step={0.125}
              onChange={(event) => updateNumber(key, event.target.value)}
              className="border rounded w-full p-2"
              style={inputStyle}
            />
          </Field>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {[
          ["running_headers", "Running headers"],
          ["front_matter_page_numbers", "Roman front-matter folios"],
          ["body_page_numbers", "Arabic body folios"],
        ].map(([key, label]) => (
          <label key={key} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings[key as keyof LargePrintPdfSettings] as boolean}
              onChange={(event) =>
                onChange({ ...settings, [key]: event.target.checked })
              }
            />
            {label}
          </label>
        ))}
      </div>
      <PdfSettingsErrors errors={errors} />
    </fieldset>
  );
}

function HardcoverFields({
  settings,
  onChange,
  errors,
}: {
  settings: HardcoverPdfSettings;
  onChange: (settings: HardcoverPdfSettings) => void;
  errors: string[];
}) {
  type MarginKey =
    | "top_margin_inches"
    | "bottom_margin_inches"
    | "inside_margin_inches"
    | "outside_margin_inches"
    | "gutter_inches";
  const margins: Array<{ key: MarginKey; label: string; min: number }> = [
    { key: "top_margin_inches", label: "Top", min: 0.625 },
    { key: "bottom_margin_inches", label: "Bottom", min: 0.625 },
    { key: "inside_margin_inches", label: "Inside", min: 0.625 },
    { key: "outside_margin_inches", label: "Outside", min: 0.5 },
    { key: "gutter_inches", label: "Gutter", min: 0.125 },
  ];

  return (
    <fieldset
      className="rounded border p-3 grid gap-3"
      style={{ borderColor: "var(--border-color)" }}
    >
      <legend
        className="px-1 text-sm font-medium"
        style={{ color: "var(--text-secondary)" }}
      >
        Hardcover settings
      </legend>
      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
        The binding gutter is added to the inside margin. Hardcover minimums are
        provider-neutral and intentionally stricter than general interiors.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Trim size">
          <select
            value={settings.trim_size}
            onChange={(event) =>
              onChange({
                ...settings,
                trim_size: event.target.value as HardcoverTrimSize,
              })
            }
            className="border rounded w-full p-2"
            style={inputStyle}
          >
            <option value="five_point_five_by_eight_point_five">
              5.5 × 8.5 in
            </option>
            <option value="six_by_nine">6 × 9 in</option>
            <option value="seven_by_ten">7 × 10 in</option>
          </select>
        </Field>
        <Field label="Chapter starts">
          <select
            value={settings.chapter_start}
            onChange={(event) => {
              const chapterStart = event.target
                .value as HardcoverPdfSettings["chapter_start"];
              onChange({
                ...settings,
                chapter_start: chapterStart,
                intentional_blank_pages: chapterStart === "recto",
              });
            }}
            className="border rounded w-full p-2"
            style={inputStyle}
          >
            <option value="recto">Right-hand page (recto)</option>
            <option value="next_page">Next page</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {margins.map(({ key, label, min }) => (
          <Field key={key} label={`${label} (in)`}>
            <input
              type="number"
              value={settings[key]}
              min={min}
              max={key === "gutter_inches" ? 1 : 2}
              step={0.125}
              onChange={(event) =>
                onChange({ ...settings, [key]: Number(event.target.value) })
              }
              className="border rounded w-full p-2"
              style={inputStyle}
            />
          </Field>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.intentional_blank_pages}
            disabled={settings.chapter_start !== "recto"}
            onChange={(event) =>
              onChange({
                ...settings,
                intentional_blank_pages: event.target.checked,
              })
            }
          />
          Intentional blank versos for recto starts
        </label>
        {[
          ["running_headers", "Running headers"],
          ["front_matter_page_numbers", "Roman front-matter folios"],
          ["body_page_numbers", "Arabic body folios"],
        ].map(([key, label]) => (
          <label key={key} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings[key as keyof HardcoverPdfSettings] as boolean}
              onChange={(event) =>
                onChange({ ...settings, [key]: event.target.checked })
              }
            />
            {label}
          </label>
        ))}
      </div>
      <PdfSettingsErrors errors={errors} />
    </fieldset>
  );
}

function PdfSettingsErrors({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <ul
      className="text-xs list-disc pl-5"
      style={{ color: "var(--btn-danger)" }}
    >
      {errors.map((error) => (
        <li key={error}>{error}</li>
      ))}
    </ul>
  );
}

function ContactFields({
  metadata,
  onChange,
}: {
  metadata: PublishingMetadata;
  onChange: (metadata: PublishingMetadata) => void;
}) {
  const update = (key: keyof PublishingMetadata["contact"], value: string) => {
    onChange({
      ...metadata,
      contact: { ...metadata.contact, [key]: value },
    });
  };
  return (
    <details>
      <summary
        className="text-sm cursor-pointer"
        style={{ color: "var(--text-secondary)" }}
      >
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

function EbookFields({
  metadata,
  onChange,
  onChooseCover,
}: {
  metadata: PublishingMetadata;
  onChange: (metadata: PublishingMetadata) => void;
  onChooseCover: () => Promise<void>;
}) {
  const update = (
    key: keyof Omit<
      PublishingMetadata["ebook"],
      "cover" | "include_front_matter" | "include_back_matter"
    >,
    value: string,
  ) => {
    onChange({
      ...metadata,
      ebook: {
        ...metadata.ebook,
        [key]: value || undefined,
      },
    });
  };
  const cover = metadata.ebook.cover;
  return (
    <div
      className="rounded border p-3 grid gap-3"
      style={{ borderColor: "var(--border-color)" }}
    >
      <p className="text-sm font-medium">EPUB metadata</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Language (BCP 47)" required>
          <input
            value={metadata.language ?? ""}
            onChange={(event) =>
              onChange({ ...metadata, language: event.target.value })
            }
            placeholder="en-US"
            className="border rounded w-full p-2"
            style={inputStyle}
            required
          />
        </Field>
        <Field label="Publication identifier (optional)">
          <input
            value={metadata.ebook.identifier ?? ""}
            onChange={(event) => update("identifier", event.target.value)}
            placeholder="ISBN or other persistent ID"
            className="border rounded w-full p-2"
            style={inputStyle}
          />
        </Field>
        <Field label="Publisher (optional)">
          <input
            value={metadata.ebook.publisher ?? ""}
            onChange={(event) => update("publisher", event.target.value)}
            className="border rounded w-full p-2"
            style={inputStyle}
          />
        </Field>
        <Field label="Reading direction">
          <select
            value={metadata.ebook.page_progression_direction ?? ""}
            onChange={(event) =>
              update("page_progression_direction", event.target.value)
            }
            className="border rounded w-full p-2"
            style={inputStyle}
          >
            <option value="">Reader default</option>
            <option value="left_to_right">Left to right</option>
            <option value="right_to_left">Right to left</option>
          </select>
        </Field>
      </div>
      <Field label="Description (optional)">
        <textarea
          value={metadata.ebook.description ?? ""}
          onChange={(event) => update("description", event.target.value)}
          rows={2}
          className="border rounded w-full p-2 resize-y"
          style={inputStyle}
        />
      </Field>
      <Field label="Rights statement (optional)">
        <input
          value={metadata.ebook.rights ?? ""}
          onChange={(event) => update("rights", event.target.value)}
          className="border rounded w-full p-2"
          style={inputStyle}
        />
      </Field>
      <div>
        <p
          className="text-sm font-medium mb-1"
          style={{ color: "var(--text-secondary)" }}
        >
          Ebook cover{" "}
          <span aria-hidden="true" style={{ color: "var(--btn-danger)" }}>
            *
          </span>
        </p>
        <div className="grid grid-cols-[auto_1fr] items-center gap-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void onChooseCover()}
              className="px-3 py-2 rounded border input-button"
              style={{ borderColor: "var(--border-color)" }}
            >
              {cover ? "Change cover" : "Choose cover"}
            </button>
            {cover && (
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...metadata,
                    ebook: { ...metadata.ebook, cover: undefined },
                  })
                }
                className="publish-delete-button px-3 py-2 rounded border input-button"
                style={deleteButtonStyle}
              >
                Remove
              </button>
            )}
          </div>
          <span
            className="text-xs truncate"
            style={{ color: "var(--text-secondary)" }}
          >
            {cover ? displayFilename(cover.source) : "No cover selected"}
          </span>
        </div>
      </div>
      {cover && (
        <Field label="Cover alt text" required>
          <input
            value={cover.alt_text}
            onChange={(event) =>
              onChange({
                ...metadata,
                ebook: {
                  ...metadata.ebook,
                  cover: { ...cover, alt_text: event.target.value },
                },
              })
            }
            placeholder="Describe the visible cover"
            className="border rounded w-full p-2"
            style={inputStyle}
            required
          />
        </Field>
      )}
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={metadata.ebook.include_front_matter}
            onChange={(event) =>
              onChange({
                ...metadata,
                ebook: {
                  ...metadata.ebook,
                  include_front_matter: event.target.checked,
                },
              })
            }
          />
          Include front matter in EPUB
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={metadata.ebook.include_back_matter}
            onChange={(event) =>
              onChange({
                ...metadata,
                ebook: {
                  ...metadata.ebook,
                  include_back_matter: event.target.checked,
                },
              })
            }
          />
          Include back matter in EPUB
        </label>
      </div>
    </div>
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
        <span className="text-sm truncate">
          {node.title || formatRole(node.role)}
        </span>
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
  const grouped = diagnosticsBySeverity(diagnostics);
  const groups = [
    {
      severity: "error" as const,
      label: "Blocking errors",
      color: "var(--btn-danger)",
    },
    {
      severity: "warning" as const,
      label: "Warnings",
      color: "var(--accent)",
    },
    {
      severity: "info" as const,
      label: "Information",
      color: "var(--text-secondary)",
    },
  ];
  return (
    <div className="grid gap-3">
      {groups.map(({ severity, label, color }) => {
        const items = grouped[severity];
        if (items.length === 0) return null;
        return (
          <section
            key={severity}
            className="rounded border p-3"
            style={{ borderColor: color }}
          >
            <h3 className="text-sm font-semibold mb-1" style={{ color }}>
              {label} ({items.length})
            </h3>
            <ul className="text-sm space-y-2">
              {items.map((diagnostic, index) => (
                <li key={`${diagnostic.code}-${index}`}>
                  <strong>{diagnostic.code}:</strong> {diagnostic.message}
                  {diagnostic.node_id !== undefined && (
                    <span> (node {diagnostic.node_id})</span>
                  )}
                  {diagnostic.remediation && (
                    <span
                      className="block text-xs"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {diagnostic.remediation}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export default PublishingPage;

function flattenOutline(
  nodes: PublishingOutlineNode[],
): PublishingOutlineNode[] {
  return nodes.flatMap((node) => [node, ...flattenOutline(node.children)]);
}

function outlineWithMatterTemplates(
  outline: PublishingOutlineNode[],
  catalog: MatterTemplateDefinition[],
  selections: MatterTemplateSelection[],
): PublishingOutlineNode[] {
  const generatedTitles = new Set(
    catalog.map((definition) => definition.output_title),
  );
  const base = outline.filter(
    (node) =>
      !(node.id === null && node.title && generatedTitles.has(node.title)),
  );
  const generated = selections.flatMap((selection) => {
    const definition = catalog.find(
      (candidate) =>
        candidate.id === selection.template_id &&
        candidate.version === selection.template_version,
    );
    return definition
      ? [
          {
            id: null,
            title: definition.output_title,
            role:
              definition.placement === "front"
                ? ("front_matter" as const)
                : ("back_matter" as const),
            inclusion: { type: "all_formats" as const },
            children: [],
          },
        ]
      : [];
  });
  const front = generated.filter((node) => node.role === "front_matter");
  const back = generated.filter((node) => node.role === "back_matter");
  const existingFront = base.filter((node) => node.role === "front_matter");
  const existingBack = base.filter((node) => node.role === "back_matter");
  const body = base.filter(
    (node) => node.role !== "front_matter" && node.role !== "back_matter",
  );
  return [...front, ...existingFront, ...body, ...existingBack, ...back];
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
    ebook: {
      ...metadata.ebook,
      identifier: metadata.ebook.identifier?.trim() || undefined,
      publisher: metadata.ebook.publisher?.trim() || undefined,
      description: metadata.ebook.description?.trim() || undefined,
      rights: metadata.ebook.rights?.trim() || undefined,
      cover: metadata.ebook.cover
        ? {
            source: metadata.ebook.cover.source.trim(),
            alt_text: metadata.ebook.cover.alt_text.trim(),
          }
        : undefined,
    },
  };
}

function displayFilename(path: string): string {
  return path.split(/[\\/]/).pop() || path;
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
