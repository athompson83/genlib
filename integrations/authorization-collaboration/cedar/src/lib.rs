// SPDX-License-Identifier: Apache-2.0
use cedar_policy::{Authorizer, Context, Decision, Entities, EntityUid, PolicySet, Request, Schema, ValidationMode, Validator};
use std::error::Error;
use std::str::FromStr;
type GateResult<T> = Result<T, Box<dyn Error + Send + Sync>>;
pub enum Action { View, Edit }
pub struct CedarGate { policies: PolicySet, schema: Schema, authorizer: Authorizer }
impl CedarGate {
    pub fn new(policy_source: &str, schema_source: &str) -> GateResult<Self> {
        let policies = PolicySet::from_str(policy_source)?;
        let schema = Schema::from_str(schema_source)?;
        let validation = Validator::new(schema.clone()).validate(&policies, ValidationMode::Strict);
        if !validation.validation_passed() { return Err("Policy does not validate against the schema".into()); }
        Ok(Self { policies, schema, authorizer: Authorizer::new() })
    }
    /// Identities and entity attributes must come from trusted server-side records.
    /// The caller must deny access on both Ok(false) and Err(_).
    pub fn allowed(&self, actor: &str, action: Action, document: &str, entities_json: &str) -> GateResult<bool> {
        if actor.len()>128 || document.len()>128 || entities_json.len()>1_048_576 { return Err("Input limit exceeded".into()); }
        let uid = |kind: &str, id: &str| -> GateResult<EntityUid> {
            Ok(format!("App::{}::{}", kind, serde_json::to_string(id)?).parse()?)
        };
        let request = Request::new(
            uid("User", actor)?,
            uid("Action", match action { Action::View=>"view", Action::Edit=>"edit" })?,
            uid("Document", document)?, Context::empty(), Some(&self.schema)
        )?;
        let entities = Entities::from_json_str(entities_json, Some(&self.schema))?;
        let response = self.authorizer.is_authorized(&request, &self.policies, &entities);
        if response.diagnostics().errors().next().is_some() { return Err("Policy evaluation failed".into()); }
        Ok(response.decision() == Decision::Allow)
    }
}
#[cfg(test)] mod tests {
    use super::*;
    const ENTITIES: &str = include_str!("../fixtures/entities.json");
    fn gate() -> CedarGate { CedarGate::new(include_str!("../policy.cedar"), include_str!("../schema.cedarschema")).unwrap() }
    #[test] fn owner_allowed_cross_tenant_and_unknown_denied() {
        let g = gate();
        assert!(g.allowed("alice",Action::View,"inventory",ENTITIES).unwrap());
        assert!(g.allowed("alice",Action::Edit,"inventory",ENTITIES).unwrap());
        assert!(!g.allowed("bob",Action::View,"inventory",ENTITIES).unwrap());
        assert!(!g.allowed("alice",Action::View,"missing",ENTITIES).unwrap_or(false));
    }
    #[test] fn forbid_and_malformed_entities_fail_closed() {
        let g = gate();
        assert!(!g.allowed("suspended",Action::Edit,"blocked",ENTITIES).unwrap());
        assert!(g.allowed("alice",Action::Edit,"inventory","{}").is_err());
        assert!(CedarGate::new("permit(principal, action, resource) when { nonexistent };",include_str!("../schema.cedarschema")).is_err());
    }
}
