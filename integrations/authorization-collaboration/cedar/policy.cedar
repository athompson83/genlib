permit (
  principal is App::User,
  action in [App::Action::"view", App::Action::"edit"],
  resource is App::Document
) when {
  principal == resource.owner && principal.tenant == resource.tenant
};
forbid (principal is App::User, action, resource) when { principal.suspended };
