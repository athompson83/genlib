// SPDX-License-Identifier: Apache-2.0
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
uniffi::setup_scaffolding!();

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, uniffi::Record)]
pub struct Item {
    pub id: String,
    pub title: String,
    pub completed: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize, uniffi::Enum)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Change {
    Add { id: String, title: String },
    Complete { id: String, completed: bool },
    Remove { id: String },
}
#[derive(Debug, thiserror::Error, uniffi::Error)]
pub enum InventoryError {
    #[error("Item ID must be 1 to 64 ASCII letters, digits, underscores or hyphens")]
    InvalidId,
    #[error("Title must contain 1 to 200 Unicode scalar values after trimming")]
    InvalidTitle,
    #[error("Duplicate item ID")]
    DuplicateId,
    #[error("Item does not exist")]
    MissingItem,
    #[error("Inventory is limited to 10000 items")]
    TooManyItems,
}
fn validate_id(id: &str) -> Result<(), InventoryError> {
    if id.is_empty() || id.len() > 64 || !id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-') {
        return Err(InventoryError::InvalidId);
    }
    Ok(())
}
#[uniffi::export]
pub fn normalize_title(value: String) -> Result<String, InventoryError> {
    let title = value.trim();
    if !(1..=200).contains(&title.chars().count()) { return Err(InventoryError::InvalidTitle); }
    Ok(title.to_owned())
}
/// Pure, deterministic transition. Persistence, authorization and sync belong to the host.
#[uniffi::export]
pub fn apply_change(mut current: Vec<Item>, change: Change) -> Result<Vec<Item>, InventoryError> {
    if current.len() > 10_000 { return Err(InventoryError::TooManyItems); }
    let mut ids = HashSet::new();
    for item in &current {
        validate_id(&item.id)?;
        normalize_title(item.title.clone())?;
        if !ids.insert(item.id.clone()) { return Err(InventoryError::DuplicateId); }
    }
    match change {
        Change::Add { id, title } => {
            validate_id(&id)?;
            if ids.contains(&id) { return Err(InventoryError::DuplicateId); }
            if current.len() == 10_000 { return Err(InventoryError::TooManyItems); }
            current.push(Item { id, title: normalize_title(title)?, completed: false });
        }
        Change::Complete { id, completed } => {
            validate_id(&id)?;
            let item = current.iter_mut().find(|item| item.id == id).ok_or(InventoryError::MissingItem)?;
            item.completed = completed;
        }
        Change::Remove { id } => {
            validate_id(&id)?;
            let index = current.iter().position(|item| item.id == id).ok_or(InventoryError::MissingItem)?;
            current.remove(index);
        }
    }
    Ok(current)
}
