//! Internal non-secret key directory and procurement-budget operations.

use std::sync::Arc;

use async_trait::async_trait;
use ovload_core::{
    engine::budget::ClientBudgetStatus, policy::ClientApiKeyId, runtime::SnapshotControl,
};

use crate::{
    model::{
        AdminError, MutationContext,
        client_keys::{
            ClientKeyBudgetMutationOrigin, ClientKeyCursorValue, ClientKeyListQuery, ClientKeyPage,
            ClientKeyRecord, ClientKeySortField, ResetClientKeyBudget, UpdateClientKeyBudgetLimits,
        },
    },
    ports::store::ClientKeyStore,
};

use super::{map_store_error, publish_committed};

#[async_trait]
pub trait ClientKeyService: Send + Sync {
    async fn get(&self, id: &ClientApiKeyId) -> Result<ClientKeyRecord, AdminError>;
    async fn list(&self, query: ClientKeyListQuery) -> Result<ClientKeyPage, AdminError>;
    async fn budget(&self, id: &ClientApiKeyId) -> Result<ClientBudgetStatus, AdminError>;
    async fn update_budget_limits(
        &self,
        context: &MutationContext,
        command: UpdateClientKeyBudgetLimits,
        origin: ClientKeyBudgetMutationOrigin,
    ) -> Result<ClientApiKeyId, AdminError>;
    async fn reset_budget(
        &self,
        context: &MutationContext,
        command: ResetClientKeyBudget,
        origin: ClientKeyBudgetMutationOrigin,
    ) -> Result<ClientApiKeyId, AdminError>;
}

pub(crate) struct DefaultClientKeyService {
    store: Arc<dyn ClientKeyStore>,
    snapshot: Arc<dyn SnapshotControl>,
}

impl DefaultClientKeyService {
    pub(crate) fn new(store: Arc<dyn ClientKeyStore>, snapshot: Arc<dyn SnapshotControl>) -> Self {
        Self { store, snapshot }
    }
}

#[async_trait]
impl ClientKeyService for DefaultClientKeyService {
    async fn get(&self, id: &ClientApiKeyId) -> Result<ClientKeyRecord, AdminError> {
        self.store
            .get_client_key(id)
            .await
            .map_err(|error| map_store_error(error, "client API key"))?
            .ok_or_else(|| AdminError::not_found("Client API Key does not exist"))
    }

    async fn budget(&self, id: &ClientApiKeyId) -> Result<ClientBudgetStatus, AdminError> {
        self.get(id).await.map(|key| key.budget)
    }

    async fn update_budget_limits(
        &self,
        context: &MutationContext,
        command: UpdateClientKeyBudgetLimits,
        origin: ClientKeyBudgetMutationOrigin,
    ) -> Result<ClientApiKeyId, AdminError> {
        if command.daily_limit_usd.is_none() && command.weekly_limit_usd.is_none() {
            return Err(AdminError::invalid("At least one budget limit is required"));
        }
        let id = command.id.clone();
        if let Some(revision) = self
            .store
            .update_client_key_budget_limits(command, origin, context)
            .await
            .map_err(|error| map_store_error(error, "client API key"))?
        {
            publish_committed(self.snapshot.as_ref(), revision).await?;
        }
        Ok(id)
    }

    async fn reset_budget(
        &self,
        context: &MutationContext,
        command: ResetClientKeyBudget,
        origin: ClientKeyBudgetMutationOrigin,
    ) -> Result<ClientApiKeyId, AdminError> {
        let id = command.id.clone();
        self.store
            .reset_client_key_budget(command, origin, context)
            .await
            .map_err(|error| map_store_error(error, "client API key"))?;
        Ok(id)
    }

    async fn list(&self, query: ClientKeyListQuery) -> Result<ClientKeyPage, AdminError> {
        validate_cursor(&query)?;
        self.store
            .list_client_keys(query)
            .await
            .map_err(|error| map_store_error(error, "client API key"))
    }
}

fn validate_cursor(query: &ClientKeyListQuery) -> Result<(), AdminError> {
    let Some(cursor) = &query.cursor else {
        return Ok(());
    };
    if cursor.sort != query.sort {
        return Err(AdminError::invalid(
            "Key cursor sort does not match the query",
        ));
    }
    let valid = matches!((cursor.sort.field, &cursor.value), (ClientKeySortField::Name, ClientKeyCursorValue::Name(value)) if !value.trim().is_empty())
        || matches!(
            (cursor.sort.field, &cursor.value),
            (
                ClientKeySortField::Enabled,
                ClientKeyCursorValue::Enabled(_)
            ) | (
                ClientKeySortField::CreatedAt,
                ClientKeyCursorValue::CreatedAt(_)
            ) | (
                ClientKeySortField::LastUsedAt,
                ClientKeyCursorValue::LastUsedAt(_)
            )
        );
    if valid {
        Ok(())
    } else {
        Err(AdminError::invalid("Invalid key cursor"))
    }
}
