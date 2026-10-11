// SPDX-License-Identifier: Apache-2.0
pub const MAX_TEXT_BYTES: usize = 256 * 1024;
pub fn normalize(value: &str) -> Result<String, String> {
    let title = value.trim();
    if !(1..=200).contains(&title.chars().count()) { return Err("Title must contain 1 to 200 characters".into()); }
    Ok(title.to_owned())
}
pub fn token(value: &str) -> Result<(), String> {
    if value.is_empty() || value.len() > 2048 || value.contains(['\r', '\n', '\0']) { return Err("A single-line token of at most 2048 UTF-8 bytes is required".into()); }
    Ok(())
}
pub fn text(name: &str, bytes: Vec<u8>) -> Result<(String, String), String> {
    let extension = name.rsplit_once('.').map(|(_, ext)| ext.to_ascii_lowercase());
    if name.len() > 200 || name.contains(['/', '\\', '\0']) || !matches!(extension.as_deref(), Some("txt" | "md" | "json")) { return Err("Unsupported text file".into()); }
    if bytes.len() > MAX_TEXT_BYTES { return Err("File exceeds 256 KiB".into()); }
    let contents = String::from_utf8(bytes).map_err(|_| "UTF-8 text is required")?;
    if contents.contains('\0') { return Err("Binary files are not supported".into()); }
    Ok((name.into(), contents))
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn bounded_normalization() { assert_eq!(normalize(" Label ").unwrap(), "Label"); assert!(normalize(" ").is_err()); assert!(normalize(&"界".repeat(201)).is_err()); }
    #[test] fn file_boundary() {
        assert_eq!(text("fixture.md", b"# Hello".to_vec()).unwrap().1, "# Hello");
        for name in ["../fixture.txt", "path\\fixture.txt", "fixture.exe"] { assert!(text(name, b"ok".to_vec()).is_err()); }
        assert!(text("a.txt", vec![0xff]).is_err()); assert!(text("a.txt", vec![0]).is_err()); assert!(text("a.txt", vec![b'x'; MAX_TEXT_BYTES + 1]).is_err());
    }
    #[test] fn token_boundary() { assert!(token("fixture-token").is_ok()); for value in ["", "line\nbreak", &"x".repeat(2049)] { assert!(token(value).is_err()); } }
}
