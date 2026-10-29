use crate::db::{self, Db};
use crate::models::{CandidateJudgement, Entity, GenerateRequest, ProfileInput, SettingsCandidate};
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

fn resolve_input_key(db: &Db, input: &ProfileInput) -> Result<String, String> {
    if let Some(k) = input.api_key.as_ref() {
        let k = k.trim();
        if !k.is_empty() {
            return Ok(k.to_string());
        }
    }
    if input.id > 0 {
        let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
        return db::profile_key(&conn, input.id);
    }
    Err("请先填写 API Key".into())
}

async fn request_models(base_url: &str, key: &str) -> Result<Vec<String>, String> {
    if base_url.trim().is_empty() {
        return Err("请先填写接口地址".into());
    }
    let resp = client()?
        .get(models_url(base_url))
        .bearer_auth(key)
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
pub async fn list_models(db: State<'_, Db>, profile_id: i64) -> Result<Vec<String>, String> {
    let (base_url, key) = {
        let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
        (
            db::get_profile(&conn, profile_id)
                .map_err(|e| e.to_string())?
                .base_url,
            db::profile_key(&conn, profile_id)?,
        )
    };
    request_models(&base_url, &key).await
}

/// Fetch models using the values currently in the form (unsaved edits included).
#[tauri::command]
pub async fn list_models_config(
    db: State<'_, Db>,
    input: ProfileInput,
) -> Result<Vec<String>, String> {
    let key = resolve_input_key(&db, &input)?;
    request_models(&input.base_url, &key).await
}

async fn request_test(base_url: &str, model: &str, key: &str) -> Result<String, String> {
    if base_url.trim().is_empty() {
        return Err("请先填写接口地址".into());
    }
    if model.trim().is_empty() {
        return Err("请先填写模型名".into());
    }
    if key.is_empty() {
        return Err("请先填写 API Key".into());
    }
    let body = json!({
        "model": model,
        "messages": [
            {"role": "system", "content": "你是连通性测试助手。"},
            {"role": "user", "content": "只回复四个字：连接成功"}
        ],
        "max_tokens": 24,
        "stream": false
    });
    let resp = client()?
        .post(chat_url(base_url))
        .bearer_auth(key)
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
pub async fn test_profile(db: State<'_, Db>, profile_id: i64) -> Result<String, String> {
    let (profile, key) = {
        let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
        (
            db::get_profile(&conn, profile_id).map_err(|e| e.to_string())?,
            db::profile_key(&conn, profile_id)?,
        )
    };
    request_test(&profile.base_url, &profile.model, &key).await
}

/// Test using the values currently in the form (unsaved edits included).
#[tauri::command]
pub async fn test_config(db: State<'_, Db>, input: ProfileInput) -> Result<String, String> {
    let key = resolve_input_key(&db, &input)?;
    request_test(&input.base_url, &input.model, &key).await
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
/// 以 80ms 为粒度轮询取消标记，让 `select!` 能在等网络数据时被叫醒。
async fn wait_for_cancel(cancel: Arc<AtomicBool>) {
    loop {
        if cancel.load(Ordering::Relaxed) {
            return;
        }
        tokio::time::sleep(Duration::from_millis(80)).await;
    }
}

/// 处理一行 SSE 数据，把正文/思考过程推给前端。返回 true 表示收到 [DONE]。
fn handle_sse_line(app: &AppHandle, request_id: &str, raw: &str) -> Result<bool, String> {
    let line = raw.trim();
    let Some(data) = line.strip_prefix("data:") else {
        return Ok(false);
    };
    let data = data.trim();
    if data.is_empty() {
        return Ok(false);
    }
    if data == "[DONE]" {
        return Ok(true);
    }
    let Ok(value) = serde_json::from_str::<serde_json::Value>(data) else {
        return Ok(false);
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
    Ok(false)
}

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
        // 取消必须能压过「等下一个 chunk」：把取消信号和读流放进同一个 select，
        // 否则用户点停止后还要等到下一块数据到达（最坏 90 秒），期间模型继续烧 token。
        let next = tokio::select! {
            biased;
            _ = wait_for_cancel(cancel.clone()) => {
                aborted = true;
                break 'outer;
            }
            r = tokio::time::timeout(Duration::from_secs(90), stream.next()) => r,
        };
        // Guard against providers that keep the connection open without sending data.
        let chunk = match next {
            Err(_) => return Err("模型长时间没有响应（90 秒），已中止".into()),
            Ok(None) => break,
            Ok(Some(item)) => item,
        };
        let bytes = chunk.map_err(|e| format!("流式读取中断: {e}"))?;
        buf.extend_from_slice(&bytes);

        while let Some(pos) = buf.iter().position(|&b| b == b'\n') {
            let line_bytes: Vec<u8> = buf.drain(..=pos).collect();
            let line = String::from_utf8_lossy(&line_bytes).to_string();
            if handle_sse_line(app, request_id, &line)? {
                break 'outer;
            }
        }
    }

    // 有的服务最后一块不带换行就断流，剩在缓冲区里的正文不能丢。
    if !aborted && !buf.is_empty() {
        let tail = String::from_utf8_lossy(&buf).to_string();
        handle_sse_line(app, request_id, &tail)?;
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

    // 摘要在长章上要同时看开头和结尾：只截前 14000 字会把章末的转折与钩子漏掉，
    // 摘要一错，后面几章的上下文就跟着错。
    let chars: Vec<char> = content.chars().collect();
    let excerpt: String = if chars.len() <= 14000 {
        content.clone()
    } else {
        let head: String = chars[..9000].iter().collect();
        let tail: String = chars[chars.len() - 5000..].iter().collect();
        format!("{head}\n\n……（中间略）……\n\n{tail}")
    };
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

fn clean_name_lines(raw: &str, prefix: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for line in raw.lines() {
        let mut s = line.trim();
        s = s.trim_start_matches(|c: char| {
            c.is_ascii_digit() || matches!(c, '.' | '、' | ')' | '）' | '(' | '（' | '-' | '·' | ' ')
        });
        s = s
            .trim()
            .trim_matches(|c| matches!(c, '"' | '“' | '”' | '『' | '』' | '「' | '」'))
            .trim_start_matches("标题：")
            .trim_start_matches("标题:")
            .trim();
        if s.is_empty() || s.chars().count() > 24 {
            continue;
        }
        let name = if !s.starts_with('第') && !prefix.is_empty() {
            format!("{prefix} {s}")
        } else {
            s.to_string()
        };
        if !out.contains(&name) {
            out.push(name);
        }
        if out.len() == 3 {
            break;
        }
    }
    out
}

/// Suggest a chapter title from the outline and current text. Does not write.
#[tauri::command]
pub async fn generate_title(
    db: State<'_, Db>,
    chapter_id: i64,
    profile_id: i64,
) -> Result<Vec<String>, String> {
    let (profile, key, chapter, project) = {
        let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
        let profile = db::get_profile(&conn, profile_id).map_err(|e| e.to_string())?;
        let key = db::profile_key(&conn, profile_id)?;
        let chapter = db::get_chapter(&conn, chapter_id).map_err(|e| e.to_string())?;
        let project = db::get_project(&conn, chapter.meta.project_id).map_err(|e| e.to_string())?;
        (profile, key, chapter, project)
    };
    if key.is_empty() {
        return Err("尚未配置 API Key".into());
    }
    let content = chapter.content.trim();
    let outline = chapter.meta.outline.trim();
    if content.is_empty() && outline.is_empty() {
        return Err("本章还没有正文或章纲，先写一点再命名".into());
    }

    // Give the model both the opening and the ending: the opening usually sets
    // the scene, the ending carries the hook. A tail-only excerpt invites
    // titles about some random last-minute object.
    let chars: Vec<char> = content.chars().collect();
    let excerpt = if chars.len() <= 3200 {
        content.to_string()
    } else {
        let head: String = chars[..1600].iter().collect();
        let tail: String = chars[chars.len() - 1600..].iter().collect();
        format!("{head}\n\n……（中间略）……\n\n{tail}")
    };
    let prefix = chapter
        .meta
        .title
        .split_whitespace()
        .next()
        .filter(|s| s.starts_with('第') && s.contains('章'))
        .unwrap_or("")
        .to_string();

    let user = format!(
        "作品：{}\n类型：{}\n视角：{}\n\n【本章章纲】\n{}\n\n【本章摘要】\n{}\n\n【本章正文】\n{}\n\n请给这一章拟 3 个标题候选。",
        project.title,
        project.genre,
        project.pov,
        if outline.is_empty() { "（无）" } else { outline },
        if chapter.meta.summary.trim().is_empty() { "（无）" } else { chapter.meta.summary.trim() },
        if excerpt.trim().is_empty() { "（尚未动笔）" } else { excerpt.trim() }
    );

    let body = json!({
        "model": profile.model,
        "messages": [
            {
                "role": "system",
                "content": "你是中文小说编辑。为给定章节拟 3 个标题候选，每行一个。\n规则：\n1. 标题必须来自本章实际写到的事件、场景或物件；正文和摘要里没有出现过的意象不要用。\n2. 优先具体事件或物品（换座、补习、最后一瓶汽水），不要抽象抒情，不要用“枕边”“那颗”这种悬而未决的意象。\n3. 四到十个字，不加序号、引号或句号，不剧透结尾。\n4. 只输出这 3 行，不要解释。"
            },
            { "role": "user", "content": user }
        ],
        "temperature": 0.6,
        "max_tokens": 90,
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

    let titles = clean_name_lines(&raw, &prefix);
    if titles.is_empty() {
        return Err("模型没有返回标题，再试一次".into());
    }
    Ok(titles)
}

/// Suggest volume names (3 candidates) from the chapters in that volume.
#[tauri::command]
pub async fn generate_volume_name(
    db: State<'_, Db>,
    chapter_id: i64,
    profile_id: i64,
) -> Result<Vec<String>, String> {
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

    let volume = chapter.meta.volume.trim();
    let peers: Vec<&crate::models::ChapterMeta> = if volume.is_empty() {
        chapters.iter().take(3).collect()
    } else {
        chapters.iter().filter(|c| c.volume.trim() == volume).collect()
    };
    let mut digest = String::new();
    for c in peers.iter().take(12) {
        if !c.summary.trim().is_empty() {
            digest.push_str(&format!("{}：{}\n", c.title, c.summary.trim()));
        }
    }
    let outline = chapter.meta.outline.trim();
    if digest.trim().is_empty() && outline.is_empty() && chapter.content.trim().is_empty() {
        return Err("这一卷还没有正文或摘要，先写一点再命名".into());
    }

    let prefix = volume
        .split_whitespace()
        .next()
        .filter(|s| s.starts_with('第') && s.contains('卷'))
        .unwrap_or("第一卷")
        .to_string();

    let user = format!(
        "作品：{}\n类型：{}\n\n【故事梗概】\n{}\n\n【本卷章节摘要】\n{}\n\n【当前章章纲】\n{}\n\n请为这一卷拟 3 个卷名候选。",
        project.title,
        project.genre,
        if project.synopsis.trim().is_empty() { "（无）" } else { project.synopsis.trim() },
        if digest.trim().is_empty() { "（暂无）" } else { digest.trim() },
        if outline.is_empty() { "（无）" } else { outline }
    );

    let body = json!({
        "model": profile.model,
        "messages": [
            {
                "role": "system",
                "content": "你是中文小说编辑。为给定的一卷拟 3 个卷名候选，每行一个，格式「第X卷 标题」。\n规则：\n1. 卷名必须来自这一卷实际写到的事件、场景或物件；没出现过的意象不要用。\n2. 四到八个字，具体、好记，不要抽象抒情。\n3. 不加序号、引号或句号，不剧透结局。\n4. 只输出这 3 行，不要解释。"
            },
            { "role": "user", "content": user }
        ],
        "temperature": 0.6,
        "max_tokens": 90,
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

    let names = clean_name_lines(&raw, &prefix);
    if names.is_empty() {
        return Err("模型没有返回卷名，再试一次".into());
    }
    Ok(names)
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

    // 和后文摘要一样：长章只看开头会漏掉后半段才出场的人物与地点。
    let chars: Vec<char> = chapter.content.chars().collect();
    let excerpt: String = if chars.len() <= 12000 {
        chapter.content.clone()
    } else {
        let head: String = chars[..8000].iter().collect();
        let tail: String = chars[chars.len() - 4000..].iter().collect();
        format!("{head}\n\n……（中间略）……\n\n{tail}")
    };
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

fn candidate_field(item: &serde_json::Value, keys: &[&str]) -> String {
    for key in keys {
        if let Some(v) = item.get(*key).and_then(|v| v.as_str()) {
            let t = v.trim();
            if !t.is_empty() {
                return t.to_string();
            }
        }
    }
    String::new()
}

/// 明显不是设定条目的泛指词。模型偶尔会把它们当条目抽出来。
const JUNK_NAMES: [&str; 10] = [
    "所有人",
    "大家",
    "众人",
    "人们",
    "路人",
    "别人",
    "有人",
    "其他人",
    "一群人",
    "同学们",
];

fn build_candidates(items: &[serde_json::Value]) -> Vec<SettingsCandidate> {
    let allowed = ["character", "location", "faction", "item", "concept"];
    let mut out: Vec<SettingsCandidate> = Vec::new();
    for item in items.iter().take(24) {
        let name = candidate_field(item, &["name", "title"]);
        // 单字名（糖 / 伞）和泛指词几乎都是噪声，直接丢掉。
        if name.chars().count() < 2 || JUNK_NAMES.contains(&name.as_str()) {
            continue;
        }
        if out.iter().any(|c| c.name == name) {
            continue;
        }
        let kind_raw = candidate_field(item, &["kind", "type"]).to_lowercase();
        let kind = if allowed.contains(&kind_raw.as_str()) {
            kind_raw
        } else {
            "concept".to_string()
        };
        let mut speech_length =
            candidate_field(item, &["speechLength", "speech_length"]).to_lowercase();
        if !["short", "medium", "long"].contains(&speech_length.as_str()) {
            speech_length = "medium".to_string();
        }
        out.push(SettingsCandidate {
            kind,
            name,
            aliases: candidate_field(item, &["aliases", "alias"]),
            role: candidate_field(item, &["role", "identity"]),
            description: candidate_field(item, &["description", "desc"])
                .chars()
                .take(200)
                .collect(),
            speech_style: candidate_field(item, &["speechStyle", "speech_style"]),
            speech_length,
            speech_words: candidate_field(item, &["speechWords", "speech_words"]),
            speech_taboo: candidate_field(item, &["speechTaboo", "speech_taboo"]),
            source: candidate_field(item, &["source", "quote", "evidence"])
                .chars()
                .take(80)
                .collect(),
        });
    }
    out
}

/// 从一段任意文本里识别设定候选。只返回结果，不写库，由用户预览确认后再入库。
#[tauri::command]
pub async fn extract_settings(
    db: State<'_, Db>,
    text: String,
    project_id: i64,
    profile_id: i64,
) -> Result<Vec<SettingsCandidate>, String> {
    let trimmed = text.trim();
    if trimmed.chars().count() < 8 {
        return Err("内容太短，至少粘贴一段话".into());
    }
    let excerpt: String = trimmed.chars().take(20000).collect();

    let (profile, key, existing) = {
        let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
        let profile = db::get_profile(&conn, profile_id).map_err(|e| e.to_string())?;
        let key = db::profile_key(&conn, profile_id)?;
        let existing = db::list_entities(&conn, project_id).map_err(|e| e.to_string())?;
        (profile, key, existing)
    };
    if key.is_empty() {
        return Err("尚未配置 API Key".into());
    }

    // 已有设定带上类型和身份，模型才能判断"这是同一个人"还是"新角色"，
    // 也能看出这段文字有没有补充新信息。
    let known = existing
        .iter()
        .take(120)
        .map(|e| {
            let kind = match e.kind.as_str() {
                "character" => "人物",
                "location" => "地点",
                "faction" => "势力",
                "item" => "物品",
                _ => "设定",
            };
            let role = e.role.trim();
            if role.is_empty() {
                format!("{}({})", e.name, kind)
            } else {
                format!("{}({}·{})", e.name, kind, role)
            }
        })
        .collect::<Vec<_>>()
        .join("、");
    let known = if known.is_empty() {
        "（无）".to_string()
    } else {
        known
    };

    let system = r#"你是小说设定整理助手。用户会给一段文字（人物小传、大纲、正文片段、设定草稿），你从中抽出"以后写别的章节还会用到"的设定。只输出 JSON 数组，不要 markdown 代码块，不要解释。

【什么才算一条设定】
必须同时满足两条：①有专名（人名、地名、组织名、物品名、术语）；②忘掉它，后面就会写错。
不够格的不要抽：
- 一次性的道具和环境（一杯咖啡、一把伞、一辆出租车）
- 只出现一次、没有名字的龙套（服务员、路人甲）
- 泛称（所有人、大家、同学们）
- 纯情绪、纯氛围、纯动作

【字段】
- kind：character / location / faction / item / concept
- name：名称，人物用本名
- aliases：别名或称呼，逗号分隔，可为空
- role：身份标签，12 字以内，可为空
- description：80 字以内，写"以后会用到的信息"——身份、动机、与主角的关系、固定特征；不要复述剧情
- speechStyle：口癖 / 语气，只对人物，可为空
- speechLength：short / medium / long，不确定填 medium
- speechWords：常用词，逗号分隔，可为空
- speechTaboo：不符合这个人物的词，逗号分隔，可为空
- source：原文里支撑这条设定的一句话，30 字以内

【判断规则】
1. 同一人物的不同称呼（本名、绰号、别人怎么叫他）合并成一条：本名放 name，其余放 aliases。
2. 亲属、同事这类"关系人"只在有名有姓、或后文会反复出场时单列；只是背景板（"她妈妈在厨房"）就写进本人的 description。
3. 地点写到能定位为止（"图书馆三楼靠窗"优于"图书馆"）；同一栋楼的多个位置合并成一条，具体位置写进 description。
4. 分类：有独立人格用 character；能去的地方用 location；组织/团体/门派用 faction；能被拿走的具体物件用 item；规则、系统、功法、世界观用 concept。
5. 一个人只有名字、没有任何可复用信息时，不要单独输出；把名字并进相关条目。
6. 人物最多 12 条，其他类型合计最多 12 条，按重要性从高到低排列（主角 → 常驻配角 → 背景）。

【和已有设定的关系】
7. 已有设定里出现过的条目：如果这段文字给了新信息（新称呼、新身份、新关系、新口癖），仍然输出它，description 只写新增的部分，不要重复已有内容。
8. 完全没有新信息的，不要输出。
9. 不确定是不是同一个人的，宁可另起一条，不要硬合并。"#;

    let body = json!({
        "model": profile.model,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": format!("已有设定（不要重复）：{}\n\n待整理文本：\n{}", known, excerpt) }
        ],
        "temperature": 0.2,
        "max_tokens": 1800,
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
    let payload: serde_json::Value =
        serde_json::from_str(&text).map_err(|_| "返回内容不是合法 JSON".to_string())?;
    let raw = payload
        .pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let json_text = match (raw.find('['), raw.rfind(']')) {
        (Some(a), Some(b)) if b > a => &raw[a..=b],
        _ => return Err("模型没有返回有效的设定数组".into()),
    };
    let parsed: serde_json::Value =
        serde_json::from_str(json_text).map_err(|e| format!("解析设定失败: {e}"))?;
    let items = if let Some(arr) = parsed.as_array() {
        arr.clone()
    } else {
        ["entities", "items", "settings", "data"]
            .iter()
            .find_map(|k| parsed.get(*k).and_then(|v| v.as_array()).cloned())
            .ok_or_else(|| "模型没有返回有效的设定数组".to_string())?
    };

    let out = build_candidates(&items);
    if out.is_empty() {
        return Err("没有识别出可用的设定，换一段文字再试".into());
    }
    Ok(out)
}

/// 让模型给多版候选打分，挑出最想让读者继续读的一版。只返回评分，不改正文。
#[tauri::command]
pub async fn judge_candidates(
    db: State<'_, Db>,
    items: Vec<String>,
    context: String,
    profile_id: i64,
) -> Result<CandidateJudgement, String> {
    if items.len() < 2 {
        return Err("至少需要两版候选".into());
    }
    let (profile, key) = {
        let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
        let profile = db::get_profile(&conn, profile_id).map_err(|e| e.to_string())?;
        let key = db::profile_key(&conn, profile_id)?;
        (profile, key)
    };
    if key.is_empty() {
        return Err("尚未配置 API Key".into());
    }

    let mut listing = String::new();
    for (i, text) in items.iter().enumerate() {
        let body: String = text.trim().chars().take(1500).collect();
        listing.push_str(&format!("### 第{}版\n{}\n\n", i + 1, body));
    }

    let system = r#"你是小说编辑。下面是同一段上文写出的几个续写版本，请判断哪一版最让读者想继续读。
按重要性排序的标准：
1. 结束时有没有发生可复述的变化：决定、拒绝、发现、撒谎、关系移动；只有气氛和心理、什么都没发生的版本分数要低。
2. 对白有没有潜台词，人物是否分得出谁在说话。
3. 细节是否具体（物件、动作、距离），还是抽象总结。
4. 结尾的钩子是否具体，还是“似乎”“隐约”这类空钩子。
5. 有没有套语和解释性旁白。
不要因为文笔华丽或字数多加分。
只输出 JSON，不要 markdown、不要解释：{"best": 1, "scores": [80, 65, 72], "reason": "25 字以内说明"}"#;

    let body = json!({
        "model": profile.model,
        "messages": [
            { "role": "system", "content": system },
            { "role": "user", "content": format!(
                "【本章】\n{}\n\n【候选】\n{}",
                context.chars().take(1500).collect::<String>(),
                listing
            ) }
        ],
        "temperature": 0.2,
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
        return Err(format!("模型返回 {}：{}", status.as_u16(), truncate(&text, 300)));
    }
    let payload: serde_json::Value =
        serde_json::from_str(&text).map_err(|_| "返回内容不是合法 JSON".to_string())?;
    let raw = payload
        .pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let json_text = match (raw.find('{'), raw.rfind('}')) {
        (Some(a), Some(b)) if b > a => &raw[a..=b],
        _ => return Err("模型没有返回评分 JSON".into()),
    };
    let parsed: serde_json::Value =
        serde_json::from_str(json_text).map_err(|e| format!("解析评分失败: {e}"))?;

    let best = parsed
        .get("best")
        .and_then(|v| v.as_i64())
        .unwrap_or(1)
        .clamp(1, items.len() as i64);
    let reason: String = parsed
        .get("reason")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .chars()
        .take(60)
        .collect();
    let scores: Vec<i64> = parsed
        .get("scores")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_i64())
                .map(|n| n.clamp(0, 100))
                .collect()
        })
        .unwrap_or_default();

    Ok(CandidateJudgement {
        best,
        reason,
        scores,
    })
}
