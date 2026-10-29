//! Import plain text / Markdown / DOCX manuscripts and split them into chapters.

use crate::db;
use crate::models::Project;
use rusqlite::Connection;
use std::io::Read;
use std::path::Path;

fn decode_text(bytes: &[u8]) -> String {
    // UTF-16 BOMs (common when the file was saved by Notepad / Word).
    if bytes.starts_with(&[0xFF, 0xFE]) {
        let (text, _, _) = encoding_rs::UTF_16LE.decode(&bytes[2..]);
        return text.trim_start_matches('\u{feff}').replace("\r\n", "\n");
    }
    if bytes.starts_with(&[0xFE, 0xFF]) {
        let (text, _, _) = encoding_rs::UTF_16BE.decode(&bytes[2..]);
        return text.trim_start_matches('\u{feff}').replace("\r\n", "\n");
    }
    if let Ok(text) = String::from_utf8(bytes.to_vec()) {
        return text.trim_start_matches('\u{feff}').replace("\r\n", "\n");
    }
    // Chinese .txt files are very often GBK.
    let (text, _, _) = encoding_rs::GBK.decode(bytes);
    text.trim_start_matches('\u{feff}').replace("\r\n", "\n")
}

fn read_plain(path: &Path) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("读取文件失败: {e}"))?;
    Ok(decode_text(&bytes))
}

fn read_docx(path: &Path) -> Result<String, String> {
    let file = std::fs::File::open(path).map_err(|e| format!("读取文件失败: {e}"))?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| format!("不是有效的 docx: {e}"))?;
    let mut doc = zip
        .by_name("word/document.xml")
        .map_err(|_| "docx 里找不到 document.xml".to_string())?;
    let mut xml = String::new();
    doc.read_to_string(&mut xml)
        .map_err(|e| format!("解析 docx 失败: {e}"))?;
    Ok(extract_docx_text(&xml))
}

fn extract_docx_text(xml: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    let mut buf = String::new();

    for ch in xml.chars() {
        match ch {
            '<' => {
                in_tag = true;
                if buf.ends_with("w:p") || buf.ends_with("w:br") {
                    out.push('\n');
                }
                buf.clear();
            }
            '>' => {
                in_tag = false;
            }
            _ if in_tag => buf.push(ch),
            _ => out.push(ch),
        }
    }

    // Decode the handful of XML entities Word emits.
    // `&amp;` 必须最后替换：先换它会把 "&amp;lt;" 二次解码成 "<"。
    let out = out
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&apos;", "'")
        .replace("&amp;", "&");

    // Paragraphs were emitted as a single newline; keep blank lines tidy.
    let mut cleaned = String::new();
    let mut blank = 0;
    for line in out.lines() {
        let line = line.trim_end();
        if line.trim().is_empty() {
            blank += 1;
            if blank > 1 {
                continue;
            }
        } else {
            blank = 0;
        }
        cleaned.push_str(line);
        cleaned.push('\n');
    }
    cleaned.trim().to_string()
}

fn heading_of(line: &str) -> Option<String> {
    let t = line.trim();
    if t.is_empty() || t.chars().count() > 46 {
        return None;
    }
    if let Some(rest) = t.strip_prefix('#') {
        let rest = rest.trim_start_matches('#').trim();
        if !rest.is_empty() {
            return Some(rest.chars().take(60).collect());
        }
    }
    if t.starts_with("第") {
        let prefix: String = t.chars().take(14).collect();
        if prefix.contains('章') || prefix.contains('回') || prefix.contains('节') {
            return Some(t.chars().take(60).collect());
        }
    }
    if t.starts_with("Chapter ") || t.starts_with("CHAPTER ") {
        return Some(t.chars().take(60).collect());
    }
    None
}

pub fn split_chapters(text: &str) -> Vec<(String, String)> {
    let mut chunks: Vec<(String, String)> = Vec::new();
    let mut title = String::new();
    let mut buf = String::new();

    for line in text.lines() {
        if let Some(heading) = heading_of(line) {
            if !buf.trim().is_empty() {
                chunks.push((
                    if title.is_empty() {
                        "正文".to_string()
                    } else {
                        title.clone()
                    },
                    buf.trim().to_string(),
                ));
                buf.clear();
            }
            title = heading;
        } else {
            buf.push_str(line);
            buf.push('\n');
        }
    }
    if !buf.trim().is_empty() {
        chunks.push((
            if title.is_empty() {
                "正文".to_string()
            } else {
                title
            },
            buf.trim().to_string(),
        ));
    }
    chunks.retain(|(_, content)| !content.trim().is_empty());
    chunks
}

/// Opens the native picker. Kept separate so the database lock is not held
/// while the dialog is open.
pub fn pick_file(parent: Option<isize>) -> Option<std::path::PathBuf> {
    crate::parent::attach(
        rfd::FileDialog::new()
            .set_title("导入作品")
            .add_filter("文本 / Markdown", &["txt", "md", "markdown"])
            .add_filter("Word 文档", &["docx"]),
        parent,
    )
    .pick_file()
}

/// Parses a manuscript file into (title, chapters). No database access.
pub fn parse_file(path: &std::path::Path) -> Result<(String, Vec<(String, String)>), String> {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    let text = if ext == "docx" {
        read_docx(path)?
    } else {
        read_plain(path)?
    };

    let chapters = split_chapters(&text);
    if chapters.is_empty() {
        return Err("没有从文件里解析到正文".into());
    }
    let title = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("导入作品")
        .trim()
        .to_string();
    Ok((title, chapters))
}

/// Creates the project and chapter rows. Caller holds the database lock.
///
/// 整本导入必须是一个事务：中途失败时不能留下半个作品。
/// 这里也刻意不走 `db::save_chapter`——那个函数会把这批字数记进「今日新增」，
/// 导入一本 20 万字的旧稿不该让写作统计凭空多出 20 万字。
pub fn insert_book(
    conn: &mut Connection,
    title: &str,
    chapters: &[(String, String)],
) -> Result<Project, String> {
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let project = db::create_project(&tx, title, "").map_err(|e| e.to_string())?;
    let t = db::now();
    for (i, (chapter_title, content)) in chapters.iter().enumerate() {
        tx.execute(
            "INSERT INTO chapters (project_id, title, content, summary, volume, position, status,
                                   word_count, created_at, updated_at)
             VALUES (?1, ?2, ?3, '', '', ?4, 'draft', ?5, ?6, ?6)",
            rusqlite::params![
                project.id,
                chapter_title,
                content,
                i as i64,
                db::count_words(content),
                t
            ],
        )
        .map_err(|e| e.to_string())?;
    }
    let out = db::get_project(&tx, project.id).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_utf16_with_bom() {
        let mut bytes = vec![0xFF, 0xFE];
        for unit in "第一章 开始\r\n正文".encode_utf16() {
            bytes.extend_from_slice(&unit.to_le_bytes());
        }
        let text = decode_text(&bytes);
        assert!(text.starts_with("第一章 开始"));
        assert!(!text.contains('\r'));
        assert!(text.contains("正文"));
    }

    #[test]
    fn splits_chinese_headings() {
        let text = "第一章 开始\n内容一\n\n第二章 继续\n内容二\n";
        let chapters = split_chapters(text);
        assert_eq!(chapters.len(), 2);
        assert_eq!(chapters[0].0, "第一章 开始");
        assert!(chapters[0].1.contains("内容一"));
        assert_eq!(chapters[1].0, "第二章 继续");
    }

    #[test]
    fn splits_markdown_headings() {
        let text = "# 第一章\n甲\n# 第二章\n乙\n";
        let chapters = split_chapters(text);
        assert_eq!(chapters.len(), 2);
        assert_eq!(chapters[1].0, "第二章");
    }

    #[test]
    fn keeps_single_chapter_when_no_headings() {
        let chapters = split_chapters("只有一段正文，没有任何标题。");
        assert_eq!(chapters.len(), 1);
        assert_eq!(chapters[0].0, "正文");
    }

    #[test]
    fn decodes_docx_paragraphs() {
        let xml = "<w:p><w:r><w:t>第一段</w:t></w:r></w:p><w:p><w:r><w:t>第二段</w:t></w:r></w:p>";
        let text = extract_docx_text(xml);
        assert!(text.contains("第一段"));
        assert!(text.contains("第二段"));
    }

    #[test]
    fn does_not_double_unescape_entities() {
        // 原文里真的有 "&lt;" 时，Word 会写成 "&amp;lt;"：只能解一层。
        let xml = "<w:p><w:r><w:t>A&amp;lt;B</w:t></w:r></w:p>";
        let text = extract_docx_text(xml);
        assert!(text.contains("A&lt;B"), "unexpected: {text}");
    }

    #[test]
    fn import_does_not_count_as_todays_writing() {
        let mut conn = crate::db::mem_conn().unwrap();
        let chapters = vec![
            ("第一章 起".to_string(), "一二三四五".to_string()),
            ("第二章 承".to_string(), "六七八九十".to_string()),
        ];
        let project = insert_book(&mut conn, "导入的书", &chapters).unwrap();
        assert_eq!(project.chapter_count, 2);
        assert_eq!(project.word_count, 10);

        let total: i64 = crate::db::daily_stats(&conn, 30)
            .iter()
            .map(|d| d.words)
            .sum();
        assert_eq!(total, 0, "导入旧稿不该算进今日写作");
    }
}
