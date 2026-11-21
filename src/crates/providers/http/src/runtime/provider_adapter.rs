use ovload_core::routing::ProviderKind;

/// The public API product is one execution surface with a small, explicit set
/// of upstream adapters. Keeping this capability vocabulary typed prevents
/// provider-specific policy from spreading through request and admin code.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum ProviderAdapter {
    OpenAiApi,
    Claude,
    Gemini,
    XaiApi,
}

impl ProviderAdapter {
    pub(super) fn parse(value: &str) -> Option<Self> {
        match value {
            "openai_api" => Some(Self::OpenAiApi),
            "claude" => Some(Self::Claude),
            "gemini" => Some(Self::Gemini),
            "xai_api" => Some(Self::XaiApi),
            _ => None,
        }
    }

    pub(super) fn provider_kind(self) -> ProviderKind {
        ProviderKind::new(self.slug()).expect("provider adapter slugs are valid")
    }

    pub(super) const fn slug(self) -> &'static str {
        match self {
            Self::OpenAiApi => "openai_api",
            Self::Claude => "claude",
            Self::Gemini => "gemini",
            Self::XaiApi => "xai_api",
        }
    }

    pub(super) const fn is_native(self) -> bool {
        matches!(self, Self::Claude | Self::Gemini)
    }

    pub(super) const fn supports_oauth(self) -> bool {
        self.is_native()
    }

    pub(super) const fn is_gemini(self) -> bool {
        matches!(self, Self::Gemini)
    }

    pub(super) const fn is_xai(self) -> bool {
        matches!(self, Self::XaiApi)
    }

    pub(super) const fn supports_compact(self) -> bool {
        matches!(self, Self::OpenAiApi)
    }
}

#[cfg(test)]
mod tests {
    use super::ProviderAdapter;

    #[test]
    fn exposes_provider_capabilities_without_string_branches() {
        assert!(
            ProviderAdapter::parse("gemini")
                .expect("known adapter")
                .is_native()
        );
        assert!(
            ProviderAdapter::parse("claude")
                .expect("known adapter")
                .supports_oauth()
        );
        assert!(
            ProviderAdapter::parse("openai_api")
                .expect("known adapter")
                .supports_compact()
        );
        assert!(
            ProviderAdapter::parse("xai_api")
                .expect("known adapter")
                .is_xai()
        );
        assert!(ProviderAdapter::parse("unknown").is_none());
    }
}
