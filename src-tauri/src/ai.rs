use crate::db::{self, Db};
use crate::models::{Entity, GenerateRequest};
use futures_util::StreamExt;
use serde_json::json;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Default)]
pub struct GenState(pub Mutex<HashMap<String, Arc<AtomicBool>>>);

fn normalize_base(base: &str) -> String {
    let mut b = base.trim().trim_end_matches('/').to_string();
    for suffix in ["/chat/completions", "/models"] {
        if b.ends_with(suffix) {
            b.truncate(b.len() - suffix.len());
            b = b.trim_end_matches('/').to_string();
        }
    }
    if !b.ends_with("/v1") && !b.contains("/v1/") {
        b.push_str("/v1");
    }
    b
}

fn chat_url(base: &str) -> String {
    format!("{}/chat/completions", normalize_base(base))
}

fn models_url(base: &str) -> String {
    format!("{}/models", normalize_base(base))
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(20))
        .timeout(Duration::from_secs(600))
        .build()
        .map_err(|e| format!("HTTP 客户端初始化失败: {e}"))
}

fn truncate(s: &str, n: usize) -> String {
    if s.chars().count() <= n {
        s.to_string()
    } else {
        let out: String = s.chars().take(n).collect();
        format!("{out}…")
    }
}

#[tauri::command]
pub async fn list_models(db: State<'_, Db>, profile_id: i64) -> Result<Vec<String>, String> {
    let (profile, key) = {
        let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
        (
            db::get_profile(&conn, profile_id).map_err(|e| e.to_string())?,
            db::profile_key(&conn, profile_id)?,
        )
    };
    let resp = client()?
        .get(models_url(&profile.base_url))
        .bearer_auth(&key)
        .send()
        .await
        .map_err(|e| format!("连接失败: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!(
            "服务返回 {}：{}",
            status.as_u16(),
            truncate(&text, 240)
        ));
    }
    let value: serde_json::Value =
        serde_json::from_str(&text).map_err(|_| "返回内容不是合法 JSON".to_string())?;
    let mut models: Vec<String> = Vec::new();
    if let Some(arr) = value.get("data").and_then(|v| v.as_array()) {
        for item in arr {
            if let Some(id) = item.get("id").and_then(|v| v.as_str()) {
                models.push(id.to_string());
            } else if let Some(name) = item.get("name").and_then(|v| v.as_str()) {
                models.push(name.to_string());
            }
        }
    } else if let Some(arr) = value.as_array() {
        for item in arr {
            if let Some(id) = item.as_str() {
                models.push(id.to_string());
            }
        }
    }
    models.sort();
    models.dedup();
    Ok(models)
}

#[tauri::command]
pub async fn test_profile(db: State<'_, Db>, profile_id: i64) -> Result<String, String> {
    let (profile, key) = {
        let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
        (
            db::get_profile(&conn, profile_id).map_err(|e| e.to_string())?,
            db::profile_key(&conn, profile_id)?,
        )
    };
    if key.is_empty() {
        return Err("请先填写 API Key".into());
    }
    let body = json!({
        "model": profile.model,
        "messages": [
            {"role": "system", "content": "你是连通性测试助手。"},
            {"role": "user", "content": "只回复四个字：连接成功"}
        ],
        "max_tokens": 24,
        "stream": false
    });
    let resp = client()?
        .post(chat_url(&profile.base_url))
        .bearer_auth(&key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("连接失败: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!(
            "服务返回 {}：{}",
            status.as_u16(),
            truncate(&text, 300)
        ));
    }
    let value: serde_json::Value =
        serde_json::from_str(&text).map_err(|_| "返回内容不是合法 JSON".to_string())?;
    let reply = value
        .pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    Ok(if reply.is_empty() {
        "已连接，但模型返回为空".to_string()
    } else {
        truncate(&reply, 80)
    })
}

#[tauri::command]
pub async fn generate(
    app: AppHandle,
    db: State<'_, Db>,
    gen: State<'_, GenState>,
    req: GenerateRequest,
) -> Result<(), String> {
    let (profile, key) = {
        let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
        (
            db::get_profile(&conn, req.profile_id).map_err(|e| e.to_string())?,
            db::profile_key(&conn, req.profile_id)?,
        )
    };
    if key.is_empty() {
        return Err("尚未配置 API Key，请到「设置 › 模型」填写".into());
    }

    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut map = gen.0.lock().map_err(|_| "状态锁定失败".to_string())?;
        map.insert(req.request_id.clone(), cancel.clone());
    }

    let url = chat_url(&profile.base_url);
    let request_id = req.request_id.clone();
    let app_handle = app.clone();
    let temperature = req.temperature.unwrap_or(profile.temperature);
    let max_tokens = req.max_tokens.unwrap_or(profile.max_tokens);
    let model = profile.model.clone();
    let messages: Vec<serde_json::Value> = req
        .messages
        .iter()
        .map(|m| json!({"role": m.role, "content": m.content}))
        .collect();

    tauri::async_runtime::spawn(async move {
        let result = run_stream(
            &app_handle,
            &url,
            &key,
            &model,
            messages,
            temperature,
            max_tokens,
            &request_id,
            cancel.clone(),
        )
        .await;

        match result {
            Ok(aborted) => {
                let _ = app_handle.emit(
                    "ai://done",
                    json!({"requestId": request_id, "aborted": aborted}),
                );
            }
            Err(err) => {
                let _ = app_handle.emit("ai://error", json!({"requestId": request_id, "message": err}));
            }
        }
        let gen_state = app_handle.state::<GenState>();
        if let Ok(mut map) = gen_state.0.lock() {
            map.remove(&request_id);
        };
    });

    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn run_stream(
    app: &AppHandle,
    url: &str,
    key: &str,
    model: &str,
    messages: Vec<serde_json::Value>,
    temperature: f64,
    max_tokens: i64,
    request_id: &str,
    cancel: Arc<AtomicBool>,
) -> Result<bool, String> {
    let body = json!({
        "model": model,
        "messages": messages,
        "stream": true,
        "temperature": temperature,
        "max_tokens": max_tokens
    });

    let resp = client()?
        .post(url)
        .bearer_auth(key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("连接失败: {e}"))?;

    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!(
            "模型返回 {}：{}",
            status.as_u16(),
            truncate(&text, 360)
        ));
    }

    let mut stream = resp.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();
    let mut aborted = false;

    'outer: while !aborted {
        if cancel.load(Ordering::Relaxed) {
            aborted = true;
            break;
        }
        // Guard against providers that keep the connection open without sending data.
        let next = tokio::time::timeout(Duration::from_secs(90), stream.next()).await;
        let chunk = match next {
            Err(_) => return Err("模型长时间没有响应（90 秒），已中止".into()),
            Ok(None) => break,
            Ok(Some(item)) => item,
        };
        let bytes = chunk.map_err(|e| format!("流式读取中断: {e}"))?;
        buf.extend_from_slice(&bytes);

        while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
            let line_bytes: Vec<u8> = buf.drain(..=pos).collect();
            let line = String::from_utf8_lossy(&line_bytes).trim().to_string();
            if line.is_empty() {
                continue;
            }
            let Some(data) = line.strip_prefix("data:") else {
                continue;
            };
            let data = data.trim();
            if data == "[DONE]" {
                break 'outer;
            }
            let Ok(value) = serde_json::from_str::<serde_json::Value>(data) else {
                continue;
            };
            if let Some(err) = value.get("error") {
                return Err(format!("模型错误: {err}"));
            }
            if let Some(reasoning) = value
                .pointer("/choices/0/delta/reasoning_content")
                .and_then(|v| v.as_str())
            {
                if !reasoning.is_empty() {
                    let _ = app.emit(
                        "ai://reasoning",
                        json!({"requestId": request_id, "text": reasoning}),
                    );
                }
            }
            if let Some(text) = value
                .pointer("/choices/0/delta/content")
                .and_then(|v| v.as_str())
            {
                if !text.is_empty() {
                    let _ = app.emit(
                        "ai://delta",
                        json!({"requestId": request_id, "text": text}),
                    );
                }
            }
        }
    }

    if !aborted && cancel.load(Ordering::Relaxed) {
        aborted = true;
    }
    Ok(aborted)
}

#[tauri::command]
pub fn cancel_generation(gen: State<'_, GenState>, request_id: String) -> Result<(), String> {
    if let Ok(map) = gen.0.lock() {
        if let Some(flag) = map.get(&request_id) {
            flag.store(true, Ordering::Relaxed);
        }
    }
    Ok(())
}

fn strip_reasoning_prefix(text: &str) -> String {
    let mut out = text.trim().to_string();
    for prefix in ["摘要：", "摘要:", "本章摘要：", "章节摘要：", "概括："] {
        if let Some(rest) = out.strip_prefix(prefix) {
            out = rest.trim().to_string();
        }
    }
    out.trim_matches('“')
        .trim_matches('”')
        .trim_matches('"')
        .trim()
        .to_string()
}

/// Non-streaming chapter summary. Writes the result back to the chapter row.
#[tauri::command]
pub async fn summarize_chapter(
    db: State<'_, Db>,
    chapter_id: i64,
    profile_id: i64,
) -> Result<String, String> {
    let (profile, key, title, content) = {
        let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
        let profile = db::get_profile(&conn, profile_id).map_err(|e| e.to_string())?;
        let key = db::profile_key(&conn, profile_id)?;
        let chapter = db::get_chapter(&conn, chapter_id).map_err(|e| e.to_string())?;
        (profile, key, chapter.meta.title, chapter.content)
    };
    if key.is_empty() {
        return Err("尚未配置 API Key".into());
    }
    if content.trim().is_empty() {
        return Err("本章还没有正文".into());
    }

    let excerpt: String = content.chars().take(14000).collect();
    let body = json!({
        "model": profile.model,
        "messages": [
            {
                "role": "system",
                "content": "你是资深小说编辑。用 2-4 句话概括给定的章节：发生了什么关键事件、人物状态有何变化、埋下或推进了哪些伏笔。只输出摘要本身，不要标题、不要分点、不要评价。"
            },
            {
                "role": "user",
                "content": format!("章节标题：{title}\n\n正文：\n{excerpt}")
            }
        ],
        "temperature": 0.3,
        "max_tokens": 320,
        "stream": false
    });

    let resp = client()?
        .post(chat_url(&profile.base_url))
        .bearer_auth(&key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("连接失败: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!(
            "模型返回 {}：{}",
            status.as_u16(),
            truncate(&text, 300)
        ));
    }
    let value: serde_json::Value =
        serde_json::from_str(&text).map_err(|_| "返回内容不是合法 JSON".to_string())?;
    let raw = value
        .pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let summary = strip_reasoning_prefix(&raw);
    if summary.is_empty() {
        return Err("模型没有返回摘要".into());
    }

    let words = db::count_words(&content);
    {
        let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
        db::set_chapter_summary(&conn, chapter_id, &summary, words).map_err(|e| e.to_string())?;
    }
    Ok(summary)
}

/// Non-streaming chapter outline (beat sheet). Writes the result to the chapter row.
#[tauri::command]
pub async fn generate_outline(
    db: State<'_, Db>,
    chapter_id: i64,
    profile_id: i64,
) -> Result<String, String> {
    let (profile, key, chapter, project, chapters) = {
        let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
        let profile = db::get_profile(&conn, profile_id).map_err(|e| e.to_string())?;
        let key = db::profile_key(&conn, profile_id)?;
        let chapter = db::get_chapter(&conn, chapter_id).map_err(|e| e.to_string())?;
        let project = db::get_project(&conn, chapter.meta.project_id).map_err(|e| e.to_string())?;
        let chapters = db::list_chapters(&conn, chapter.meta.project_id).map_err(|e| e.to_string())?;
        (profile, key, chapter, project, chapters)
    };
    if key.is_empty() {
        return Err("尚未配置 API Key".into());
    }

    let index = chapters.iter().position(|c| c.id == chapter_id).unwrap_or(0);
    let mut prev = String::new();
    let start = index.saturating_sub(3);
    for c in &chapters[start..index] {
        if !c.summary.trim().is_empty() {
            prev.push_str(&format!("{}：{}\n", c.title, c.summary.trim()));
        }
    }
    let chars: Vec<char> = chapter.content.chars().collect();
    let recent: String = chars[chars.len().saturating_sub(1500)..].iter().collect();
    let user = format!(
        "作品：{}\n类型：{}\n视角：{}\n文风：{}\n\n【故事梗概】\n{}\n\n【前情】\n{}\n\n【本章】{}\n\n【本章已写内容（可能为空）】\n{}\n\n请给出本章的 3-6 个节拍，用于指导写作。",
        project.title,
        project.genre,
        project.pov,
        project.style_guide,
        project.synopsis,
        if prev.trim().is_empty() { "（无）" } else { prev.trim() },
        chapter.meta.title,
        if recent.trim().is_empty() { "（尚未动笔）" } else { recent.trim() }
    );

    let body = json!({
        "model": profile.model,
        "messages": [
            {
                "role": "system",
                "content": "你是小说结构编辑。输出本章的节拍清单：每行一条，以「· 」开头，写清这一拍发生什么、谁推动、情绪如何变化。只输出清单本身，不要标题、不要总结、不要解释。"
            },
            { "role": "user", "content": user }
        ],
        "temperature": 0.7,
        "max_tokens": 600,
        "stream": false
    });

    let resp = client()?
        .post(chat_url(&profile.base_url))
        .bearer_auth(&key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("连接失败: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("模型返回 {}：{}", status.as_u16(), truncate(&text, 300)));
    }
    let value: serde_json::Value =
        serde_json::from_str(&text).map_err(|_| "返回内容不是合法 JSON".to_string())?;
    let raw = value
        .pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if raw.is_empty() {
        return Err("模型没有返回章纲".into());
    }

    {
        let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
        db::set_chapter_outline(&conn, chapter_id, &raw).map_err(|e| e.to_string())?;
    }
    Ok(raw)
}

/// Extract new characters / places / items from a chapter and store them.
#[tauri::command]
pub async fn extract_entities(
    db: State<'_, Db>,
    chapter_id: i64,
    profile_id: i64,
) -> Result<Vec<Entity>, String> {
    let (profile, key, chapter, existing) = {
        let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
        let profile = db::get_profile(&conn, profile_id).map_err(|e| e.to_string())?;
        let key = db::profile_key(&conn, profile_id)?;
        let chapter = db::get_chapter(&conn, chapter_id).map_err(|e| e.to_string())?;
        let existing = db::list_entities(&conn, chapter.meta.project_id).map_err(|e| e.to_string())?;
        (profile, key, chapter, existing)
    };
    if key.is_empty() {
        return Err("尚未配置 API Key".into());
    }
    if chapter.content.trim().is_empty() {
        return Err("本章还没有正文".into());
    }

    let excerpt: String = chapter.content.chars().take(12000).collect();
    let known = existing
        .iter()
        .map(|e| e.name.as_str())
        .collect::<Vec<_>>()
        .join("、");
    let body = json!({
        "model": profile.model,
        "messages": [
            {
                "role": "system",
                "content": "你是小说设定整理助手。从章节正文中抽取值得长期记住的设定：人物、地点、势力、物品、世界观概念。只输出 JSON 数组，不要 markdown 代码块，不要解释。每项字段：kind（character/location/faction/item/concept）、name、aliases（逗号分隔，可为空）、role（身份，可为空）、description（40 字以内，写关键特征）。最多 12 条，按重要性排序。"
            },
            {
                "role": "user",
                "content": format!("已有人物/设定：{}\n\n章节：{}\n\n正文：\n{}",
                    if known.is_empty() { "（无）" } else { &known },
                    chapter.meta.title,
                    excerpt)
            }
        ],
        "temperature": 0.2,
        "max_tokens": 1200,
        "stream": false
    });

    let resp = client()?
        .post(chat_url(&profile.base_url))
        .bearer_auth(&key)
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("连接失败: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("模型返回 {}：{}", status.as_u16(), truncate(&text, 300)));
    }
    let value: serde_json::Value =
        serde_json::from_str(&text).map_err(|_| "返回内容不是合法 JSON".to_string())?;
    let raw = value
        .pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let json_text = match (raw.find('['), raw.rfind(']')) {
        (Some(a), Some(b)) if b > a => &raw[a..=b],
        _ => return Err("模型没有返回有效的设定数组".into()),
    };
    let items: Vec<serde_json::Value> =
        serde_json::from_str(json_text).map_err(|e| format!("解析设定失败: {e}"))?;

    let allowed = ["character", "location", "faction", "item", "concept"];
    let known_names: Vec<String> = existing.iter().map(|e| e.name.clone()).collect();
    let mut saved = Vec::new();
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    for item in items.into_iter().take(12) {
        let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("").trim();
        if name.is_empty() || known_names.iter().any(|n| n == name) {
            continue;
        }
        if saved.iter().any(|e: &Entity| e.name == name) {
            continue;
        }
        let kind = item
            .get("kind")
            .and_then(|v| v.as_str())
            .filter(|k| allowed.contains(k))
            .unwrap_or("concept");
        let entity = Entity {
            id: 0,
            project_id: chapter.meta.project_id,
            kind: kind.to_string(),
            name: name.to_string(),
            aliases: item.get("aliases").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            role: item.get("role").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            description: item
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .chars()
                .take(120)
                .collect(),
            speech_style: String::new(),
            speech_length: "medium".to_string(),
            speech_words: String::new(),
            speech_taboo: String::new(),
            updated_at: String::new(),
        };
        if let Ok(saved_entity) = db::upsert_entity(&conn, &entity) {
            saved.push(saved_entity);
        }
    }
    Ok(saved)
}
