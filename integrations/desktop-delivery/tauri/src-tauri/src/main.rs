// SPDX-License-Identifier: Apache-2.0
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
#[tauri::command]
fn normalize_title(value: String) -> Result<String, String> {
    let title=value.trim();
    if !(1..=200).contains(&title.chars().count()) { return Err("Title must contain 1 to 200 characters".into()); }
    Ok(title.to_owned())
}
fn main() {
    tauri::Builder::default().invoke_handler(tauri::generate_handler![normalize_title])
        .run(tauri::generate_context!()).expect("desktop runtime failed");
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn bounded_normalization() {
        assert_eq!(normalize_title(" Label ".into()).unwrap(),"Label");
        assert!(normalize_title(" ".into()).is_err());
        assert!(normalize_title("界".repeat(201)).is_err());
    }
}
