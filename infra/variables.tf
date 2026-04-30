variable "aws_profile" {
  type        = string
  default     = ""
  description = "AWS CLI profile to use. Leave empty in CI (uses env credentials from OIDC role)."
}

variable "aws_region" {
  type        = string
  default     = "us-east-1"
  description = "Primary deployment region."
}

variable "saml_metadata_url" {
  type        = string
  default     = ""
  description = "SAML metadata URL for AWS IAM Identity Center. Leave empty to skip SAML federation (Cognito-only users)."
}

variable "callback_urls" {
  type        = list(string)
  default     = ["http://localhost:5173/callback"]
  description = "Cognito hosted-UI callback URLs. CloudFront URL is appended automatically post-deploy."
}
