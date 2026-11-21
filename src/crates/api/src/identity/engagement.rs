use super::{extract::IdentityRequest, wire::IdentityHttpError};
use crate::auth::SessionState;
use axum::{
    Json, Router,
    extract::{
        Path, Query, State,
        rejection::{JsonRejection, QueryRejection},
    },
    routing::{get, post},
};
use ovload_admin::{
    model::{engagement::EngagementCommand, identity_access::IdentityError},
    ports::commerce::{CommercePageQuery, CommerceQuery},
};

pub(super) fn router<S: SessionState + Clone + Send + Sync + 'static>() -> Router<S> {
    Router::new()
        .route("/engagement/{view}", get(view::<S>))
        .route("/commerce/payment-summary", get(payment_summary::<S>))
        .route("/commerce/{scope}", get(commerce_page::<S>))
        .route("/engagement", post(command::<S>))
}
async fn view<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    Path(view): Path<String>,
) -> Result<Json<serde_json::Value>, IdentityHttpError> {
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    if view == "commerce" {
        state
            .admin_services()
            .commerce()
            .query(&session, CommerceQuery::Overview)
            .await
            .map(Json)
            .map_err(|e| request.error(e))
    } else if let Some(scope) = view.strip_prefix("commerce-") {
        state
            .admin_services()
            .commerce()
            .query(&session, CommerceQuery::Scope(scope.to_owned()))
            .await
            .map(Json)
            .map_err(|e| request.error(e))
    } else {
        state
            .admin_services()
            .site_settings()
            .engagement_view(&session, &view)
            .await
            .map(Json)
            .map_err(|e| request.error(e))
    }
}
async fn command<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    input: Result<Json<EngagementCommand>, JsonRejection>,
) -> Result<Json<serde_json::Value>, IdentityHttpError> {
    request.require_csrf()?;
    let Json(input) = input.map_err(|_| request.error(IdentityError::Invalid))?;
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    match input {
        EngagementCommand::Commerce { key, command } => state
            .admin_services()
            .commerce()
            .execute(&session, key, command)
            .await
            .map(Json)
            .map_err(|e| request.error(e)),
        command => state
            .admin_services()
            .site_settings()
            .engagement_command(&session, command)
            .await
            .map(Json)
            .map_err(|e| request.error(e)),
    }
}

#[derive(serde::Deserialize)]
#[serde(deny_unknown_fields)]
struct PaymentSummaryQuery {
    from: chrono::NaiveDate,
    to: chrono::NaiveDate,
}
async fn payment_summary<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    query: Result<Query<PaymentSummaryQuery>, QueryRejection>,
) -> Result<Json<serde_json::Value>, IdentityHttpError> {
    let Query(query) = query.map_err(|_| request.error(IdentityError::Invalid))?;
    let days = (query.to - query.from).num_days();
    if !(0..=366).contains(&days) {
        return Err(request.error(IdentityError::Invalid));
    }
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    state
        .admin_services()
        .commerce()
        .query(
            &session,
            CommerceQuery::PaymentSummary {
                from: query.from,
                to: query.to,
                timezone: state.admin_services().timezone().name().to_owned(),
            },
        )
        .await
        .map(Json)
        .map_err(|e| request.error(e))
}

async fn commerce_page<S: SessionState>(
    State(state): State<S>,
    request: IdentityRequest,
    Path(scope): Path<String>,
    query: Result<Query<std::collections::BTreeMap<String, String>>, QueryRejection>,
) -> Result<Json<serde_json::Value>, IdentityHttpError> {
    let Query(params) = query.map_err(|_| request.error(IdentityError::Invalid))?;
    let session = request
        .authenticate(state.admin_services().identity())
        .await?;
    state
        .admin_services()
        .commerce()
        .query(
            &session,
            CommerceQuery::Page(CommercePageQuery { scope, params }),
        )
        .await
        .map(Json)
        .map_err(|e| request.error(e))
}
