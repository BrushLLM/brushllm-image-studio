pub mod batch;
pub mod compose;
pub mod decode;
pub mod encode;
pub mod exif_edit;
pub mod guard;
pub mod metadata;
pub mod ops;
pub mod output;
pub mod stitch;

use thiserror::Error;

#[derive(Debug, Error)]
pub enum StudioError {
    #[error("I/O: {0}")]
    Io(String),
    #[error("cannot decode image: {0}")]
    Decode(String),
    #[error("cannot encode image: {0}")]
    Encode(String),
    #[error("invalid parameter: {0}")]
    Param(String),
}

pub type Result<T> = std::result::Result<T, StudioError>;
