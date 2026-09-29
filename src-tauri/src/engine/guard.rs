//! Centralized input/output limits and validation. Every command funnels
//! user-controlled values through here so the rules live in one place and
//! the error text stays stable across tools.

use std::path::{Component, Path, PathBuf};

use super::{Result, StudioError};

/// Tunable limits — adjust here only; no tool-side hardcoding.
pub mod limits {
    /// Max input file size (100 MB).
    pub const MAX_INPUT_BYTES: u64 = 100 * 1024 * 1024;
    /// Max decoded pixels per image (68 MP ≈ 8K×8K).
    pub const MAX_PIXELS: u64 = 68_000_000;
    /// Max SVG rasterized pixels (same budget).
    pub const MAX_SVG_PIXELS: u64 = 68_000_000;
    /// Max files per batch.
    pub const MAX_BATCH_FILES: usize = 500;
    /// Max AI images per request (primary + references).
    pub const MAX_AI_IMAGES: usize = 4;
    /// Max AI prompt length.
    pub const MAX_PROMPT_CHARS: usize = 4000;
    /// Max output filename suffix length.
    pub const MAX_SUFFIX_CHARS: usize = 64;
}

/// Reject non-regular files (FIFOs, devices, sockets) and enforce the size cap.
pub fn validate_input_file(path: &Path) -> Result<()> {
    let meta = std::fs::metadata(path)
        .map_err(|e| StudioError::Io(format!("cannot read {}: {e}", path.display())))?;
    if !meta.is_file() {
        return Err(StudioError::Param(format!(
            "{} is not a regular file",
            path.display()
        )));
    }
    let len = meta.len();
    if len > limits::MAX_INPUT_BYTES {
        return Err(StudioError::Param(format!(
            "{} is {} MB — the limit is {} MB",
            path.display(),
            len / (1024 * 1024),
            limits::MAX_INPUT_BYTES / (1024 * 1024)
        )));
    }
    Ok(())
}

/// Enforce the decoded-pixel budget (checked multiplication).
pub fn validate_pixels(width: u64, height: u64, what: &str) -> Result<()> {
    let pixels = width
        .checked_mul(height)
        .ok_or_else(|| StudioError::Param(format!("{what} dimensions overflow")))?;
    if pixels > limits::MAX_PIXELS {
        return Err(StudioError::Param(format!(
            "{what} is {} megapixels — the limit is {} MP",
            pixels / 1_000_000,
            limits::MAX_PIXELS / 1_000_000
        )));
    }
    Ok(())
}

/// Validate an output filename suffix: no separators, no path traversal, no
/// control characters, bounded length. Empty is allowed (no suffix).
pub fn validate_suffix(suffix: &str) -> Result<String> {
    if suffix.is_empty() {
        return Ok(String::new());
    }
    if suffix.chars().count() > limits::MAX_SUFFIX_CHARS {
        return Err(StudioError::Param(format!(
            "suffix is too long (max {} characters)",
            limits::MAX_SUFFIX_CHARS
        )));
    }
    if suffix.contains('/') || suffix.contains('\\') {
        return Err(StudioError::Param(
            "suffix must not contain path separators".into(),
        ));
    }
    if suffix.contains("..") {
        return Err(StudioError::Param(
            "suffix must not contain path traversal".into(),
        ));
    }
    if suffix.chars().any(|c| c.is_control() || c == '\0') {
        return Err(StudioError::Param(
            "suffix must not contain control characters".into(),
        ));
    }
    if suffix.starts_with('.') {
        // A leading dot would create hidden files; allow it but it is unusual
        // — reject to keep output predictable.
        return Err(StudioError::Param(
            "suffix must not start with a dot".into(),
        ));
    }
    Ok(suffix.to_string())
}

/// Normalize an output directory: must exist or be creatable, must be a
/// directory (after following symlinks), no traversal components required —
/// the user may pick any folder.
pub fn validate_output_dir(dir: &Path) -> Result<PathBuf> {
    if dir.as_os_str().is_empty() {
        return Err(StudioError::Param("output folder is empty".into()));
    }
    match std::fs::metadata(dir) {
        Ok(meta) if meta.is_dir() => Ok(dir.to_path_buf()),
        Ok(_) => Err(StudioError::Param(format!(
            "{} is not a folder",
            dir.display()
        ))),
        Err(_) => Err(StudioError::Io(format!(
            "output folder {} is not reachable",
            dir.display()
        ))),
    }
}

/// A safe single path component (file name): no separators, no `.`/`..`,
/// no control characters. Used for generated file names.
pub fn validate_file_name(name: &str) -> Result<String> {
    if name.is_empty()
        || name == "."
        || name == ".."
        || name.contains('/')
        || name.contains('\\')
        || name.contains('\0')
        || name.chars().any(|c| c.is_control())
    {
        return Err(StudioError::Param(format!("unsafe file name: {name:?}")));
    }
    Ok(name.to_string())
}

/// Validate a full output path: the parent must be a directory, the file
/// name must be a safe component. Returns the normalized path.
pub fn validate_output_path(path: &Path) -> Result<PathBuf> {
    let parent = path
        .parent()
        .ok_or_else(|| StudioError::Param(format!("invalid output path: {}", path.display())))?;
    validate_output_dir(parent)?;
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| StudioError::Param("output path has no file name".into()))?;
    validate_file_name(name)?;
    Ok(path.to_path_buf())
}

/// True when the path has no `..` components (used for AI inputs etc.).
pub fn has_no_parent_traversal(path: &str) -> bool {
    Path::new(path)
        .components()
        .all(|c| !matches!(c, Component::ParentDir))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn suffix_accepts_normal_text() {
        assert_eq!(validate_suffix("-min").unwrap(), "-min");
        assert_eq!(validate_suffix("").unwrap(), "");
    }

    #[test]
    fn suffix_rejects_traversal_and_separators() {
        assert!(validate_suffix("../evil").is_err());
        assert!(validate_suffix("a/b").is_err());
        assert!(validate_suffix("a\\b").is_err());
        assert!(validate_suffix("a..b").is_err());
        assert!(validate_suffix(".hidden").is_err());
        assert!(validate_suffix("a\u{0}b").is_err());
        assert!(validate_suffix(&"x".repeat(100)).is_err());
    }

    #[test]
    fn file_name_rejects_unsafe() {
        assert!(validate_file_name("photo.png").is_ok());
        assert!(validate_file_name("..").is_err());
        assert!(validate_file_name("a/b.png").is_err());
        assert!(validate_file_name("").is_err());
    }

    #[test]
    fn pixel_budget_checked() {
        assert!(validate_pixels(8000, 8000, "image").is_ok());
        assert!(validate_pixels(u64::MAX, 2, "image").is_err());
        assert!(validate_pixels(20_000, 20_000, "image").is_err());
    }

    #[test]
    fn traversal_detection() {
        assert!(has_no_parent_traversal("/tmp/a.png"));
        assert!(!has_no_parent_traversal("../a.png"));
        assert!(!has_no_parent_traversal("a/../../b.png"));
    }
}
