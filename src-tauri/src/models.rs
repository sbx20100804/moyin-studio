use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: i64,
    pub title: String,
    pub synopsis: String,
    pub style_guide: String,
    /// 文风预设：light / web / literary / custom
    #[serde(default)]
    pub voice: String,
    /// 可选：一段喜欢的文字，作为语感样本
    #[serde(default)]
    pub style_sample: String,
    pub pov: String,
    pub genre: String,
    pub target_words: i64,
    pub accent: String,
    pub created_at: String,
    pub updated_at: String,
    pub word_count: i64,
    pub chapter_count: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ChapterMeta {
    pub id: i64,
    pub project_id: i64,
    pub title: String,
    pub summary: String,
    pub outline: String,
    pub volume: String,
    pub position: i64,
    pub status: String,
    pub word_count: i64,
    pub summary_words: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Chapter {
    #[serde(flatten)]
    pub meta: ChapterMeta,
    pub content: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Entity {
    pub id: i64,
    pub project_id: i64,
    pub kind: String,
    pub name: String,
    pub aliases: String,
    pub role: String,
    pub description: String,
    /// 只对 character 有意义：口癖 / 语气
    #[serde(default)]
    pub speech_style: String,
    /// short / medium / long
    #[serde(default)]
    pub speech_length: String,
    /// 常用词，逗号分隔
    #[serde(default)]
    pub speech_words: String,
    /// 禁用词，逗号分隔
    #[serde(default)]
    pub speech_taboo: String,
    pub updated_at: String,
}

/// AI 从一段文本里识别出的设定候选，先给用户预览，确认后才落库。
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SettingsCandidate {
    pub kind: String,
    pub name: String,
    #[serde(default)]
    pub aliases: String,
    #[serde(default)]
    pub role: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub speech_style: String,
    #[serde(default)]
    pub speech_length: String,
    #[serde(default)]
    pub speech_words: String,
    #[serde(default)]
    pub speech_taboo: String,
    /// 原文里支撑这条设定的一句话，方便用户判断真假
    #[serde(default)]
    pub source: String,
}

/// 多候选自动评估的结果。
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CandidateJudgement {
    /// 胜出版本号，从 1 开始
    pub best: i64,
    #[serde(default)]
    pub reason: String,
    /// 每版 0-100，顺序与传入的 items 一致
    #[serde(default)]
    pub scores: Vec<i64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: i64,
    pub name: String,
    pub base_url: String,
    pub model: String,
    pub temperature: f64,
    pub max_tokens: i64,
    pub context_window: i64,
    pub is_default: bool,
    pub has_key: bool,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProfileInput {
    pub id: i64,
    pub name: String,
    pub base_url: String,
    pub model: String,
    pub temperature: f64,
    pub max_tokens: i64,
    #[serde(default)]
    pub context_window: i64,
    #[serde(default)]
    pub is_default: bool,
    /// `None` keeps the stored key untouched, `Some("")` clears it.
    #[serde(default)]
    pub api_key: Option<String>,
}

#[derive(Deserialize, Clone, Debug)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct GenerateRequest {
    pub request_id: String,
    pub profile_id: i64,
    pub messages: Vec<ChatMessage>,
    pub temperature: Option<f64>,
    pub max_tokens: Option<i64>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    pub id: i64,
    pub word_count: i64,
    pub updated_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotMeta {
    pub id: i64,
    pub chapter_id: i64,
    pub project_id: i64,
    pub title: String,
    pub reason: String,
    pub word_count: i64,
    pub preview: String,
    pub created_at: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    #[serde(flatten)]
    pub meta: SnapshotMeta,
    pub content: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Thread {
    pub id: i64,
    pub project_id: i64,
    pub title: String,
    pub detail: String,
    pub status: String,
    pub setup_chapter_id: Option<i64>,
    pub payoff_chapter_id: Option<i64>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DailyStat {
    pub day: String,
    pub words: i64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub chapter_id: i64,
    pub title: String,
    pub snippet: String,
    pub offset: i64,
    pub position: i64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Retrieved {
    pub title: String,
    pub text: String,
}

