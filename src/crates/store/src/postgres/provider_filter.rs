//! Management filters select a platform; execution and pricing retain exact adapter IDs.
use sqlx::{Postgres, QueryBuilder};

pub(crate) fn provider_filter_kinds(provider: &str) -> Vec<String> {
    ovload_core::identity::provider_filter_aliases(provider)
        .map(|aliases| aliases.iter().map(|value| (*value).to_owned()).collect())
        .unwrap_or_else(|| vec![provider.to_owned()])
}

/// `column` must be a static SQL expression supplied by the caller, never user input.
pub(crate) fn push_provider_filter(
    query: &mut QueryBuilder<Postgres>,
    column: &str,
    provider: &str,
) {
    query
        .push(format!(" and {column}=any("))
        .push_bind(provider_filter_kinds(provider))
        .push(")");
}
