mod ai;
mod db;
mod export;
mod import;
mod models;
mod parent;
mod secret;

use db::Db;
use models::*;
use std::sync::Mutex;
use tauri::{Manager, State};

// ------------------------------------------------------------- window ops

#[tauri::command]
fn win_start_drag(win: tauri::WebviewWindow) -> Result<(), String> {
    win.start_dragging().map_err(|e| e.to_string())
}

#[tauri::command]
fn win_minimize(win: tauri::WebviewWindow) -> Result<(), String> {
    win.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
fn win_toggle_maximize(win: tauri::WebviewWindow) -> Result<bool, String> {
    let maxed = win.is_maximized().map_err(|e| e.to_string())?;
    if maxed {
        win.unmaximize().map_err(|e| e.to_string())?;
    } else {
        win.maximize().map_err(|e| e.to_string())?;
    }
    Ok(!maxed)
}

#[tauri::command]
fn win_is_maximized(win: tauri::WebviewWindow) -> Result<bool, String> {
    win.is_maximized().map_err(|e| e.to_string())
}

#[tauri::command]
fn win_close(win: tauri::WebviewWindow) -> Result<(), String> {
    win.close().map_err(|e| e.to_string())
}

// ---------------------------------------------------------------- projects

#[tauri::command]
fn list_projects(db: State<'_, Db>) -> Result<Vec<Project>, String> {
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    db::list_projects(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_project(db: State<'_, Db>, title: String, genre: String) -> Result<Project, String> {
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    let p = db::create_project(&conn, title.trim(), genre.trim()).map_err(|e| e.to_string())?;
    let _ = db::set_setting(&conn, "last_project_id", &p.id.to_string());
    Ok(p)
}

#[tauri::command]
fn update_project(db: State<'_, Db>, project: Project) -> Result<(), String> {
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    db::update_project(&conn, &project).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_project(db: State<'_, Db>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    db::delete_project(&conn, id).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------- chapters

#[tauri::command]
fn list_chapters(db: State<'_, Db>, project_id: i64) -> Result<Vec<ChapterMeta>, String> {
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    db::list_chapters(&conn, project_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_chapter(db: State<'_, Db>, id: i64) -> Result<Chapter, String> {
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    db::get_chapter(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_chapter_content(db: State<'_, Db>, id: i64) -> Result<String, String> {
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    db::get_chapter_content(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
fn create_chapter(db: State<'_, Db>, project_id: i64, title: String) -> Result<ChapterMeta, String> {
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    db::create_chapter(&conn, project_id, title.trim()).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_chapter(
    db: State<'_, Db>,
    id: i64,
    title: String,
    content: String,
) -> Result<SaveResult, String> {
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    db::save_chapter(&conn, id, &title, &content).map_err(|e| e.to_string())
}

#[tauri::command]
fn update_chapter_meta(
    db: State<'_, Db>,
    id: i64,
    title: Option<String>,
    summary: Option<String>,
    outline: Option<String>,
    volume: Option<String>,
    status: Option<String>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    db::update_chapter_meta(&conn, id, title, summary, outline, volume, status)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_chapter(db: State<'_, Db>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    db::delete_chapter(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
fn reorder_chapters(db: State<'_, Db>, ids: Vec<i64>) -> Result<(), String> {
    let mut conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    db::reorder_chapters(&mut conn, &ids).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------- entities

#[tauri::command]
fn list_entities(db: State<'_, Db>, project_id: i64) -> Result<Vec<Entity>, String> {
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    db::list_entities(&conn, project_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn upsert_entity(db: State<'_, Db>, entity: Entity) -> Result<Entity, String> {
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    db::upsert_entity(&conn, &entity).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_entity(db: State<'_, Db>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    db::delete_entity(&conn, id).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------- profiles

#[tauri::command]
fn list_profiles(db: State<'_, Db>) -> Result<Vec<Profile>, String> {
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    db::list_profiles(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_profile(db: State<'_, Db>, profile: ProfileInput) -> Result<Profile, String> {
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    db::save_profile(&conn, &profile)
}

#[tauri::command]
fn delete_profile(db: State<'_, Db>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    db::delete_profile(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_default_profile(db: State<'_, Db>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    db::set_default_profile(&conn, id).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------- settings

#[tauri::command]
fn get_setting(db: State<'_, Db>, key: String) -> Result<Option<String>, String> {
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    Ok(db::get_setting(&conn, &key))
}

#[tauri::command]
fn set_setting(db: State<'_, Db>, key: String, value: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    db::set_setting(&conn, &key, &value).map_err(|e| e.to_string())
}

// ---------------------------------------------------------------- snapshots

#[tauri::command]
fn create_snapshot(
    db: State<'_, Db>,
    chapter_id: i64,
    reason: String,
) -> Result<SnapshotMeta, String> {
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    db::create_snapshot(&conn, chapter_id, &reason).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_snapshots(db: State<'_, Db>, chapter_id: i64) -> Result<Vec<SnapshotMeta>, String> {
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    db::list_snapshots(&conn, chapter_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_snapshot(db: State<'_, Db>, id: i64) -> Result<Snapshot, String> {
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    db::get_snapshot(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
fn restore_snapshot(db: State<'_, Db>, id: i64) -> Result<SaveResult, String> {
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    db::restore_snapshot(&conn, id)
}

// ------------------------------------------------------------------ export

#[tauri::command]
fn export_book(
    window: tauri::Window,
    db: State<'_, Db>,
    project_id: i64,
    format: String,
    chapter_ids: Option<Vec<i64>>,
) -> Result<Option<String>, String> {
    let parent = window.hwnd().ok().map(|h| h.0 as isize);
    let (project, chapters) = {
        let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
        let project = db::get_project(&conn, project_id).map_err(|e| e.to_string())?;
        let metas = db::list_chapters(&conn, project_id).map_err(|e| e.to_string())?;
        let mut chapters: Vec<(String, String)> = Vec::new();
        for m in metas {
            if let Some(ids) = &chapter_ids {
                if !ids.contains(&m.id) {
                    continue;
                }
            }
            let content = db::get_chapter_content(&conn, m.id).map_err(|e| e.to_string())?;
            chapters.push((m.title, content));
        }
        (project, chapters)
    };
    export::export_book(&project, &chapters, &format, parent)
}

#[tauri::command]
fn import_book(window: tauri::Window, db: State<'_, Db>) -> Result<Option<Project>, String> {
    // Pick and parse without holding the database lock, so autosave and other
    // commands keep working while the file dialog is open.
    let parent = window.hwnd().ok().map(|h| h.0 as isize);
    let Some(path) = import::pick_file(parent) else {
        return Ok(None);
    };
    let (title, chapters) = import::parse_file(&path)?;
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    import::insert_book(&conn, &title, &chapters).map(Some)
}

#[tauri::command]
fn list_deleted_chapters(db: State<'_, Db>, project_id: i64) -> Result<Vec<ChapterMeta>, String> {
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    db::list_deleted_chapters(&conn, project_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn restore_chapter(db: State<'_, Db>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    db::restore_chapter(&conn, id).map_err(|e| e.to_string())
}

#[tauri::command]
fn purge_chapter(db: State<'_, Db>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    db::purge_chapter(&conn, id).map_err(|e| e.to_string())
}

// ------------------------------------------------------------------ threads

#[tauri::command]
fn list_threads(db: State<'_, Db>, project_id: i64) -> Result<Vec<Thread>, String> {
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    db::list_threads(&conn, project_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn upsert_thread(db: State<'_, Db>, thread: Thread) -> Result<Thread, String> {
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    db::upsert_thread(&conn, &thread).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_thread(db: State<'_, Db>, id: i64) -> Result<(), String> {
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    db::delete_thread(&conn, id).map_err(|e| e.to_string())
}

// -------------------------------------------------------------------- stats

#[tauri::command]
fn daily_stats(db: State<'_, Db>, days: i64) -> Result<Vec<DailyStat>, String> {
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    Ok(db::daily_stats(&conn, days))
}

// ------------------------------------------------------------------- search

#[tauri::command]
fn search_chapters(
    db: State<'_, Db>,
    project_id: i64,
    query: String,
    limit: i64,
) -> Result<Vec<SearchHit>, String> {
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    Ok(db::search_chapters(&conn, project_id, &query, limit))
}

#[tauri::command]
fn retrieve_context(
    db: State<'_, Db>,
    project_id: i64,
    query: String,
    exclude_chapter_id: i64,
    limit: i64,
) -> Result<Vec<Retrieved>, String> {
    let conn = db.0.lock().map_err(|_| "数据库锁定失败".to_string())?;
    Ok(db::retrieve_context(
        &conn,
        project_id,
        &query,
        exclude_chapter_id,
        limit,
    ))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Portable mode: MOYIN_DATA_DIR overrides the roaming app-data folder.
            let portable = std::env::var("MOYIN_DATA_DIR")
                .ok()
                .filter(|v| !v.trim().is_empty());
            let dir = match &portable {
                Some(v) => std::path::PathBuf::from(v),
                None => {
                    // Fall back to local app data, then next to the executable,
                    // so the app still starts if Roaming is read-only.
                    let mut candidates: Vec<std::path::PathBuf> = Vec::new();
                    if let Ok(p) = app.path().app_data_dir() {
                        candidates.push(p);
                    }
                    if let Ok(p) = app.path().app_local_data_dir() {
                        candidates.push(p);
                    }
                    if let Ok(exe) = std::env::current_exe() {
                        if let Some(parent) = exe.parent() {
                            candidates.push(parent.join("moyin-data"));
                        }
                    }
                    let mut chosen = None;
                    for candidate in candidates {
                        if std::fs::create_dir_all(&candidate).is_ok() {
                            chosen = Some(candidate);
                            break;
                        }
                    }
                    chosen.ok_or("无法创建数据目录：请设置 MOYIN_DATA_DIR 指向一个可写目录")?
                }
            };
            std::fs::create_dir_all(&dir).map_err(|e| format!("无法创建数据目录: {e}"))?;
            let conn = db::open(&dir.join("moyin.db")).map_err(|e| format!("数据库初始化失败: {e}"))?;
            app.manage(Db(Mutex::new(conn)));
            app.manage(ai::GenState::default());

            let mut builder =
                tauri::WebviewWindowBuilder::new(app, "main", tauri::WebviewUrl::App("index.html".into()))
                    .title("墨隐 · Novel Studio")
                    .inner_size(1460.0, 940.0)
                    .min_inner_size(1080.0, 680.0)
                    .center()
                    .decorations(false)
                    .resizable(true)
                    .background_color(tauri::utils::config::Color(10, 11, 14, 255))
                    .disable_drag_drop_handler();

            #[cfg(windows)]
            {
                // Keep the Chromium profile next to the app data. This avoids
                // depending on %LOCALAPPDATA% being writable, and makes the
                // portable build fully self-contained.
                let web_dir = app
                    .path()
                    .app_local_data_dir()
                    .ok()
                    .filter(|p| std::fs::create_dir_all(p).is_ok())
                    .map(|p| p.join("webview"))
                    .unwrap_or_else(|| dir.join("webview"));
                let _ = std::fs::create_dir_all(&web_dir);
                builder = builder.data_directory(web_dir);
            }
            let _ = &portable;

            builder.build()?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            win_start_drag,
            win_minimize,
            win_toggle_maximize,
            win_is_maximized,
            win_close,
            list_projects,
            create_project,
            update_project,
            delete_project,
            list_chapters,
            get_chapter,
            get_chapter_content,
            create_chapter,
            save_chapter,
            update_chapter_meta,
            delete_chapter,
            reorder_chapters,
            list_entities,
            upsert_entity,
            delete_entity,
            list_profiles,
            save_profile,
            delete_profile,
            set_default_profile,
            get_setting,
            set_setting,
            create_snapshot,
            list_snapshots,
            get_snapshot,
            restore_snapshot,
            export_book,
            import_book,
            list_deleted_chapters,
            restore_chapter,
            purge_chapter,
            list_threads,
            upsert_thread,
            delete_thread,
            daily_stats,
            search_chapters,
            retrieve_context,
            ai::generate,
            ai::cancel_generation,
            ai::list_models,
            ai::test_profile,
            ai::summarize_chapter,
            ai::generate_outline,
            ai::extract_entities,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
