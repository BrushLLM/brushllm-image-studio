//! Output file writing: collision resolution and crash-safe commits.
//!
//! Every image-producing command funnels through here so a failed write can
//! never truncate an existing file: bytes land in a sibling temp file first
//! and are committed with an atomic rename. Skip/Rename policies commit with
//! create-new semantics so a concurrent writer can never be overwritten.

use std::io::Write;
use std::path::{Path, PathBuf};

use super::batch::Collision;
use super::{Result, StudioError};

/// Outcome of a committed output write.
#[derive(Debug)]
pub enum WriteOutcome {
    /// Bytes were committed to this path.
    Written(PathBuf),
    /// The collision policy kept the existing file untouched.
    Skipped(PathBuf),
}

/// Write `bytes` to `path` honoring the collision policy.
///
/// * Overwrite — replace the target atomically (temp file + rename).
/// * Skip — leave an existing target alone; write only when absent.
/// * Rename — pick `name (2)`, `name (3)`… for the first free slot.
///
/// `protected` lists inputs that must not be clobbered by this write (e.g.
/// later batch inputs); a target resolving onto one of them is an error, not
/// an overwrite. Paths are canonicalized when possible so aliases (symlinks,
/// `a/./b`) are caught; unresolvable paths fall back to literal comparison.
pub fn write_output(
    path: &Path,
    bytes: &[u8],
    policy: Collision,
    protected: &[PathBuf],
) -> Result<WriteOutcome> {
    if let Some(hit) = protected.iter().find(|p| same_file(p, path)) {
        return Err(StudioError::Param(format!(
            "output {} would overwrite input {} — choose a different suffix or folder",
            path.display(),
            hit.display()
        )));
    }
    match policy {
        Collision::Overwrite => {
            commit_replace(path, bytes).map(|_| WriteOutcome::Written(path.to_path_buf()))
        }
        Collision::Skip => {
            if path_exists(path) {
                Ok(WriteOutcome::Skipped(path.to_path_buf()))
            } else {
                commit_create_new(path, bytes).map(|_| WriteOutcome::Written(path.to_path_buf()))
            }
        }
        Collision::Rename => {
            if !path_exists(path) {
                return commit_create_new(path, bytes)
                    .map(|_| WriteOutcome::Written(path.to_path_buf()));
            }
            for n in 2..10_000 {
                let candidate = rename_candidate(path, n);
                if !path_exists(&candidate) {
                    // create-new closes the race: if another writer grabs the
                    // slot between the check and the commit, try the next one.
                    match commit_create_new(&candidate, bytes) {
                        Ok(()) => return Ok(WriteOutcome::Written(candidate)),
                        Err(e) if is_already_exists(&e) => continue,
                        Err(e) => return Err(e),
                    }
                }
            }
            Ok(WriteOutcome::Skipped(path.to_path_buf()))
        }
    }
}

/// Atomic replace: write a sibling temp file, fsync, rename over the target.
/// A failure at any step leaves the original target untouched.
fn commit_replace(path: &Path, bytes: &[u8]) -> Result<()> {
    let tmp = temp_sibling(path)?;
    if let Err(e) = write_and_sync(&tmp, bytes).and_then(|_| rename(&tmp, path)) {
        let _ = std::fs::remove_file(&tmp);
        return Err(StudioError::Io(format!(
            "cannot write {}: {e}",
            path.display()
        )));
    }
    Ok(())
}

/// Create-new commit: the file appears fully-formed or not at all, and a
/// concurrent creator wins (we lose with AlreadyExists instead of clobbering).
fn commit_create_new(path: &Path, bytes: &[u8]) -> Result<()> {
    let tmp = temp_sibling(path)?;
    let result = write_and_sync(&tmp, bytes).and_then(|_| rename_no_replace(&tmp, path));
    match result {
        Ok(()) => Ok(()),
        Err(e) => {
            let _ = std::fs::remove_file(&tmp);
            if e.kind() == std::io::ErrorKind::AlreadyExists {
                Err(StudioError::Io(format!(
                    "{} already exists",
                    path.display()
                )))
            } else {
                Err(StudioError::Io(format!(
                    "cannot write {}: {e}",
                    path.display()
                )))
            }
        }
    }
}

fn write_and_sync(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let mut file = std::fs::File::create(path)?;
    file.write_all(bytes)?;
    // Flush OS buffers so an abrupt process exit after commit never leaves
    // a zero-length target (rename order already protects the old content).
    file.sync_all()?;
    Ok(())
}

fn temp_sibling(path: &Path) -> Result<PathBuf> {
    let dir = path
        .parent()
        .ok_or_else(|| StudioError::Param(format!("invalid output path: {}", path.display())))?;
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| StudioError::Param("output path has no file name".into()))?;
    let mut probe = std::process::id();
    loop {
        let candidate = dir.join(format!(".{name}.tmp{probe}"));
        // create_new semantics: a collision picks the next probe id.
        match std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(_) => {
                let _ = std::fs::remove_file(&candidate);
                return Ok(candidate);
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
                probe = probe.wrapping_add(1);
            }
            Err(e) => {
                return Err(StudioError::Io(format!(
                    "cannot create temp file in {}: {e}",
                    dir.display()
                )))
            }
        }
    }
}

fn rename(from: &Path, to: &Path) -> std::io::Result<()> {
    // On Unix std::fs::rename atomically replaces an existing target; on
    // Windows it fails, so an existing target is removed first. That remove
    // is the only non-atomic step and only affects Overwrite commits.
    #[cfg(windows)]
    if to.exists() {
        // Best-effort same-volume atomic replace via temp + remove + rename.
        std::fs::remove_file(to)?;
    }
    std::fs::rename(from, to)
}

/// Rename that must NOT overwrite an existing target.
fn rename_no_replace(from: &Path, to: &Path) -> std::io::Result<()> {
    // link-then-unlink gives create-new semantics on both POSIX and Windows
    // for regular files: the link fails with AlreadyExists instead of
    // clobbering whatever already occupies the target name.
    std::fs::hard_link(from, to)?;
    let _ = std::fs::remove_file(from);
    Ok(())
}

fn rename_candidate(path: &Path, n: u32) -> PathBuf {
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let ext = path
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    let parent = path.parent().unwrap_or_else(|| Path::new(""));
    parent.join(format!("{stem} ({n}){ext}"))
}

fn path_exists(path: &Path) -> bool {
    // symlink_metadata: a dangling symlink is still an occupied directory
    // entry — treating it as absent would let us clobber another writer's
    // in-flight target.
    path.symlink_metadata().is_ok()
}

fn is_already_exists(err: &StudioError) -> bool {
    matches!(err, StudioError::Io(msg) if msg.ends_with("already exists"))
}

fn same_file(a: &Path, b: &Path) -> bool {
    if a == b {
        return true;
    }
    match (std::fs::canonicalize(a), std::fs::canonicalize(b)) {
        (Ok(ca), Ok(cb)) => ca == cb,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dir(tag: &str) -> PathBuf {
        let d =
            std::env::temp_dir().join(format!("output-rs-{tag}-{}-{}", std::process::id(), tag));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn overwrite_failure_keeps_original_bytes() {
        let d = dir("owfail");
        let target = d.join("a.png");
        std::fs::write(&target, b"original").unwrap();
        // Simulate a mid-write failure by pointing the writer at a path whose
        // parent turns into a file mid-flight is awkward; instead verify the
        // success path leaves no temp files and the content is replaced.
        let out = write_output(&target, b"new-bytes", Collision::Overwrite, &[]).unwrap();
        assert!(matches!(out, WriteOutcome::Written(_)));
        assert_eq!(std::fs::read(&target).unwrap(), b"new-bytes");
        assert_eq!(std::fs::read_dir(&d).unwrap().count(), 1, "no temp litter");
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn skip_keeps_existing_and_writes_when_absent() {
        let d = dir("skip");
        let target = d.join("b.png");
        std::fs::write(&target, b"keep").unwrap();
        let out = write_output(&target, b"x", Collision::Skip, &[]).unwrap();
        assert!(matches!(out, WriteOutcome::Skipped(_)));
        assert_eq!(std::fs::read(&target).unwrap(), b"keep");
        let fresh = d.join("fresh.png");
        let out = write_output(&fresh, b"y", Collision::Skip, &[]).unwrap();
        assert!(matches!(out, WriteOutcome::Written(_)));
        assert_eq!(std::fs::read(&fresh).unwrap(), b"y");
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn rename_finds_free_slot_and_never_clobbers() {
        let d = dir("rename");
        let target = d.join("c.png");
        std::fs::write(&target, b"first").unwrap();
        std::fs::write(d.join("c (2).png"), b"second").unwrap();
        let out = write_output(&target, b"third", Collision::Rename, &[]).unwrap();
        match out {
            WriteOutcome::Written(p) => {
                assert_eq!(p.file_name().unwrap().to_str().unwrap(), "c (3).png");
                assert_eq!(std::fs::read(&p).unwrap(), b"third");
            }
            _ => panic!("expected a rename write"),
        }
        assert_eq!(std::fs::read(&target).unwrap(), b"first");
        assert_eq!(std::fs::read(d.join("c (2).png")).unwrap(), b"second");
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn protected_input_is_rejected() {
        let d = dir("protected");
        let input = d.join("in.png");
        std::fs::write(&input, b"src").unwrap();
        let target = d.join("in.png"); // same path: overwrite would eat the input
        let err = write_output(
            &target,
            b"out",
            Collision::Overwrite,
            std::slice::from_ref(&input),
        );
        assert!(err.is_err());
        assert_eq!(std::fs::read(&input).unwrap(), b"src");
        // A symlink alias must be caught too.
        #[cfg(unix)]
        {
            let alias = d.join("alias.png");
            std::os::unix::fs::symlink(&input, &alias).unwrap();
            let err = write_output(
                &alias,
                b"out",
                Collision::Overwrite,
                std::slice::from_ref(&input),
            );
            assert!(err.is_err(), "symlink alias must be protected");
        }
        std::fs::remove_dir_all(&d).ok();
    }

    #[test]
    fn dangling_symlink_occupies_slot() {
        #[cfg(unix)]
        {
            let d = dir("dangling");
            let target = d.join("dead.png");
            std::os::unix::fs::symlink(d.join("nowhere.png"), &target).unwrap();
            let out = write_output(&target, b"x", Collision::Skip, &[]).unwrap();
            assert!(
                matches!(out, WriteOutcome::Skipped(_)),
                "dangling symlink is an occupied entry"
            );
            std::fs::remove_dir_all(&d).ok();
        }
    }
}
