//! Shared contracts. No database, web framework, or provider implementation dependencies.
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Protocol {
    Responses,
    ChatCompletions,
    AnthropicMessages,
    Gemini,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Transport {
    Http,
    Sse,
    WebSocket,
}

/// Capabilities must describe implemented behavior, never planned support.
#[derive(Debug, Serialize)]
pub struct ProviderCapabilities {
    pub id: &'static str,
    pub protocols: &'static [Protocol],
    pub transports: &'static [Transport],
}

/// Provider implementations own authentication and upstream protocol semantics.
/// Request execution and retry budgets belong to the executor, not this contract.
pub trait ProviderAdapter: Send + Sync {
    fn capabilities(&self) -> ProviderCapabilities;
}
