// SPDX-License-Identifier: Apache-2.0
use genlib_inventory_core::{apply_change, normalize_title, Change, InventoryError, Item};
use serde::Deserialize;
#[derive(Deserialize)] struct Fixture { changes: Vec<Change>, expected: Vec<Item> }
#[test] fn shared_conformance_fixture() {
    let fixture: Fixture = serde_json::from_str(include_str!("../fixtures/conformance.json")).unwrap();
    let actual = fixture.changes.into_iter().try_fold(Vec::new(), apply_change).unwrap();
    assert_eq!(actual, fixture.expected);
}
#[test] fn invalid_input_is_rejected_and_input_is_retained() {
    let current = apply_change(vec![], Change::Add { id: "a".into(), title: "Valid".into() }).unwrap();
    assert!(matches!(apply_change(current.clone(), Change::Add { id: "a".into(), title: "Duplicate".into() }), Err(InventoryError::DuplicateId)));
    assert_eq!(current[0].title, "Valid");
    assert!(matches!(normalize_title("  ".into()), Err(InventoryError::InvalidTitle)));
    assert!(matches!(normalize_title("界".repeat(201)), Err(InventoryError::InvalidTitle)));
    assert!(matches!(apply_change(current, Change::Remove { id: "missing".into() }), Err(InventoryError::MissingItem)));
}
