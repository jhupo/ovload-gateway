//! Native usage facts and bounded proof for the product's text/function procurement rates.

use super::{pricing, provider_adapter::ProviderAdapter, request};
use ovload_core::{
    event::{GatewayEvent, ProviderEvent},
    metering::{CalculatedCost, ModelPriceOverride, Usage},
};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    io::Write,
};

const MAX_OUTPUT_ITEMS: usize = 128;
const MAX_CONTENT_PARTS: usize = 256;
const MAX_ITEM_ID_BYTES: usize = 512;
const MAX_REQUEST_BYTES: usize = 8 * 1024 * 1024;

pub(super) struct NativeMetering {
    is_xai: bool,
    request_is_supported: bool,
    outputs: OutputEvidence,
    terminal_seen: bool,
}

impl NativeMetering {
    pub(super) fn new(final_request: Option<&[u8]>, provider: ProviderAdapter) -> Self {
        let request_is_supported = final_request
            .filter(|body| body.len() <= MAX_REQUEST_BYTES)
            .and_then(|body| serde_json::from_slice::<Map<String, Value>>(body).ok())
            .is_some_and(|body| request::validate(&body).is_ok());
        Self {
            is_xai: provider.is_xai(),
            request_is_supported,
            outputs: OutputEvidence::default(),
            terminal_seen: false,
        }
    }

    pub(super) fn project(
        &mut self,
        mut event: ProviderEvent,
        requested_tier: Option<&str>,
        explicit_pricing: Option<&ModelPriceOverride>,
    ) -> Option<ProviderEvent> {
        let mut usage = None;
        let mut calculated = None;
        if !self.terminal_seen
            && let Some(wire) = event.wire_event()
        {
            let kind = wire.event_type().unwrap_or_default();
            let data = wire.data();
            self.outputs.observe(kind, data);
            if matches!(
                kind,
                "response.completed" | "response.incomplete" | "response.failed" | "error"
            ) {
                self.terminal_seen = true;
                if let Some(response) = data.get("response")
                    && let Some(native) = NativeUsage::read(response, self.is_xai)
                {
                    if event
                        .canonical_facts()
                        .iter()
                        .any(|fact| matches!(fact, GatewayEvent::Completed(_)))
                        && self.request_is_supported
                        && self
                            .outputs
                            .confirms_terminal(response, native.usage.output_tokens)
                    {
                        let tier = match response.get("service_tier") {
                            None => Some(requested_tier),
                            Some(value) => value.as_str().map(Some),
                        };
                        calculated = tier.and_then(|tier| native.cost(tier, explicit_pricing));
                    }
                    usage = Some(native.usage);
                }
            }
        }
        let had_decoder_metering = event.canonical_facts().iter().any(|fact| {
            matches!(
                fact,
                GatewayEvent::Usage(_) | GatewayEvent::CalculatedCost(_)
            )
        });
        if !had_decoder_metering && usage.is_none() && calculated.is_none() {
            return Some(event);
        }
        let observation = event.take_observation();
        let session = event.take_session_update();
        let (mut facts, wire) = event.into_parts();
        facts.retain(|fact| {
            !matches!(
                fact,
                GatewayEvent::Usage(_) | GatewayEvent::CalculatedCost(_)
            )
        });
        let mut insertion = facts
            .iter()
            .position(|fact| matches!(fact, GatewayEvent::Completed(_)))
            .unwrap_or(facts.len());
        if let Some(usage) = usage {
            facts.insert(insertion, GatewayEvent::Usage(usage));
            insertion += 1;
        }
        if let Some(cost) = calculated {
            facts.insert(insertion, GatewayEvent::CalculatedCost(cost));
        }
        let mut projected = if let Some(wire) = wire {
            ProviderEvent::canonical_with_wire(facts, wire)
        } else if !facts.is_empty() {
            let mut facts = facts.into_iter();
            let first = facts.next()?;
            facts.fold(ProviderEvent::canonical(first), ProviderEvent::with_fact)
        } else if let Some(observation) = observation {
            return Some(ProviderEvent::observation(observation));
        } else {
            return None;
        };
        if let Some(observation) = observation {
            projected.attach_observation(observation);
        }
        if let Some(session) = session {
            projected.attach_session_update(session);
        }
        Some(projected)
    }
}

struct NativeUsage {
    usage: Usage,
    cost_is_coherent: bool,
}

impl NativeUsage {
    fn read(response: &Value, is_xai: bool) -> Option<Self> {
        let raw = response.get("usage")?.as_object()?;
        if raw.is_empty() {
            return None;
        }
        let mut coherent = raw.keys().all(|key| {
            [
                "input_tokens",
                "output_tokens",
                "total_tokens",
                "input_tokens_details",
                "output_tokens_details",
            ]
            .contains(&key.as_str())
                || (key == "attribution" && raw[key].is_object())
                || (is_xai
                    && match key.as_str() {
                        "num_sources_used" | "num_server_side_tools_used" => {
                            raw[key].as_u64() == Some(0)
                        }
                        "cost_in_usd_ticks" => raw[key].as_u64().is_some(),
                        "context_details" => raw[key].is_object(),
                        _ => false,
                    })
        });
        let mut usage = Usage {
            input_tokens: count(raw.get("input_tokens"), &mut coherent),
            output_tokens: count(raw.get("output_tokens"), &mut coherent),
            total_tokens: count(raw.get("total_tokens"), &mut coherent),
            ..Usage::new()
        };
        if let Some(details) = details(
            raw.get("input_tokens_details"),
            &["cached_tokens", "cache_write_tokens"],
            &mut coherent,
        ) {
            usage.cached_input_tokens = count(details.get("cached_tokens"), &mut coherent);
            usage.cache_write_input_tokens =
                count(details.get("cache_write_tokens"), &mut coherent);
            // xAI reports cache reads but has no separately billed cache-write
            // dimension. An explicit invalid count must never become zero.
            if is_xai && !details.contains_key("cache_write_tokens") {
                usage.cache_write_input_tokens = Some(0);
            }
        }
        if let Some(details) = details(
            raw.get("output_tokens_details"),
            &["reasoning_tokens"],
            &mut coherent,
        ) {
            usage.reasoning_output_tokens = count(details.get("reasoning_tokens"), &mut coherent);
        }
        if let Some(tools) = response.get("tool_usage") {
            coherent &= zero_tool_usage(tools);
            if let Some(image) = tools.get("image_gen").and_then(Value::as_object) {
                usage.image_input_tokens = count(image.get("input_tokens"), &mut coherent);
                usage.image_output_tokens = count(image.get("output_tokens"), &mut coherent);
            }
        }
        if let (Some(input), Some(output), Some(total)) =
            (usage.input_tokens, usage.output_tokens, usage.total_tokens)
            && input.checked_add(output) != Some(total)
        {
            usage.total_tokens = None;
            coherent = false;
        }
        if let Some(input) = usage.input_tokens {
            if usage
                .cached_input_tokens
                .is_some_and(|cached| cached > input)
            {
                usage.cached_input_tokens = None;
                coherent = false;
            }
            if usage
                .cache_write_input_tokens
                .is_some_and(|written| written > input)
            {
                usage.cache_write_input_tokens = None;
                coherent = false;
            }
            if let (Some(cached), Some(written)) =
                (usage.cached_input_tokens, usage.cache_write_input_tokens)
                && cached.checked_add(written).is_none_or(|sum| sum > input)
            {
                usage.cached_input_tokens = None;
                usage.cache_write_input_tokens = None;
                coherent = false;
            }
        }
        if let (Some(reasoning), Some(output)) =
            (usage.reasoning_output_tokens, usage.output_tokens)
            && reasoning > output
        {
            usage.reasoning_output_tokens = None;
            coherent = false;
        }
        [
            usage.input_tokens,
            usage.output_tokens,
            usage.total_tokens,
            usage.cached_input_tokens,
            usage.cache_write_input_tokens,
            usage.reasoning_output_tokens,
            usage.image_input_tokens,
            usage.image_output_tokens,
        ]
        .into_iter()
        .any(|count| count.is_some())
        .then_some(Self {
            usage,
            cost_is_coherent: coherent,
        })
    }

    fn cost(
        &self,
        tier: Option<&str>,
        prices: Option<&ModelPriceOverride>,
    ) -> Option<CalculatedCost> {
        if !self.cost_is_coherent || self.usage.total_tokens.is_none() {
            return None;
        }
        // This private proof never changes the provider-reported customer quantities.
        let mut billable = self.usage.clone();
        billable.image_input_tokens = Some(0);
        billable.image_output_tokens = Some(0);
        pricing::evaluate(&billable, tier, prices).map(|cost| cost.calculated_cost())
    }
}

fn count(value: Option<&Value>, coherent: &mut bool) -> Option<u64> {
    let value = value?;
    let count = value.as_u64();
    *coherent &= count.is_some();
    count
}

// Some Responses servers include unused hosted-tool counters on every text
// response. Only explicitly zero, recognized dimensions prove no tool charge.
fn zero_tool_usage(value: &Value) -> bool {
    value.as_object().is_some_and(|tools| {
        tools.iter().all(|(kind, value)| {
            let Some(fields) = value.as_object() else {
                return false;
            };
            match kind.as_str() {
                "web_search" => {
                    fields.len() == 1
                        && fields.get("num_requests").and_then(Value::as_u64) == Some(0)
                }
                "image_gen" => {
                    ["input_tokens", "output_tokens", "total_tokens"]
                        .iter()
                        .all(|key| fields.get(*key).and_then(Value::as_u64) == Some(0))
                        && fields.iter().all(|(key, value)| match key.as_str() {
                            "input_tokens" | "output_tokens" | "total_tokens" => {
                                value.as_u64() == Some(0)
                            }
                            "input_tokens_details" | "output_tokens_details" => {
                                value.as_object().is_some_and(|details| {
                                    details.iter().all(|(key, value)| {
                                        matches!(key.as_str(), "text_tokens" | "image_tokens")
                                            && value.as_u64() == Some(0)
                                    })
                                })
                            }
                            _ => false,
                        })
                }
                _ => false,
            }
        })
    })
}

fn details<'a>(
    value: Option<&'a Value>,
    allowed: &[&str],
    coherent: &mut bool,
) -> Option<&'a Map<String, Value>> {
    let value = value?;
    let details = value.as_object();
    *coherent &=
        details.is_some_and(|details| details.keys().all(|key| allowed.contains(&key.as_str())));
    details
}

#[derive(Default)]
struct OutputEvidence {
    items: BTreeMap<u32, OutputItem>,
    references: BTreeMap<u32, (String, OutputKind)>,
    invalid: bool,
}

struct OutputItem {
    id: String,
    kind: OutputKind,
    done_digest: Option<[u8; 32]>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum OutputKind {
    Message,
    Reasoning,
    Function,
}

impl OutputEvidence {
    fn observe(&mut self, kind: &str, data: &Value) {
        if self.invalid {
            return;
        }
        if data
            .get("type")
            .is_some_and(|value| value.as_str() != Some(kind))
        {
            self.invalid = true;
            return;
        }
        let valid = match kind {
            "response.output_item.added" | "response.output_item.done" => self
                .observe_item(data, kind == "response.output_item.done")
                .is_some(),
            "response.content_part.added" | "response.content_part.done" => {
                self.observe_reference(data, OutputKind::Message).is_some()
                    && data
                        .get("part")
                        .is_some_and(|part| text_part(part, &["output_text", "refusal"]))
            }
            "response.reasoning_summary_part.added" | "response.reasoning_summary_part.done" => {
                self.observe_reference(data, OutputKind::Reasoning)
                    .is_some()
                    && data
                        .get("part")
                        .or_else(|| data.get("summary_part"))
                        .is_some_and(|part| text_part(part, &["summary_text"]))
            }
            "response.reasoning_part.added" | "response.reasoning_part.done" => {
                self.observe_reference(data, OutputKind::Reasoning)
                    .is_some()
                    && data
                        .get("part")
                        .is_some_and(|part| text_part(part, &["reasoning_text"]))
            }
            "response.created"
            | "response.in_progress"
            | "response.completed"
            | "response.incomplete"
            | "response.failed"
            | "response.rate_limits.updated"
            | "response.metadata"
            | "error" => true,
            "response.output_text.delta"
            | "response.output_text.done"
            | "response.refusal.delta"
            | "response.refusal.done" => {
                self.observe_reference(data, OutputKind::Message).is_some()
            }
            "response.reasoning_summary_text.delta"
            | "response.reasoning_summary_text.done"
            | "response.reasoning_text.delta"
            | "response.reasoning_text.done" => self
                .observe_reference(data, OutputKind::Reasoning)
                .is_some(),
            "response.function_call_arguments.delta" | "response.function_call_arguments.done" => {
                self.observe_reference(data, OutputKind::Function).is_some()
            }
            _ => false,
        };
        self.invalid |= !valid;
    }

    fn observe_reference(&mut self, data: &Value, kind: OutputKind) -> Option<()> {
        let index = u32::try_from(data.get("output_index")?.as_u64()?).ok()?;
        if usize::try_from(index).ok()? >= MAX_OUTPUT_ITEMS {
            return None;
        }
        let id = bounded_id(data.get("item_id")?)?;
        if self
            .items
            .get(&index)
            .is_some_and(|item| item.id != id || item.kind != kind || item.done_digest.is_some())
            || self
                .references
                .get(&index)
                .is_some_and(|(observed_id, observed_kind)| {
                    observed_id != id || *observed_kind != kind
                })
        {
            return None;
        }
        self.references
            .entry(index)
            .or_insert_with(|| (id.to_owned(), kind));
        Some(())
    }

    fn observe_item(&mut self, data: &Value, done: bool) -> Option<()> {
        let index = u32::try_from(data.get("output_index")?.as_u64()?).ok()?;
        if usize::try_from(index).ok()? >= MAX_OUTPUT_ITEMS {
            return None;
        }
        let item = data.get("item")?;
        let (id, kind) = item_identity(item)?;
        if self
            .references
            .get(&index)
            .is_some_and(|(observed_id, observed_kind)| observed_id != id || *observed_kind != kind)
        {
            return None;
        }
        let digest = if done { Some(item_digest(item)?) } else { None };
        if let Some(existing) = self.items.get_mut(&index) {
            if existing.id != id || existing.kind != kind || existing.done_digest.is_some() {
                return None;
            }
            existing.done_digest = digest;
        } else {
            if self.items.len() >= MAX_OUTPUT_ITEMS
                || self.items.values().any(|other| other.id == id)
            {
                return None;
            }
            self.items.insert(
                index,
                OutputItem {
                    id: id.to_owned(),
                    kind,
                    done_digest: digest,
                },
            );
        }
        Some(())
    }

    fn confirms_terminal(&self, response: &Value, output_tokens: Option<u64>) -> bool {
        if self.invalid {
            return false;
        }
        let output = match response.get("output") {
            None => &[][..],
            Some(Value::Array(items)) => items.as_slice(),
            Some(_) => return false,
        };
        if output.is_empty() {
            if self.items.is_empty() {
                return output_tokens == Some(0) && self.references.is_empty();
            }
            return self
                .references
                .keys()
                .all(|index| self.items.contains_key(index))
                && self
                    .items
                    .iter()
                    .enumerate()
                    .all(|(expected, (index, item))| {
                        usize::try_from(*index).ok() == Some(expected) && item.done_digest.is_some()
                    });
        }
        if output.len() > MAX_OUTPUT_ITEMS
            || self
                .items
                .keys()
                .chain(self.references.keys())
                .any(|index| usize::try_from(*index).map_or(true, |index| index >= output.len()))
        {
            return false;
        }
        let mut ids = BTreeSet::new();
        output.iter().enumerate().all(|(index, item)| {
            let Some((id, kind)) = item_identity(item) else {
                return false;
            };
            let Some(digest) = item_digest(item) else {
                return false;
            };
            if !ids.insert(id) {
                return false;
            }
            let Some(index) = u32::try_from(index).ok() else {
                return false;
            };
            self.items.get(&index).is_none_or(|observed| {
                observed.id == id
                    && observed.kind == kind
                    && observed.done_digest.is_none_or(|done| done == digest)
            }) && self
                .references
                .get(&index)
                .is_none_or(|(observed_id, observed_kind)| {
                    observed_id == id && *observed_kind == kind
                })
        })
    }
}

fn item_identity(item: &Value) -> Option<(&str, OutputKind)> {
    let id = bounded_id(item.get("id")?)?;
    let kind = match item.get("type")?.as_str()? {
        "message" => OutputKind::Message,
        "reasoning" => OutputKind::Reasoning,
        "function_call" => OutputKind::Function,
        _ => return None,
    };
    Some((id, kind))
}

fn bounded_id(value: &Value) -> Option<&str> {
    value
        .as_str()
        .filter(|id| !id.is_empty() && id.len() <= MAX_ITEM_ID_BYTES)
}

fn item_digest(item: &Value) -> Option<[u8; 32]> {
    let (_, kind) = item_identity(item)?;
    let object = item.as_object()?;
    let fields: &[&str] = match kind {
        OutputKind::Message => &["type", "id", "status", "role", "content", "phase"],
        OutputKind::Reasoning => &[
            "type",
            "id",
            "status",
            "summary",
            "content",
            "encrypted_content",
        ],
        OutputKind::Function => &["type", "id", "status", "call_id", "name", "arguments"],
    };
    if object.keys().any(|key| !fields.contains(&key.as_str())) {
        return None;
    }
    if item.get("phase").is_some_and(|phase| {
        !phase.is_null() && !matches!(phase.as_str(), Some("commentary" | "final_answer"))
    }) {
        return None;
    }
    if item
        .get("status")
        .is_some_and(|value| !matches!(value.as_str(), Some("completed" | "incomplete")))
    {
        return None;
    }
    match kind {
        OutputKind::Message
            if item.get("role").and_then(Value::as_str) != Some("assistant")
                || !parts(item.get("content")?, &["output_text", "refusal"]) =>
        {
            return None;
        }
        OutputKind::Reasoning => {
            if item
                .get("encrypted_content")
                .is_some_and(|value| !value.is_string() && !value.is_null())
            {
                return None;
            }
            for (field, allowed) in [
                ("summary", &["summary_text"][..]),
                ("content", &["reasoning_text"][..]),
            ] {
                if item.get(field).is_some_and(|value| !parts(value, allowed)) {
                    return None;
                }
            }
        }
        OutputKind::Function
            if ["call_id", "name", "arguments"]
                .iter()
                .any(|field| item.get(*field).and_then(Value::as_str).is_none()) =>
        {
            return None;
        }
        _ => {}
    }
    // Keep a fixed digest rather than retaining generated text or function arguments.
    let mut digest = Sha256::new();
    for field in fields {
        digest.update(field.as_bytes());
        if let Some(value) = item.get(*field) {
            digest_json(&mut digest, value)?;
        }
        digest.update([0]);
    }
    Some(digest.finalize().into())
}

fn parts(value: &Value, allowed: &[&str]) -> bool {
    value.as_array().is_some_and(|parts| {
        parts.len() <= MAX_CONTENT_PARTS && parts.iter().all(|part| text_part(part, allowed))
    })
}

fn text_part(part: &Value, allowed: &[&str]) -> bool {
    let Some(object) = part.as_object() else {
        return false;
    };
    let Some(kind) = part
        .get("type")
        .and_then(Value::as_str)
        .filter(|kind| allowed.contains(kind))
    else {
        return false;
    };
    let fields: &[&str] = match kind {
        "output_text" => &["type", "text", "annotations", "logprobs"],
        "refusal" => &["type", "refusal"],
        "summary_text" | "reasoning_text" => &["type", "text"],
        _ => return false,
    };
    object.keys().all(|key| fields.contains(&key.as_str()))
        && part
            .get(if kind == "refusal" { "refusal" } else { "text" })
            .is_some_and(Value::is_string)
        && ["annotations", "logprobs"]
            .into_iter()
            .all(|field| part.get(field).is_none_or(Value::is_array))
}

fn digest_json(digest: &mut Sha256, value: &Value) -> Option<()> {
    match value {
        Value::Object(object) => {
            digest.update(b"{");
            let mut keys = object.keys().collect::<Vec<_>>();
            keys.sort_unstable();
            for key in keys {
                serde_json::to_writer(DigestWriter(&mut *digest), key).ok()?;
                digest.update(b":");
                digest_json(digest, object.get(key)?)?;
                digest.update(b",");
            }
            digest.update(b"}");
        }
        Value::Array(array) => {
            digest.update(b"[");
            for value in array {
                digest_json(digest, value)?;
                digest.update(b",");
            }
            digest.update(b"]");
        }
        _ => serde_json::to_writer(DigestWriter(&mut *digest), value).ok()?,
    }
    Some(())
}

struct DigestWriter<'a>(&'a mut Sha256);

impl Write for DigestWriter<'_> {
    fn write(&mut self, bytes: &[u8]) -> std::io::Result<usize> {
        self.0.update(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

#[cfg(test)]
mod live_schema_tests {
    use super::*;
    use serde_json::json;

    fn response() -> Value {
        json!({"usage":{"input_tokens":100,"output_tokens":10,"total_tokens":110,"input_tokens_details":{"cached_tokens":20,"cache_write_tokens":0},"output_tokens_details":{"reasoning_tokens":5}}})
    }

    fn price() -> ModelPriceOverride {
        serde_json::from_value(json!({"multiplierBps":10000,"bands":{"standard":{"input":"1","output":"2","cacheRead":"0.1","cacheWrite":"1.25"}}})).unwrap()
    }

    #[test]
    fn live_schema_openai_attribution_and_message_phase_preserve_billing() {
        let mut response = response();
        response["usage"]["attribution"] = json!({"items":{},"request_fields":{}});
        let native = NativeUsage::read(&response, false).unwrap();
        assert!(native.cost(None, Some(&price())).is_some());
        let item = json!({"type":"message","id":"msg_test","status":"completed","role":"assistant","phase":"final_answer","content":[{"type":"output_text","text":"OK","annotations":[],"logprobs":[]}]});
        assert!(item_digest(&item).is_some());
        let mut invalid = item;
        invalid["phase"] = json!("future_modality");
        assert!(item_digest(&invalid).is_none());
        response["usage"]["future_charge"] = json!(1);
        assert!(
            NativeUsage::read(&response, false)
                .unwrap()
                .cost(None, Some(&price()))
                .is_none()
        );
    }

    #[test]
    fn live_schema_xai_text_usage_uses_token_rates_not_reported_upstream_cost() {
        let mut response = response();
        response["usage"]["input_tokens_details"]
            .as_object_mut()
            .unwrap()
            .remove("cache_write_tokens");
        response["usage"]["num_sources_used"] = json!(0);
        response["usage"]["num_server_side_tools_used"] = json!(0);
        response["usage"]["cost_in_usd_ticks"] = json!(9999999);
        response["usage"]["context_details"] = json!({"input_tokens":100,"output_tokens":12});
        let native = NativeUsage::read(&response, true).unwrap();
        assert_eq!(native.usage.cache_write_input_tokens, Some(0));
        assert!(native.cost(None, Some(&price())).is_some());
        assert!(
            NativeUsage::read(&response, false)
                .unwrap()
                .cost(None, Some(&price()))
                .is_none()
        );
        response["usage"]["num_server_side_tools_used"] = json!(1);
        assert!(
            NativeUsage::read(&response, true)
                .unwrap()
                .cost(None, Some(&price()))
                .is_none()
        );
        response["usage"]["num_server_side_tools_used"] = json!(0);
        response["usage"]["input_tokens_details"]["cache_write_tokens"] = Value::Null;
        assert!(
            NativeUsage::read(&response, true)
                .unwrap()
                .cost(None, Some(&price()))
                .is_none()
        );
    }

    #[test]
    fn live_schema_unused_hosted_tools_require_explicit_zero_known_counters() {
        let mut response = response();
        let tools = json!({"image_gen":{"input_tokens":0,"output_tokens":0,"total_tokens":0,"input_tokens_details":{"text_tokens":0,"image_tokens":0},"output_tokens_details":{"text_tokens":0,"image_tokens":0}},"web_search":{"num_requests":0}});
        response["tool_usage"] = tools.clone();
        assert!(
            NativeUsage::read(&response, false)
                .unwrap()
                .cost(None, Some(&price()))
                .is_some()
        );
        for invalid in [
            json!({"web_search":{"num_requests":1}}),
            json!({"web_search":{"num_requests":null}}),
            json!({"web_search":{}}),
            json!({"future_tool":{"num_requests":0}}),
            json!({"image_gen":{"input_tokens":0,"output_tokens":0}}),
        ] {
            response["tool_usage"] = invalid;
            assert!(
                NativeUsage::read(&response, false)
                    .unwrap()
                    .cost(None, Some(&price()))
                    .is_none()
            );
        }
        for pointer in [
            "/image_gen/input_tokens",
            "/image_gen/output_tokens",
            "/image_gen/total_tokens",
            "/image_gen/input_tokens_details/image_tokens",
            "/image_gen/output_tokens_details/text_tokens",
        ] {
            response["tool_usage"] = tools.clone();
            *response["tool_usage"].pointer_mut(pointer).unwrap() = json!(1);
            assert!(
                NativeUsage::read(&response, false)
                    .unwrap()
                    .cost(None, Some(&price()))
                    .is_none()
            );
        }
    }
}
