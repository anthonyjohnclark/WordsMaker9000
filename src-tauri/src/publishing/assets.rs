use std::collections::HashSet;
use std::fs;
use std::io::{Cursor, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use image::ImageReader;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

use super::model::{AssetId, AssetKind, AssetSource, BookAsset};
use super::source::project_root;

const ASSET_SCHEMA_VERSION: u32 = 1;
const ASSET_REGISTRY_FILENAME: &str = "assets.json";
const ASSET_DIRECTORY: &str = "assets";
pub(crate) const MAX_ASSET_BYTES: u64 = 25 * 1024 * 1024;

static ASSET_REGISTRY_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct ProjectAssetRegistry {
    pub schema_version: u32,
    pub assets: Vec<ProjectAsset>,
}

impl Default for ProjectAssetRegistry {
    fn default() -> Self {
        Self {
            schema_version: ASSET_SCHEMA_VERSION,
            assets: vec![],
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct ProjectAsset {
    pub id: String,
    pub display_name: String,
    pub relative_path: String,
    pub media_type: String,
    pub byte_size: u64,
    pub width_px: Option<u32>,
    pub height_px: Option<u32>,
    pub sha256: String,
}

#[derive(Debug)]
struct ValidatedImage {
    bytes: Vec<u8>,
    display_name: String,
    media_type: &'static str,
    extension: &'static str,
    width_px: Option<u32>,
    height_px: Option<u32>,
    sha256: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct InspectedImage {
    pub media_type: String,
    pub byte_size: u64,
    pub width_px: Option<u32>,
    pub height_px: Option<u32>,
}

#[tauri::command]
pub(crate) async fn list_project_assets(
    app: AppHandle,
    project_name: String,
) -> Result<Vec<ProjectAsset>, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data: {error}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        let root = project_root(&app_data, &project_name)?;
        Ok(load_or_default(&root)?.assets)
    })
    .await
    .map_err(|error| format!("Asset listing task failed: {error}"))?
}

#[tauri::command]
pub(crate) async fn import_project_asset(
    app: AppHandle,
    project_name: String,
    source_path: String,
) -> Result<ProjectAsset, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data: {error}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        let root = project_root(&app_data, &project_name)?;
        import_asset(&root, Path::new(&source_path))
    })
    .await
    .map_err(|error| format!("Asset import task failed: {error}"))?
}

#[tauri::command]
pub(crate) async fn replace_project_asset(
    app: AppHandle,
    project_name: String,
    asset_id: String,
    source_path: String,
) -> Result<ProjectAsset, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data: {error}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        let root = project_root(&app_data, &project_name)?;
        replace_asset(&root, &asset_id, Path::new(&source_path))
    })
    .await
    .map_err(|error| format!("Asset replacement task failed: {error}"))?
}

#[tauri::command]
pub(crate) async fn remove_project_asset(
    app: AppHandle,
    project_name: String,
    asset_id: String,
) -> Result<(), String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data: {error}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        let root = project_root(&app_data, &project_name)?;
        remove_asset(&root, &asset_id)
    })
    .await
    .map_err(|error| format!("Asset removal task failed: {error}"))?
}

#[tauri::command]
pub(crate) async fn cleanup_project_assets(
    app: AppHandle,
    project_name: String,
) -> Result<Vec<String>, String> {
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("Failed to resolve app data: {error}"))?;
    tauri::async_runtime::spawn_blocking(move || {
        let root = project_root(&app_data, &project_name)?;
        cleanup_orphan_files(&root)
    })
    .await
    .map_err(|error| format!("Asset cleanup task failed: {error}"))?
}

pub(crate) fn load_or_default(project_root: &Path) -> Result<ProjectAssetRegistry, String> {
    let path = registry_path(project_root);
    if !path.exists() {
        return Ok(ProjectAssetRegistry::default());
    }
    let content = fs::read_to_string(&path)
        .map_err(|error| format!("Failed to read {}: {error}", path.display()))?;
    let registry: ProjectAssetRegistry = serde_json::from_str(&content)
        .map_err(|error| format!("Invalid project asset registry: {error}"))?;
    validate_registry(&registry)?;
    Ok(registry)
}

pub(crate) fn as_book_assets(registry: &ProjectAssetRegistry) -> Vec<BookAsset> {
    registry
        .assets
        .iter()
        .map(|asset| BookAsset {
            id: AssetId(asset.id.clone()),
            kind: AssetKind::Image,
            media_type: asset.media_type.clone(),
            source: AssetSource::ProjectRelativePath {
                path: asset.relative_path.clone(),
            },
        })
        .collect()
}

pub(crate) fn inspect_project_asset(path: &Path) -> Result<InspectedImage, String> {
    let image = validate_image(path)?;
    Ok(InspectedImage {
        media_type: image.media_type.to_string(),
        byte_size: image.bytes.len() as u64,
        width_px: image.width_px,
        height_px: image.height_px,
    })
}

fn import_asset(project_root: &Path, source_path: &Path) -> Result<ProjectAsset, String> {
    let _guard = registry_lock()?;
    let image = validate_image(source_path)?;
    let mut registry = load_or_default(project_root)?;
    if let Some(existing) = registry
        .assets
        .iter()
        .find(|asset| asset.sha256 == image.sha256)
    {
        return Ok(existing.clone());
    }

    let relative_path = store_image(project_root, &image)?;
    let asset = ProjectAsset {
        id: format!("asset-{}", uuid::Uuid::new_v4()),
        display_name: image.display_name,
        relative_path,
        media_type: image.media_type.to_string(),
        byte_size: image.bytes.len() as u64,
        width_px: image.width_px,
        height_px: image.height_px,
        sha256: image.sha256,
    };
    registry.assets.push(asset.clone());
    save_atomic(project_root, &registry)?;
    Ok(asset)
}

fn replace_asset(
    project_root: &Path,
    asset_id: &str,
    source_path: &Path,
) -> Result<ProjectAsset, String> {
    let _guard = registry_lock()?;
    validate_asset_id(asset_id)?;
    let image = validate_image(source_path)?;
    let mut registry = load_or_default(project_root)?;
    let index = registry
        .assets
        .iter()
        .position(|asset| asset.id == asset_id)
        .ok_or_else(|| format!("Project asset {asset_id:?} does not exist."))?;
    let old_path = registry.assets[index].relative_path.clone();
    let relative_path = store_image(project_root, &image)?;
    registry.assets[index] = ProjectAsset {
        id: asset_id.to_string(),
        display_name: image.display_name,
        relative_path,
        media_type: image.media_type.to_string(),
        byte_size: image.bytes.len() as u64,
        width_px: image.width_px,
        height_px: image.height_px,
        sha256: image.sha256,
    };
    let replaced = registry.assets[index].clone();
    save_atomic(project_root, &registry)?;
    remove_unregistered_path(project_root, &old_path, &registry)?;
    Ok(replaced)
}

fn remove_asset(project_root: &Path, asset_id: &str) -> Result<(), String> {
    let _guard = registry_lock()?;
    validate_asset_id(asset_id)?;
    let references = referenced_source_files(project_root, asset_id)?;
    if !references.is_empty() {
        return Err(format!(
            "Project asset {asset_id:?} is still referenced by: {}. Remove those image blocks first.",
            references.join(", ")
        ));
    }

    let mut registry = load_or_default(project_root)?;
    let index = registry
        .assets
        .iter()
        .position(|asset| asset.id == asset_id)
        .ok_or_else(|| format!("Project asset {asset_id:?} does not exist."))?;
    let removed = registry.assets.remove(index);
    save_atomic(project_root, &registry)?;
    remove_unregistered_path(project_root, &removed.relative_path, &registry)
}

fn cleanup_orphan_files(project_root: &Path) -> Result<Vec<String>, String> {
    let _guard = registry_lock()?;
    let registry = load_or_default(project_root)?;
    let registered = registry
        .assets
        .iter()
        .map(|asset| asset.relative_path.replace('\\', "/"))
        .collect::<HashSet<_>>();
    let directory = project_root.join(ASSET_DIRECTORY);
    if !directory.exists() {
        return Ok(vec![]);
    }

    let mut removed = Vec::new();
    for entry in fs::read_dir(&directory)
        .map_err(|error| format!("Failed to inspect {}: {error}", directory.display()))?
    {
        let entry = entry.map_err(|error| format!("Failed to inspect project assets: {error}"))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let relative = project_relative(project_root, &path)?;
        if !registered.contains(&relative) {
            fs::remove_file(&path)
                .map_err(|error| format!("Failed to remove orphan {}: {error}", path.display()))?;
            removed.push(relative);
        }
    }
    removed.sort();
    Ok(removed)
}

fn registry_lock() -> Result<std::sync::MutexGuard<'static, ()>, String> {
    ASSET_REGISTRY_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| "Project asset registry lock is poisoned.".to_string())
}

fn registry_path(project_root: &Path) -> PathBuf {
    project_root.join(ASSET_REGISTRY_FILENAME)
}

fn validate_registry(registry: &ProjectAssetRegistry) -> Result<(), String> {
    if registry.schema_version != ASSET_SCHEMA_VERSION {
        return Err(format!(
            "Unsupported project asset schema version {}; expected {}.",
            registry.schema_version, ASSET_SCHEMA_VERSION
        ));
    }
    let mut ids = HashSet::new();
    for asset in &registry.assets {
        validate_asset_id(&asset.id)?;
        validate_relative_asset_path(&asset.relative_path)?;
        if !ids.insert(&asset.id) {
            return Err(format!("Duplicate project asset ID {:?}.", asset.id));
        }
        if asset.sha256.len() != 64 || !asset.sha256.chars().all(|value| value.is_ascii_hexdigit())
        {
            return Err(format!(
                "Project asset {:?} has an invalid SHA-256.",
                asset.id
            ));
        }
        if asset.byte_size == 0 || asset.byte_size > MAX_ASSET_BYTES {
            return Err(format!(
                "Project asset {:?} has an invalid byte size.",
                asset.id
            ));
        }
    }
    Ok(())
}

fn validate_asset_id(asset_id: &str) -> Result<(), String> {
    if asset_id.is_empty()
        || asset_id.len() > 100
        || !asset_id
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || matches!(value, '-' | '_'))
    {
        Err(format!("Invalid project asset ID {asset_id:?}."))
    } else {
        Ok(())
    }
}

fn validate_relative_asset_path(value: &str) -> Result<(), String> {
    let path = Path::new(value);
    let mut components = path.components();
    let first = components.next();
    let valid_first = matches!(first, Some(Component::Normal(name)) if name == ASSET_DIRECTORY);
    let remaining = components.collect::<Vec<_>>();
    let valid_remaining =
        remaining.len() == 1 && matches!(remaining[0], Component::Normal(_)) && !path.is_absolute();
    if valid_first && valid_remaining {
        Ok(())
    } else {
        Err(format!(
            "Invalid project-relative asset path {value:?}; expected assets/<file>."
        ))
    }
}

fn validate_image(path: &Path) -> Result<ValidatedImage, String> {
    if !path.is_file() {
        return Err(format!("Image source {} does not exist.", path.display()));
    }
    let display_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "Image source has no valid filename.".to_string())?
        .to_string();
    let metadata = fs::metadata(path)
        .map_err(|error| format!("Failed to inspect {}: {error}", path.display()))?;
    if metadata.len() == 0 {
        return Err("Image files cannot be empty.".to_string());
    }
    if metadata.len() > MAX_ASSET_BYTES {
        return Err(format!(
            "Image {:?} is larger than the 25 MiB project asset limit.",
            display_name
        ));
    }
    let bytes =
        fs::read(path).map_err(|error| format!("Failed to read {}: {error}", path.display()))?;
    let (media_type, extension, width_px, height_px) = detect_image(&bytes)?;
    validate_source_extension(path, media_type)?;
    let sha256 = format!("{:x}", Sha256::digest(&bytes));
    Ok(ValidatedImage {
        bytes,
        display_name,
        media_type,
        extension,
        width_px,
        height_px,
        sha256,
    })
}

fn detect_image(
    bytes: &[u8],
) -> Result<(&'static str, &'static str, Option<u32>, Option<u32>), String> {
    if let Some((media_type, extension)) = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some(("image/png", "png"))
    } else if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        Some(("image/jpeg", "jpg"))
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some(("image/gif", "gif"))
    } else {
        None
    } {
        let reader = ImageReader::new(Cursor::new(bytes))
            .with_guessed_format()
            .map_err(|error| format!("Failed to detect image format: {error}"))?;
        let (width, height) = reader
            .into_dimensions()
            .map_err(|error| format!("Failed to read image dimensions: {error}"))?;
        if width == 0 || height == 0 {
            return Err("Images must have non-zero dimensions.".to_string());
        }
        return Ok((media_type, extension, Some(width), Some(height)));
    }

    let text = std::str::from_utf8(bytes)
        .map_err(|_| "Unsupported image type; use PNG, JPEG, GIF, or SVG.".to_string())?;
    let compact = text.trim_start_matches('\u{feff}').trim_start();
    let lowercase = compact.to_ascii_lowercase();
    let svg_start = lowercase.starts_with("<svg")
        || (lowercase.starts_with("<?xml") && lowercase.contains("<svg"));
    if !svg_start || !lowercase.contains("</svg>") {
        return Err("Unsupported image type; use PNG, JPEG, GIF, or SVG.".to_string());
    }
    if lowercase.contains("<script")
        || lowercase.contains("javascript:")
        || lowercase.contains("<foreignobject")
        || lowercase.contains("href=\"http:")
        || lowercase.contains("href=\"https:")
        || lowercase.contains("href='http:")
        || lowercase.contains("href='https:")
    {
        return Err(
            "SVG images cannot contain scripts, foreign objects, or external links.".to_string(),
        );
    }
    if !lowercase.contains("viewbox=")
        && !(lowercase.contains("width=") && lowercase.contains("height="))
    {
        return Err("SVG images require a viewBox or explicit width and height.".to_string());
    }
    Ok(("image/svg+xml", "svg", None, None))
}

fn validate_source_extension(path: &Path, media_type: &str) -> Result<(), String> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let valid = match media_type {
        "image/png" => extension == "png",
        "image/jpeg" => matches!(extension.as_str(), "jpg" | "jpeg"),
        "image/gif" => extension == "gif",
        "image/svg+xml" => extension == "svg",
        _ => false,
    };
    if valid {
        Ok(())
    } else {
        Err(format!(
            "Image extension {:?} does not match detected media type {media_type:?}.",
            extension
        ))
    }
}

fn store_image(project_root: &Path, image: &ValidatedImage) -> Result<String, String> {
    let directory = project_root.join(ASSET_DIRECTORY);
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Failed to create {}: {error}", directory.display()))?;
    let filename = format!("{}.{}", image.sha256, image.extension);
    let destination = directory.join(&filename);
    if !destination.exists() {
        let mut temp = tempfile::NamedTempFile::new_in(&directory)
            .map_err(|error| format!("Failed to create temporary project asset: {error}"))?;
        temp.write_all(&image.bytes)
            .map_err(|error| format!("Failed to write temporary project asset: {error}"))?;
        temp.as_file()
            .sync_all()
            .map_err(|error| format!("Failed to sync temporary project asset: {error}"))?;
        temp.persist(&destination)
            .map_err(|error| format!("Failed to commit project asset: {error}"))?;
    }
    Ok(format!("{ASSET_DIRECTORY}/{filename}"))
}

fn save_atomic(project_root: &Path, registry: &ProjectAssetRegistry) -> Result<(), String> {
    validate_registry(registry)?;
    fs::create_dir_all(project_root)
        .map_err(|error| format!("Failed to create project directory: {error}"))?;
    let serialized = serde_json::to_vec_pretty(registry)
        .map_err(|error| format!("Failed to serialize project assets: {error}"))?;
    let mut temp = tempfile::NamedTempFile::new_in(project_root)
        .map_err(|error| format!("Failed to create temporary asset registry: {error}"))?;
    temp.write_all(&serialized)
        .map_err(|error| format!("Failed to write temporary asset registry: {error}"))?;
    temp.as_file()
        .sync_all()
        .map_err(|error| format!("Failed to sync temporary asset registry: {error}"))?;
    temp.persist(registry_path(project_root))
        .map(|_| ())
        .map_err(|error| format!("Failed to commit project asset registry: {error}"))
}

fn referenced_source_files(project_root: &Path, asset_id: &str) -> Result<Vec<String>, String> {
    let double = format!("data-wm-asset-id=\"{asset_id}\"");
    let single = format!("data-wm-asset-id='{asset_id}'");
    let mut references = Vec::new();
    for entry in fs::read_dir(project_root)
        .map_err(|error| format!("Failed to inspect project sources: {error}"))?
    {
        let entry = entry.map_err(|error| format!("Failed to inspect project sources: {error}"))?;
        let path = entry.path();
        if !path.is_file()
            || path.extension().and_then(|value| value.to_str()) != Some("json")
            || path.file_name().and_then(|value| value.to_str()) == Some(ASSET_REGISTRY_FILENAME)
        {
            continue;
        }
        let content = fs::read_to_string(&path)
            .map_err(|error| format!("Failed to inspect {}: {error}", path.display()))?;
        let stored_content = serde_json::from_str::<serde_json::Value>(&content)
            .ok()
            .and_then(|value| {
                value
                    .get("content")
                    .and_then(|content| content.as_str())
                    .map(str::to_string)
            })
            .unwrap_or(content);
        if stored_content.contains(&double) || stored_content.contains(&single) {
            references.push(
                path.file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("unknown source")
                    .to_string(),
            );
        }
    }
    references.sort();
    Ok(references)
}

fn remove_unregistered_path(
    project_root: &Path,
    relative_path: &str,
    registry: &ProjectAssetRegistry,
) -> Result<(), String> {
    if registry
        .assets
        .iter()
        .any(|asset| asset.relative_path == relative_path)
    {
        return Ok(());
    }
    validate_relative_asset_path(relative_path)?;
    let path = project_root.join(relative_path);
    if path.exists() {
        fs::remove_file(&path)
            .map_err(|error| format!("Failed to remove {}: {error}", path.display()))?;
    }
    Ok(())
}

fn project_relative(project_root: &Path, path: &Path) -> Result<String, String> {
    let relative = path
        .strip_prefix(project_root)
        .map_err(|_| format!("Asset path {} leaves the project.", path.display()))?;
    let value = relative.to_string_lossy().replace('\\', "/");
    validate_relative_asset_path(&value)?;
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{DynamicImage, ImageFormat};

    fn png(path: &Path, width: u32, height: u32) {
        let image = DynamicImage::new_rgba8(width, height);
        let mut bytes = Cursor::new(Vec::new());
        image.write_to(&mut bytes, ImageFormat::Png).unwrap();
        fs::write(path, bytes.into_inner()).unwrap();
    }

    #[test]
    fn absent_registry_is_lazy_and_atomic_import_deduplicates() {
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("source.png");
        png(&source, 120, 80);

        assert_eq!(load_or_default(root.path()).unwrap().assets, vec![]);
        assert!(!registry_path(root.path()).exists());

        let first = import_asset(root.path(), &source).unwrap();
        let repeated = import_asset(root.path(), &source).unwrap();
        assert_eq!(first, repeated);
        assert_eq!(first.width_px, Some(120));
        assert_eq!(first.height_px, Some(80));
        assert_eq!(load_or_default(root.path()).unwrap().assets.len(), 1);
        assert!(root.path().join(&first.relative_path).is_file());
    }

    #[test]
    fn unknown_registry_versions_fail_closed() {
        let root = tempfile::tempdir().unwrap();
        fs::write(
            registry_path(root.path()),
            r#"{"schema_version":99,"assets":[]}"#,
        )
        .unwrap();

        let error = load_or_default(root.path()).unwrap_err();
        assert!(error.contains("schema version 99"));
    }

    #[test]
    fn replace_keeps_the_stable_id_and_cleans_old_content() {
        let root = tempfile::tempdir().unwrap();
        let first_source = root.path().join("first.png");
        let second_source = root.path().join("second.png");
        png(&first_source, 10, 20);
        png(&second_source, 30, 40);
        let first = import_asset(root.path(), &first_source).unwrap();
        let old_path = root.path().join(&first.relative_path);

        let replaced = replace_asset(root.path(), &first.id, &second_source).unwrap();
        assert_eq!(replaced.id, first.id);
        assert_eq!(
            (replaced.width_px, replaced.height_px),
            (Some(30), Some(40))
        );
        assert_ne!(replaced.relative_path, first.relative_path);
        assert!(!old_path.exists());
    }

    #[test]
    fn replace_can_share_deduplicated_content_without_deleting_the_other_asset() {
        let root = tempfile::tempdir().unwrap();
        let first_source = root.path().join("first.png");
        let second_source = root.path().join("second.png");
        png(&first_source, 10, 20);
        png(&second_source, 30, 40);
        let first = import_asset(root.path(), &first_source).unwrap();
        let second = import_asset(root.path(), &second_source).unwrap();

        let replaced = replace_asset(root.path(), &second.id, &first_source).unwrap();
        assert_eq!(replaced.id, second.id);
        assert_eq!(replaced.relative_path, first.relative_path);
        assert_eq!(load_or_default(root.path()).unwrap().assets.len(), 2);

        remove_asset(root.path(), &second.id).unwrap();
        assert!(root.path().join(first.relative_path).is_file());
    }

    #[test]
    fn referenced_assets_cannot_be_removed_and_unreferenced_assets_can() {
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("source.png");
        png(&source, 10, 10);
        let asset = import_asset(root.path(), &source).unwrap();
        fs::write(
            root.path().join("scene.json"),
            format!(
                "{{\"content\":\"<figure data-wm-asset-id=\\\"{}\\\"></figure>\"}}",
                asset.id
            ),
        )
        .unwrap();

        let error = remove_asset(root.path(), &asset.id).unwrap_err();
        assert!(error.contains("scene.json"));
        fs::remove_file(root.path().join("scene.json")).unwrap();
        remove_asset(root.path(), &asset.id).unwrap();
        assert!(load_or_default(root.path()).unwrap().assets.is_empty());
        assert!(!root.path().join(asset.relative_path).exists());
    }

    #[test]
    fn invalid_types_paths_sizes_and_scripted_svg_are_rejected() {
        let root = tempfile::tempdir().unwrap();
        let text = root.path().join("not-image.txt");
        fs::write(&text, "hello").unwrap();
        assert!(validate_image(&text).is_err());

        let disguised = root.path().join("image.jpg");
        png(&disguised, 2, 2);
        assert!(validate_image(&disguised)
            .unwrap_err()
            .contains("does not match"));

        let svg = root.path().join("unsafe.svg");
        fs::write(
            &svg,
            r#"<svg viewBox="0 0 10 10"><script>alert(1)</script></svg>"#,
        )
        .unwrap();
        assert!(validate_image(&svg).unwrap_err().contains("scripts"));

        let registry = ProjectAssetRegistry {
            schema_version: ASSET_SCHEMA_VERSION,
            assets: vec![ProjectAsset {
                id: "asset-ok".to_string(),
                display_name: "bad.png".to_string(),
                relative_path: "../bad.png".to_string(),
                media_type: "image/png".to_string(),
                byte_size: 1,
                width_px: Some(1),
                height_px: Some(1),
                sha256: "0".repeat(64),
            }],
        };
        assert!(validate_registry(&registry)
            .unwrap_err()
            .contains("asset path"));
    }

    #[test]
    fn orphan_cleanup_only_removes_unregistered_asset_files() {
        let root = tempfile::tempdir().unwrap();
        let source = root.path().join("source.png");
        png(&source, 10, 10);
        let asset = import_asset(root.path(), &source).unwrap();
        let orphan = root.path().join(ASSET_DIRECTORY).join("orphan.png");
        png(&orphan, 1, 1);

        let removed = cleanup_orphan_files(root.path()).unwrap();
        assert_eq!(removed, vec!["assets/orphan.png"]);
        assert!(root.path().join(asset.relative_path).is_file());
    }
}
