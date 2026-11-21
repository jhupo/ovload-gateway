//! Synthetic directional contract fixtures; these contain no customer payloads.

use ovload_protocol::openai::{
    chat::{ChatStreamConverter, ConversionError, convert_request, convert_response},
    sse::{DONE_SSE_FRAME, encode_sse_event, parse_sse_events},
};
use serde_json::{Value, json};

fn completed() -> Value {
    serde_json::from_str(include_str!("fixtures/responses-completed.json")).unwrap()
}

fn event(
    converter: &mut ChatStreamConverter,
    value: Value,
) -> Result<Vec<Vec<u8>>, ConversionError> {
    let event = encode_sse_event(value["type"].as_str().unwrap(), &value.to_string());
    converter.push(event.as_bytes())
}

fn start(converter: &mut ChatStreamConverter) -> Vec<Vec<u8>> {
    event(converter, json!({"type":"response.created","response":{"id":"resp_fixture","created_at":1700000000,"status":"in_progress","output":[]}})).unwrap()
}

#[test]
fn chat_metadata_is_ignored_only_for_the_active_response_before_completion() {
    let metadata = json!({"type":"response.metadata","response_id":"resp_fixture","metadata":{"moderation":{"blocked":false}}});
    let mut converter = ChatStreamConverter::new("public-text".to_owned(), false);
    assert!(event(&mut converter, metadata.clone()).is_err());
    start(&mut converter);
    assert!(event(&mut converter, metadata.clone()).unwrap().is_empty());
    assert!(converter.finish().is_err());
    let mut foreign = metadata.clone();
    foreign["response_id"] = json!("resp_other");
    assert!(event(&mut converter, foreign).is_err());
    let mut malformed = metadata.clone();
    malformed["metadata"] = Value::Null;
    assert!(event(&mut converter, malformed).is_err());
    emit_content(&mut converter);
    event(&mut converter, json!({"type":"response.completed","response":completed()})).unwrap();
    assert!(event(&mut converter, metadata).is_err());
    converter.push(DONE_SSE_FRAME.as_bytes()).unwrap();
    converter.finish().unwrap();
}

#[test]
fn request_fixture_preserves_role_hierarchy_and_function_semantics() {
    let converted = convert_request(include_bytes!("fixtures/chat-request.json")).unwrap();
    assert_eq!(converted.model, "public-text");
    assert!(converted.stream && converted.include_usage);
    assert_eq!(converted.responses["max_output_tokens"], 128);
    assert_eq!(converted.responses["tools"][0]["strict"], false);
    assert_eq!(
        converted.responses["tool_choice"],
        json!({"type":"function","name":"lookup"})
    );
    let input = converted.responses["input"].as_array().unwrap();
    assert_eq!(input[0]["role"], "system");
    assert_eq!(input[1]["role"], "developer");
    assert_eq!(input[2]["content"][0]["type"], "input_text");
    assert_eq!(input[3]["type"], "function_call");
    assert_eq!(input[4]["type"], "function_call_output");
    assert_eq!(input[3]["call_id"], input[4]["call_id"]);
    assert_eq!(input[5]["role"], "assistant");
    assert_eq!(input[5]["content"][0]["type"], "input_text");
    assert!(converted.responses.get("stream_options").is_none());
}

#[test]
fn unsupported_semantics_and_invalid_tool_history_fail_before_dispatch() {
    let base = json!({"model":"public-text","messages":[{"role":"user","content":"synthetic"}]});
    for (field, value) in [
        ("n", json!(2)),
        ("stop", json!("END")),
        ("max_tokens", json!(64)),
        ("logprobs", json!(true)),
        ("audio", json!({})),
        ("previous_response_id", json!("resp_other")),
        ("stream_options", json!({"include_usage":true})),
    ] {
        let mut body = base.clone();
        body[field] = value;
        assert!(
            convert_request(&serde_json::to_vec(&body).unwrap()).is_err(),
            "{field}"
        );
    }
    for messages in [
        json!([{"role":"user","content":[{"type":"image_url","image_url":{"url":"https://example.invalid/synthetic.png"}}]}]),
        json!([{"role":"tool","tool_call_id":"missing","content":"synthetic"}]),
        json!([{"role":"assistant","content":null,"tool_calls":[{"id":"call_a","type":"function","function":{"name":"lookup","arguments":"{}"}}]}]),
        json!([{"role":"user","content":[]}]),
    ] {
        let mut body = base.clone();
        body["messages"] = messages;
        assert!(convert_request(&serde_json::to_vec(&body).unwrap()).is_err());
    }
    let mut body = base;
    body["messages"] = Value::Array(vec![json!({"role":"user","content":"synthetic"}); 257]);
    assert!(convert_request(&serde_json::to_vec(&body).unwrap()).is_err());
}

#[test]
fn buffered_fixture_maps_authoritative_usage_and_rejects_unrepresentable_output() {
    let response = completed();
    let chat = convert_response(&response, "public-text").unwrap();
    assert_eq!(chat["model"], "public-text");
    assert_eq!(chat["choices"][0]["message"]["content"], "synthetic answer");
    assert_eq!(chat["choices"][0]["finish_reason"], "tool_calls");
    assert_eq!(
        chat["usage"],
        json!({"prompt_tokens":12,"completion_tokens":7,"total_tokens":19,"prompt_tokens_details":{"cached_tokens":3},"completion_tokens_details":{"reasoning_tokens":2}})
    );
    let mut missing = response.clone();
    missing.as_object_mut().unwrap().remove("usage");
    assert!(convert_response(&missing, "public-text").unwrap()["usage"].is_null());
    let mut invalid = response.clone();
    invalid["usage"]["total_tokens"] = json!(20);
    assert!(convert_response(&invalid, "public-text").is_err());
    let mut invalid = response.clone();
    invalid["output"][0]["content"][0]["annotations"] = json!([{"type":"url_citation"}]);
    assert!(convert_response(&invalid, "public-text").is_err());
    let mut invalid = response;
    invalid["output"]
        .as_array_mut()
        .unwrap()
        .push(json!({"type":"reasoning","summary":[{"type":"summary_text","text":"synthetic"}]}));
    assert!(convert_response(&invalid, "public-text").is_err());
}

fn emit_content(converter: &mut ChatStreamConverter) -> Vec<Vec<u8>> {
    emit_content_with_item_done(converter, true)
}

fn emit_content_with_item_done(
    converter: &mut ChatStreamConverter,
    complete_items: bool,
) -> Vec<Vec<u8>> {
    let response = completed();
    let mut frames = Vec::new();
    event(converter, json!({"type":"response.output_item.added","output_index":0,"item":{"type":"message","role":"assistant","content":[]}})).unwrap();
    event(converter, json!({"type":"response.content_part.added","output_index":0,"content_index":0,"part":{"type":"output_text","text":"","annotations":[]}})).unwrap();
    frames.extend(event(converter, json!({"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"synthetic "})).unwrap());
    frames.extend(event(converter, json!({"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":"answer"})).unwrap());
    event(converter, json!({"type":"response.output_text.done","output_index":0,"content_index":0,"text":"synthetic answer"})).unwrap();
    if complete_items {
        event(
            converter,
            json!({"type":"response.output_item.done","output_index":0,"item":response["output"][0]}),
        ).unwrap();
    }
    frames.extend(event(converter, json!({"type":"response.output_item.added","output_index":1,"item":{"type":"function_call","call_id":"call_fixture","name":"lookup","arguments":""}})).unwrap());
    frames.extend(event(converter, json!({"type":"response.function_call_arguments.delta","output_index":1,"delta":"{\"key\":"})).unwrap());
    frames.extend(event(converter, json!({"type":"response.function_call_arguments.delta","output_index":1,"delta":"\"fixture\"}"})).unwrap());
    event(converter, json!({"type":"response.function_call_arguments.done","output_index":1,"arguments":"{\"key\":\"fixture\"}"})).unwrap();
    if complete_items {
        event(
            converter,
            json!({"type":"response.output_item.done","output_index":1,"item":response["output"][1]}),
        ).unwrap();
    }
    frames
}

#[test]
fn sparse_terminal_uses_verified_completed_items_and_authoritative_usage() {
    for omit_output in [false, true] {
        let mut converter = ChatStreamConverter::new("public-text".to_owned(), true);
        start(&mut converter);
        emit_content(&mut converter);
        let mut response = completed();
        if omit_output {
            response.as_object_mut().unwrap().remove("output");
        } else {
            response["output"] = json!([]);
        }
        assert!(
            event(
                &mut converter,
                json!({"type":"response.completed","response":response})
            )
            .unwrap()
            .is_empty()
        );
        assert!(converter.finish().is_err());
        let frames = converter.push(DONE_SSE_FRAME.as_bytes()).unwrap();
        converter.finish().unwrap();
        let events = parse_sse_events(std::str::from_utf8(&frames.concat()).unwrap()).unwrap();
        let finish: Value = serde_json::from_str(&events[0].data).unwrap();
        assert_eq!(finish["choices"][0]["finish_reason"], "tool_calls");
        let usage: Value = serde_json::from_str(&events[1].data).unwrap();
        assert!(usage["choices"].as_array().unwrap().is_empty());
        assert_eq!(usage["usage"]["total_tokens"], 19);
        assert_eq!(events.len(), 2);
        assert_eq!(frames.last().unwrap(), DONE_SSE_FRAME.as_bytes());
    }
}

#[test]
fn sparse_and_complete_terminals_reject_unfinished_items_or_inconsistent_snapshots() {
    for output in [Value::Null, json!([]), completed()["output"].clone()] {
        let mut converter = ChatStreamConverter::new("public-text".to_owned(), false);
        start(&mut converter);
        emit_content_with_item_done(&mut converter, false);
        let mut response = completed();
        if output.is_null() {
            response.as_object_mut().unwrap().remove("output");
        } else {
            response["output"] = output;
        }
        assert!(
            event(
                &mut converter,
                json!({"type":"response.completed","response":response})
            )
            .is_err()
        );
        assert!(converter.finish().is_err());
    }
    let mut converter = ChatStreamConverter::new("public-text".to_owned(), false);
    start(&mut converter);
    emit_content(&mut converter);
    let mut response = completed();
    response["output"].as_array_mut().unwrap().pop();
    assert!(
        event(
            &mut converter,
            json!({"type":"response.completed","response":response})
        )
        .is_err()
    );
}

#[test]
fn item_done_rejects_omitted_or_mismatched_streamed_content() {
    for delta in ["", "synthetic ANSWER"] {
        let mut converter = ChatStreamConverter::new("public-text".to_owned(), false);
        start(&mut converter);
        event(&mut converter, json!({"type":"response.output_item.added","output_index":0,"item":{"type":"message","role":"assistant","content":[]}})).unwrap();
        event(&mut converter, json!({"type":"response.content_part.added","output_index":0,"content_index":0,"part":{"type":"output_text","text":"","annotations":[]}})).unwrap();
        if !delta.is_empty() {
            event(&mut converter, json!({"type":"response.output_text.delta","output_index":0,"content_index":0,"delta":delta})).unwrap();
        }
        assert!(event(&mut converter, json!({"type":"response.output_item.done","output_index":0,"item":completed()["output"][0]})).is_err());
    }
}

#[test]
fn stream_preserves_tool_fragments_and_delays_finish_until_execution_done() {
    for include_usage in [false, true] {
        let mut converter = ChatStreamConverter::new("public-text".to_owned(), include_usage);
        let mut frames = start(&mut converter);
        frames.extend(emit_content(&mut converter));
        assert!(
            event(
                &mut converter,
                json!({"type":"response.completed","response":completed()})
            )
            .unwrap()
            .is_empty()
        );
        assert!(converter.finish().is_err());
        frames.extend(converter.push(DONE_SSE_FRAME.as_bytes()).unwrap());
        converter.finish().unwrap();
        let text = String::from_utf8(frames.concat()).unwrap();
        let events = parse_sse_events(&text).unwrap();
        assert!(text.ends_with(DONE_SSE_FRAME));
        let chunks: Vec<Value> = events
            .iter()
            .map(|event| serde_json::from_str(&event.data).unwrap())
            .collect();
        assert!(
            chunks
                .iter()
                .all(|chunk| chunk["id"] == "chatcmpl-resp_fixture"
                    && chunk["model"] == "public-text")
        );
        let content: String = chunks
            .iter()
            .filter_map(|chunk| {
                chunk
                    .pointer("/choices/0/delta/content")
                    .and_then(Value::as_str)
            })
            .collect();
        assert_eq!(content, "synthetic answer");
        let args: String = chunks
            .iter()
            .filter_map(|chunk| {
                chunk
                    .pointer("/choices/0/delta/tool_calls/0/function/arguments")
                    .and_then(Value::as_str)
            })
            .collect();
        assert_eq!(args, "{\"key\":\"fixture\"}");
        assert_eq!(
            chunks
                .iter()
                .filter(|chunk| chunk
                    .pointer("/choices/0/finish_reason")
                    .is_some_and(|reason| reason == "tool_calls"))
                .count(),
            1
        );
        assert_eq!(
            chunks
                .iter()
                .filter(|chunk| chunk["choices"].as_array().unwrap().is_empty())
                .count(),
            usize::from(include_usage)
        );
    }
}

#[test]
fn stream_rejects_missing_or_changed_deltas_and_never_fabricates_stop() {
    let mut converter = ChatStreamConverter::new("public-text".to_owned(), false);
    start(&mut converter);
    assert!(
        event(
            &mut converter,
            json!({"type":"response.completed","response":completed()})
        )
        .is_err()
    );
    let mut converter = ChatStreamConverter::new("public-text".to_owned(), false);
    start(&mut converter);
    emit_content(&mut converter);
    let mut changed = completed();
    changed["output"][0]["content"][0]["text"] = json!("synthetic ANSWER");
    assert!(
        event(
            &mut converter,
            json!({"type":"response.completed","response":changed})
        )
        .is_err()
    );
    let mut converter = ChatStreamConverter::new("public-text".to_owned(), false);
    start(&mut converter);
    let frames = event(&mut converter, json!({"type":"response.failed","response":{"error":{"type":"server_error","code":"fixture_failure","message":"Synthetic failure."}}})).unwrap();
    assert!(
        String::from_utf8(frames.concat())
            .unwrap()
            .contains("fixture_failure")
    );
    let frames = converter.push(DONE_SSE_FRAME.as_bytes()).unwrap();
    assert_eq!(frames, vec![DONE_SSE_FRAME.as_bytes().to_vec()]);
    converter.finish().unwrap();
    let mut converter = ChatStreamConverter::new("public-text".to_owned(), false);
    start(&mut converter);
    assert!(converter.finish().is_err());
    assert!(converter.push(DONE_SSE_FRAME.as_bytes()).is_err());
}

#[test]
fn incomplete_status_maps_supported_finish_reasons_only() {
    for (source, expected) in [
        ("max_output_tokens", "length"),
        ("content_filter", "content_filter"),
    ] {
        let mut response = completed();
        response["status"] = json!("incomplete");
        response["incomplete_details"] = json!({"reason":source});
        assert_eq!(
            convert_response(&response, "public-text").unwrap()["choices"][0]["finish_reason"],
            expected
        );
    }
    let mut response = completed();
    response["status"] = json!("incomplete");
    response["incomplete_details"] = json!({"reason":"unknown"});
    assert!(convert_response(&response, "public-text").is_err());
}
