// SPDX-License-Identifier: Apache-2.0
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod boundary;
use serde::Serialize;
use std::{io::Read, sync::Mutex, time::Duration};
use tauri::{AppHandle, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_updater::{Update, UpdaterExt};
use url::Url;
#[derive(Serialize)] struct SelectedText { name: String, contents: String }
#[derive(Serialize)] struct SessionStatus { present: bool }
#[derive(Serialize)] struct UpdateStatus { state: String, version: Option<String> }
struct UpdateState { state: &'static str, candidate: Option<Update>, bytes: Option<Vec<u8>> }
impl Default for UpdateState { fn default() -> Self { Self { state: "idle", candidate: None, bytes: None } } }
#[derive(Default)] struct NativeState { updates: Mutex<UpdateState> }
static VAULT: Mutex<()> = Mutex::new(());
static PICKER: Mutex<()> = Mutex::new(());
fn main_window(window: &WebviewWindow) -> Result<(), String> {
    let url = window.url().map_err(|_| "Local main window required")?;
    if window.label() != "main" || !(url.scheme() == "tauri" || url.host_str() == Some("tauri.localhost")) { return Err("Local main window required".into()); }
    Ok(())
}
#[tauri::command] fn normalize_title(window: WebviewWindow, value: String) -> Result<String, String> { main_window(&window)?; boundary::normalize(&value) }
#[tauri::command] async fn pick_text(window: WebviewWindow, app: AppHandle) -> Result<Option<SelectedText>, String> {
    main_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = PICKER.try_lock().map_err(|_| "File selection already open")?;
        let selection = app.dialog().file().add_filter("Text fixtures", &["txt", "md", "json"]).blocking_pick_file();
        let Some(selection) = selection else { return Ok(None); };
        let path = selection.into_path().map_err(|_| "Text selection failed")?;
        let file = std::fs::File::open(&path).map_err(|_| "Text selection failed")?;
        let info = file.metadata().map_err(|_| "Text selection failed")?;
        if !info.is_file() || info.len() > boundary::MAX_TEXT_BYTES as u64 { return Err("Unsupported text file".into()); }
        let mut bytes = Vec::new(); file.take((boundary::MAX_TEXT_BYTES + 1) as u64).read_to_end(&mut bytes).map_err(|_| "Text selection failed")?;
        let name = path.file_name().and_then(|value| value.to_str()).ok_or("Unsupported filename")?;
        let (name, contents) = boundary::text(name, bytes)?; Ok(Some(SelectedText { name, contents }))
    }).await.map_err(|_| "Text selection failed".to_string())?
}
fn credential() -> Result<keyring::Entry, String> { keyring::Entry::new("dev.genlib.inventory", "fixture-session").map_err(|_| "OS secure storage is unavailable".into()) }
#[tauri::command] async fn save_session(window: WebviewWindow, value: String) -> Result<SessionStatus, String> {
    main_window(&window)?; boundary::token(&value)?;
    tauri::async_runtime::spawn_blocking(move || { let _lock = VAULT.lock().map_err(|_| "OS secure storage is unavailable")?; credential()?.set_password(&value).map_err(|_| "OS secure storage is unavailable")?; Ok(SessionStatus { present: true }) }).await.map_err(|_| "OS secure storage is unavailable".to_string())?
}
#[tauri::command] async fn session_status(window: WebviewWindow) -> Result<SessionStatus, String> {
    main_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || { let _lock = VAULT.lock().map_err(|_| "OS secure storage is unavailable")?;
        match credential()?.get_password() {
            Ok(value) => { boundary::token(&value)?; Ok(SessionStatus { present: true }) },
            Err(keyring::Error::NoEntry) => Ok(SessionStatus { present: false }),
            Err(_) => Err("OS secure storage is unavailable".into()),
        }
    }).await.map_err(|_| "OS secure storage is unavailable".to_string())?
}
#[tauri::command] async fn clear_session(window: WebviewWindow) -> Result<SessionStatus, String> {
    main_window(&window)?;
    tauri::async_runtime::spawn_blocking(move || { let _lock = VAULT.lock().map_err(|_| "OS secure storage is unavailable")?;
        match credential()?.delete_credential() { Ok(()) | Err(keyring::Error::NoEntry) => Ok(SessionStatus { present: false }), Err(_) => Err("OS secure storage is unavailable".into()) }
    }).await.map_err(|_| "OS secure storage is unavailable".to_string())?
}
fn trusted_feed() -> Result<(Url, String), String> {
    let endpoint = option_env!("GENLIB_UPDATE_FEED").map(str::to_owned).or_else(|| std::env::var("GENLIB_UPDATE_FEED").ok()).ok_or("Update feed is not configured")?;
    let url = Url::parse(&endpoint).map_err(|_| "Invalid update feed")?;
    if url.scheme() != "https" || url.host_str().is_none() || !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some() { return Err("Trusted HTTPS update feed required".into()); }
    let key = option_env!("GENLIB_UPDATE_PUBLIC_KEY").map(str::to_owned).or_else(|| std::env::var("GENLIB_UPDATE_PUBLIC_KEY").ok()).ok_or("Updater signing public key is required")?;
    if key.is_empty() { return Err("Updater signing public key is required".into()); } Ok((url, key))
}
fn status(state: &UpdateState) -> UpdateStatus { UpdateStatus { state: state.state.into(), version: state.candidate.as_ref().map(|update| update.version.clone()) } }
#[tauri::command] async fn check_update(window: WebviewWindow, app: AppHandle, state: State<'_, NativeState>) -> Result<UpdateStatus, String> {
    main_window(&window)?;
    { let mut inner = state.updates.lock().map_err(|_| "Update state unavailable")?;
      if !matches!(inner.state, "idle" | "available" | "failed") { return Err("Update operation already in progress".into()); }
      inner.state = "checking"; inner.candidate = None; inner.bytes = None; }
    let result = async {
        let (feed, key) = trusted_feed()?;
        let updater = app.updater_builder().endpoints(vec![feed.clone()]).map_err(|_| "Invalid update feed")?.pubkey(key)
            .timeout(Duration::from_secs(60)).configure_client(|client| client.redirect(reqwest::redirect::Policy::none()))
            .build().map_err(|_| "Updater configuration rejected")?;
        let candidate = updater.check().await.map_err(|_| "Update check failed")?;
        if let Some(update) = &candidate {
            if update.download_url.scheme() != "https" || update.download_url.origin() != feed.origin() || !update.download_url.username().is_empty() || update.download_url.password().is_some() || update.download_url.fragment().is_some() || update.download_url.query().is_some() { return Err("Untrusted update artifact".to_string()); }
        }
        Ok(candidate)
    }.await;
    let mut inner = state.updates.lock().map_err(|_| "Update state unavailable")?;
    match result { Ok(candidate) => { inner.state = if candidate.is_some() { "available" } else { "idle" }; inner.candidate = candidate; Ok(status(&inner)) }, Err(error) => { inner.state = "failed"; Err(error) } }
}
#[tauri::command] async fn download_update(window: WebviewWindow, state: State<'_, NativeState>) -> Result<UpdateStatus, String> {
    main_window(&window)?;
    let candidate = { let mut inner = state.updates.lock().map_err(|_| "Update state unavailable")?;
        if inner.state != "available" { return Err("Check for an available update first".into()); }
        let candidate = inner.candidate.take().ok_or("No update candidate")?; inner.state = "downloading"; candidate };
    // The pinned updater verifies the artifact signature and signed version before
    // returning bytes. No install occurs until the separate restart command.
    let result = candidate.download(|_, _| {}, || {}).await;
    let mut inner = state.updates.lock().map_err(|_| "Update state unavailable")?;
    inner.candidate = Some(candidate);
    match result { Ok(bytes) => { inner.bytes = Some(bytes); inner.state = "ready"; Ok(status(&inner)) }, Err(_) => { inner.state = "failed"; Err("Update download or signature verification failed".into()) } }
}
#[tauri::command] async fn restart_update(window: WebviewWindow, app: AppHandle, state: State<'_, NativeState>) -> Result<UpdateStatus, String> {
    main_window(&window)?;
    let (candidate, bytes) = { let mut inner = state.updates.lock().map_err(|_| "Update state unavailable")?;
        if inner.state != "ready" { return Err("No verified update is ready".into()); }
        let candidate = inner.candidate.take().ok_or("No update candidate")?; let bytes = inner.bytes.take().ok_or("No verified bytes")?; inner.state = "restarting"; (candidate, bytes) };
    let result = tauri::async_runtime::spawn_blocking(move || candidate.install(bytes)).await;
    if !matches!(result, Ok(Ok(()))) { state.updates.lock().map_err(|_| "Update state unavailable")?.state = "failed"; return Err("Verified update could not be installed".into()); }
    app.restart()
}
fn main() {
    tauri::Builder::default().manage(NativeState::default())
        .plugin(tauri_plugin_dialog::init()).plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![normalize_title, pick_text, save_session, session_status, clear_session, check_update, download_update, restart_update])
        .run(tauri::generate_context!()).expect("desktop runtime failed");
}
