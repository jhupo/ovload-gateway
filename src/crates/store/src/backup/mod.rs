//! S3 对象存储与 `pg_dump` 基础设施适配器

mod archive;
pub mod extensions;
pub mod pg_dump;
pub mod restore;
pub mod s3;
mod snapshot;
pub mod staging;
