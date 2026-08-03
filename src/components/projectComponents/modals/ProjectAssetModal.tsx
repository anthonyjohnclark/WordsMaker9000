import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useModal } from "../../../contexts/global/ModalContext";
import {
  ImagePresentation,
  ProjectAsset,
  ProjectImageValue,
} from "../../../types/ProjectAssetTypes";
import {
  importProjectAsset,
  listProjectAssets,
  removeProjectAsset,
  replaceProjectAsset,
} from "../../../utils/projectAssets";

interface ProjectAssetModalProps {
  projectName: string;
  flushCurrentDocument: () => Promise<void>;
  onInsert: (value: ProjectImageValue) => void;
}

const IMAGE_FILTERS = [
  { name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "svg"] },
];

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const ProjectAssetModal = ({
  projectName,
  flushCurrentDocument,
  onInsert,
}: ProjectAssetModalProps) => {
  const modal = useModal();
  const [assets, setAssets] = useState<ProjectAsset[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [alt, setAlt] = useState("");
  const [caption, setCaption] = useState("");
  const [decorative, setDecorative] = useState(false);
  const [presentation, setPresentation] =
    useState<ImagePresentation>("block");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = assets.find((asset) => asset.id === selectedId) ?? null;

  useEffect(() => {
    let active = true;
    setBusy(true);
    listProjectAssets(projectName)
      .then((loaded) => {
        if (!active) return;
        setAssets(loaded);
        setSelectedId((current) => current || loaded[0]?.id || "");
      })
      .catch((cause) => active && setError(errorMessage(cause)))
      .finally(() => active && setBusy(false));
    return () => {
      active = false;
    };
  }, [projectName]);

  const chooseFile = async (): Promise<string | null> => {
    const selection = await open({ multiple: false, directory: false, filters: IMAGE_FILTERS });
    return typeof selection === "string" ? selection : null;
  };

  const importAsset = async () => {
    const sourcePath = await chooseFile();
    if (!sourcePath) return;
    setBusy(true);
    setError(null);
    try {
      const imported = await importProjectAsset(projectName, sourcePath);
      setAssets((current) => [
        ...current.filter((asset) => asset.id !== imported.id),
        imported,
      ]);
      setSelectedId(imported.id);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const replaceAsset = async () => {
    if (!selected) return;
    const sourcePath = await chooseFile();
    if (!sourcePath) return;
    setBusy(true);
    setError(null);
    try {
      const replaced = await replaceProjectAsset(
        projectName,
        selected.id,
        sourcePath,
      );
      setAssets((current) =>
        current.map((asset) => (asset.id === replaced.id ? replaced : asset)),
      );
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const removeAsset = async () => {
    if (!selected || !window.confirm(`Remove ${selected.display_name}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await flushCurrentDocument();
      await removeProjectAsset(projectName, selected.id);
      const remaining = assets.filter((asset) => asset.id !== selected.id);
      setAssets(remaining);
      setSelectedId(remaining[0]?.id ?? "");
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const insert = () => {
    if (!selected) return;
    if (!decorative && !alt.trim()) {
      setError("Alternative text is required unless the image is decorative.");
      return;
    }
    onInsert({
      assetId: selected.id,
      alt: decorative ? "" : alt.trim(),
      caption: caption.trim(),
      decorative,
      presentation,
    });
    modal.handleClose();
  };

  const buttonStyle = {
    border: "1px solid var(--border-color)",
    color: "var(--text-primary)",
  };

  return (
    <div className="min-w-[42rem] max-w-[70vw]" style={{ color: "var(--text-primary)" }}>
      <div className="flex items-center justify-between gap-4 mb-4">
        <div>
          <h2 className="text-xl font-bold">Project images</h2>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Images are copied into this project and referenced by a stable asset ID.
          </p>
        </div>
        <button className="rounded px-3 py-2" style={buttonStyle} onClick={importAsset} disabled={busy}>
          Import image
        </button>
      </div>

      {error && (
        <div className="rounded p-3 mb-3 text-sm" role="alert" style={{ border: "1px solid var(--error, #b91c1c)" }}>
          {error}
        </div>
      )}

      <div className="grid grid-cols-[minmax(15rem,1fr)_minmax(20rem,1.4fr)] gap-5">
        <div>
          <label className="block text-sm font-semibold mb-1" htmlFor="project-image-list">
            Project asset
          </label>
          <select
            id="project-image-list"
            className="w-full rounded p-2 min-h-10"
            style={{ background: "var(--input-bg)", border: "1px solid var(--border-color)" }}
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            disabled={busy || assets.length === 0}
          >
            {assets.length === 0 && <option value="">No images imported</option>}
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>{asset.display_name}</option>
            ))}
          </select>
          {selected && (
            <div className="mt-2 text-xs space-y-1" style={{ color: "var(--text-muted)" }}>
              <p>{selected.media_type} · {selected.width_px ?? "vector"} × {selected.height_px ?? "vector"}</p>
              <p className="break-all">ID: {selected.id}</p>
              <div className="flex gap-2 pt-2">
                <button className="rounded px-2 py-1" style={buttonStyle} onClick={replaceAsset} disabled={busy}>Replace/relink</button>
                <button className="rounded px-2 py-1" style={buttonStyle} onClick={removeAsset} disabled={busy}>Remove</button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={decorative} onChange={(event) => setDecorative(event.target.checked)} />
            Decorative image (screen readers may ignore it)
          </label>
          <div>
            <label className="block text-sm font-semibold mb-1" htmlFor="project-image-alt">
              Alternative text {!decorative && <span aria-hidden="true">*</span>}
            </label>
            <textarea
              id="project-image-alt"
              className="w-full rounded p-2"
              style={{ background: "var(--input-bg)", border: "1px solid var(--border-color)" }}
              value={alt}
              onChange={(event) => setAlt(event.target.value)}
              disabled={decorative}
              required={!decorative}
              rows={2}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1" htmlFor="project-image-caption">Visible caption (optional)</label>
            <input
              id="project-image-caption"
              className="w-full rounded p-2"
              style={{ background: "var(--input-bg)", border: "1px solid var(--border-color)" }}
              value={caption}
              onChange={(event) => setCaption(event.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1" htmlFor="project-image-presentation">Placement</label>
            <select
              id="project-image-presentation"
              className="w-full rounded p-2"
              style={{ background: "var(--input-bg)", border: "1px solid var(--border-color)" }}
              value={presentation}
              onChange={(event) => setPresentation(event.target.value as ImagePresentation)}
            >
              <option value="block">Block</option>
              <option value="full_width">Full width</option>
            </select>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-5">
        <button className="rounded px-4 py-2" style={buttonStyle} onClick={modal.handleClose}>Cancel</button>
        <button
          className="rounded px-4 py-2 font-semibold"
          style={{ background: "var(--accent)", color: "var(--btn-text)", border: "1px solid var(--accent)" }}
          onClick={insert}
          disabled={busy || !selected}
        >
          Insert image
        </button>
      </div>
    </div>
  );
};

export default ProjectAssetModal;
