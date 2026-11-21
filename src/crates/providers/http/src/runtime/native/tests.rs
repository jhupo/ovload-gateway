use super::*;
use serde_json::json;

fn credential(kind: &str, oauth: bool) -> Credential {
    Credential {
        schema_version: 1,
        api_key: "fixture-key".into(),
        base_url: if kind == "claude" {
            "https://api.anthropic.com/v1"
        } else if oauth {
            "https://cloudcode-pa.googleapis.com"
        } else {
            "https://generativelanguage.googleapis.com/v1beta"
        }
        .into(),
        oauth: oauth.then(|| oauth::Tokens {
            refresh_token: "fixture-refresh".into(),
            expires_at: chrono::Utc::now() + chrono::TimeDelta::hours(1),
            project: Some("fixture-project".into()),
            subject: "fixture-subject".into(),
            email: None,
        }),
    }
}

#[test]
fn api_keys_never_receive_subscription_identity_or_bearer_headers() {
    for (kind, key) in [("claude", "x-api-key"), ("gemini", "x-goog-api-key")] {
        let headers = headers(kind, &credential(kind, false)).unwrap();
        assert_eq!(headers[key], "fixture-key");
        for absent in [
            "authorization",
            "user-agent",
            "anthropic-beta",
            "x-app",
            "x-stainless-os",
        ] {
            assert!(!headers.contains_key(absent));
        }
        let headers = super::headers(kind, &credential(kind, true)).unwrap();
        assert_eq!(headers["authorization"], "Bearer fixture-key");
        assert!(!headers.contains_key(key));
        assert!(headers.contains_key("user-agent"));
        if kind == "gemini" {
            assert_eq!(
                headers["client-metadata"],
                r#"{"ideType":"ANTIGRAVITY","platform":"LINUX","pluginType":"GEMINI"}"#
            );
        }
    }
}

#[test]
fn native_requests_keep_tools_results_system_and_oauth_project_separate() {
    let body = json!({"model":"fixture-model","instructions":"Be brief","input":[
        {"role":"user","content":"check"},
        {"type":"function_call","call_id":"call_1","name":"lookup","arguments":"{\"city\":\"上海\"}"},
        {"type":"function_call_output","call_id":"call_1","output":"sunny"}
    ],"tools":[{"type":"function","name":"lookup","parameters":{"type":"object","properties":{}}}],"tool_choice":"auto","max_output_tokens":32});
    for kind in ["claude", "gemini"] {
        let key = encode(kind, &credential(kind, false), body.as_object().unwrap()).unwrap();
        let oauth = encode(kind, &credential(kind, true), body.as_object().unwrap()).unwrap();
        if kind == "claude" {
            assert_eq!(key["messages"][1]["content"][0]["input"]["city"], "上海");
            assert_eq!(key["messages"][2]["content"][0]["tool_use_id"], "call_1");
            assert_eq!(key["system"], "Be brief");
            assert!(key.get("metadata").is_none());
            assert!(
                oauth["system"][0]["text"]
                    .as_str()
                    .unwrap()
                    .contains("Claude Code")
            );
        } else {
            assert_eq!(
                key["contents"][2]["parts"][0]["functionResponse"]["name"],
                "lookup"
            );
            assert!(key.get("project").is_none());
            assert_eq!(oauth["project"], "fixture-project");
            assert_eq!(oauth["userAgent"], "antigravity");
            assert_eq!(oauth["requestType"], "agent");
            assert!(
                oauth["requestId"]
                    .as_str()
                    .is_some_and(|id| id.starts_with("agent-"))
            );
            assert_eq!(oauth["request"], key);
        }
        for field in ["service_tier", "reasoning", "text"] {
            let mut invalid = body.clone();
            invalid[field] = json!("unsupported");
            assert!(encode(kind, &credential(kind, false), invalid.as_object().unwrap()).is_err());
        }
    }
}

#[test]
fn native_requests_encode_multimodal_parts_per_provider() {
    let image = "data:image/png;base64,AA==";
    let document = "data:application/pdf;base64,AA==";
    let claude_body = json!({
        "model":"fixture-model",
        "input":[{"role":"user","content":[
            {"type":"input_text","text":"describe"},
            {"type":"input_image","image_url":image},
            {"type":"input_file","file_data":document,"filename":"brief.pdf"}
        ]}
        ],
        "max_output_tokens":32
    });
    let claude = encode(
        "claude",
        &credential("claude", false),
        claude_body.as_object().unwrap(),
    )
    .unwrap();
    assert_eq!(
        claude["messages"][0]["content"][1],
        json!({"type":"image","source":{"type":"base64","media_type":"image/png","data":"AA=="}})
    );
    assert_eq!(
        claude["messages"][0]["content"][2],
        json!({"type":"document","source":{"type":"base64","media_type":"application/pdf","data":"AA=="}})
    );

    let gemini_body = json!({
        "model":"fixture-model",
        "input":[{"role":"user","content":[
            {"type":"input_image","image_url":image},
            {"type":"input_audio","input_audio":{"format":"wav","data":"AA=="}},
            {"type":"input_file","file_data":document,"filename":"brief.pdf"}
        ]}
        ],
        "max_output_tokens":32
    });
    let gemini = encode(
        "gemini",
        &credential("gemini", false),
        gemini_body.as_object().unwrap(),
    )
    .unwrap();
    assert_eq!(
        gemini["contents"][0]["parts"][0],
        json!({"inlineData":{"mimeType":"image/png","data":"AA=="}})
    );
    assert_eq!(
        gemini["contents"][0]["parts"][1],
        json!({"inlineData":{"mimeType":"audio/wav","data":"AA=="}})
    );
    assert_eq!(
        gemini["contents"][0]["parts"][2],
        json!({"inlineData":{"mimeType":"application/pdf","data":"AA=="}})
    );
}

fn translate(kind: &str, values: Vec<Value>, chunk_size: usize) -> Vec<Value> {
    let raw: String = values
        .into_iter()
        .map(|value| format!("data: {value}\r\n\r\n"))
        .collect();
    let mut decoder = Decoder::new(kind, "fixture-model");
    let mut output = Vec::new();
    for chunk in raw.as_bytes().chunks(chunk_size) {
        output.extend(decoder.push(chunk).unwrap());
    }
    output.extend(decoder.finish().unwrap());
    ovload_protocol::openai::sse::SseEventDecoder::default()
        .push(&output)
        .unwrap()
        .into_iter()
        .map(|event| serde_json::from_str(&event.data).unwrap())
        .collect()
}

#[test]
fn claude_fragmented_stream_preserves_text_tools_and_cached_token_counts() {
    let events = translate(
        "claude",
        vec![
            json!({"type":"message_start","message":{"usage":{"input_tokens":5,"output_tokens":0,"cache_read_input_tokens":7,"cache_creation_input_tokens":3}}}),
            json!({"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}),
            json!({"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"你好"}}),
            json!({"type":"content_block_stop","index":0}),
            json!({"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tool_1","name":"lookup","input":{}}}),
            json!({"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"city\":"}}),
            json!({"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"\"上海\"}"}}),
            json!({"type":"content_block_stop","index":1}),
            json!({"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"input_tokens":6,"output_tokens":4}}),
            json!({"type":"message_stop"}),
        ],
        1,
    );
    let response = &events.last().unwrap()["response"];
    assert_eq!(response["output"][0]["content"][0]["text"], "你好");
    assert_eq!(response["output"][1]["arguments"], "{\"city\":\"上海\"}");
    assert_eq!(response["usage"]["input_tokens"], 16);
    assert_eq!(response["usage"]["total_tokens"], 20);
    assert_eq!(
        response["usage"]["input_tokens_details"]["cached_tokens"],
        7
    );
    assert_eq!(
        response["usage"]["input_tokens_details"]["cache_write_tokens"],
        3
    );
}

#[test]
fn gemini_oauth_wrapping_and_reasoning_usage_are_projected_without_double_counting() {
    let events = translate(
        "gemini",
        vec![
            json!({"response":{"candidates":[{"content":{"parts":[{"text":"hello"}]}}]}}),
            json!({"response":{"candidates":[{"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":9,"candidatesTokenCount":2,"thoughtsTokenCount":3,"cachedContentTokenCount":4,"totalTokenCount":14}}}),
        ],
        3,
    );
    let response = &events.last().unwrap()["response"];
    assert_eq!(response["output"][0]["content"][0]["text"], "hello");
    assert_eq!(response["usage"]["output_tokens"], 5);
    assert_eq!(response["usage"]["total_tokens"], 14);
    assert_eq!(
        response["usage"]["output_tokens_details"]["reasoning_tokens"],
        3
    );
}

#[test]
fn gemini_inline_data_is_projected_as_a_completed_output_media_part() {
    let events = translate(
        "gemini",
        vec![
            json!({"candidates":[{"content":{"parts":[{"inlineData":{"mimeType":"image/png","data":"AA=="}}]}}]}),
            json!({"candidates":[{"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":1,"candidatesTokenCount":1,"totalTokenCount":2}}),
        ],
        1,
    );
    let response = &events.last().unwrap()["response"];
    assert_eq!(
        response["output"][0]["content"][0],
        json!({"type":"output_image","image_url":"data:image/png;base64,AA=="})
    );
    assert!(events.iter().any(|event| {
        event["type"] == "response.content_part.added" && event["part"]["type"] == "output_image"
    }));
    assert!(events.iter().any(|event| {
        event["type"] == "response.content_part.done" && event["part"]["type"] == "output_image"
    }));
}

#[test]
fn truncated_or_error_stream_never_becomes_success() {
    for kind in ["claude", "gemini"] {
        let mut decoder = Decoder::new(kind, "fixture-model");
        assert!(decoder.finish().is_err());
        assert!(
            decoder
                .push(b"data: {\"error\":{\"message\":\"secret upstream error\"}}\n\n")
                .is_err()
        );
    }
    let mut decoder = Decoder::new("gemini", "fixture-model");
    assert!(
        decoder
            .push(b"data: {\"candidates\":[{\"finishReason\":\"SAFETY\"}]}\n\n")
            .is_err()
    );
}

#[test]
fn gemini_tool_signature_survives_a_followup_request() {
    let events = translate(
        "gemini",
        vec![
            json!({"candidates":[{"content":{"parts":[{"thoughtSignature":"opaque-upstream-signature","functionCall":{"id":"native-tool-id","name":"lookup","args":{"city":"上海"}}}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":4,"candidatesTokenCount":2}}),
        ],
        1,
    );
    let call = events.last().unwrap()["response"]["output"][0].clone();
    let body = json!({"model":"fixture-model","input":[call.clone(),{"type":"function_call_output","call_id":call["call_id"],"output":"sunny"}]});
    let converted = encode(
        "gemini",
        &credential("gemini", true),
        body.as_object().unwrap(),
    )
    .unwrap();
    assert_eq!(
        converted["request"]["contents"][0]["parts"][0]["thoughtSignature"],
        "opaque-upstream-signature"
    );
    assert_eq!(
        converted["request"]["contents"][0]["parts"][0]["functionCall"]["id"],
        "native-tool-id"
    );
    assert_eq!(
        converted["request"]["contents"][1]["parts"][0]["functionResponse"]["id"],
        "native-tool-id"
    );
}

#[test]
fn identity_presets_validate_and_preview_the_same_headers_used_for_oauth() {
    for kind in ["claude", "gemini"] {
        for preset in ["linux-x64", "windows-x64", "macos-arm64"] {
            let configuration = profile::object(json!({"preset":preset}));
            let preview = profile::preview(kind, &configuration).unwrap();
            let mut headers = HeaderMap::new();
            profile::apply(kind, Some(&configuration), &mut headers).unwrap();
            assert_eq!(
                headers["user-agent"].to_str().unwrap(),
                preview.expose_to_provider()["userAgent"].as_str().unwrap()
            );
        }
        assert!(
            profile::preview(
                kind,
                &profile::object(json!({"preset":"custom\r\nx-api-key: injected"}))
            )
            .is_err()
        );
    }
}

#[test]
fn native_tools_round_trip_through_chat_completions_with_long_gemini_signatures() {
    use ovload_protocol::openai::chat::{ChatStreamConverter, convert_request, convert_response};
    let signature = "signed-thought-".repeat(100);
    let events = translate(
        "gemini",
        vec![json!({"candidates":[{"content":{"parts":[{
        "functionCall":{"name":"lookup","args":{"city":"Paris"}},"thoughtSignature":signature
    }]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":3}})],
        17,
    );
    let response = &events.last().unwrap()["response"];
    let chat = convert_response(response, "fixture-model").unwrap();
    let message = &chat["choices"][0]["message"];
    let id = message["tool_calls"][0]["id"].as_str().unwrap();
    assert!(id.len() > 256);
    let mut converter = ChatStreamConverter::new("fixture-model".into(), true);
    for event in &events {
        converter
            .push(format!("data: {event}\n\n").as_bytes())
            .unwrap();
    }
    converter
        .push(ovload_protocol::openai::sse::DONE_SSE_FRAME.as_bytes())
        .unwrap();
    converter.finish().unwrap();
    let converted = convert_request(
        &serde_json::to_vec(&json!({"model":"fixture-model","messages":[
            {"role":"user","content":"lookup"},
            {"role":"assistant","content":null,"tool_calls":message["tool_calls"]},
            {"role":"tool","tool_call_id":id,"content":"sunny"}
        ]}))
        .unwrap(),
    )
    .unwrap();
    let native = encode(
        "gemini",
        &credential("gemini", false),
        converted.responses.as_object().unwrap(),
    )
    .unwrap();
    assert_eq!(
        native["contents"][1]["parts"][0]["thoughtSignature"],
        signature
    );
    assert!(ovload_protocol::openai::chat::valid_tool_call_id(
        &"x".repeat(257)
    ));
    assert!(!ovload_protocol::openai::chat::valid_tool_call_id(
        &format!("gemini_call_{}", "a".repeat(48 * 1024 + 1))
    ));
}
