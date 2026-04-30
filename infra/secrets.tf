# Shared secret CloudFront injects when forwarding to API Gateway.
# The Lambda checks for this header and rejects any direct hits.
resource "random_password" "cf_to_api_secret" {
  length  = 48
  special = false
}
