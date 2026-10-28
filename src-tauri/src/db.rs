use crate::models::*;
use crate::secret;
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashSet;
use std::path::Path;
use std::sync::Mutex;

pub struct Db(pub Mutex<Connection>);

pub fn now() -> String {
    chrono::Local::now().to_rfc3339()
}

pub fn count_words(text: &str) -> i64 {
    text.chars().filter(|c| !c.is_whitespace()).count() as i64
}

pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    migrate(&conn)?;
    seed(&conn)?;
    Ok(conn)
}

fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            synopsis TEXT NOT NULL DEFAULT '',
            style_guide TEXT NOT NULL DEFAULT '',
            pov TEXT NOT NULL DEFAULT '第三人称',
            genre TEXT NOT NULL DEFAULT '',
            target_words INTEGER NOT NULL DEFAULT 0,
            accent TEXT NOT NULL DEFAULT '#D9A85F',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS chapters (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            title TEXT NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            summary TEXT NOT NULL DEFAULT '',
            volume TEXT NOT NULL DEFAULT '',
            position INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'draft',
            word_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_chapters_project ON chapters(project_id, position);

        CREATE TABLE IF NOT EXISTS entities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
            kind TEXT NOT NULL DEFAULT 'character',
            name TEXT NOT NULL,
            aliases TEXT NOT NULL DEFAULT '',
            role TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_entities_project ON entities(project_id, kind);

        CREATE TABLE IF NOT EXISTS profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            base_url TEXT NOT NULL,
            model TEXT NOT NULL,
            api_key TEXT NOT NULL DEFAULT '',
            temperature REAL NOT NULL DEFAULT 0.85,
            max_tokens INTEGER NOT NULL DEFAULT 2400,
            is_default INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS snapshots (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            chapter_id INTEGER NOT NULL,
            project_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            reason TEXT NOT NULL DEFAULT '',
            word_count INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_snapshots_chapter ON snapshots(chapter_id, id DESC);
        "#,
    )?;

    // Versioned migrations. Existing databases from before versioning already
    // contain most columns, so every step stays idempotent.
    let version: i64 = conn.pragma_query_value(None, "user_version", |r| r.get(0))?;
    if version < 1 {
        conn.pragma_update(None, "user_version", 1)?;
    }
    if version < 2 {
        ensure_column(conn, "chapters", "summary_words", "INTEGER NOT NULL DEFAULT 0")?;
        conn.pragma_update(None, "user_version", 2)?;
    }
    if version < 3 {
        ensure_column(conn, "chapters", "outline", "TEXT NOT NULL DEFAULT ''")?;
        ensure_column(conn, "profiles", "context_window", "INTEGER NOT NULL DEFAULT 32768")?;
        conn.pragma_update(None, "user_version", 3)?;
    }
    if version < 4 {
        ensure_column(conn, "chapters", "deleted_at", "TEXT")?;
        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS threads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id INTEGER NOT NULL,
                title TEXT NOT NULL,
                detail TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'open',
                setup_chapter_id INTEGER,
                payoff_chapter_id INTEGER,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_threads_project ON threads(project_id, status);
            CREATE TABLE IF NOT EXISTS daily_words (
                day TEXT PRIMARY KEY,
                words INTEGER NOT NULL DEFAULT 0
            );
            UPDATE chapters SET summary_words = word_count
              WHERE summary_words = 0 AND summary IS NOT NULL AND summary <> '';
            "#,
        )?;
        conn.pragma_update(None, "user_version", 4)?;
    }
    if version < 5 {
        ensure_column(conn, "projects", "voice", "TEXT NOT NULL DEFAULT 'light'")?;
        conn.pragma_update(None, "user_version", 5)?;
    }
    if version < 6 {
        ensure_column(conn, "projects", "style_sample", "TEXT NOT NULL DEFAULT ''")?;
        conn.pragma_update(None, "user_version", 6)?;
    }
    if version < 7 {
        ensure_column(conn, "entities", "speech_style", "TEXT NOT NULL DEFAULT ''")?;
        ensure_column(conn, "entities", "speech_length", "TEXT NOT NULL DEFAULT 'medium'")?;
        ensure_column(conn, "entities", "speech_words", "TEXT NOT NULL DEFAULT ''")?;
        ensure_column(conn, "entities", "speech_taboo", "TEXT NOT NULL DEFAULT ''")?;
        conn.pragma_update(None, "user_version", 7)?;
    }
    if version < 8 {
        ensure_column(conn, "projects", "chapter_words", "INTEGER NOT NULL DEFAULT 2000")?;
        conn.pragma_update(None, "user_version", 8)?;
    }
    Ok(())
}

fn ensure_column(
    conn: &Connection,
    table: &str,
    column: &str,
    ddl: &str,
) -> rusqlite::Result<()> {
    let mut exists = false;
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let rows = stmt.query_map([], |r| r.get::<_, String>(1))?;
    for name in rows {
        if name? == column {
            exists = true;
            break;
        }
    }
    if !exists {
        conn.execute_batch(&format!("ALTER TABLE {table} ADD COLUMN {column} {ddl}"))?;
    }
    Ok(())
}

fn seed(conn: &Connection) -> rusqlite::Result<()> {
    let project_count: i64 = conn.query_row("SELECT COUNT(*) FROM projects", [], |r| r.get(0))?;

    let profile_count: i64 = conn.query_row("SELECT COUNT(*) FROM profiles", [], |r| r.get(0))?;
    if profile_count == 0 {
        conn.execute(
            "INSERT INTO profiles (name, base_url, model, api_key, temperature, max_tokens, is_default)
             VALUES (?1, ?2, ?3, '', 0.85, 2400, 1)",
            params!["DeepSeek", "https://api.deepseek.com", "deepseek-chat"],
        )?;
    }

    if project_count == 0 {
        seed_demo(conn)?;
    }
    // Demo chapters ship with summaries: treat them as up to date.
    conn.execute(
        "UPDATE chapters SET summary_words = word_count
         WHERE summary_words = 0 AND summary IS NOT NULL AND summary <> ''",
        [],
    )?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('theme', 'dark')
         ON CONFLICT(key) DO NOTHING",
        [],
    )?;
    let last: Option<String> = conn
        .query_row("SELECT value FROM settings WHERE key='last_project_id'", [], |r| r.get(0))
        .optional()?;
    if last.is_none() {
        let id: i64 = conn.query_row("SELECT id FROM projects ORDER BY id LIMIT 1", [], |r| r.get(0))?;
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('last_project_id', ?1)
             ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            params![id.to_string()],
        )?;
    }
    Ok(())
}

fn seed_demo(conn: &Connection) -> rusqlite::Result<()> {
    let t = now();
    conn.execute(
        "INSERT INTO projects (title, synopsis, style_guide, pov, genre, target_words, accent, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            "长夜将明",
            "一桩沉在渡口十年的旧案，两个不肯放手的人。雨夜、河灯、没有落款的信——所有线索都指向同一个已经死去的人。",
            "冷峻克制，多用短句与白描，少形容词堆砌。对话简练，留白多于解释。环境描写服务于情绪，不写无意义的天气。",
            "第三人称限知",
            "古风悬疑",
            120000_i64,
            "#D9A85F",
            t,
            t
        ],
    )?;
    let project_id = conn.last_insert_rowid();

    let chapters: [(&str, &str, &str); 2] = [
        (
            "第一章 雨落青石渡",
            "雨是在戌时落下来的。\n\n沈砚站在渡口的石阶上，看最后一盏河灯被水吞没。灯芯将熄未熄，在水面上拖出一线橘色的痕，像谁用指尖划开了夜。\n\n“船家。”他朝雾里问。\n\n没有人应。\n\n只有橹声，一下，又一下，从很远的地方赶来，仿佛走了很多年。\n\n他抬手按住右肩。旧伤在雨天总是先一步知道什么。\n\n石阶尽头，那盏常年不灭的渡灯今晚是暗的。灯罩上积了雨水，也积了一层薄灰——有人很久没有擦过它了。\n\n沈砚在雨里站了很久，直到身后传来脚步声。\n\n很轻，很稳，踩在湿石上几乎没有声音。\n\n“你迟了。”来人说。\n\n他没有回头。\n\n“顾小姐，”他说，“这地方，不该有活人等你。”",
            "沈砚雨夜赴青石渡，发现渡灯熄灭，顾青梧出现，两人互相试探。",
        ),
        (
            "第二章 没有落款的信",
            "顾青梧把那封没有落款的信推回桌心。\n\n信纸很旧，边缘起了毛，折痕处已经透了光。上面的字不多，只有一行：\n\n「初七夜，青石渡，勿带灯。」\n\n“我收到它的时候，”她说，“写信的人已经死了三天。”\n\n沈砚没有立刻接。他的目光落在落款的位置——那里空着，干干净净，连一滴墨都没有洇开。\n\n“你怎么知道是他写的？”\n\n“字。”顾青梧说，“别人学不像。他写‘渡’字，最后一捺总是收得太急，像怕被水追上。”\n\n窗外的雨敲在瓦上，一声一声，像有人在数。\n\n沈砚终于伸手，把信拿了起来。",
            "顾青梧出示一封死者署名前寄出的信，笔迹成为关键线索。",
        ),
    ];

    for (i, (title, content, summary)) in chapters.iter().enumerate() {
        conn.execute(
            "INSERT INTO chapters (project_id, title, content, summary, volume, position, status, word_count, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'draft', ?7, ?8, ?9)",
            params![
                project_id,
                title,
                content,
                summary,
                "第一卷 河灯",
                i as i64,
                count_words(content),
                t,
                t
            ],
        )?;
    }

    let entities: [(&str, &str, &str, &str, &str); 3] = [
        (
            "character",
            "沈砚",
            "沈先生",
            "主角",
            "二十八岁，前巡捕房探长，因一桩旧案离职。右肩有旧伤，雨天发作。说话极省，习惯用问句代替判断。不抽烟，随身带一截磨旧的灯芯。",
        ),
        (
            "character",
            "顾青梧",
            "青梧，顾小姐",
            "女主角",
            "二十四岁，报馆校对，记忆力惊人。表面温顺，实则固执。左手腕有一道浅疤，来历未明。",
        ),
        (
            "location",
            "青石渡",
            "老渡口",
            "关键地点",
            "城西老渡口，入夜后无船。渡灯常年不灭，自从十年前那件事后，当地人避谈此处。",
        ),
    ];
    for (kind, name, aliases, role, description) in entities.iter() {
        conn.execute(
            "INSERT INTO entities (project_id, kind, name, aliases, role, description, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![project_id, kind, name, aliases, role, description, t],
        )?;
    }
    Ok(())
}

// ---------------------------------------------------------------- projects

pub fn list_projects(conn: &Connection) -> rusqlite::Result<Vec<Project>> {
    let mut stmt = conn.prepare(
        "SELECT p.id, p.title, p.synopsis, p.style_guide, p.pov, p.genre, p.target_words, p.accent,
                p.created_at, p.updated_at,
                COALESCE(SUM(c.word_count), 0) AS wc,
                COUNT(c.id) AS cc,
                p.voice,
                p.style_sample,
                p.chapter_words
         FROM projects p LEFT JOIN chapters c
              ON c.project_id = p.id AND c.deleted_at IS NULL
         GROUP BY p.id
         ORDER BY p.updated_at DESC",
    )?;
    let rows = stmt.query_map([], |r| {
        Ok(Project {
            id: r.get(0)?,
            title: r.get(1)?,
            synopsis: r.get(2)?,
            style_guide: r.get(3)?,
            pov: r.get(4)?,
            genre: r.get(5)?,
            target_words: r.get(6)?,
            accent: r.get(7)?,
            created_at: r.get(8)?,
            updated_at: r.get(9)?,
            word_count: r.get(10)?,
            chapter_count: r.get(11)?,
            voice: r.get(12)?,
            style_sample: r.get(13)?,
            chapter_words: r.get(14)?,
        })
    })?;
    rows.collect()
}

pub fn get_project(conn: &Connection, id: i64) -> rusqlite::Result<Project> {
    conn.query_row(
        "SELECT p.id, p.title, p.synopsis, p.style_guide, p.pov, p.genre, p.target_words, p.accent,
                p.created_at, p.updated_at,
                COALESCE((SELECT SUM(word_count) FROM chapters WHERE project_id = p.id AND deleted_at IS NULL), 0),
                (SELECT COUNT(*) FROM chapters WHERE project_id = p.id AND deleted_at IS NULL),
                p.voice,
                p.style_sample,
                p.chapter_words
         FROM projects p WHERE p.id = ?1",
        params![id],
        |r| {
            Ok(Project {
                id: r.get(0)?,
                title: r.get(1)?,
                synopsis: r.get(2)?,
                style_guide: r.get(3)?,
                pov: r.get(4)?,
                genre: r.get(5)?,
                target_words: r.get(6)?,
                accent: r.get(7)?,
                created_at: r.get(8)?,
                updated_at: r.get(9)?,
                word_count: r.get(10)?,
                chapter_count: r.get(11)?,
                voice: r.get(12)?,
                style_sample: r.get(13)?,
                chapter_words: r.get(14)?,
            })
        },
    )
}

pub fn create_project(conn: &Connection, title: &str, genre: &str) -> rusqlite::Result<Project> {
    let t = now();
    conn.execute(
        "INSERT INTO projects (title, synopsis, style_guide, pov, genre, target_words, accent, voice, style_sample, created_at, updated_at)
         VALUES (?1, '', '', '第三人称', ?2, 0, '#D9A85F', 'light', '', ?3, ?3)",
        params![title, genre, t],
    )?;
    let id = conn.last_insert_rowid();
    get_project(conn, id)
}

pub fn update_project(conn: &Connection, p: &Project) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE projects SET title=?1, synopsis=?2, style_guide=?3, pov=?4, genre=?5,
                target_words=?6, accent=?7, voice=?8, style_sample=?9, chapter_words=?10,
                updated_at=?11 WHERE id=?12",
        params![
            p.title,
            p.synopsis,
            p.style_guide,
            p.pov,
            p.genre,
            p.target_words,
            p.accent,
            if p.voice.is_empty() { "light" } else { &p.voice },
            p.style_sample,
            if p.chapter_words > 0 { p.chapter_words } else { 2000 },
            now(),
            p.id
        ],
    )?;
    Ok(())
}

pub fn delete_project(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM snapshots WHERE project_id=?1", params![id])?;
    conn.execute("DELETE FROM threads WHERE project_id=?1", params![id])?;
    conn.execute("DELETE FROM entities WHERE project_id=?1", params![id])?;
    conn.execute("DELETE FROM chapters WHERE project_id=?1", params![id])?;
    conn.execute("DELETE FROM projects WHERE id=?1", params![id])?;
    Ok(())
}

pub fn touch_project(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    conn.execute("UPDATE projects SET updated_at=?1 WHERE id=?2", params![now(), id])?;
    Ok(())
}

// ---------------------------------------------------------------- chapters

fn map_chapter_meta(r: &rusqlite::Row) -> rusqlite::Result<ChapterMeta> {
    Ok(ChapterMeta {
        id: r.get(0)?,
        project_id: r.get(1)?,
        title: r.get(2)?,
        summary: r.get(3)?,
        outline: r.get(4)?,
        volume: r.get(5)?,
        position: r.get(6)?,
        status: r.get(7)?,
        word_count: r.get(8)?,
        summary_words: r.get(9)?,
        created_at: r.get(10)?,
        updated_at: r.get(11)?,
    })
}

const CHAPTER_COLS: &str = "id, project_id, title, summary, outline, volume, position, status, word_count, summary_words, created_at, updated_at";

pub fn list_chapters(conn: &Connection, project_id: i64) -> rusqlite::Result<Vec<ChapterMeta>> {
    let sql = format!(
        "SELECT {CHAPTER_COLS} FROM chapters WHERE project_id=?1 AND deleted_at IS NULL ORDER BY position ASC, id ASC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![project_id], map_chapter_meta)?;
    rows.collect()
}

pub fn get_chapter(conn: &Connection, id: i64) -> rusqlite::Result<Chapter> {
    let sql = format!("SELECT {CHAPTER_COLS}, content FROM chapters WHERE id=?1 AND deleted_at IS NULL");
    conn.query_row(&sql, params![id], |r| {
        Ok(Chapter {
            meta: map_chapter_meta(r)?,
            content: r.get(12)?,
        })
    })
}

pub fn get_chapter_content(conn: &Connection, id: i64) -> rusqlite::Result<String> {
    conn.query_row("SELECT content FROM chapters WHERE id=?1", params![id], |r| r.get(0))
}

pub fn create_chapter(conn: &Connection, project_id: i64, title: &str) -> rusqlite::Result<ChapterMeta> {
    let pos: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM chapters WHERE project_id=?1",
            params![project_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let t = now();
    conn.execute(
        "INSERT INTO chapters (project_id, title, content, summary, volume, position, status, word_count, created_at, updated_at)
         VALUES (?1, ?2, '', '', '', ?3, 'draft', 0, ?4, ?4)",
        params![project_id, title, pos, t],
    )?;
    let id = conn.last_insert_rowid();
    touch_project(conn, project_id)?;
    let sql = format!("SELECT {CHAPTER_COLS} FROM chapters WHERE id=?1");
    conn.query_row(&sql, params![id], map_chapter_meta)
}

pub fn save_chapter(
    conn: &Connection,
    id: i64,
    title: &str,
    content: &str,
) -> Result<SaveResult, String> {
    let wc = count_words(content);
    let t = now();
    // One transaction: a chapter write, the daily word counter and the project
    // timestamp either all land or none do.
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    let old: i64 = tx
        .query_row("SELECT word_count FROM chapters WHERE id=?1", params![id], |r| r.get(0))
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or(0);
    let changed = tx
        .execute(
            "UPDATE chapters SET title=?1, content=?2, word_count=?3, updated_at=?4 WHERE id=?5",
            params![title, content, wc, t, id],
        )
        .map_err(|e| e.to_string())?;
    if changed == 0 {
        // The chapter was purged while a save was in flight. Report it instead of
        // pretending the write succeeded — that is how drafts disappear silently.
        return Err("章节不存在（可能已被删除），这次保存没有写入".into());
    }
    let delta = wc - old;
    if delta > 0 {
        let day = chrono::Local::now().format("%Y-%m-%d").to_string();
        tx.execute(
            "INSERT INTO daily_words (day, words) VALUES (?1, ?2)
             ON CONFLICT(day) DO UPDATE SET words = words + excluded.words",
            params![day, delta],
        )
        .map_err(|e| e.to_string())?;
    }
    let pid: i64 = tx
        .query_row("SELECT project_id FROM chapters WHERE id=?1", params![id], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    touch_project(&tx, pid).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(SaveResult {
        id,
        word_count: wc,
        updated_at: t,
    })
}

pub fn update_chapter_meta(
    conn: &Connection,
    id: i64,
    title: Option<String>,
    summary: Option<String>,
    outline: Option<String>,
    volume: Option<String>,
    status: Option<String>,
) -> rusqlite::Result<()> {
    if let Some(v) = title {
        conn.execute("UPDATE chapters SET title=?1 WHERE id=?2", params![v, id])?;
    }
    if let Some(v) = summary {
        // A manual summary is authoritative for the current word count.
        conn.execute(
            "UPDATE chapters SET summary=?1, summary_words=word_count WHERE id=?2",
            params![v, id],
        )?;
    }
    if let Some(v) = outline {
        conn.execute("UPDATE chapters SET outline=?1 WHERE id=?2", params![v, id])?;
    }
    if let Some(v) = volume {
        conn.execute("UPDATE chapters SET volume=?1 WHERE id=?2", params![v, id])?;
    }
    if let Some(v) = status {
        conn.execute("UPDATE chapters SET status=?1 WHERE id=?2", params![v, id])?;
    }
    conn.execute("UPDATE chapters SET updated_at=?1 WHERE id=?2", params![now(), id])?;
    Ok(())
}

pub fn delete_chapter(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    let pid: Option<i64> = conn
        .query_row("SELECT project_id FROM chapters WHERE id=?1", params![id], |r| r.get(0))
        .optional()?;
    // Soft delete: keep the row (and its snapshots) so it can be restored.
    conn.execute(
        "UPDATE chapters SET deleted_at=?1 WHERE id=?2",
        params![now(), id],
    )?;
    if let Some(pid) = pid {
        touch_project(conn, pid)?;
    }
    Ok(())
}

pub fn list_deleted_chapters(conn: &Connection, project_id: i64) -> rusqlite::Result<Vec<ChapterMeta>> {
    let sql = format!(
        "SELECT {CHAPTER_COLS} FROM chapters WHERE project_id=?1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params![project_id], map_chapter_meta)?;
    rows.collect()
}

pub fn restore_chapter(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    conn.execute("UPDATE chapters SET deleted_at=NULL WHERE id=?1", params![id])?;
    let pid: i64 = conn.query_row("SELECT project_id FROM chapters WHERE id=?1", params![id], |r| r.get(0))?;
    touch_project(conn, pid)?;
    Ok(())
}

pub fn purge_chapter(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM snapshots WHERE chapter_id=?1", params![id])?;
    conn.execute("DELETE FROM chapters WHERE id=?1", params![id])?;
    Ok(())
}

pub fn reorder_chapters(conn: &mut Connection, ids: &[i64]) -> rusqlite::Result<()> {
    let tx = conn.transaction()?;
    for (i, id) in ids.iter().enumerate() {
        tx.execute(
            "UPDATE chapters SET position=?1 WHERE id=?2",
            params![i as i64, id],
        )?;
    }
    tx.commit()
}

// ---------------------------------------------------------------- entities

pub fn list_entities(conn: &Connection, project_id: i64) -> rusqlite::Result<Vec<Entity>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, kind, name, aliases, role, description,
                speech_style, speech_length, speech_words, speech_taboo, updated_at
         FROM entities WHERE project_id=?1
         ORDER BY CASE kind WHEN 'character' THEN 0 WHEN 'location' THEN 1 WHEN 'faction' THEN 2
                            WHEN 'item' THEN 3 ELSE 4 END, name",
    )?;
    let rows = stmt.query_map(params![project_id], |r| {
        Ok(Entity {
            id: r.get(0)?,
            project_id: r.get(1)?,
            kind: r.get(2)?,
            name: r.get(3)?,
            aliases: r.get(4)?,
            role: r.get(5)?,
            description: r.get(6)?,
            speech_style: r.get(7)?,
            speech_length: r.get(8)?,
            speech_words: r.get(9)?,
            speech_taboo: r.get(10)?,
            updated_at: r.get(11)?,
        })
    })?;
    rows.collect()
}

pub fn upsert_entity(conn: &Connection, e: &Entity) -> rusqlite::Result<Entity> {
    let t = now();
    let id = if e.id == 0 {
        conn.execute(
            "INSERT INTO entities (project_id, kind, name, aliases, role, description,
                                   speech_style, speech_length, speech_words, speech_taboo, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                e.project_id,
                e.kind,
                e.name,
                e.aliases,
                e.role,
                e.description,
                e.speech_style,
                if e.speech_length.is_empty() { "medium" } else { &e.speech_length },
                e.speech_words,
                e.speech_taboo,
                t
            ],
        )?;
        conn.last_insert_rowid()
    } else {
        conn.execute(
            "UPDATE entities SET kind=?1, name=?2, aliases=?3, role=?4, description=?5,
                    speech_style=?6, speech_length=?7, speech_words=?8, speech_taboo=?9,
                    updated_at=?10 WHERE id=?11",
            params![
                e.kind,
                e.name,
                e.aliases,
                e.role,
                e.description,
                e.speech_style,
                if e.speech_length.is_empty() { "medium" } else { &e.speech_length },
                e.speech_words,
                e.speech_taboo,
                t,
                e.id
            ],
        )?;
        e.id
    };
    conn.query_row(
        "SELECT id, project_id, kind, name, aliases, role, description,
                speech_style, speech_length, speech_words, speech_taboo, updated_at
         FROM entities WHERE id=?1",
        params![id],
        |r| {
            Ok(Entity {
                id: r.get(0)?,
                project_id: r.get(1)?,
                kind: r.get(2)?,
                name: r.get(3)?,
                aliases: r.get(4)?,
                role: r.get(5)?,
                description: r.get(6)?,
                speech_style: r.get(7)?,
                speech_length: r.get(8)?,
                speech_words: r.get(9)?,
                speech_taboo: r.get(10)?,
                updated_at: r.get(11)?,
            })
        },
    )
}

pub fn delete_entity(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM entities WHERE id=?1", params![id])?;
    Ok(())
}

// ---------------------------------------------------------------- profiles

const PROFILE_COLS: &str =
    "id, name, base_url, model, temperature, max_tokens, context_window, is_default, api_key";

fn map_profile(r: &rusqlite::Row) -> rusqlite::Result<Profile> {
    let key: String = r.get(8)?;
    Ok(Profile {
        id: r.get(0)?,
        name: r.get(1)?,
        base_url: r.get(2)?,
        model: r.get(3)?,
        temperature: r.get(4)?,
        max_tokens: r.get(5)?,
        context_window: r.get(6)?,
        is_default: r.get::<_, i64>(7)? != 0,
        has_key: !key.is_empty(),
    })
}

pub fn list_profiles(conn: &Connection) -> rusqlite::Result<Vec<Profile>> {
    let sql = format!("SELECT {PROFILE_COLS} FROM profiles ORDER BY is_default DESC, id ASC");
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], map_profile)?;
    rows.collect()
}

pub fn get_profile(conn: &Connection, id: i64) -> rusqlite::Result<Profile> {
    let sql = format!("SELECT {PROFILE_COLS} FROM profiles WHERE id=?1");
    conn.query_row(&sql, params![id], map_profile)
}

pub fn save_profile(conn: &Connection, input: &ProfileInput) -> Result<Profile, String> {
    let existing_key: String = if input.id == 0 {
        String::new()
    } else {
        conn.query_row(
            "SELECT api_key FROM profiles WHERE id=?1",
            params![input.id],
            |r| r.get(0),
        )
        .unwrap_or_default()
    };
    let key_blob = match &input.api_key {
        Some(k) => secret::protect(k)?,
        None => existing_key,
    };

    let id = if input.id == 0 {
        conn.execute(
            "INSERT INTO profiles (name, base_url, model, api_key, temperature, max_tokens, context_window, is_default)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                input.name.trim(),
                input.base_url.trim(),
                input.model.trim(),
                key_blob,
                input.temperature,
                input.max_tokens,
                if input.context_window > 0 { input.context_window } else { 32768 },
                input.is_default as i64
            ],
        )
        .map_err(|e| e.to_string())?;
        conn.last_insert_rowid()
    } else {
        conn.execute(
            "UPDATE profiles SET name=?1, base_url=?2, model=?3, api_key=?4, temperature=?5,
                    max_tokens=?6, context_window=?7, is_default=?8 WHERE id=?9",
            params![
                input.name.trim(),
                input.base_url.trim(),
                input.model.trim(),
                key_blob,
                input.temperature,
                input.max_tokens,
                if input.context_window > 0 { input.context_window } else { 32768 },
                input.is_default as i64,
                input.id
            ],
        )
        .map_err(|e| e.to_string())?;
        input.id
    };

    if input.is_default {
        conn.execute("UPDATE profiles SET is_default=0 WHERE id<>?1", params![id])
            .map_err(|e| e.to_string())?;
    }
    ensure_default_profile(conn).map_err(|e| e.to_string())?;
    get_profile(conn, id).map_err(|e| e.to_string())
}

pub fn ensure_default_profile(conn: &Connection) -> rusqlite::Result<()> {
    let any: i64 = conn.query_row("SELECT COUNT(*) FROM profiles WHERE is_default=1", [], |r| r.get(0))?;
    if any == 0 {
        let first: Option<i64> = conn
            .query_row("SELECT id FROM profiles ORDER BY id LIMIT 1", [], |r| r.get(0))
            .optional()?;
        if let Some(id) = first {
            conn.execute("UPDATE profiles SET is_default=1 WHERE id=?1", params![id])?;
        }
    }
    Ok(())
}

pub fn delete_profile(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM profiles WHERE id=?1", params![id])?;
    ensure_default_profile(conn)?;
    Ok(())
}

pub fn set_default_profile(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    conn.execute("UPDATE profiles SET is_default=0", [])?;
    conn.execute("UPDATE profiles SET is_default=1 WHERE id=?1", params![id])?;
    Ok(())
}

pub fn profile_key(conn: &Connection, id: i64) -> Result<String, String> {
    let blob: String = conn
        .query_row("SELECT api_key FROM profiles WHERE id=?1", params![id], |r| r.get(0))
        .map_err(|e| format!("找不到该模型配置: {e}"))?;
    secret::unprotect(&blob)
}

// ---------------------------------------------------------------- snapshots

pub fn create_snapshot(
    conn: &Connection,
    chapter_id: i64,
    reason: &str,
) -> rusqlite::Result<SnapshotMeta> {
    let (project_id, title, content, wc): (i64, String, String, i64) = conn.query_row(
        "SELECT project_id, title, content, word_count FROM chapters WHERE id=?1",
        params![chapter_id],
        |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
    )?;
    let t = now();
    conn.execute(
        "INSERT INTO snapshots (chapter_id, project_id, title, content, reason, word_count, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![chapter_id, project_id, title, content, reason, wc, t],
    )?;
    let id = conn.last_insert_rowid();
    // Keep only the newest 40 snapshots per chapter.
    conn.execute(
        "DELETE FROM snapshots WHERE chapter_id=?1 AND id <=
         (SELECT id FROM snapshots WHERE chapter_id=?1 ORDER BY id DESC LIMIT 1 OFFSET 39)",
        params![chapter_id],
    )?;
    Ok(SnapshotMeta {
        id,
        chapter_id,
        project_id,
        title,
        reason: reason.to_string(),
        word_count: wc,
        preview: content.chars().take(80).collect(),
        created_at: t,
    })
}

pub fn list_snapshots(conn: &Connection, chapter_id: i64) -> rusqlite::Result<Vec<SnapshotMeta>> {
    let mut stmt = conn.prepare(
        "SELECT id, chapter_id, project_id, title, reason, word_count,
                substr(content, 1, 80), created_at
         FROM snapshots WHERE chapter_id=?1 ORDER BY id DESC LIMIT 50",
    )?;
    let rows = stmt.query_map(params![chapter_id], |r| {
        Ok(SnapshotMeta {
            id: r.get(0)?,
            chapter_id: r.get(1)?,
            project_id: r.get(2)?,
            title: r.get(3)?,
            reason: r.get(4)?,
            word_count: r.get(5)?,
            preview: r.get::<_, String>(6)?.replace('\n', " "),
            created_at: r.get(7)?,
        })
    })?;
    rows.collect()
}

pub fn get_snapshot(conn: &Connection, id: i64) -> rusqlite::Result<Snapshot> {
    conn.query_row(
        "SELECT id, chapter_id, project_id, title, reason, word_count,
                substr(content, 1, 80), created_at, content
         FROM snapshots WHERE id=?1",
        params![id],
        |r| {
            Ok(Snapshot {
                meta: SnapshotMeta {
                    id: r.get(0)?,
                    chapter_id: r.get(1)?,
                    project_id: r.get(2)?,
                    title: r.get(3)?,
                    reason: r.get(4)?,
                    word_count: r.get(5)?,
                    preview: r.get::<_, String>(6)?.replace('\n', " "),
                    created_at: r.get(7)?,
                },
                content: r.get(8)?,
            })
        },
    )
}

pub fn restore_snapshot(conn: &Connection, id: i64) -> Result<SaveResult, String> {
    let snap = get_snapshot(conn, id).map_err(|e| e.to_string())?;
    // Back up the current state so the restore itself can be undone.
    create_snapshot(conn, snap.meta.chapter_id, "恢复前自动备份").map_err(|e| e.to_string())?;
    let wc = count_words(&snap.content);
    let t = now();
    conn.execute(
        "UPDATE chapters SET content=?1, word_count=?2, updated_at=?3 WHERE id=?4",
        params![snap.content, wc, t, snap.meta.chapter_id],
    )
    .map_err(|e| e.to_string())?;
    let _ = touch_project(conn, snap.meta.project_id);
    Ok(SaveResult {
        id: snap.meta.chapter_id,
        word_count: wc,
        updated_at: t,
    })
}

pub fn set_chapter_summary(
    conn: &Connection,
    id: i64,
    summary: &str,
    words: i64,
) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE chapters SET summary=?1, summary_words=?2, updated_at=?3 WHERE id=?4",
        params![summary, words, now(), id],
    )?;
    Ok(())
}

pub fn set_chapter_outline(conn: &Connection, id: i64, outline: &str) -> rusqlite::Result<()> {
    conn.execute(
        "UPDATE chapters SET outline=?1, updated_at=?2 WHERE id=?3",
        params![outline, now(), id],
    )?;
    Ok(())
}

// ---------------------------------------------------------------- threads

pub fn list_threads(conn: &Connection, project_id: i64) -> rusqlite::Result<Vec<Thread>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, title, detail, status, setup_chapter_id, payoff_chapter_id,
                created_at, updated_at
         FROM threads WHERE project_id=?1
         ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'paid' THEN 1 ELSE 2 END, id DESC",
    )?;
    let rows = stmt.query_map(params![project_id], |r| {
        Ok(Thread {
            id: r.get(0)?,
            project_id: r.get(1)?,
            title: r.get(2)?,
            detail: r.get(3)?,
            status: r.get(4)?,
            setup_chapter_id: r.get(5)?,
            payoff_chapter_id: r.get(6)?,
            created_at: r.get(7)?,
            updated_at: r.get(8)?,
        })
    })?;
    rows.collect()
}

pub fn upsert_thread(conn: &Connection, t: &Thread) -> rusqlite::Result<Thread> {
    let ts = now();
    let id = if t.id == 0 {
        conn.execute(
            "INSERT INTO threads (project_id, title, detail, status, setup_chapter_id,
                                  payoff_chapter_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)",
            params![
                t.project_id,
                t.title,
                t.detail,
                t.status,
                t.setup_chapter_id,
                t.payoff_chapter_id,
                ts
            ],
        )?;
        conn.last_insert_rowid()
    } else {
        conn.execute(
            "UPDATE threads SET title=?1, detail=?2, status=?3, setup_chapter_id=?4,
                    payoff_chapter_id=?5, updated_at=?6 WHERE id=?7",
            params![
                t.title,
                t.detail,
                t.status,
                t.setup_chapter_id,
                t.payoff_chapter_id,
                ts,
                t.id
            ],
        )?;
        t.id
    };
    conn.query_row(
        "SELECT id, project_id, title, detail, status, setup_chapter_id, payoff_chapter_id,
                created_at, updated_at FROM threads WHERE id=?1",
        params![id],
        |r| {
            Ok(Thread {
                id: r.get(0)?,
                project_id: r.get(1)?,
                title: r.get(2)?,
                detail: r.get(3)?,
                status: r.get(4)?,
                setup_chapter_id: r.get(5)?,
                payoff_chapter_id: r.get(6)?,
                created_at: r.get(7)?,
                updated_at: r.get(8)?,
            })
        },
    )
}

pub fn delete_thread(conn: &Connection, id: i64) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM threads WHERE id=?1", params![id])?;
    Ok(())
}

pub fn open_thread_titles(conn: &Connection, project_id: i64) -> Vec<String> {
    let mut out = Vec::new();
    let Ok(mut stmt) = conn.prepare(
        "SELECT title, detail FROM threads WHERE project_id=?1 AND status='open' ORDER BY id DESC LIMIT 10",
    ) else {
        return out;
    };
    let Ok(rows) = stmt.query_map(params![project_id], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
    }) else {
        return out;
    };
    for row in rows.flatten() {
        let detail = row.1.trim().replace('\n', " ");
        if detail.is_empty() {
            out.push(row.0);
        } else {
            out.push(format!("{}：{}", row.0, detail.chars().take(80).collect::<String>()));
        }
    }
    out
}

// ---------------------------------------------------------------- stats

pub fn daily_stats(conn: &Connection, days: i64) -> Vec<DailyStat> {
    let mut out = Vec::new();
    let Ok(mut stmt) =
        conn.prepare("SELECT day, words FROM daily_words ORDER BY day DESC LIMIT ?1")
    else {
        return out;
    };
    if let Ok(rows) = stmt.query_map(params![days.max(1)], |r| {
        Ok(DailyStat {
            day: r.get(0)?,
            words: r.get(1)?,
        })
    }) {
        out.extend(rows.flatten());
    }
    out.reverse();
    out
}

// ---------------------------------------------------------------- search

pub fn search_chapters(
    conn: &Connection,
    project_id: i64,
    query: &str,
    limit: i64,
) -> Vec<SearchHit> {
    let q = query.trim();
    if q.is_empty() {
        return Vec::new();
    }
    let needle = q.to_lowercase();
    let mut hits = Vec::new();

    let Ok(mut stmt) = conn.prepare(
        "SELECT id, title, content, position FROM chapters
         WHERE project_id=?1 AND deleted_at IS NULL ORDER BY position ASC",
    ) else {
        return hits;
    };
    let Ok(rows) = stmt.query_map(params![project_id], |r| {
        Ok((
            r.get::<_, i64>(0)?,
            r.get::<_, String>(1)?,
            r.get::<_, String>(2)?,
            r.get::<_, i64>(3)?,
        ))
    }) else {
        return hits;
    };

    for row in rows.flatten() {
        let (id, title, content, position) = row;
        let hay = content.to_lowercase();
        let mut from = 0usize;
        let mut found = 0;
        while hits.len() < limit as usize && found < 3 {
            let Some(idx) = hay[from..].find(&needle) else {
                break;
            };
            let byte_pos = from + idx;
            let char_pos = content[..byte_pos].chars().count();
            let start = content[..byte_pos]
                .char_indices()
                .rev()
                .nth(28)
                .map(|(i, _)| i)
                .unwrap_or(0);
            let end = content[byte_pos..]
                .char_indices()
                .nth(60)
                .map(|(i, _)| byte_pos + i)
                .unwrap_or(content.len());
            hits.push(SearchHit {
                chapter_id: id,
                title: title.clone(),
                snippet: content[start..end].replace('\n', " "),
                offset: char_pos as i64,
                position,
            });
            from = byte_pos + needle.len().max(1);
            found += 1;
        }
    }
    hits
}

// ---------------------------------------------------------------- retrieval

fn is_cjk(c: char) -> bool {
    matches!(c as u32, 0x4E00..=0x9FFF | 0x3400..=0x4DBF)
}

fn tokens(text: &str) -> HashSet<String> {
    let mut set = HashSet::new();
    let mut ascii = String::new();
    let mut prev: Option<char> = None;
    for c in text.chars() {
        if c.is_ascii_alphanumeric() {
            ascii.push(c.to_ascii_lowercase());
            prev = Some(c);
            continue;
        }
        if ascii.len() >= 3 {
            set.insert(ascii.clone());
        }
        ascii.clear();
        if is_cjk(c) {
            if let Some(p) = prev {
                if is_cjk(p) {
                    set.insert(format!("{p}{c}"));
                }
            }
        }
        prev = Some(c);
    }
    if ascii.len() >= 3 {
        set.insert(ascii);
    }
    set
}

/// Keyword retrieval over earlier chapters: no embeddings, no network.
pub fn retrieve_context(
    conn: &Connection,
    project_id: i64,
    query: &str,
    exclude_chapter_id: i64,
    limit: i64,
) -> Vec<Retrieved> {
    let q = tokens(query);
    if q.len() < 2 {
        return Vec::new();
    }
    let q: Vec<&String> = q.iter().take(240).collect();

    let Ok(mut stmt) = conn.prepare(
        "SELECT title, content FROM chapters
         WHERE project_id=?1 AND deleted_at IS NULL AND id<>?2
           AND position < (SELECT position FROM chapters WHERE id=?2)
         ORDER BY position ASC",
    ) else {
        return Vec::new();
    };
    let Ok(rows) = stmt.query_map(params![project_id, exclude_chapter_id], |r| {
        Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
    }) else {
        return Vec::new();
    };

    let mut scored: Vec<(i32, String, String)> = Vec::new();
    for row in rows.flatten() {
        let (title, content) = row;
        for para in content.split('\n') {
            let para = para.trim();
            if para.chars().count() < 16 {
                continue;
            }
            let chunk: String = para.chars().take(400).collect();
            let pt = tokens(&chunk);
            let mut score = 0i32;
            for token in &q {
                if pt.contains(*token) {
                    score += 1;
                }
            }
            if score >= 3 {
                scored.push((score, title.clone(), chunk));
            }
        }
    }
    scored.sort_by(|a, b| b.0.cmp(&a.0));
    scored.dedup_by(|a, b| a.2 == b.2);
    scored
        .into_iter()
        .take(limit.max(1) as usize)
        .map(|(_, title, text)| Retrieved { title, text })
        .collect()
}

// ---------------------------------------------------------------- settings

pub fn get_setting(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row("SELECT value FROM settings WHERE key=?1", params![key], |r| r.get(0))
        .optional()
        .ok()
        .flatten()
}

pub fn set_setting(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        params![key, value],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mem() -> Connection {
        let conn = Connection::open_in_memory().expect("open memory db");
        migrate(&conn).expect("migrate");
        conn
    }

    #[test]
    fn save_chapter_writes_content_and_word_count() {
        let conn = mem();
        let project = create_project(&conn, "测试", "轻小说").unwrap();
        let chapter = create_chapter(&conn, project.id, "第一章").unwrap();
        let res = save_chapter(&conn, chapter.id, "第一章", "一二三四五").unwrap();
        assert_eq!(res.word_count, 5);
        assert_eq!(get_chapter(&conn, chapter.id).unwrap().content, "一二三四五");
    }

    #[test]
    fn save_chapter_fails_loudly_when_chapter_is_gone() {
        let conn = mem();
        let project = create_project(&conn, "测试", "轻小说").unwrap();
        let chapter = create_chapter(&conn, project.id, "第一章").unwrap();
        save_chapter(&conn, chapter.id, "第一章", "正文").unwrap();
        let before: i64 = daily_stats(&conn, 7).iter().map(|d| d.words).sum();

        let err = save_chapter(&conn, 999_999, "x", "不该写入的正文").unwrap_err();
        assert!(err.contains("章节不存在"), "unexpected error: {err}");

        let after: i64 = daily_stats(&conn, 7).iter().map(|d| d.words).sum();
        assert_eq!(before, after, "失败的保存不应该写进日更统计");
    }
}
