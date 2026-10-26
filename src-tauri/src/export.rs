use std::io::Write;
use std::path::PathBuf;

fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn safe_name(name: &str) -> String {
    let cleaned: String = name
        .chars()
        .map(|c| if "\\/:*?\"<>|".contains(c) { '_' } else { c })
        .collect();
    let trimmed = cleaned.trim().trim_matches('.').to_string();
    if trimmed.is_empty() {
        "未命名".to_string()
    } else {
        trimmed
    }
}

fn build_txt(title: &str, synopsis: &str, chapters: &[(String, String)]) -> String {
    let mut out = format!("{title}\n");
    if !synopsis.trim().is_empty() {
        out.push_str(&format!("\n{}\n", synopsis.trim()));
    }
    out.push_str("\n\n");
    for (ch_title, content) in chapters {
        out.push_str(&format!("{ch_title}\n\n"));
        out.push_str(content.trim());
        out.push_str("\n\n\n");
    }
    out
}

fn build_md(title: &str, synopsis: &str, chapters: &[(String, String)]) -> String {
    let mut out = format!("# {title}\n\n");
    if !synopsis.trim().is_empty() {
        out.push_str(&format!("> {}\n\n", synopsis.trim().replace('\n', "\n> ")));
    }
    for (ch_title, content) in chapters {
        out.push_str(&format!("## {ch_title}\n\n"));
        out.push_str(content.trim());
        out.push_str("\n\n");
    }
    out
}

fn para(text: &str, style: Option<&str>) -> String {
    let ppr = match style {
        Some(s) => format!("<w:pPr><w:pStyle w:val=\"{s}\"/></w:pPr>"),
        None => String::new(),
    };
    if text.is_empty() {
        format!("<w:p>{ppr}</w:p>")
    } else {
        format!(
            "<w:p>{ppr}<w:r><w:t xml:space=\"preserve\">{}</w:t></w:r></w:p>",
            escape_xml(text)
        )
    }
}

fn build_docx_document(title: &str, synopsis: &str, chapters: &[(String, String)]) -> String {
    let mut body = String::new();
    body.push_str(&para(title, Some("Title")));
    if !synopsis.trim().is_empty() {
        body.push_str(&para(synopsis.trim(), Some("Subtitle")));
    }
    for (ch_title, content) in chapters {
        body.push_str(&para(ch_title, Some("Heading1")));
        for line in content.split('\n') {
            let line = line.trim();
            if line.is_empty() {
                body.push_str("<w:p/>");
            } else {
                body.push_str(&para(line, Some("Body")));
            }
        }
    }
    format!(
        r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>{body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="851" w:footer="992" w:gutter="0"/></w:sectPr></w:body>
</w:document>"#
    )
}

const STYLES_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults>
<w:rPrDefault><w:rPr>
<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="Noto Serif SC"/>
<w:sz w:val="24"/><w:szCs w:val="24"/>
<w:lang w:val="en-US" w:eastAsia="zh-CN"/>
</w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:line="400" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr></w:pPrDefault>
</w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Body"><w:name w:val="Body Text"/><w:basedOn w:val="Normal"/><w:qFormat/>
<w:pPr><w:spacing w:line="400" w:lineRule="auto" w:after="120"/><w:ind w:firstLineChars="200" w:firstLine="480"/></w:pPr>
</w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:qFormat/>
<w:pPr><w:jc w:val="center"/><w:spacing w:before="1200" w:after="600"/></w:pPr>
<w:rPr><w:rFonts w:eastAsia="Noto Serif SC"/><w:b/><w:sz w:val="52"/></w:rPr>
</w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:qFormat/>
<w:pPr><w:jc w:val="center"/><w:spacing w:after="800"/></w:pPr>
<w:rPr><w:color w:val="666666"/><w:sz w:val="24"/></w:rPr>
</w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Body"/><w:qFormat/>
<w:pPr><w:keepNext/><w:spacing w:before="720" w:after="360"/><w:jc w:val="center"/><w:outlineLvl w:val="0"/></w:pPr>
<w:rPr><w:b/><w:sz w:val="36"/></w:rPr>
</w:style>
</w:styles>"#;

fn write_docx(
    path: &PathBuf,
    title: &str,
    synopsis: &str,
    chapters: &[(String, String)],
) -> Result<(), String> {
    let file = std::fs::File::create(path).map_err(|e| format!("创建文件失败: {e}"))?;
    let mut zip = zip::ZipWriter::new(file);
    let opts = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated);

    let content_types = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>"#;

    let rels = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>"#;

    let doc_rels = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>"#;

    zip.start_file("[Content_Types].xml", opts).map_err(|e| e.to_string())?;
    zip.write_all(content_types.as_bytes()).map_err(|e| e.to_string())?;
    zip.start_file("_rels/.rels", opts).map_err(|e| e.to_string())?;
    zip.write_all(rels.as_bytes()).map_err(|e| e.to_string())?;
    zip.start_file("word/document.xml", opts).map_err(|e| e.to_string())?;
    zip.write_all(build_docx_document(title, synopsis, chapters).as_bytes())
        .map_err(|e| e.to_string())?;
    zip.start_file("word/styles.xml", opts).map_err(|e| e.to_string())?;
    zip.write_all(STYLES_XML.as_bytes()).map_err(|e| e.to_string())?;
    zip.start_file("word/_rels/document.xml.rels", opts)
        .map_err(|e| e.to_string())?;
    zip.write_all(doc_rels.as_bytes()).map_err(|e| e.to_string())?;
    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

/// Opens a native save dialog and writes the book. Returns the chosen path.
pub fn export_book(
    project: &crate::models::Project,
    chapters: &[(String, String)],
    format: &str,
    parent: Option<isize>,
) -> Result<Option<String>, String> {
    let (ext, label) = match format {
        "docx" => ("docx", "Word 文档"),
        "md" => ("md", "Markdown"),
        _ => ("txt", "纯文本"),
    };

    let dialog = crate::parent::attach(
        rfd::FileDialog::new()
            .set_title("导出作品")
            .set_file_name(format!("{}.{}", safe_name(&project.title), ext))
            .add_filter(label, &[ext]),
        parent,
    );
    let path = dialog.save_file();

    let Some(path) = path else {
        return Ok(None);
    };

    match format {
        "docx" => write_docx(&path, &project.title, &project.synopsis, chapters)?,
        "md" => std::fs::write(&path, build_md(&project.title, &project.synopsis, chapters))
            .map_err(|e| format!("写入失败: {e}"))?,
        _ => std::fs::write(&path, build_txt(&project.title, &project.synopsis, chapters))
            .map_err(|e| format!("写入失败: {e}"))?,
    }

    Ok(Some(path.to_string_lossy().to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    #[test]
    fn docx_contains_chapters() {
        let dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("target")
            .join("test-out");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("test.docx");
        let chapters = vec![
            (
                "第一章 测试".to_string(),
                "第一段。\n\n第二段。".to_string(),
            ),
            ("第二章".to_string(), "只有一段。".to_string()),
        ];
        write_docx(&path, "测试书", "这是梗概", &chapters).unwrap();

        let file = std::fs::File::open(&path).unwrap();
        let mut zip = zip::ZipArchive::new(file).unwrap();
        let mut doc = String::new();
        zip.by_name("word/document.xml")
            .unwrap()
            .read_to_string(&mut doc)
            .unwrap();
        assert!(doc.contains("测试书"));
        assert!(doc.contains("第一章 测试"));
        assert!(doc.contains("第二段。"));
        assert!(doc.contains("第二章"));
        assert!(zip.by_name("word/styles.xml").is_ok());
    }

    #[test]
    fn txt_and_md_include_titles() {
        let chapters = vec![("第一章 雨".to_string(), "正文。".to_string())];
        let txt = build_txt("书名", "梗概", &chapters);
        assert!(txt.contains("书名"));
        assert!(txt.contains("第一章 雨"));
        assert!(txt.contains("正文。"));

        let md = build_md("书名", "梗概", &chapters);
        assert!(md.starts_with("# 书名"));
        assert!(md.contains("## 第一章 雨"));
    }

    #[test]
    fn unsafe_filename_is_sanitized() {
        assert_eq!(safe_name("a/b:c*?"), "a_b_c__");
        assert_eq!(safe_name("   "), "未命名");
    }
}
