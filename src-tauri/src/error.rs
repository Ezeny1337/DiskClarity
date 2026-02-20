use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
#[serde(tag = "type", content = "message")]
pub enum AppError {
    #[error("IO error: {0}")]
    Io(String),

    #[error("NTFS error: {0}")]
    Ntfs(String),

    #[error("Scan task failed: {0}")]
    TaskFailed(String),

    #[error("Serialization failed: {0}")]
    Serialization(String),

    #[error("Compression failed: {0}")]
    Compression(String),

    #[error("Snapshot error: {0}")]
    Snapshot(String),

    #[error("Network error: {0}")]
    Network(String),

    #[error("Scan cancelled")]
    Cancelled,

    #[error("No active scan")]
    NoActiveScan,

    #[error("Invalid path: {0}")]
    InvalidPath(String),
}

pub type AppResult<T> = Result<T, AppError>;

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e.to_string())
    }
}

impl From<tokio::task::JoinError> for AppError {
    fn from(e: tokio::task::JoinError) -> Self {
        AppError::TaskFailed(e.to_string())
    }
}

impl From<ureq::Error> for AppError {
    fn from(e: ureq::Error) -> Self {
        AppError::Network(e.to_string())
    }
}

impl From<rmp_serde::encode::Error> for AppError {
    fn from(e: rmp_serde::encode::Error) -> Self {
        AppError::Serialization(e.to_string())
    }
}

impl From<rmp_serde::decode::Error> for AppError {
    fn from(e: rmp_serde::decode::Error) -> Self {
        AppError::Serialization(e.to_string())
    }
}
