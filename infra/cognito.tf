resource "aws_cognito_user_pool" "main" {
  name = "${local.name}-users"

  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  mfa_configuration        = "OFF"

  password_policy {
    minimum_length    = 12
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = false
  }

  schema {
    name                = "email"
    attribute_data_type = "String"
    mutable             = true
    required            = true
  }
}

resource "aws_cognito_user_pool_domain" "main" {
  domain       = "${local.name}-${data.aws_caller_identity.current.account_id}"
  user_pool_id = aws_cognito_user_pool.main.id
}

resource "aws_cognito_identity_provider" "sso" {
  count         = var.saml_metadata_url == "" ? 0 : 1
  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = "AWSIdentityCenter"
  provider_type = "SAML"

  provider_details = {
    MetadataURL = var.saml_metadata_url
  }

  attribute_mapping = {
    email = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"
  }
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "${local.name}-web"
  user_pool_id = aws_cognito_user_pool.main.id

  # Make sure the SAML IdP exists before the client tries to list it in
  # supported_identity_providers (otherwise the API rejects the update).
  depends_on = [aws_cognito_identity_provider.sso]

  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]

  supported_identity_providers = concat(
    ["COGNITO"],
    var.saml_metadata_url == "" ? [] : ["AWSIdentityCenter"]
  )

  # Auto-include the CloudFront origin so we don't need a second apply.
  callback_urls = concat(
    var.callback_urls,
    ["https://${aws_cloudfront_distribution.web.domain_name}/callback"]
  )
  logout_urls = concat(
    var.callback_urls,
    ["https://${aws_cloudfront_distribution.web.domain_name}"]
  )

  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]
}
