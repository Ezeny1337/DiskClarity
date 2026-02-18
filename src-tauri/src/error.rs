use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize)]
#[serde(tag = "type", content = "message")]
pub enum AppError {
    #[error("IO Error: {0}")]
    Io(String),

    #[error("NTFS Error: {0}")]
    Ntfs(String),

    #[error("Scan Task Failed: {0}")]
    TaskFailed(String),

    #[error("Serialization Failed: {0}")]
    Serialization(String),

    #[error("Compression Failed: {0}")]
    Compression(String),

    #[error("Snapshot Error: {0}")]
    Snapshot(String),

    #[error("Network Error: {0}")]
    Network(String),

    #[error("Scan Cancelled")]
    Cancelled,

    #[error("No Active Scan")]
    NoActiveScan,

    #[error("Invalid Path: {0}")]
    InvalidPath(String),
}

pub type AppResult<T> = Result<T, AppError>;

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::Io(err.to_string())
    }
}

impl From<tokio::task::JoinError> for AppError {
    fn from(err: tokio::task::JoinError) -> Self {
        AppError::TaskFailed(err.to_string())
    }
}

impl From<ureq::Error> for AppError {
    fn from(err: ureq::Error) -> Self {
        AppError::Network(err.to_string())
    }
}
